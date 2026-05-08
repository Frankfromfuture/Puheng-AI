import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import multer from "multer";
import OpenAI from "openai";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const EXPORT_DIR = path.join(ROOT, "exports");
const STATE_FILE = path.join(DATA_DIR, "app-state.json");

const app = express();
const upload = multer({ dest: UPLOAD_DIR });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/exports", express.static(EXPORT_DIR));

const depths = ["简版", "标准", "深入", "专项"];
const knownDefaultNoteIds = new Set([
  "tsinghua-companies",
  "shanghai-soe",
  "shanghai-medical",
  "qingpu",
  "longhua",
  "qingpu-region",
  "longhua-region",
  "attraction",
  "land",
  "lease",
  "coop-fund",
  "industry-fund",
  "medical",
  "soe"
]);

const researchRequirements = {
  brief: {
    label: "简要分析",
    instruction: "所有框架只做简单判断，压缩背景铺陈，优先输出可核实结论、缺口与引用。"
  },
  fundamental: {
    label: "基本面深度分析",
    instruction: "企业基本面、工商股东、公告年报、财务与经营质量深入，其余章节配合基本面结论简化。"
  },
  investment: {
    label: "投资合作分析",
    instruction: "产业链位置、竞争格局、资本合作、融资估值、投资方与合作基金线索为重点。"
  },
  landing: {
    label: "招商落地分析",
    instruction: "产业链位置与区域资源交叉为重点，突出招商引资、空间载体、租赁/拿地与 90 天路径。"
  },
  enablement: {
    label: "赋能合作分析",
    instruction: "我方强资源、企业需求、合作抓手、资源复合与赋能路径为重点。"
  },
  comprehensive: {
    label: "全面分析",
    instruction: "所有重点章节均展开分析，基础、市场、资本、赋能、落地与风险均需形成可执行判断。"
  }
};

function depthForRequirement(requirement, nodeId, parentId) {
  const mode = researchRequirements[requirement] ? requirement : "comprehensive";
  const group = parentId || nodeId;
  if (mode === "brief") return "简版";
  if (mode === "comprehensive") {
    if (["capital-cooperation", "enablement", "landing-plan"].includes(group)) return "专项";
    return "深入";
  }
  if (mode === "fundamental") {
    if (group === "basic") return "深入";
    if (group === "market-position" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "investment") {
    if (group === "capital-cooperation") return "专项";
    if (group === "market-position") return "深入";
    if (group === "basic" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "landing") {
    if (group === "landing-plan") return "专项";
    if (group === "market-position") return "深入";
    if (group === "enablement" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "enablement") {
    if (group === "enablement") return "专项";
    if (group === "market-position" || group === "landing-plan") return "标准";
    if (group === "risks") return "标准";
    return "简版";
  }
  return "标准";
}

function applyResearchDepths(nodes, requirement, parentId = null) {
  return nodes.map((item) => ({
    ...item,
    depth: depthForRequirement(requirement, item.id, parentId),
    children: applyResearchDepths(item.children ?? [], requirement, parentId || item.id)
  }));
}

function node(id, title, children = [], depth = "标准") {
  return {
    id,
    title,
    enabled: true,
    includeInWord: true,
    depth,
    notes: "",
    status: "not_started",
    locked: false,
    children
  };
}

function citation(id, title, sourceType, usedIn, url = "", publishedAt = "") {
  return { id, title, sourceType, usedIn, url, publishedAt };
}

function defaultFramework() {
  return [
    node(
      "basic",
      "基础信息速览",
      [
        node("business-registration", "工商信息", [], "简版"),
        node("shareholding", "股东结构", [], "标准"),
        node("filings-finance", "公告/年报/财务要点", [], "标准"),
        node("negative-info", "负面信息", [], "标准")
      ],
      "简版"
    ),
    node(
      "market-position",
      "市场地位分析",
      [
        node("industry-chain-position", "产业链位置", [], "深入"),
        node("competitors", "同类竞争对手", [], "深入"),
        node("competitive-advantages", "竞争优势", [], "深入"),
        node("upstream-downstream", "重要上下游企业", [], "深入")
      ],
      "深入"
    ),
    node(
      "capital-cooperation",
      "资本合作分析",
      [
        node("recent-capital-news", "近期资本动态", [], "深入"),
        node("financing-history", "历史融资情况", [], "深入"),
        node("valuation-rounds", "近几轮估值", [], "深入"),
        node("major-investors", "主要投资者", [], "深入"),
        node("fund-contribution", "公司或大股东基金出资情况", [], "专项"),
        node("cooperation-fund", "合作基金/产业基金可能性", [], "专项"),
        node("capital-cooperation-advice", "资本合作建议", [], "专项")
      ],
      "专项"
    ),
    node(
      "enablement",
      "赋能合作点分析",
      [
        node("enterprise-needs", "企业需求识别", [], "深入"),
        node("resource-match", "我方强资源匹配", [], "专项"),
        node("cooperation-priority", "合作点优先级", [], "专项"),
        node("next-actions", "推进动作", [], "标准")
      ],
      "专项"
    ),
    node(
      "landing-plan",
      "落地方案分析",
      [
        node("region-match", "区域匹配", [], "专项"),
        node("investment-attraction", "招商引资", [], "专项"),
        node("land-cooperation", "合作拿地", [], "专项"),
        node("leasing-landing", "租赁落地", [], "专项"),
        node("landing-fund", "合作基金", [], "专项"),
        node("ninety-day-plan", "90 天推进路径", [], "标准")
      ],
      "专项"
    ),
    node("risks", "风险与待核实问题", [], "深入"),
    node("citation-appendix", "引用来源附录", [], "简版")
  ];
}

function createBlankSection(reportNode) {
  return {
    id: reportNode.id,
    title: reportNode.title,
    confidenceScore: 0,
    confidenceReason: "尚未生成。本节生成后会显示资料充分度、主要依据与缺口。",
    sourceCoverage: "未检索",
    keyFindings: [],
    analysisText: "",
    missingInfo: [],
    citations: [],
    status: reportNode.status ?? "not_started",
    locked: reportNode.locked ?? false
  };
}

function walk(nodes, visitor, parent = null, level = 1) {
  for (const item of nodes) {
    visitor(item, parent, level);
    walk(item.children ?? [], visitor, item, level + 1);
  }
}

function flatten(nodes) {
  const items = [];
  walk(nodes, (item, parent, level) => {
    items.push({ ...item, parentId: parent?.id ?? null, level });
  });
  return items;
}

function defaultState() {
  const framework = defaultFramework();
  const sections = {};
  walk(framework, (item) => {
    sections[item.id] = createBlankSection(item);
  });

  return {
    project: {
      id: "default-project",
      companyName: "",
      researchRequirement: "comprehensive",
      stockCode: "",
      creditCode: "",
      industry: "",
      region: "",
      description: ""
    },
    settings: {
      qwen: {
        apiKey: "",
        provider: "dashscope",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        responsesBaseUrl: "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1",
        openSearchHost: "https://default-hea5.platform-cn-shanghai.opensearch.aliyuncs.com",
        openSearchAppName: "default",
        model: "qwen-plus",
        region: "中国大陆（北京）"
      },
      externalApis: [
        {
          id: "sec-edgar",
          name: "SEC EDGAR 上市公司公告",
          enabled: true,
          endpoint: "https://data.sec.gov",
          notes: "美国上市公司 10-K、10-Q、8-K、S-1 等公开披露。"
        },
        {
          id: "hkexnews",
          name: "港交所 HKEXnews",
          enabled: true,
          endpoint: "https://www.hkexnews.hk",
          notes: "港股公告、年报、招股书、通函。"
        },
        {
          id: "market-data",
          name: "行情与财务数据 API",
          enabled: false,
          endpoint: "",
          notes: "用于股价、市值、估值倍数等；可接入自选免费或已授权接口。"
        },
        {
          id: "business-registry",
          name: "工商与负面信息来源",
          enabled: false,
          endpoint: "",
          notes: "中国工商信息多为官方查询入口或需授权接口；支持手动补充来源。"
        },
        {
          id: "news-search",
          name: "行业与资本新闻搜索",
          enabled: false,
          endpoint: "",
          notes: "用于融资、估值、重要投资方、资本市场新闻。"
        }
      ],
      strongResources: [
        {
          id: "tsinghua-companies",
          name: "清华系相关企业",
          type: "产业/校友资源",
          enabled: true,
          notes: ""
        },
        {
          id: "shanghai-soe",
          name: "上海重要国央企",
          type: "产业客户/资本资源",
          enabled: true,
          notes: ""
        },
        {
          id: "shanghai-medical",
          name: "上海市医疗系统",
          type: "医疗场景",
          enabled: true,
          notes: ""
        },
        {
          id: "qingpu",
          name: "上海青浦区",
          type: "区域落地",
          enabled: true,
          notes: ""
        },
        {
          id: "longhua",
          name: "深圳龙华区",
          type: "区域落地",
          enabled: true,
          notes: ""
        }
      ],
      landingRegions: [
        {
          id: "qingpu-region",
          name: "上海青浦区",
          enabled: true,
          industries: "",
          resources: "",
          constraints: "",
          notes: ""
        },
        {
          id: "longhua-region",
          name: "深圳龙华区",
          enabled: true,
          industries: "",
          resources: "",
          constraints: "",
          notes: ""
        }
      ],
      landingMethods: [
        { id: "attraction", name: "招商引资", enabled: true, notes: "" },
        { id: "land", name: "合作拿地", enabled: true, notes: "" },
        { id: "lease", name: "租赁落地", enabled: true, notes: "" },
        { id: "coop-fund", name: "合作基金", enabled: true, notes: "" },
        { id: "industry-fund", name: "产业基金投资", enabled: true, notes: "" },
        { id: "medical", name: "医疗系统合作", enabled: true, notes: "" },
        { id: "soe", name: "国央企合作", enabled: true, notes: "" }
      ]
    },
    framework,
    sections,
    files: [],
    sources: [
      citation("source-user-upload", "用户上传资料", "上传材料", "全部章节"),
      citation("source-public-disclosure", "上市公司公告/年报", "公开披露", "公告/年报/财务要点"),
      citation("source-capital-news", "行业与资本新闻", "公开新闻", "资本合作分析"),
      citation("source-registry", "工商与负面信息公开来源", "工商/监管", "基础信息速览")
    ]
  };
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  try {
    await fs.access(STATE_FILE);
  } catch {
    await writeState(defaultState());
  }
}

async function readState() {
  await ensureStorage();
  const raw = await fs.readFile(STATE_FILE, "utf8");
  const state = JSON.parse(raw);
  const changed = migrateState(state);
  if (changed) await writeState(state);
  return state;
}

async function writeState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function migrateState(state) {
  let changed = false;
  state.project ??= {};
  if (!state.project.researchRequirement) {
    state.project.researchRequirement = "comprehensive";
    changed = true;
  }
  state.meta ??= {};
  if (!state.meta.blankDefaultAnnotationsV1) {
    for (const item of state.settings?.strongResources ?? []) {
      if (knownDefaultNoteIds.has(item.id)) item.notes = "";
    }
    for (const item of state.settings?.landingMethods ?? []) {
      if (knownDefaultNoteIds.has(item.id)) item.notes = "";
    }
    for (const item of state.settings?.landingRegions ?? []) {
      if (knownDefaultNoteIds.has(item.id)) {
        item.industries = "";
        item.resources = "";
        item.constraints = "";
        item.notes = "";
      }
    }
    state.meta.blankDefaultAnnotationsV1 = true;
    changed = true;
  }
  return changed;
}

function publicState(state) {
  state.settings.qwen.provider ??= "dashscope";
  state.settings.qwen.baseUrl ??= "https://dashscope.aliyuncs.com/compatible-mode/v1";
  state.settings.qwen.responsesBaseUrl ??= "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1";
  state.settings.qwen.openSearchHost ??= "https://default-hea5.platform-cn-shanghai.opensearch.aliyuncs.com";
  state.settings.qwen.openSearchAppName ??= "default";
  return {
    ...state,
    settings: {
      ...state.settings,
      qwen: {
        ...state.settings.qwen,
        apiKey: undefined,
        apiKeyConfigured: Boolean(state.settings.qwen.apiKey),
        apiKeyPreview: state.settings.qwen.apiKey
          ? `****${state.settings.qwen.apiKey.slice(-4)}`
          : ""
      }
    }
  };
}

function syncSectionsWithFramework(state) {
  const currentIds = new Set();
  walk(state.framework, (item) => {
    currentIds.add(item.id);
    const existing = state.sections[item.id];
    if (!existing) {
      state.sections[item.id] = createBlankSection(item);
    } else {
      existing.title = item.title;
      existing.status = existing.status === "confirmed" ? "confirmed" : item.status ?? existing.status;
      existing.locked = Boolean(existing.locked || item.locked);
    }
  });
  for (const id of Object.keys(state.sections)) {
    if (!currentIds.has(id)) {
      delete state.sections[id];
    }
  }
}

function findNode(nodes, id) {
  for (const item of nodes) {
    if (item.id === id) return item;
    const child = findNode(item.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function cleanJsonText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function normalizeDraft(raw, reportNode) {
  const score = Number(raw.confidenceScore ?? 0);
  return {
    id: reportNode.id,
    title: String(raw.title || reportNode.title),
    confidenceScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    confidenceReason: String(raw.confidenceReason || "模型未返回置信度说明，请人工核实。"),
    sourceCoverage: String(raw.sourceCoverage || "未说明"),
    keyFindings: Array.isArray(raw.keyFindings) ? raw.keyFindings.map(String).filter(Boolean) : [],
    analysisText: String(raw.analysisText || ""),
    missingInfo: Array.isArray(raw.missingInfo) ? raw.missingInfo.map(String).filter(Boolean) : [],
    citations: Array.isArray(raw.citations)
      ? raw.citations.map((item, index) => ({
          id: String(item.id || `${reportNode.id}-citation-${index + 1}`),
          title: String(item.title || "未命名来源"),
          url: String(item.url || ""),
          sourceType: String(item.sourceType || "未分类"),
          publishedAt: String(item.publishedAt || ""),
          usedIn: String(item.usedIn || reportNode.title)
        }))
      : [],
    status: raw.confidenceScore < 60 ? "insufficient" : "needs_review",
    locked: false,
    updatedAt: new Date().toISOString()
  };
}

function buildSectionPrompt(state, reportNode) {
  const requirement = researchRequirements[state.project.researchRequirement] ?? researchRequirements.comprehensive;
  const flat = flatten(state.framework)
    .filter((item) => item.enabled)
    .map((item) => `${"  ".repeat(item.level - 1)}- ${item.title}（深度：${item.depth}）`)
    .join("\n");
  const resources = state.settings.strongResources
    .filter((item) => item.enabled)
    .map((item) => `${item.name}：${item.type}；${item.notes}`)
    .join("\n");
  const regions = state.settings.landingRegions
    .filter((item) => item.enabled)
    .map((item) => `${item.name}${item.notes ? `：${item.notes}` : ""}`)
    .join("\n");
  const methods = state.settings.landingMethods
    .filter((item) => item.enabled)
    .map((item) => `${item.name}：${item.notes}`)
    .join("\n");
  const files = state.files.map((item) => `${item.originalName}（${item.category}，${item.uploadedAt}）`).join("\n") || "暂无上传文件。";
  const sources = state.sources
    .map((item) => `${item.id}｜${item.title}｜${item.sourceType}｜${item.url || "无链接"}｜用于：${item.usedIn}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "你是严谨的企业公开资料与资本合作分析助手。必须基于用户上传资料、外部检索结果和已列明来源作答。禁止编造事实、融资金额、估值、股东、公告或负面信息。没有来源的内容只能写入 missingInfo 或待核实，不能写成确定事实。只返回严格 JSON，不要 Markdown，不要解释 JSON 以外的内容。"
    },
    {
      role: "user",
      content: `请为清大浦恒 AI 报告生成单个章节草稿。

当前企业：
企业名称：${state.project.companyName || "未填写"}
研究要求：${requirement.label}
研究要求解释：${requirement.instruction}
如果企业名称是简称、别名或不完整名称，请基于公开资料做最佳可能性判断；无法确认的身份、主体、证券代码、工商信息必须进入 missingInfo，不得当作确定事实。

当前要生成的章节：
章节 ID：${reportNode.id}
章节标题：${reportNode.title}
分析深度：${reportNode.depth}
备注要求：${reportNode.notes || "无"}

完整报告框架：
${flat}

我方强资源：
${resources || "暂无启用资源。"}

重点落地区域：
${regions || "暂无启用区域。"}

可选落地方式：
${methods || "暂无启用方式。"}

上传资料：
${files}

可用来源清单：
${sources}

请按以下 JSON 结构返回：
{
  "title": "章节标题",
  "confidenceScore": 0到100的整数,
  "confidenceReason": "格式：资料充分度：...｜主要依据：...｜主要缺口：...",
  "sourceCoverage": "说明本节覆盖了哪些来源类型，以及哪些来源不足",
  "keyFindings": ["3到6条要点"],
  "analysisText": "可直接进入报告正文的中文段落。若是资本合作分析，必须覆盖近期资本动态、融资情况、近几轮估值、主要投资者、公司或大股东基金出资、合作基金可能性；若资料不足，要明确说资料不足。",
  "missingInfo": ["待核实或待补充信息"],
  "citations": [
    {
      "id": "必须优先使用上方可用来源清单中的 id；如果是用户上传资料，用 source-user-upload",
      "title": "来源标题",
      "url": "来源链接，可为空",
      "sourceType": "上传材料/公开披露/公开新闻/工商监管/行情财务/其他",
      "publishedAt": "发布日期，可为空",
      "usedIn": "本来源支撑的判断"
    }
  ]
}`
    }
  ];
}

function messagesToPrompt(messages) {
  return messages
    .map((message) => `${message.role === "system" ? "系统规则" : "用户任务"}：\n${message.content}`)
    .join("\n\n");
}

function extractOpenSearchAnswer(payload) {
  if (payload.code || payload.message) {
    throw new Error(`OpenSearch 返回错误：${payload.code || "ERROR"} ${payload.message || ""}`);
  }
  if (typeof payload?.result?.text === "string") return payload.result.text;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const message = payload.errors.map((error) => `${error.code || "ERROR"} ${error.message || ""}`).join("; ");
    throw new Error(`OpenSearch 返回错误：${message}`);
  }
  const data = payload?.result?.data;
  if (Array.isArray(data)) {
    const answerItem = data.find((item) => typeof item.answer === "string") ?? data[0];
    if (answerItem?.answer) return answerItem.answer;
  }
  if (typeof payload?.result?.answer === "string") return payload.result.answer;
  if (typeof payload?.answer === "string") return payload.answer;
  throw new Error("OpenSearch 未返回可解析的 answer。");
}

async function callOpenSearchForSection(state, reportNode) {
  const { apiKey, openSearchHost, openSearchAppName, model } = state.settings.qwen;
  if (!apiKey) {
    const error = new Error("模型 API Key 尚未配置，请先在设置菜单填写并测试连接。");
    error.status = 400;
    throw error;
  }
  if (!openSearchHost || !openSearchAppName) {
    const error = new Error("OpenSearch Host 或应用名称尚未配置。");
    error.status = 400;
    throw error;
  }

  const endpoint = `${openSearchHost.replace(/\/$/, "")}/v3/openapi/workspaces/${encodeURIComponent(openSearchAppName)}/text-generation/${encodeURIComponent(model)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: buildSectionPrompt(state, reportNode),
      stream: false,
      csi_level: "none",
      parameters: {
        temperature: 0.2,
        max_tokens: 4096
      }
    })
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`OpenSearch 返回非 JSON 内容：${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`OpenSearch 请求失败 ${response.status}：${text.slice(0, 300)}`);
  }

  const answer = extractOpenSearchAnswer(payload);
  const parsed = JSON.parse(cleanJsonText(answer));
  return normalizeDraft(parsed, reportNode);
}

async function callQwenForSection(state, reportNode) {
  const { apiKey, baseUrl, model, provider } = state.settings.qwen;
  if (!apiKey) {
    const error = new Error("模型 API Key 尚未配置，请先在设置菜单填写并测试连接。");
    error.status = 400;
    throw error;
  }

  if (provider === "opensearch") {
    return callOpenSearchForSection(state, reportNode);
  }

  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: buildSectionPrompt(state, reportNode),
    response_format: { type: "json_object" }
  });

  const content = completion.choices?.[0]?.message?.content ?? "";
  if (!content) {
    throw new Error("模型未返回内容。");
  }
  const parsed = JSON.parse(cleanJsonText(content));
  return normalizeDraft(parsed, reportNode);
}

function paragraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 140, line: 320 },
    ...options,
    children: [new TextRun({ text, font: "Microsoft YaHei", size: 22, ...options.run })]
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, font: "Microsoft YaHei", size: 21 })]
  });
}

function confidenceLine(section) {
  return `置信度：${section.confidenceScore}%｜${section.confidenceReason || "暂无说明"}｜资料覆盖：${section.sourceCoverage || "未说明"}`;
}

function sourceRows(citations) {
  if (citations.length === 0) {
    return [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            children: [paragraph("暂无可列明引用来源。")]
          })
        ]
      })
    ];
  }
  return citations.map(
    (item) =>
      new TableRow({
        children: [
          cell(item.title || "未命名来源"),
          cell(item.sourceType || "未分类"),
          cell(item.publishedAt || ""),
          cell(item.usedIn || ""),
          cell(item.url || "")
        ]
      })
  );
}

function cell(text, shading = undefined) {
  return new TableCell({
    shading,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: String(text), font: "Microsoft YaHei", size: 18 })]
      })
    ]
  });
}

async function buildDocx(state) {
  const confirmed = [];
  walk(state.framework, (item, parent, level) => {
    const section = state.sections[item.id];
    if (
      item.enabled &&
      item.includeInWord &&
      section?.status === "confirmed" &&
      item.id !== "citation-appendix"
    ) {
      confirmed.push({ node: item, section, level });
    }
  });

  if (confirmed.length === 0) {
    const error = new Error("至少需要确认一个章节后才能生成 Word。");
    error.status = 400;
    throw error;
  }

  const allCitations = [];
  for (const item of confirmed) {
    for (const cite of item.section.citations ?? []) {
      allCitations.push({ ...cite, usedIn: cite.usedIn || item.section.title });
    }
  }
  const citationMap = new Map();
  for (const cite of allCitations) {
    citationMap.set(`${cite.id}-${cite.usedIn}-${cite.url}`, cite);
  }
  const uniqueCitations = Array.from(citationMap.values());

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: `${state.project.companyName || "目标企业"}公开资料与合作分析报告`,
          bold: true,
          font: "Microsoft YaHei",
          size: 36,
          color: "0D6B5F"
        })
      ]
    }),
    paragraph(`报告日期：${new Date().toLocaleDateString("zh-CN")}`, {
      alignment: AlignmentType.CENTER,
      run: { color: "5D6774" }
    }),
    paragraph("资料说明：本报告基于用户确认章节生成。未列明来源或置信度不足的信息应作为待核实事项，不构成审计、法律意见或投资承诺。", {
      run: { color: "5D6774" }
    })
  ];

  for (const item of confirmed) {
    children.push(
      new Paragraph({
        heading: item.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 80 },
        children: [
          new TextRun({
            text: item.section.title,
            bold: true,
            font: "Microsoft YaHei",
            color: item.level === 1 ? "0D6B5F" : "1D2939"
          })
        ]
      }),
      paragraph(confidenceLine(item.section), {
        run: { color: item.section.confidenceScore >= 70 ? "0D6B5F" : "B25E09", bold: true }
      })
    );

    if (item.section.keyFindings?.length) {
      children.push(paragraph("关键要点", { run: { bold: true } }));
      item.section.keyFindings.forEach((finding) => children.push(bullet(finding)));
    }

    if (item.section.analysisText) {
      item.section.analysisText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => children.push(paragraph(line)));
    }

    if (item.section.missingInfo?.length) {
      children.push(paragraph("待核实与资料缺口", { run: { bold: true, color: "B25E09" } }));
      item.section.missingInfo.forEach((gap) => children.push(bullet(gap)));
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
      children: [new TextRun({ text: "引用来源附录", bold: true, font: "Microsoft YaHei", color: "0D6B5F" })]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "D0D5DD" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "D0D5DD" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "D0D5DD" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "D0D5DD" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EAECF0" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "EAECF0" }
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell("来源名称", { fill: "E7F3F0" }),
            cell("类型", { fill: "E7F3F0" }),
            cell("发布日期", { fill: "E7F3F0" }),
            cell("使用位置", { fill: "E7F3F0" }),
            cell("链接", { fill: "E7F3F0" })
          ]
        }),
        ...sourceRows(uniqueCitations)
      ]
    })
  );

  const doc = new Document({
    creator: "清大浦恒 AI",
    title: `${state.project.companyName || "目标企业"}公开资料与合作分析报告`,
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Microsoft YaHei", size: 22 },
          paragraph: { spacing: { line: 320, after: 140 } }
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const slug = `${state.project.companyName || "puheng-report"}-${Date.now()}`
    .replace(/[^\p{Script=Han}\w.-]+/gu, "-")
    .slice(0, 80);
  const filename = `${slug}.docx`;
  const filepath = path.join(EXPORT_DIR, filename);
  await fs.writeFile(filepath, buffer);
  return { filename, url: `/exports/${filename}` };
}

app.get("/api/state", async (_req, res) => {
  const state = await readState();
  res.json(publicState(state));
});

app.patch("/api/project", async (req, res) => {
  const state = await readState();
  state.project = { ...state.project, ...req.body };
  if (req.body?.researchRequirement) {
    state.framework = applyResearchDepths(state.framework, state.project.researchRequirement);
    syncSectionsWithFramework(state);
  }
  await writeState(state);
  res.json(publicState(state));
});

app.patch("/api/settings", async (req, res) => {
  const state = await readState();
  const next = req.body ?? {};
  if (next.qwen) {
    state.settings.qwen = {
      ...state.settings.qwen,
      ...next.qwen,
      apiKey:
        typeof next.qwen.apiKey === "string" && next.qwen.apiKey.length > 0
          ? next.qwen.apiKey
          : next.qwen.clearApiKey
            ? ""
            : state.settings.qwen.apiKey
    };
    delete state.settings.qwen.clearApiKey;
  }
  for (const key of ["externalApis", "strongResources", "landingRegions", "landingMethods"]) {
    if (Array.isArray(next[key])) state.settings[key] = next[key];
  }
  await writeState(state);
  res.json(publicState(state));
});

app.post("/api/settings/qwen/test", async (_req, res, next) => {
  try {
    const state = await readState();
    if (!state.settings.qwen.apiKey) {
      res.status(400).json({ message: "模型 API Key 尚未配置。" });
      return;
    }
    if (state.settings.qwen.provider === "opensearch") {
      const { apiKey, openSearchHost, openSearchAppName, model } = state.settings.qwen;
      const endpoint = `${openSearchHost.replace(/\/$/, "")}/v3/openapi/workspaces/${encodeURIComponent(openSearchAppName)}/text-generation/${encodeURIComponent(model)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "只返回 JSON。" },
            { role: "user", content: "{\"ok\":true}" }
          ],
          stream: false,
          csi_level: "none",
          parameters: { max_tokens: 64, temperature: 0.2 }
        })
      });
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`OpenSearch 返回非 JSON 内容：${text.slice(0, 200)}`);
      }
      if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
        const detail = Array.isArray(payload.errors) ? JSON.stringify(payload.errors) : text;
        throw new Error(`OpenSearch 连接测试失败：${detail.slice(0, 300)}`);
      }
      res.json({ ok: true, sample: extractOpenSearchAnswer(payload).slice(0, 300) });
      return;
    }
    const client = new OpenAI({
      apiKey: state.settings.qwen.apiKey,
      baseURL: state.settings.qwen.baseUrl
    });
    const result = await client.chat.completions.create({
      model: state.settings.qwen.model,
      messages: [
        { role: "system", content: "只回复 JSON。" },
        { role: "user", content: "{\"ok\":true}" }
      ],
      temperature: 0,
      max_tokens: 20
    });
    res.json({ ok: true, sample: result.choices?.[0]?.message?.content ?? "" });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/framework", async (req, res) => {
  const state = await readState();
  state.framework = req.body.framework;
  syncSectionsWithFramework(state);
  await writeState(state);
  res.json(publicState(state));
});

app.patch("/api/sections/:id", async (req, res) => {
  const state = await readState();
  const section = state.sections[req.params.id];
  if (!section) {
    res.status(404).json({ message: "章节不存在。" });
    return;
  }
  state.sections[req.params.id] = {
    ...section,
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  await writeState(state);
  res.json(publicState(state));
});

app.post("/api/sections/:id/draft", async (req, res, next) => {
  try {
    const state = await readState();
    const reportNode = findNode(state.framework, req.params.id);
    if (!reportNode) {
      res.status(404).json({ message: "章节不存在。" });
      return;
    }
    const section = state.sections[req.params.id];
    if (section?.locked) {
      res.status(409).json({ message: "该章节已确认并锁定，请先解锁再重新生成。" });
      return;
    }
    reportNode.status = "generating";
    state.sections[req.params.id] = { ...section, status: "generating" };
    await writeState(state);

    const draft = await callQwenForSection(state, reportNode);
    state.sections[req.params.id] = draft;
    reportNode.status = draft.status;
    await writeState(state);
    res.json(publicState(state));
  } catch (error) {
    const state = await readState();
    const reportNode = findNode(state.framework, req.params.id);
    if (reportNode) reportNode.status = "not_started";
    if (state.sections[req.params.id]) state.sections[req.params.id].status = "not_started";
    await writeState(state);
    next(error);
  }
});

app.post("/api/sections/:id/confirm", async (req, res) => {
  const state = await readState();
  const section = state.sections[req.params.id];
  const reportNode = findNode(state.framework, req.params.id);
  if (!section || !reportNode) {
    res.status(404).json({ message: "章节不存在。" });
    return;
  }
  state.sections[req.params.id] = {
    ...section,
    ...req.body,
    status: "confirmed",
    locked: true,
    updatedAt: new Date().toISOString()
  };
  reportNode.status = "confirmed";
  reportNode.locked = true;
  await writeState(state);
  res.json(publicState(state));
});

app.post("/api/sections/:id/unlock", async (req, res) => {
  const state = await readState();
  const section = state.sections[req.params.id];
  const reportNode = findNode(state.framework, req.params.id);
  if (!section || !reportNode) {
    res.status(404).json({ message: "章节不存在。" });
    return;
  }
  section.locked = false;
  section.status = "needs_review";
  reportNode.locked = false;
  reportNode.status = "needs_review";
  await writeState(state);
  res.json(publicState(state));
});

app.post("/api/upload", upload.array("files"), async (req, res) => {
  const state = await readState();
  const uploaded = (req.files ?? []).map((file) => ({
    id: randomUUID(),
    originalName: file.originalname,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    category: req.body.category || "企业资料",
    path: file.path
  }));
  state.files.push(...uploaded);
  if (uploaded.length) {
    state.sources.push(
      ...uploaded.map((file) =>
        citation(file.id, file.originalName, "上传材料", "用户上传资料", "", file.uploadedAt.slice(0, 10))
      )
    );
  }
  await writeState(state);
  res.json(publicState(state));
});

app.post("/api/export/docx", async (_req, res, next) => {
  try {
    const state = await readState();
    const result = await buildDocx(state);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    message: error.message || "服务器处理失败。"
  });
});

const port = process.env.PORT || 8787;
await ensureStorage();
app.listen(port, () => {
  console.log(`Puheng AI server running at http://localhost:${port}`);
});

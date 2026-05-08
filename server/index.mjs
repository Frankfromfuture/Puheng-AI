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
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
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
    ],
    promptEngineering: {
      globalStyle: ""
    }
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


const DEFAULT_GLOBAL_STYLE = `报告生成时须严格遵循以下风格要求：
1. 简称原则：企业名称首次出现后全文使用简称，不重复完整名称。
2. 信息时效：所有数据与判断以生成日为基准，仅引用最新可查公开信息；引用历史数据须标注时间节点。
3. 分析视角：面向投资人与资源整合者，站在"为企业创造可落地价值"的角度，客观评估合作与投资策略，不做主观情感性表达。
4. 文风：简练不啰嗦，避免铺垫与重复。禁止出现"我""你"等口语词汇，禁止推销性语言。
5. 段落结构：长内容须分段，段落不宜过散；并列要点可分点，单点不宜过短（每点至少一句有效信息）。
6. 结论先行：每段首句为该段核心结论短句，后续句作支撑与展开。
7. 一级标题摘要：每个一级标题章节首段须为2-3句极简结论，凝练本章核心判断，供快速阅读。`;

const DEFAULT_NODE_NOTES = {
  "business-registration": "核实注册资本、实控人身份与股权穿透。历史沿革简述变更要点。不可查项进入待核实，禁止推测。",
  "shareholding": "列出前十大股东（穿透后）、一致行动人与重要股权质押/冻结。标注各方属性（产业/财务/国资）。",
  "filings-finance": "聚焦近三年营收、毛利率与净利润趋势。标注数据来源与报告期，重点异常须简要解释。",
  "negative-info": "列出司法、监管、舆情类负面记录，标注影响程度（重大/一般/关注）。无信息须明确说明，禁止留空。",
  "industry-chain-position": "明确产业链层级与核心供给环节，分析对上下游的议价权强弱。",
  "competitors": "列出3-5家主要竞争对手，从规模、技术与市场三维度简要对比，突出目标企业差异化定位。",
  "competitive-advantages": "从技术壁垒、资质、客户粘性、品牌四维度识别竞争优势，须有可核实依据，禁止泛化表述。",
  "upstream-downstream": "列出主要客户（如公开则含前五名）与核心供应商，分析集中度风险与关系稳定性。",
  "recent-capital-news": "梳理近12个月融资事件、股权变动及股东增减持。无信息须明确说明。",
  "financing-history": "梳理历次融资轮次、时间节点与领投机构（金额公开者列出），识别资本偏好与融资节奏。",
  "valuation-rounds": "仅引用公开或可推算的估值数据，不确定项标注「估算」并进入待核实，禁止编造数字。",
  "major-investors": "区分财务型与战略型投资者，重点标注知名机构与产业方背景，分析其与企业的战略关系。",
  "fund-contribution": "核查企业或实控人是否设立或出资产业基金，分析资本运作意图与LP构成。无记录须说明。",
  "cooperation-fund": "结合我方资源与企业资本需求，评估共设产业基金的可行性、切入时机与结构设计要点。",
  "capital-cooperation-advice": "输出1-3条优先级排序的资本合作路径，每条须含具体切入建议与风险提示。",
  "enterprise-needs": "从增长瓶颈、战略短板与资源缺口三维度识别3-5个核心需求，排除伪需求。",
  "resource-match": "将我方强资源与企业需求逐条交叉匹配，标注匹配强度（强/中/弱）与匹配逻辑。",
  "cooperation-priority": "综合匹配度与可落地性，输出优先推进的1-3个合作方向并说明优先级理由。",
  "next-actions": "输出90天内可启动的具体行动清单，每项须明确负责方、预期产出与推进条件。",
  "region-match": "将企业业务与我方重点落地区域交叉分析，识别高匹配区域并从政策、产业、空间三方面说明理由。",
  "investment-attraction": "评估企业符合哪类招商引资政策，结合产业偏好与税收贡献潜力给出可落地路径。",
  "land-cooperation": "分析企业土地使用需求，评估合作拿地的可行路径与谈判要点。",
  "leasing-landing": "识别适合租赁落地的场景（研发/运营/仓储），匹配我方园区资源，给出优先选址建议。",
  "landing-fund": "结合落地区域政府引导基金政策，评估联合设立专项基金的条件与投资范围。",
  "ninety-day-plan": "输出从初步接触到签约意向的90天行动路径，含关键里程碑、决策节点与所需资源。",
  "risks": "列出影响合作与投资决策的关键风险（经营/财务/法律/竞争）及信息缺口，标注优先级与核实建议。",
  "citation-appendix": "列出本报告所引用的全部来源，格式：序号、名称、类型、关键引用内容摘要。"
};

const DEFAULT_RESOURCE_NOTES = {
  "tsinghua-companies": "分析目标企业与清华系生态的协同点，包括技术对接、客户引荐、校友网络等合作可能，给出优先匹配方向。",
  "shanghai-soe": "评估目标企业与上海国央企的合作机会，识别供应链、战略合作或资本层面的切入点。",
  "shanghai-medical": "分析目标企业产品/服务在上海医疗系统的应用场景与落地路径，明确切入科室或机构。",
  "qingpu": "评估目标企业落地青浦的可行性，结合青浦产业政策、园区资源与企业需求进行交叉分析。",
  "longhua": "评估目标企业落地龙华的可行性，结合龙华制造业升级政策与企业供应链布局进行交叉分析。",
  "qingpu-region": "结合青浦区重点招商产业方向与企业业务特征，评估落地可行性与政策匹配度。",
  "longhua-region": "结合龙华区产业升级重点与企业供应链布局，评估落地可行性与空间资源匹配。",
  "attraction": "分析企业招商引资的适配性，结合业务规模、税收贡献与就业带动潜力评估可行性。",
  "land": "结合企业空间需求与我方区域合作资源，评估合作拿地的优先度与谈判策略。",
  "lease": "分析租赁落地的优先场景（写字楼/产业园/仓储），结合企业阶段性需求给出建议。",
  "coop-fund": "评估与目标企业联合设立专项产业基金的条件，包括规模、LP结构与投资范围。",
  "industry-fund": "分析对目标企业进行产业基金直投的条件（估值区间、轮次匹配、退出路径）。",
  "medical": "分析目标企业产品/技术在医疗系统的场景适配，识别具体合作切入科室或机构。",
  "soe": "评估目标企业与国央企开展战略合作的可能性，识别供应链引荐、联合项目或资本层面的机会。"
};

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
  // Migrate: add promptEngineering with defaults
  if (!state.meta.promptEngineeringV1) {
    state.promptEngineering ??= {};
    if (!state.promptEngineering.globalStyle) {
      state.promptEngineering.globalStyle = DEFAULT_GLOBAL_STYLE;
    }
    // Set default notes on framework nodes only if currently empty
    walk(state.framework ?? [], (node) => {
      if (!node.notes && DEFAULT_NODE_NOTES[node.id]) {
        node.notes = DEFAULT_NODE_NOTES[node.id];
      }
    });
    // Set default notes on resources only if currently empty
    for (const item of state.settings?.strongResources ?? []) {
      if (!item.notes && DEFAULT_RESOURCE_NOTES[item.id]) item.notes = DEFAULT_RESOURCE_NOTES[item.id];
    }
    for (const item of state.settings?.landingRegions ?? []) {
      if (!item.notes && DEFAULT_RESOURCE_NOTES[item.id]) item.notes = DEFAULT_RESOURCE_NOTES[item.id];
    }
    for (const item of state.settings?.landingMethods ?? []) {
      if (!item.notes && DEFAULT_RESOURCE_NOTES[item.id]) item.notes = DEFAULT_RESOURCE_NOTES[item.id];
    }
    state.meta.promptEngineeringV1 = true;
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
        `你是严谨的企业公开资料与资本合作分析助手。必须基于用户上传资料、外部检索结果和已列明来源作答。禁止编造事实、融资金额、估值、股东、公告或负面信息。没有来源的内容只能写入 missingInfo 或待核实，不能写成确定事实。只返回严格 JSON，不要 Markdown，不要解释 JSON 以外的内容。

报告全局风格要求（必须严格遵守）：
${
            (state.promptEngineering?.globalStyle || DEFAULT_GLOBAL_STYLE).trim()
          }`
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
    paragraph("资料说明：本报告基于工作台简报预览中的已确认章节正文生成，不构成审计、法律意见或投资承诺。", {
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
      })
    );

    if (item.section.analysisText) {
      item.section.analysisText
        .split("\n")
        .map((line) => line.trimEnd())
        .forEach((line) => children.push(paragraph(line)));
    } else {
      children.push(paragraph(""));
    }
  }

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

app.patch("/api/prompt-engineering", async (req, res) => {
  const state = await readState();
  state.promptEngineering ??= {};
  if (typeof req.body?.globalStyle === "string") {
    state.promptEngineering.globalStyle = req.body.globalStyle;
  }
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

app.post("/api/report/generate", async (req, res) => {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  try {
    const state = await readState();
    if (!state.settings.qwen.apiKey) {
      send("error", { message: "模型 API Key 尚未配置，请先在设置菜单填写并测试连接。" });
      res.end();
      return;
    }

    // Collect all enabled, non-locked nodes in order
    const nodesToGenerate = [];
    flatten(state.framework).forEach((item) => {
      if (item.enabled && !item.locked && !state.sections[item.id]?.locked) {
        const node = findNode(state.framework, item.id);
        if (node) nodesToGenerate.push(node);
      }
    });

    if (nodesToGenerate.length === 0) {
      send("error", { message: "没有可生成的章节（所有章节已锁定或未启用）。" });
      res.end();
      return;
    }

    send("start", { total: nodesToGenerate.length });

    for (let i = 0; i < nodesToGenerate.length; i++) {
      const reportNode = nodesToGenerate[i];
      const currentState = await readState();

      // Mark as generating
      const section = currentState.sections[reportNode.id];
      if (section?.locked) continue; // skip if locked in the meantime
      reportNode.status = "generating";
      currentState.sections[reportNode.id] = { ...section, status: "generating" };
      await writeState(currentState);

      send("generating", { id: reportNode.id, title: reportNode.title, index: i, total: nodesToGenerate.length });

      try {
        const freshState = await readState();
        const freshNode = findNode(freshState.framework, reportNode.id);
        const draft = await callQwenForSection(freshState, freshNode ?? reportNode);

        freshState.sections[reportNode.id] = draft;
        if (freshNode) freshNode.status = draft.status;
        await writeState(freshState);

        send("section", { id: reportNode.id, section: draft, index: i, total: nodesToGenerate.length });
      } catch (err) {
        // Mark failed section back to not_started and continue
        const errState = await readState();
        const errNode = findNode(errState.framework, reportNode.id);
        if (errNode) errNode.status = "not_started";
        if (errState.sections[reportNode.id]) errState.sections[reportNode.id].status = "not_started";
        await writeState(errState);

        send("section_error", { id: reportNode.id, title: reportNode.title, message: err.message });
      }
    }

    const finalState = await readState();
    send("done", { state: publicState(finalState) });
  } catch (err) {
    send("error", { message: err.message || "生成失败。" });
  }

  res.end();
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

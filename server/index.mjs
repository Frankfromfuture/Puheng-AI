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
  WidthType,
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

const depths = ["简版", "标准", "深入"];
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
  "order-enablement",
  "industry-fund",
  "medical",
  "soe"
]);

const researchRequirements = {
  brief: {
    label: "简要分析",
    instruction: "所有章节只保留关键判断、直接依据和必要缺口，重点说明投资、招商落地、合作赋能中最相关的一项结论。"
  },
  fundamental: {
    label: "基本面深度分析",
    instruction: "深入分析主体资质、团队、股东、财务、资产和经营质量，并说明基本面对投资价值、落地承载和合作可信度的影响。"
  },
  investment: {
    label: "投资合作分析",
    instruction: "以投资价值和资本合作为主线，重点分析产业位置、竞争格局、融资估值、股东资源、产业基金和退出/增值路径。"
  },
  landing: {
    label: "招商落地分析",
    instruction: "以招商落地可行性为主线，重点分析产业契合、区域政策、空间载体、租赁/拿地、税收就业贡献和政府谈判抓手。"
  },
  enablement: {
    label: "赋能合作分析",
    instruction: "以合作赋能为主线，识别企业真实需求、我方资源匹配、可引荐对象、合作抓手和优先推进路径。"
  },
  comprehensive: {
    label: "全面分析",
    instruction: "所有重点章节均展开，基础、市场、资本、赋能、落地与风险必须形成互相印证的可执行判断。"
  }
};

function depthForRequirement(requirement, nodeId, parentId) {
  const mode = researchRequirements[requirement] ? requirement : "comprehensive";
  const group = parentId || nodeId;
  if (mode === "brief") return "简版";
  if (mode === "comprehensive") {
    if (["capital-cooperation", "enablement", "landing-plan"].includes(group)) return "深入";
    return "深入";
  }
  if (mode === "fundamental") {
    if (group === "basic") return "深入";
    if (group === "market-position" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "investment") {
    if (group === "capital-cooperation") return "深入";
    if (group === "market-position") return "深入";
    if (group === "basic" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "landing") {
    if (group === "landing-plan") return "深入";
    if (group === "market-position") return "深入";
    if (group === "enablement" || group === "risks") return "标准";
    return "简版";
  }
  if (mode === "enablement") {
    if (group === "enablement") return "深入";
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
        node("founders-core-team", "创始人与核心团队", [], "简版"),
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
        node("financing-progress", "融资进展", [], "深入"),
        node("important-shareholders", "重要股东", [], "深入"),
        node("industrial-fund-progress", "产业基金进展", [], "深入"),
        node("capital-dynamics", "资本动态", [], "深入")
      ],
      "深入"
    ),
    node(
      "enablement",
      "赋能合作点分析",
      [
        node("enterprise-needs", "企业需求识别", [], "深入"),
        node("resource-match", "我方强资源匹配", [], "深入"),
        node("cooperation-priority", "合作点优先级", [], "深入"),
        node("next-actions", "推进动作", [], "标准")
      ],
      "深入"
    ),
    node(
      "landing-plan",
      "落地方案分析",
      [
        node("region-match", "区域匹配", [], "深入"),
        node("investment-attraction", "招商引资", [], "深入"),
        node("land-cooperation", "合作拿地", [], "深入"),
        node("leasing-landing", "租赁落地", [], "深入"),
        node("landing-fund", "合作基金", [], "深入")
      ],
      "深入"
    ),
    node("risks", "企业风险分析", [], "深入")
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

function normalizeReportNode(node) {
  const id = typeof node.id === "string" && node.id.trim() ? node.id : randomUUID();
  const title = typeof node.title === "string" && node.title.trim() ? node.title : "自定义章节";
  const depth = depths.includes(node.depth) ? node.depth : "标准";
  const status = ["not_started", "generating", "needs_review", "confirmed", "insufficient"].includes(node.status)
    ? node.status
    : "not_started";
  return {
    id,
    title,
    enabled: typeof node.enabled === "boolean" ? node.enabled : true,
    includeInWord: typeof node.includeInWord === "boolean" ? node.includeInWord : true,
    depth,
    notes: typeof node.notes === "string" ? node.notes : "",
    status,
    locked: Boolean(node.locked),
    children: Array.isArray(node.children) ? node.children.map(normalizeReportNode) : []
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
        { id: "order-enablement", name: "订单赋能", enabled: true, notes: "" }
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
1. 结论先行：每节先给明确判断，再用事实、数据、来源支撑。避免背景铺陈和空泛评价。
2. 交叉分析：第1-3章节（基础/市场/资本）绝对禁止提及或暗示我方合作、招商落地、资源协同等，必须纯粹陈述企业的客观事实与数据。仅第4-5章节才可进行合作点交叉分析。
3. 信息边界：所有事实以可查公开资料、上传资料和已列明来源为准；金额、估值、股东、客户、负面信息不可编造。不确定内容写入待核实。
4. 表达风格：简洁、直接、有逻辑。少写形容词，多写判断、依据、影响和下一步。禁止出现"我""你"等口语词汇，禁止推销性语言。
5. 段落结构：长内容须分段，段落之间必须保留一行空行（即两个段落之间用两个换行符分隔）。每段只表达一个核心判断，单段不宜过长。
6. 重点呈现：关键结论、核心风险、合作窗口、落地抓手等结论性提炼须使用 **加粗**。
7. 表格与文字穿插：适合结构化的信息要使用完整 Markdown 表格，但不要整节全部堆表格。每个重要小节应先用1-2句文字给出**结论性重点**，再用表格承载事实、数据和对比，表格后用短段解释影响、风险边界或下一步判断。表格必须包含表头、分隔行和完整数据行，例如：| 事项 | 时间 | 判断 | 依据 |\\n| :--- | :--- | :--- | :--- |\\n| 示例 | 待核实 | 示例判断 | 示例来源 |。融资轮次、股东结构、财务数据、竞品对比、客户/供应商、风险清单、资源匹配、落地路径、合作优先级、资本动态等尽量表格化，但必须与关键文字判断交替呈现。
8. 一级标题摘要：每个一级章节首段用2-3句极简结论。第1-3章只概括核心事实与现状；第4-5章概括落地与合作的核心意义。`;

const DEFAULT_DEPTH_INSTRUCTIONS = {
  "简版": "只输出核心判断、关键依据、直接影响和必要风险。每节尽量压缩为少量高密度段落，突出核心要点。",
  "标准": "在核心判断基础上补充关键事实、数据来源和简要推理。第1-3章回归纯客观评估；第4-5章才进行落地赋能等深度推理。并指出信息缺口。",
  "深入": "充分展开事实链、资本链、产业链。第1-3章严格客观分析风险与事项；第4-5章必须形成可执行判断：落地可行性、合作路径等。"
};

const DEFAULT_NODE_NOTES = {
  "business-registration": "核实企业主体、注册资本、实控人、上市状态、总部位置和关键工商变更。重点说明这些基础信息对企业本身经营与存续的影响。不可查项列入待核实。",
  "founders-core-team": "识别创始人、联合创始人及核心高管，重点分析学历背景、科研实力、论文/专利/项目成果、过往工作与创业经历。进一步判断团队之间的同学、同事、校友、科研合作、投资或创业伙伴关系，以及团队结构对融资、研发、与业务发展的支撑。",
  "shareholding": "梳理前十大股东、实控人、一致行动人、员工持股平台、产业/财务/国资股东和质押冻结情况。重点判断股东结构对融资能力、产业资源、公司独立性、治理稳定性的影响。",
  "filings-finance": "聚焦近三年营收、毛利率、净利润、现金流、研发投入和重大经营变化。不要堆砌财务数字，要解释趋势对投资价值、扩张能力、抗风险能力和长远发展的含义。",
  "negative-info": "梳理司法、监管、舆情、经营异常、失信、环保、安全生产等负面信息。按重大/一般/关注分级，并说明对投资、上市合规、企业声誉和持续经营的影响。",
  "industry-chain-position": "明确企业所在产业链环节、核心产品/服务、上下游依赖和议价能力。重点判断其是否处在区域招商重点链条、是否具备补链强链价值、是否适合资本或资源协同。",
  "competitors": "选择3-5家可比企业，从规模、技术、客户、融资、区域布局和落地能力对比。结论要指出目标企业的相对位置、可替代风险和招商/投资差异化卖点。",
  "competitive-advantages": "从技术壁垒、产品成熟度、客户粘性、资质牌照、成本效率、团队能力和资本背书识别优势。每个优势都要对应可核实依据，并说明能否转化为投资价值、落地价值或合作价值。",
  "upstream-downstream": "梳理主要客户、供应商、生态伙伴和渠道资源，分析集中度、稳定性和议价关系。重点识别可被引荐、可被赋能、可形成区域产业协同的上下游节点。",
  "financing-progress": "按时间顺序梳理所有可查融资轮次，列出日期、轮次、金额、估值或估值区间、领投/跟投方、资金用途和来源。重点判断融资节奏、估值变化、资本认可度及下一轮融资窗口。",
  "important-shareholders": "识别知名投资机构、产业投资者、政府/国资投资者、战略股东、创始团队和员工持股平台。重点分析股东资源能否带来客户、供应链、牌照、资金、政府关系或落地支持。",
  "industrial-fund-progress": "统计公司及股东出资或参与产业基金的情况，包括基金名称、规模、出资主体、管理机构、合作LP、产业主题、投向和已投项目。核查是否设立CVC，并分析其产业布局、资本合作入口和区域基金合作可能。",
  "capital-dynamics": "梳理重大融资、并购重组、上市/辅导/递表、定增、股权转让、回购、重大资本开支和资产处置。重点说明事件对估值、资金压力、战略方向、招商落地和合作窗口的影响。",
  "enterprise-needs": "从增长瓶颈、客户拓展、产能空间、融资需求、政策资质、供应链补强、场景验证和品牌背书识别真实需求。排除泛泛需求，说明需求背后的业务原因和可介入窗口。",
  "resource-match": "将我方强资源与企业需求逐项匹配，按强/中/弱标注匹配度。每项必须说明匹配逻辑、可提供资源、企业可能收益、我方价值和推进条件。",
  "cooperation-priority": "综合投资价值、落地可行性、资源匹配度、企业紧迫性和执行难度，给出1-3个优先合作方向。每个方向说明为什么优先、从哪里切入、需要谁参与、预期产出是什么。",
  "next-actions": "输出可立即启动的推进动作，覆盖接触对象、材料准备、资源引荐、区域对接、基金/资本沟通和下一步核实事项。每项明确负责方、前置条件和可衡量产出。",
  "region-match": "将企业业务、产业链环节、客户/供应链、空间需求、人才需求与重点区域政策、产业基础、园区载体和基金资源交叉分析。结论要指出最适合落地的区域和原因。",
  "investment-attraction": "评估企业是否适合招商引资，重点分析落地业态、税收/就业/产值潜力、政策适配、总部/研发/生产/销售中心可能性和政府谈判抓手。",
  "land-cooperation": "分析企业是否存在拿地或重资产空间需求，判断用地类型、面积、建设内容、投资强度、产出贡献和谈判条件。不可凭空估算，估算必须说明依据。",
  "leasing-landing": "分析企业适合租赁落地的场景，如总部办公、研发中心、展示中心、销售中心、仓储或小试中试空间。匹配园区载体、面积区间、租赁周期和落地优先级。",
  "landing-fund": "结合企业融资阶段、产业方向、区域基金政策和我方资源，评估专项基金、产业基金直投或基金招商的可行性。说明基金角色、可能规模、LP结构、投资逻辑和风险。",
  "risks": "从经营、财务、法律合规、治理结构、技术替代、客户集中、融资压力、落地承诺和合作执行角度识别风险。每项风险都要说明对投资、招商落地、合作赋能的影响和核实办法。"
};

const DEFAULT_RESOURCE_NOTES = {
  "tsinghua-companies": "分析目标企业与清华系企业、校友网络、科研成果和产业资源的协同点，重点聚焦于新紫光系企业，识别技术合作、采购关系、投资合作和生态合作入口。",
  "shanghai-soe": "评估目标企业与上海国央企，尤其是申能、上汽、久事、漕河泾、临港等、在客户采购、供应链、场景开放、战略投资、联合项目和落地采购方面的合作机会，明确最可行的切入对象和路径。",
  "shanghai-medical": "分析目标企业产品/技术在上海知名三甲医院与申康中心的应用场景，识别科室、医院、渠道、试点路径和合规门槛，并判断是否可形成示范场景、采购订单与招商落地抓手。",
  "qingpu": "评估企业与青浦产业方向、空间载体、基金资源、交通区位和重点企业生态的匹配度，说明适合落地的业态、政策抓手和合作入口。",
  "longhua": "评估企业与深圳龙华制造业升级、供应链生态、空间载体和产业政策的匹配度，说明落地价值、上下游协同和合作切入点。",
  "qingpu-region": "结合青浦区及徐泾镇产业规划、园区载体、基金政策和重点企业生态，判断企业落地的产业契合度、空间适配度、税收/就业贡献和招商推进路径。",
  "longhua-region": "结合龙华区及民治街道、深国际华南物流园片区的产业规划、空间资源和制造业生态，判断企业落地的产业契合度、供应链协同和招商推进路径。",
  "attraction": "分析企业在所选择重点落地区域内的招商引资落地的适配性，明确可能落地业态、业务规模、税收贡献、就业带动、政策诉求和政府谈判抓手，给出优先推进方式。",
  "land": "分析企业是否具备合作拿地需求，如产能扩产、第二总部、建设创新研发中心、募投固定资产等，判断用地用途、面积区间、投资强度、建设内容、产出贡献和前置条件，避免无依据承诺。",
  "lease": "分析所选择重点落地区域内的国央企重点园区与政策，分析企业最迫切需求，匹配租赁落地优先场景（生产基地、研发空间、办公空间、创新空间等），说明面积、周期、成本敏感度和快速落地路径。",
  "coop-fund": "评估与所选择的重点落地区域政府资金，与企业联合设立专项产业基金的可行性，说明基金主题、规模区间、LP结构、管理机构、投资范围、招商带动和风险边界。",
  "order-enablement": "围绕我方以上的强资源赋能提示词，分析目标企业与强赋能资源间的订单合作机会"
};

function migrateState(state) {

  let changed = false;
  state.project ??= {};
  if (!state.project.researchRequirement) {
    state.project.researchRequirement = "comprehensive";
    changed = true;
  }
  state.meta ??= {};
  if (!state.meta.landingMethodsOrderEnablementV1) {
    state.settings ??= {};
    state.settings.landingMethods ??= [];
    state.settings.landingMethods = state.settings.landingMethods.filter(
      (item) => !["industry-fund", "medical", "soe"].includes(item.id)
    );
    if (!state.settings.landingMethods.some((item) => item.id === "order-enablement")) {
      state.settings.landingMethods.push({
        id: "order-enablement",
        name: "订单赋能",
        enabled: true,
        notes: DEFAULT_RESOURCE_NOTES["order-enablement"]
      });
    }
    state.meta.landingMethodsOrderEnablementV1 = true;
    changed = true;
  }
  if (!state.meta.removeCitationAppendixV1) {
    state.framework = (state.framework ?? []).filter((node) => node.id !== "citation-appendix");
    if (state.sections) delete state.sections["citation-appendix"];
    state.meta.removeCitationAppendixV1 = true;
    changed = true;
  }
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
  if (!state.meta.globalStyleV2) {
    if (state.promptEngineering?.globalStyle?.includes("所有章节都要主动连接投资价值、招商落地、合作赋能三类视角")) {
      state.promptEngineering.globalStyle = DEFAULT_GLOBAL_STYLE;
    }
    state.meta.globalStyleV2 = true;
    changed = true;
  }
  if (!state.meta.depthInstructionsV1) {
    state.promptEngineering ??= {};
    state.promptEngineering.depthInstructions ??= {};
    const depthInstructions = state.promptEngineering.depthInstructions;
    for (const depth of depths) {
      if (!depthInstructions[depth]) {
        depthInstructions[depth] = DEFAULT_DEPTH_INSTRUCTIONS[depth];
      }
    }
    state.meta.depthInstructionsV1 = true;
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
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    trimmed = trimmed.slice(start, end + 1);
  }

  let inString = false;
  let escaped = false;
  let fixed = "";
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      fixed += char;
    } else if (char === '\\' && !escaped) {
      escaped = true;
      fixed += char;
    } else {
      if (escaped) escaped = false;
      if (inString && char === '\n') {
        fixed += '\\n';
      } else if (inString && char === '\r') {
        fixed += '\\r';
      } else if (inString && char === '\t') {
        fixed += '\\t';
      } else {
        fixed += char;
      }
    }
  }
  return fixed;
}

function parseModelJson(text, context = "模型返回内容") {
  try {
    return JSON.parse(cleanJsonText(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}不是严格 JSON：${message}`);
  }
}

function extractJsonStringField(text, field) {
  const source = String(text || "");
  const marker = `"${field}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const colonIndex = source.indexOf(":", markerIndex + marker.length);
  if (colonIndex === -1) return "";
  let quoteIndex = -1;
  for (let i = colonIndex + 1; i < source.length; i++) {
    if (/\s/.test(source[i])) continue;
    if (source[i] === '"') quoteIndex = i;
    break;
  }
  if (quoteIndex === -1) return "";

  let value = "";
  let escaped = false;
  for (let i = quoteIndex + 1; i < source.length; i++) {
    const char = source[i];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      value += char;
    }
  }

  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"");
  }
}

function extractJsonStringArrayField(text, field) {
  const source = String(text || "");
  const marker = `"${field}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return [];
  const start = source.indexOf("[", markerIndex + marker.length);
  if (start === -1) return [];
  const tail = source.slice(start);
  const values = [];
  const pattern = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = pattern.exec(tail))) {
    const before = tail.slice(0, match.index);
    if (before.includes("]")) break;
    try {
      values.push(JSON.parse(`"${match[1]}"`));
    } catch {
      values.push(match[1]);
    }
  }
  return values.filter(Boolean);
}

function normalizeUnstructuredAnswer(answer, reportNode) {
  const cleaned = String(answer || "")
    .trim()
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const looksLikeJson = cleaned.startsWith("{") || cleaned.includes('"analysisText"');
  if (!looksLikeJson) return { body: cleaned, keyFindings: [], missingInfo: [] };

  const body = extractJsonStringField(cleaned, "analysisText");
  const keyFindings = extractJsonStringArrayField(cleaned, "keyFindings");
  const missingInfo = extractJsonStringArrayField(cleaned, "missingInfo");
  if (body || keyFindings.length > 0 || missingInfo.length > 0) {
    return { body, keyFindings, missingInfo };
  }

  const compact = cleaned
    .replace(/^\{\s*/, "")
    .replace(/\s*\}\s*$/, "")
    .replace(/^\s*"[^"]+"\s*:\s*/gm, "")
    .replace(/[{},]\s*$/gm, "")
    .trim();
  return { body: compact, keyFindings: [], missingInfo: [] };
}

function draftFromUnstructuredAnswer(answer, reportNode, reason) {
  const normalized = normalizeUnstructuredAnswer(answer, reportNode);

  return normalizeDraft({
    title: reportNode.title,
    confidenceScore: 50,
    confidenceReason: `模型已返回内容，但格式不是严格 JSON，系统已保留原文供人工核验。原因：${reason}`,
    sourceCoverage: "模型返回格式异常，来源引用需人工核验。",
    keyFindings: normalized.keyFindings,
    analysisText: normalized.body || "模型返回内容为空或不可解析，请重试生成。",
    missingInfo: [
      "模型返回格式异常，需人工核验本节内容与来源。",
      ...normalized.missingInfo
    ],
    citations: []
  }, reportNode);
}

function stripHtml(value = "") {
  return value
    .replace(/<!--red_beg-->|<!--red_end-->/g, "")
    .replace(/<em>|<\/em>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ensp;|&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteSearchUrl(url, base) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

async function searchQueriesForSection(state, reportNode) {
  const companyName = state.project.companyName?.trim();
  if (!companyName) return [];
  const quoted = `"${companyName}"`;
  const currentYear = new Date().getFullYear();

  const sectionQueries = {
    "business-registration": [
      `${quoted} 天眼查 企查查 工商注册`,
      `${quoted} 注册资本 法定代表人 工商变更`,
      `${quoted} 总部地址 成立日期 企业类型`
    ],
    "founders-core-team": [
      `${quoted} 创始人 核心团队 学历 科研 工作经历`,
      `${quoted} CEO CTO 高管 团队 背景`,
      `${quoted} 创始团队 创业经历 清华 科研`
    ],
    "shareholding": [
      `${quoted} 股东 投资方 企查查 天眼查`,
      `${quoted} 前十大股东 实控人 股权比例`,
      `${quoted} 员工持股平台 股权结构 图谱`
    ],
    "filings-finance": [
      `${quoted} 营收 净利润 毛利率 财务数据`,
      `${quoted} 财报 招股书 年报 业绩`,
      `${quoted} 研发投入 现金流 经营变化`
    ],
    "negative-info": [
      `${quoted} 司法诉讼 裁判文书 被执行人`,
      `${quoted} 行政处罚 经营异常 失信`,
      `${quoted} 负面 环保 维权 争议`
    ],
    "industry-chain-position": [
      `${quoted} 产业链上下游 核心产品 服务`,
      `${quoted} 行业地位 市场份额 议价能力`,
      `${quoted} 供应商 客户 供应链`
    ],
    competitors: [
      `${quoted} 竞品 对标企业 竞争对手`,
      `${quoted} 市场竞争 份额 排名 对比`,
      `${quoted} 差异化 优势 劣势 替代品`
    ],
    "competitive-advantages": [
      `${quoted} 核心技术 壁垒 专利 牌照`,
      `${quoted} 产品成熟度 客户粘性 优势`,
      `${quoted} 获奖 资质 行业认可度`
    ],
    "upstream-downstream": [
      `${quoted} 主要客户 合作方 渠道`,
      `${quoted} 供应商 采购 供应链 合作伙伴`,
      `${quoted} 生态 战略合作 签约`
    ],
    "financing-progress": [
      `${quoted} 融资 轮次 投资方 估值`,
      `${quoted} Pre-A A轮 B轮 IPO 融资`,
      `${quoted} 投资界 投中网 36氪 融资`
    ],
    "important-shareholders": [
      `${quoted} 股东 投资机构 产业投资者 国资`,
      `${quoted} 重要股东 工商变更 增资 投资方`,
      `${quoted} 股权结构 招商局 华泰 国方`
    ],
    "industrial-fund-progress": [
      `${quoted} 产业基金 CVC 出资 LP`,
      `${quoted} 设立基金 管理机构 投资机构`,
      `${quoted} 战略投资 产业布局 基金投向`
    ],
    "capital-dynamics": [
      `${quoted} 并购 重组 上市 辅导 资本动态`,
      `${quoted} 定增 股权转让 回购 重大开支`,
      `${quoted} 资产处置 新闻 投资并购`
    ],
    "enterprise-needs": [
      `${quoted} 战略合作 产业需求 客户需求`,
      `${quoted} 招商 落地 产能 供应链`,
      `${quoted} 业务布局 合作需求 痛点`
    ],
    "resource-match": [
      `${quoted} 合作伙伴 生态 产业资源`,
      `${quoted} 供应链 渠道 客户 资源对接`,
      `${quoted} 场景落地 战略合作`
    ],
    "cooperation-priority": [
      `${quoted} 合作 产业协同 投资价值`,
      `${quoted} 商业化 落地 重点客户`,
      `${quoted} 招商引资 产业园 区域合作`
    ],
    "region-match": [
      `${quoted} 总部 基地 项目落地 区域布局`,
      `${quoted} 生产基地 研发中心 分公司`,
      `${quoted} 政府合作 产业园 落地`
    ],
    "investment-attraction": [
      `${quoted} 招商引资 落地 项目投资`,
      `${quoted} 融资 政府基金 产业基金`,
      `${quoted} 区域合作 产业政策`
    ],
    "land-cooperation": [
      `${quoted} 拿地 用地 厂房 基地`,
      `${quoted} 生产基地 项目建设 产能`,
      `${quoted} 园区 落地 土地`
    ],
    "leasing-landing": [
      `${quoted} 办公 研发中心 厂房 租赁`,
      `${quoted} 入驻 园区 载体 空间`,
      `${quoted} 区域布局 落地载体`
    ],
    "landing-fund": [
      `${quoted} 产业基金 政府基金 引导基金`,
      `${quoted} 融资 落地 基金合作`,
      `${quoted} 投资机构 股东 出资基金`
    ],
    risks: [
      `${quoted} 风险 经营风险 财务风险`,
      `${quoted} 诉讼 行政处罚 经营异常`,
      `${quoted} 融资风险 竞争风险 合规风险`
    ]
  };

  const capitalDomains = ["pedaily.cn", "chinaventure.com.cn", "36kr.com", "tmtpost.com", "lieyunwang.com", "iyiou.com", "laoyaoba.com", "sohu.com"];
  const registryDomains = ["qcc.com", "tianyancha.com", "aiqicha.baidu.com", "qixin.com"];
  const newsDomains = ["36kr.com", "tmtpost.com", "yicai.com", "stcn.com", "cls.cn", "jiemian.com"];
  const domainHints = new Set();

  if (["business-registration", "shareholding", "important-shareholders", "negative-info"].includes(reportNode.id)) {
    registryDomains.forEach((domain) => domainHints.add(`site:${domain} ${quoted} ${reportNode.title}`));
  }
  if (["financing-progress", "important-shareholders", "industrial-fund-progress", "capital-dynamics"].includes(reportNode.id)) {
    capitalDomains.forEach((domain) => domainHints.add(`site:${domain} ${quoted} 融资 投资方 股东`));
  }
  if (["industry-chain-position", "competitors", "competitive-advantages", "upstream-downstream", "enterprise-needs", "resource-match", "cooperation-priority", "region-match", "investment-attraction"].includes(reportNode.id)) {
    newsDomains.forEach((domain) => domainHints.add(`site:${domain} ${quoted} ${reportNode.title}`));
  }

  const genericQueries = [
    `${quoted} ${reportNode.title || ""} 最新 ${currentYear}`,
    `${quoted} ${reportNode.title || ""} 公开资料`,
    `${quoted} ${reportNode.notes ? reportNode.notes.slice(0, 24) : reportNode.title || ""}`
  ];

  const baseQueries = [
    ...(sectionQueries[reportNode.id] ?? []),
    ...genericQueries,
    ...domainHints
  ];

  const dynamicQueries = [];
  if (reportNode.notes) {
    const { apiKey, baseUrl, model, provider, openSearchHost, openSearchAppName } = state.settings.qwen;
    if (apiKey) {
      const messages = [
        {
          role: "system",
          content: "你是一个专业的企业调查搜索专家。你需要根据用户的分析章节标题和提示词要求，提取出3到4个最精准的短小查询词组，用于搜索引擎检索。对于工商、股东、财务等强事实节点，请主动在搜索词中加上『企查查』、『天眼查』、『持股比例』、『招股书』等具有极强定向搜索能力的词汇。必须返回严格的JSON对象格式，包含 queries 数组，例如：{\"queries\": [\"企业名 关键词1\", \"企业名 关键词2\"]}。不要返回其他内容。"
        },
        {
          role: "user",
          content: `目标企业：${companyName}\n章节标题：${reportNode.title}\n章节提示词要求：${reportNode.notes}\n\n请提取3个检索词组（必须包含企业名称）：`
        }
      ];

      let text = "";
      try {
        if (provider === "opensearch" && openSearchHost && openSearchAppName) {
          const endpoint = `${openSearchHost.replace(/\/$/, "")}/v3/openapi/workspaces/${encodeURIComponent(openSearchAppName)}/text-generation/${encodeURIComponent(model)}`;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ messages, stream: false, csi_level: "none", parameters: { temperature: 0.1, max_tokens: 500 } })
          });
          if (response.ok) {
            const payload = await response.json();
            text = extractOpenSearchAnswer(payload);
          }
        } else {
          const client = new OpenAI({ apiKey, baseURL: baseUrl });
          const completion = await client.chat.completions.create({
            model, temperature: 0.1, messages, response_format: { type: "json_object" }
          });
          text = completion.choices?.[0]?.message?.content ?? "";
        }
        
        const parsed = parseModelJson(text, "动态搜索词生成结果");
        if (Array.isArray(parsed?.queries) && parsed.queries.length > 0) {
          dynamicQueries.push(...parsed.queries.map(String));
        }
      } catch (err) {
        console.error("动态生成搜索词失败:", err);
      }
    }
  }

  const queries = [...dynamicQueries, ...baseQueries]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query) => query.includes(companyName));

  return [...new Set(queries)].slice(0, 10);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTokenUsage(value = {}) {
  const input = Number(
    value.input ??
    value.input_tokens ??
    value.prompt_tokens ??
    value.promptTokens ??
    value.total_input_tokens ??
    0
  );
  const output = Number(
    value.output ??
    value.output_tokens ??
    value.completion_tokens ??
    value.completionTokens ??
    value.total_output_tokens ??
    0
  );
  const total = Number(value.total ?? value.total_tokens ?? 0);
  return {
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
    total: Number.isFinite(total) ? total : 0
  };
}

function findTokenUsage(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > 4) return null;
  const direct = normalizeTokenUsage(payload);
  if (direct.input > 0 || direct.output > 0 || direct.total > 0) return direct;
  for (const key of ["usage", "token_usage", "tokenUsage", "tokens", "result", "data", "output"]) {
    const nested = payload[key];
    if (!nested) continue;
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findTokenUsage(item, depth + 1);
        if (found) return found;
      }
    } else {
      const found = findTokenUsage(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function recordTokenUsage(state, usage) {
  const normalized = normalizeTokenUsage(usage ?? {});
  if (normalized.input <= 0 && normalized.output <= 0 && normalized.total <= 0) return;
  state.meta ??= {};
  const current = state.meta.modelTokenUsage && typeof state.meta.modelTokenUsage === "object"
    ? state.meta.modelTokenUsage
    : {};
  const input = Number(current.input ?? 0) + normalized.input;
  const output = Number(current.output ?? 0) + normalized.output;
  const total = Number(current.total ?? 0) + (normalized.total || normalized.input + normalized.output);
  state.meta.modelTokenUsage = {
    input,
    output,
    total,
    requests: Number(current.requests ?? 0) + 1,
    updatedAt: new Date().toISOString()
  };
}

function parseSogouResults(html, query, limit) {
  const blocks = [...html.matchAll(/<h3 class="vr-title[\s\S]*?(?=<h3 class="vr-title|$)/g)];
  const results = [];
  for (const match of blocks) {
    const block = match[0];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const title = stripHtml(linkMatch[2]);
    if (!title) continue;
    const summaryMatch = block.match(/<div[^>]+(?:class="[^"]*(?:summary|space-txt|text-layout)[^"]*"|id="cacheresult_summary_[^"]*")[^>]*>([\s\S]*?)<\/div>/);
    const snippet = stripHtml(summaryMatch?.[1] ?? "");
    const cite = stripHtml((block.match(/<a[^>]+class="citeLinkClass"[\s\S]*?<\/a>/)?.[0] ?? ""));
    const url = absoluteSearchUrl(linkMatch[1].replace(/&amp;/g, "&"), "https://www.sogou.com");
    if (!snippet && !cite) continue;
    results.push({ title, url, snippet: snippet || cite, query });
    if (results.length >= limit) break;
  }
  return results;
}

function parseBingResults(html, query, limit) {
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)];
  const results = [];
  for (const match of blocks) {
    const block = match[0];
    const linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/);
    if (!linkMatch) continue;
    const title = stripHtml(linkMatch[2]);
    const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    if (!title || !snippet) continue;
    results.push({ title, url: linkMatch[1], snippet, query });
    if (results.length >= limit) break;
  }
  return results;
}

function parseSo360Results(html, query, limit) {
  const blocks = [...html.matchAll(/<li[^>]+class="[^"]*(?:res-list|result)[^"]*"[\s\S]*?(?=<li[^>]+class="[^"]*(?:res-list|result)|$)/g)];
  const fallbackBlocks = blocks.length ? blocks : [...html.matchAll(/<h3[\s\S]*?(?=<h3|$)/g)];
  const results = [];
  for (const match of fallbackBlocks) {
    const block = match[0];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const title = stripHtml(linkMatch[2]);
    const snippet =
      stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "") ||
      stripHtml(block.match(/<div[^>]+class="[^"]*(?:res-desc|summary|desc)[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!title || !snippet) continue;
    results.push({
      title,
      url: absoluteSearchUrl(linkMatch[1].replace(/&amp;/g, "&"), "https://www.so.com"),
      snippet,
      query
    });
    if (results.length >= limit) break;
  }
  return results;
}

function extractPublishedAt(text = "") {
  const match = text.match(/(20\d{2})[年\-./](\d{1,2})(?:[月\-./](\d{1,2})日?)?/);
  if (!match) return "";
  const month = match[2].padStart(2, "0");
  const day = match[3] ? match[3].padStart(2, "0") : "01";
  return `${match[1]}-${month}-${day}`;
}

function sourceQualityScore(item, companyName) {
  const text = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
  let score = 0;
  if (text.includes(companyName.toLowerCase())) score += 30;
  if (/20\d{2}/.test(text)) score += 8;
  if (/融资|投资方|股东|估值|营收|净利润|高管|创始人|专利|客户|合作|并购|上市/.test(text)) score += 12;
  if (/pedaily|chinaventure|36kr|tmtpost|lieyunwang|iyiou|laoyaoba|qcc|tianyancha|aiqicha|yicai|stcn|cls|jiemian/.test(text)) score += 16;
  if (/pre[\s-]?a|a\+|b\+|种子轮|天使轮|领投|跟投|累计融资|募集资金/.test(text)) score += 10;
  if (/内容由ai智能生成|ai导读|小说阅读器|会员登录/.test(text)) score -= 24;
  if (/baidu\.com\/link|sogou\.com\/link|weixin\.sogou/.test(text)) score -= 4;
  return score;
}

async function enrichSearchResult(item, companyName) {
  if (!/^https?:\/\//i.test(item.url)) return item;
  if (/baidu\.com\/s\?|bing\.com\/search|sogou\.com\/web/.test(item.url)) return item;
  try {
    const response = await fetchWithTimeout(item.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    }, 6000);
    if (!response.ok) return item;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return item;
    const html = await response.text();
    const meta =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      "";
    const bodyText = stripHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
    const companyIndex = bodyText.indexOf(companyName);
    const focusedText = companyIndex >= 0
      ? bodyText.slice(Math.max(0, companyIndex - 120), companyIndex + 520)
      : bodyText.slice(0, 520);
    const expanded = [item.snippet, stripHtml(meta), focusedText]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 900);
    return expanded.length > item.snippet.length ? { ...item, snippet: expanded } : item;
  } catch {
    return item;
  }
}

async function searchPublicSources(state, reportNode) {
  const companyName = state.project.companyName?.trim();
  const queries = await searchQueriesForSection(state, reportNode);
  if (queries.length === 0) return [];

  const collected = [];
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9"
  };

  const isValidResult = (item) => {
    if (!companyName) return true;
    const lc = (item.title + " " + item.snippet).toLowerCase();
    return lc.includes(companyName.toLowerCase()) || item.query.toLowerCase().includes(companyName.toLowerCase());
  };

  const collectFrom = async (channel, query) => {
    if (channel === "baidu") {
      const baiduUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=10`;
      const response = await fetchWithTimeout(baiduUrl, { headers });
      if (!response.ok) return [];
      const html = await response.text();
      const baiduBlocks = [...html.matchAll(/<h3[^>]*class="[^"]*c-title[^"]*"[^>]*>[\s\S]*?<\/h3>/g)];
      const items = [];
      for (const match of baiduBlocks) {
        const linkMatch = match[0].match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;
        const title = stripHtml(linkMatch[2]);
        if (!title) continue;
        const after = html.slice(match.index, match.index + 1000);
        const snippetMatch = after.match(/<span[^>]*>([\s\S]{15,260}?)<\/span>/);
        const snippet = stripHtml(snippetMatch?.[1] ?? "");
        if (!snippet) continue;
        items.push({ title, url: absoluteSearchUrl(linkMatch[1], "https://www.baidu.com"), snippet, query, channel: "百度" });
      }
      return items;
    }
    if (channel === "sogou") {
      const sogouUrl = `https://www.sogou.com/web?query=${encodeURIComponent(query)}&num=10`;
      const response = await fetchWithTimeout(sogouUrl, { headers });
      if (!response.ok) return [];
      return parseSogouResults(await response.text(), query, 10).map((item) => ({ ...item, channel: "搜狗" }));
    }
    if (channel === "so360") {
      const soUrl = `https://www.so.com/s?q=${encodeURIComponent(query)}&pn=1`;
      const response = await fetchWithTimeout(soUrl, { headers, redirect: "manual" });
      if (!response.ok && response.status < 300) return [];
      return parseSo360Results(await response.text(), query, 10).map((item) => ({ ...item, channel: "360搜索" }));
    }
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN`;
    const response = await fetchWithTimeout(bingUrl, { headers });
    if (!response.ok) return [];
    return parseBingResults(await response.text(), query, 10).map((item) => ({ ...item, channel: "Bing" }));
  };

  for (const query of queries) {
    for (const channel of ["baidu", "sogou", "so360", "bing"]) {
      try {
        const items = await collectFrom(channel, query);
        collected.push(...items.filter(isValidResult));
      } catch { /* ignore */ }
      if (collected.length >= 24) break;
    }
    if (collected.length >= 24) break;
  }

  // Dedup: accept results where title+snippet contain company name, or where the query itself was company-focused
  const seen = new Set();
  const cnLower = companyName.toLowerCase();
  const filtered = collected
    .filter((item) => {
      const lc = (item.title + " " + item.snippet).toLowerCase();
      return lc.includes(cnLower) || item.query.toLowerCase().includes(cnLower);
    })
    .filter((item) => {
      const key = `${item.title}|${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const ranked = filtered
    .map((item) => ({ ...item, score: sourceQualityScore(item, companyName) }))
    .sort((a, b) => b.score - a.score);
  const enriched = [];
  for (const item of ranked.slice(0, 12)) {
    enriched.push(await enrichSearchResult(item, companyName));
  }
  const strong = enriched.filter((i) => i.snippet.toLowerCase().includes(cnLower));
  const weak = enriched.filter((i) => !i.snippet.toLowerCase().includes(cnLower));
  const merged = [...strong, ...weak]
    .map((item) => ({ ...item, score: sourceQualityScore(item, companyName) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (merged.length > 0) {
    console.log(`[search] ${companyName}｜${reportNode.title}｜${merged.length}条｜${queries.slice(0, 4).join(" / ")}`);
  } else {
    console.log(`[search] ${companyName}｜${reportNode.title}｜未检索到有效结果`);
  }

  return merged.map((item) => ({
    id: `web-search-${reportNode.id}-${randomUUID().slice(0, 8)}`,
    title: item.title,
    url: item.url,
    sourceType: `自动公开检索/${item.channel || "网页"}`,
    publishedAt: extractPublishedAt(`${item.title} ${item.snippet}`),
    usedIn: `${reportNode.title}｜检索词：${item.query}`,
    snippet: item.snippet,
    query: item.query
  }));
}

function sectionSpecificPrompt(reportNode) {
  if (reportNode.id === "financing-progress") {
    return "融资进展章节必须按轮次逐条核对，不得把Pre A+、A轮、B+轮等不同轮次合并成一行；日期、金额、投资方、估值、资金用途必须分别说明来源。来源中若出现“AI导读”“内容由AI智能生成”等字样，只能作为线索，不能作为确定事实的唯一依据。缺少年份、金额或投资方时必须写“待核实”，不要自行推断。";
  }
  if (reportNode.id === "capital-dynamics") {
    return "资本动态章节必须采用“文字结论 + 表格梳理 + 简短判断”的穿插结构。可用表格呈现资本事件总览、重大融资事件、IPO/上市进程、并购重组/股权转让/回购/重大资本开支、合作窗口判断；但每张表前后都要有关键文字判断，突出估值、资金压力、战略方向和合作窗口。无公开信息的事项写“未见明确公开披露/待核实”，不得只堆表格，也不得用大段散文替代表格。";
  }
  if (reportNode.id === "important-shareholders") {
    return "重要股东章节必须区分工商股东、新闻披露投资方、历史投资方和疑似关联方；不能把投资方直接等同为当前股东，除非来源明确显示持股或工商变更。";
  }
  if (reportNode.id === "founders-core-team") {
    return "创始人与核心团队章节必须区分已证实任职、过往经历和推测关联；学历、科研成果、前雇主、共同创业或校友关系均需说明依据，不能凭名称或学校背景推断。";
  }
  if (reportNode.id === "negative-info" || reportNode.id === "risks") {
    return "风险章节必须区分已发生事实、潜在风险和待核实问题；没有来源支撑的负面信息不得写成确定事实。";
  }
  return "本章节必须优先使用当前章节相关来源；跨来源矛盾时，列明差异并进入待核实，不要强行下结论。";
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

function selectSourcesForPrompt(state, reportNode, options = {}) {
  const maxSources = options.maxSources ?? 16;
  const maxSnippetLength = options.maxSnippetLength ?? 700;
  const title = reportNode.title || "";
  const id = reportNode.id || "";
  const score = (source) => {
    let value = 0;
    const usedIn = source.usedIn || "";
    const sourceType = source.sourceType || "";
    if (usedIn.includes(title) || usedIn.includes(id)) value += 80;
    if (sourceType.includes("自动公开检索")) value += 30;
    if (sourceType.includes("上传")) value += 25;
    if (sourceType.includes("工商") || sourceType.includes("公开新闻") || sourceType.includes("资本")) value += 15;
    if (source.snippet) value += Math.min(20, Math.ceil(source.snippet.length / 60));
    return value;
  };

  return [...state.sources]
    .map((source, index) => ({ source, index, score: score(source) }))
    .filter((item) => item.score > 0 || item.index < 6)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxSources)
    .map(({ source }) => ({
      ...source,
      snippet: source.snippet ? source.snippet.slice(0, maxSnippetLength) : ""
    }));
}

function buildSectionPrompt(state, reportNode, options = {}) {
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
  const promptSources = selectSourcesForPrompt(state, reportNode, options);
  const sources = promptSources
    .map((item) => {
      let str = `${item.id}｜${item.title}｜${item.sourceType}｜${item.url || "无链接"}｜用于：${item.usedIn}`;
      if (item.snippet) str += `\n  摘要内容：${item.snippet}`;
      return str;
    })
    .join("\n");

  // Only sections 4 (enablement) and 5 (landing-plan) get cooperation cross-analysis.
  // Sections 1-3 get a hard prohibition block.
  const crossAnalysisNodeIds = new Set([
    "enablement", "enterprise-needs", "resource-match", "cooperation-priority", "next-actions",
    "landing-plan", "region-match", "investment-attraction", "land-cooperation", "leasing-landing", "landing-fund"
  ]);
  const isCrossAnalysis = crossAnalysisNodeIds.has(reportNode.id);

  let crossAnalysisPrompt = "";
  if (isCrossAnalysis) {
    crossAnalysisPrompt = `

【交叉指引调度规则 — 仅适用于第4、5章节】
请先评估目标企业当前章节的实际属性，再从下方资源池中挑选真正匹配的项目做深度交叉分析。禁止强行罗列不相关资源；若无显著匹配，须直言说明。

我方强资源：
${resources || "暂无启用资源。"}

重点落地区域：
${regions || "暂无启用区域。"}

可选落地方式：
${methods || "暂无启用方式。"}
`;
  } else {
    crossAnalysisPrompt = `

【严格边界限制 — 当前章节属于第1-3章：基础信息/市场地位/资本合作】
本章节只梳理、核实、评估企业自身的公开事实，绝对禁止出现：我方如何合作、落地区域匹配、招商引资、资源对接、与我方资源协同、赋能合作或落地方案视角。
请完全聚焦于企业的客观信息，用事实、数据和公开来源支撑判断，不作任何合作指引。`;
  }

  return [
    {
      role: "system",
      content:
        `你是严谨的企业公开资料与资本合作分析助手。必须基于用户上传资料、外部检索结果和已列明来源作答。禁止编造事实、融资金额、估值、股东、公告或负面信息。没有来源的内容只能写入 missingInfo 或待核实，不能写成确定事实。
【格式高压线】必须返回严格、合法的JSON对象格式！(1) 所有文本换行必须转义为 \\n，绝不输出真实的换行符；(2) 内部双引号必须转义为 \\"，强烈建议在分析文本中直接使用中文双引号（“”）取代英文双引号；(3) 确保没有多余或缺失的逗号，不要Markdown格式包裹。

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
分析深度要求：${state.promptEngineering?.depthInstructions?.[reportNode.depth] || DEFAULT_DEPTH_INSTRUCTIONS[reportNode.depth] || ""}
备注要求：${reportNode.notes || "无"}
章节核查规则：${sectionSpecificPrompt(reportNode)}

完整报告框架：
${flat}
${crossAnalysisPrompt}

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
  "analysisText": "可直接进入报告正文的中文内容。必须简洁、直接、有逻辑。【第1-3章节】只写企业自身事实梳理与判断，绝对禁止出现合作点/落地/资源对接分析。【第4-5章节】须进行充分的合作点交叉分析。所有章节：若外部检索到有效信息，须明确整理引用并用来支撑分析；若资料不足，须明确说明。适合结构化的信息使用完整 Markdown 表格，表格必须包含表头、分隔行和数据行；但正文必须保留关键文字判断，形成“结论文字 + 表格 + 判断文字”的穿插结构。",
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

function buildCompactSectionPrompt(state, reportNode) {
  const requirement = researchRequirements[state.project.researchRequirement] ?? researchRequirements.comprehensive;
  const promptSources = selectSourcesForPrompt(state, reportNode, { maxSources: 6, maxSnippetLength: 260 });
  const sources = promptSources
    .map((item, index) => {
      const snippet = item.snippet ? `｜摘要：${item.snippet}` : "";
      return `${index + 1}. ${item.id}｜${item.title}｜${item.sourceType}｜${item.url || "无链接"}｜${item.usedIn}${snippet}`;
    })
    .join("\n") || "暂无来源。";
  const isEarlyChapter = !new Set([
    "enablement", "enterprise-needs", "resource-match", "cooperation-priority", "next-actions",
    "landing-plan", "region-match", "investment-attraction", "land-cooperation", "leasing-landing", "landing-fund"
  ]).has(reportNode.id);

  return [
    {
      role: "system",
      content: "你是企业公开资料分析助手。只返回严格JSON对象，不要Markdown代码块。禁止编造没有来源支撑的融资、估值、股东、财务、处罚、诉讼、客户或合作事实；不确定内容写入missingInfo。"
    },
    {
      role: "user",
      content: `请生成单个报告章节。\n企业：${state.project.companyName || "未填写"}\n研究要求：${requirement.label}，${requirement.instruction}\n章节ID：${reportNode.id}\n章节标题：${reportNode.title}\n分析深度：${reportNode.depth}\n章节备注：${reportNode.notes || "无"}\n章节核查规则：${sectionSpecificPrompt(reportNode)}\n边界：${isEarlyChapter ? "本节只写企业自身事实、数据与判断，禁止合作点/落地/资源对接分析。" : "本节需要围绕投资、招商落地、合作赋能做交叉分析。"}\n可用来源：\n${sources}\n\n写作要求：简洁、直接、有逻辑；适合表格整理的信息使用完整 Markdown 表格，必须包含表头、分隔行和完整数据行，不要只输出表格符号或半截表格；不要整节全部堆表格，须用关键文字结论与表格穿插呈现；每段之间留一行空行；引用必须优先使用上方来源id。\n\n返回JSON结构：{"title":"章节标题","confidenceScore":0到100整数,"confidenceReason":"资料充分度：...｜主要依据：...｜主要缺口：...","sourceCoverage":"来源覆盖说明","keyFindings":["3到6条要点"],"analysisText":"报告正文","missingInfo":["待核实信息"],"citations":[{"id":"来源id","title":"来源标题","url":"来源链接","sourceType":"来源类型","publishedAt":"日期","usedIn":"支撑的判断"}]}`
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientModelConnectionError(message = "") {
  return /Connection reset|I\/O error|SocketException|InternalServerError|ECONNRESET|ETIMEDOUT|fetch failed|aborted/i.test(message);
}

function friendlyModelConnectionError(message = "") {
  if (/Connection reset|I\/O error|SocketException/i.test(message)) {
    return `OpenSearch 已收到请求，但其底层模型服务连接被重置。通常是 DashScope/模型服务临时网络抖动、OpenSearch 到模型服务的内部链路异常，或当前模型服务短时不可用。请稍后重试；如果持续出现，请检查 OpenSearch 应用绑定模型、地域和 DashScope 服务可用性。原始错误：${message.slice(0, 500)}`;
  }
  if (/InternalServerError/i.test(message)) {
    return `OpenSearch 返回内部服务错误。请检查 OpenSearch 应用配置、模型名称、地域和模型服务可用性。原始错误：${message.slice(0, 500)}`;
  }
  return message;
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
  const requestOpenSearch = async (messages, maxTokens = 4096) =>
    fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        messages,
        stream: false,
        csi_level: "none",
        parameters: {
          temperature: 0.2,
          max_tokens: maxTokens
        }
      })
    }, 90000);

  let response = await requestOpenSearch(buildSectionPrompt(state, reportNode), 4096);
  let text = await response.text();
  if (!response.ok && response.status >= 400) {
    console.error(`OpenSearch 首次生成失败，尝试压缩来源后重试：${response.status} ${text.slice(0, 200)}`);
    response = await requestOpenSearch(buildSectionPrompt(state, reportNode, { maxSources: 8, maxSnippetLength: 320 }), 3072);
    text = await response.text();
  }
  if (!response.ok && response.status >= 400) {
    console.error(`OpenSearch 压缩来源仍失败，切换极简提示词重试：${response.status} ${text.slice(0, 200)}`);
    response = await requestOpenSearch(buildCompactSectionPrompt(state, reportNode), 1800);
    text = await response.text();
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`OpenSearch 返回非 JSON 内容：${text.slice(0, 200)}`);
  }
  recordTokenUsage(state, findTokenUsage(payload));
  if (!response.ok) {
    throw new Error(`OpenSearch 请求失败 ${response.status}：${text.slice(0, 300)}`);
  }

  const answer = extractOpenSearchAnswer(payload);
  let parsed;
  try {
    parsed = parseModelJson(answer, "OpenSearch 章节生成结果");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`${reason}，已按原文保存章节。`);
    return draftFromUnstructuredAnswer(answer, reportNode, reason);
  }
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
  recordTokenUsage(state, completion.usage);

  const content = completion.choices?.[0]?.message?.content ?? "";
  if (!content) {
    throw new Error("模型未返回内容。");
  }
  let parsed;
  try {
    parsed = parseModelJson(content, "模型章节生成结果");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`${reason}，已按原文保存章节。`);
    return draftFromUnstructuredAnswer(content, reportNode, reason);
  }
  return normalizeDraft(parsed, reportNode);
}

function paragraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 140, line: 320 },
    ...options,
    children: [new TextRun({ text, font: "Microsoft YaHei", size: 22, ...options.run })]
  });
}

function markdownRuns(text, run = {}) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = part.startsWith("**") && part.endsWith("**");
      return new TextRun({
        text: bold ? part.slice(2, -2) : part,
        font: "Microsoft YaHei",
        size: 22,
        bold,
        ...run
      });
    });
}

function isMarkdownTableSeparator(line = "") {
  const cells = line.trim().split("|").map((cell) => cell.trim()).filter(Boolean);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(lines, startIndex) {
  if (startIndex + 1 >= lines.length || !lines[startIndex].includes("|") || !isMarkdownTableSeparator(lines[startIndex + 1])) {
    return null;
  }

  const parseRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const headers = parseRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    if (!isMarkdownTableSeparator(lines[index])) rows.push(parseRow(lines[index]));
    index += 1;
  }

  if (headers.length === 0 || rows.length === 0) return null;
  return { headers, rows, nextIndex: index };
}

function docxTableCell(text, isHeader = false) {
  return new TableCell({
    shading: isHeader ? { fill: "F4F4F5" } : undefined,
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: 260 },
        children: markdownRuns(text, {
          size: 18,
          bold: isHeader || undefined,
          color: isHeader ? "18181B" : "3F3F46"
        })
      })
    ]
  });
}

function docxMarkdownTable(table) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: table.headers.map((cell) => docxTableCell(cell, true))
    }),
    ...table.rows.map((row) =>
      new TableRow({
        children: table.headers.map((_, index) => docxTableCell(row[index] ?? ""))
      })
    )
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D4D4D8" }
    },
    rows
  });
}

function contentParagraphs(text) {
  const lines = text.trim().split(/\r?\n/);
  const children = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const block = paragraphLines.join("\n").trim();
    if (block) {
      for (const line of block.split(/\n/).map((item) => item.trim()).filter(Boolean)) {
        children.push(
          new Paragraph({
            spacing: { after: 180, line: 340 },
            children: markdownRuns(line)
          })
        );
      }
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length;) {
    const table = parseMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      children.push(docxMarkdownTable(table));
      children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
      index = table.nextIndex;
      continue;
    }
    if (!lines[index].trim()) {
      flushParagraph();
      index += 1;
      continue;
    }
    const headingMatch = lines[index].match(/^###\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      children.push(
        new Paragraph({
          spacing: { before: 260, after: 100, line: 320 },
          children: markdownRuns(headingMatch[1].trim(), {
            size: 26,
            bold: true,
            color: "18181B"
          })
        })
      );
      index += 1;
      continue;
    }
    paragraphLines.push(lines[index]);
    index += 1;
  }
  flushParagraph();
  return children;
}

function generatedAnalysisBody(section, node) {
  let text = section?.analysisText?.trim() ?? "";
  if (text.startsWith("{") && text.includes('"analysisText"')) {
    try {
      text = String(JSON.parse(text).analysisText || text).trim();
    } catch {
      text = extractJsonStringField(text, "analysisText") || text;
    }
  }
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const plainHeading = line.replace(/^#{1,6}\s*/, "").replace(/[：:]\s*$/, "").trim();
      return plainHeading !== node.title;
    })
    .join("\n")
    .trim();
}

async function buildDocx(state) {
  const hasGeneratedContent = (node) => {
    const section = state.sections[node.id];
    return Boolean(node.enabled && node.includeInWord && generatedAnalysisBody(section, node));
  };
  const hasGeneratedBranch = (node) => hasGeneratedContent(node) || (node.children ?? []).some(hasGeneratedBranch);

  if (!state.framework.some(hasGeneratedBranch)) {
    const error = new Error("至少需要生成一个章节后才能生成 Word。");
    error.status = 400;
    throw error;
  }

  const companyName = state.project.companyName?.trim() || "目标企业";
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 520, after: 120 },
      children: [
        new TextRun({
          text: `${companyName}分析报告`,
          bold: true,
          font: "Microsoft YaHei",
          size: 44,
          color: "111827"
        })
      ]
    }),
    paragraph("by清大浦恒 AI", {
      alignment: AlignmentType.CENTER,
      spacing: { after: 520 },
      run: { color: "5D6774", size: 18 }
    })
  ];

  const appendNode = (node, level) => {
    if (!hasGeneratedBranch(node)) return;
    const section = state.sections[node.id];
    const hasOwnContent = hasGeneratedContent(node);
    children.push(
      new Paragraph({
        heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: level === 1 ? 340 : 240, after: 100 },
        children: [
          new TextRun({
            text: node.title,
            bold: true,
            font: "Microsoft YaHei",
            size: level === 1 ? 30 : 25,
            color: level === 1 ? "111827" : "1D2939"
          })
        ]
      })
    );
    if (hasOwnContent) {
      children.push(...contentParagraphs(generatedAnalysisBody(section, node)));
    }
    for (const child of node.children ?? []) {
      appendNode(child, Math.min(level + 1, 2));
    }
  };

  for (const node of state.framework) appendNode(node, 1);

  const doc = new Document({
    creator: "清大浦恒 AI",
    title: `${companyName}分析报告`,
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
  const slug = `${companyName}分析报告-${Date.now()}`
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
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetchWithTimeout(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              messages: [
                { role: "system", content: "只返回严格 JSON，不要解释。" },
                { role: "user", content: "{\"ok\":true}" }
              ],
              stream: false,
              csi_level: "none",
              parameters: { max_tokens: 32, temperature: 0 }
            })
          }, 15000);
          const text = await response.text();
          let payload;
          try {
            payload = JSON.parse(text);
          } catch {
            throw new Error(`OpenSearch 返回非 JSON 内容：${text.slice(0, 200)}`);
          }
          if (!response.ok || payload.code || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
            const detail = Array.isArray(payload.errors)
              ? JSON.stringify(payload.errors)
              : JSON.stringify({
                  code: payload.code || response.status,
                  message: payload.message || text.slice(0, 300),
                  request_id: payload.request_id
                });
            throw new Error(detail);
          }
          res.json({ ok: true, sample: extractOpenSearchAnswer(payload).slice(0, 300), attempts: attempt });
          return;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (attempt < 3 && isTransientModelConnectionError(message)) {
            await wait(700 * attempt);
            continue;
          }
          break;
        }
      }
      const rawMessage = lastError instanceof Error ? lastError.message : String(lastError || "未知错误");
      res.status(502).json({ message: `OpenSearch 连接测试失败：${friendlyModelConnectionError(rawMessage)}` });
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
  state.framework = Array.isArray(req.body.framework)
    ? req.body.framework.map(normalizeReportNode)
    : state.framework;
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

async function generateDraftForSection(sectionId) {
  try {
    const state = await readState();
    const reportNode = findNode(state.framework, sectionId);
    if (!reportNode) return;
    const section = state.sections[sectionId] ?? createBlankSection(reportNode);
    if (section?.locked) return;

    const existingUrls = new Set(state.sources.map((s) => s.url).filter(Boolean));
    const searchResults = await searchPublicSources(state, reportNode);
    const newSources = searchResults.filter((s) => s.url && !existingUrls.has(s.url));
    if (newSources.length > 0) {
      state.sources.push(...newSources);
      await writeState(state);
    }

    const draft = await callQwenForSection(state, reportNode);
    state.sections[sectionId] = draft;
    reportNode.status = draft.status;
    await writeState(state);
  } catch (error) {
    const state = await readState();
    const reportNode = findNode(state.framework, sectionId);
    if (reportNode) reportNode.status = "not_started";
    if (state.sections[sectionId]) state.sections[sectionId].status = "not_started";
    await writeState(state);
    console.error(`章节生成失败 ${sectionId}:`, error);
  }
}

app.post("/api/sections/:id/draft", async (req, res, next) => {
  try {
    const state = await readState();
    const reportNode = findNode(state.framework, req.params.id);
    if (!reportNode) {
      res.status(404).json({ message: "章节不存在。" });
      return;
    }
    const section = state.sections[req.params.id] ?? createBlankSection(reportNode);
    if (section?.locked) {
      res.status(409).json({ message: "该章节已确认并锁定，请先解锁再重新生成。" });
      return;
    }
    reportNode.status = "generating";
    state.sections[req.params.id] = { ...section, status: "generating" };
    await writeState(state);
    setTimeout(() => {
      generateDraftForSection(req.params.id).catch((error) => {
        console.error(`章节生成后台任务失败 ${req.params.id}:`, error);
      });
    }, 0);
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
  if (req.body?.depthInstructions && typeof req.body.depthInstructions === "object") {
    state.promptEngineering.depthInstructions ??= {};
    for (const depth of depths) {
      if (typeof req.body.depthInstructions[depth] === "string") {
        state.promptEngineering.depthInstructions[depth] = req.body.depthInstructions[depth];
      }
    }
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
      const section = currentState.sections[reportNode.id] ?? createBlankSection(reportNode);
      if (section?.locked) continue; // skip if locked in the meantime
      reportNode.status = "generating";
      currentState.sections[reportNode.id] = { ...section, status: "generating" };
      await writeState(currentState);

      send("generating", { id: reportNode.id, title: reportNode.title, index: i, total: nodesToGenerate.length });

      try {
        const freshState = await readState();
        const freshNode = findNode(freshState.framework, reportNode.id) ?? reportNode;

        const existingUrls = new Set(freshState.sources.map((s) => s.url).filter(Boolean));
        const searchResults = await searchPublicSources(freshState, freshNode);
        const newSources = searchResults.filter((s) => s.url && !existingUrls.has(s.url));
        if (newSources.length > 0) {
          freshState.sources.push(...newSources);
          await writeState(freshState);
        }

        const draft = await callQwenForSection(freshState, freshNode);

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

app.post("/api/report/clear", async (_req, res, next) => {
  try {
    const state = await readState();
    state.sections = {};
    walk(state.framework, (node) => {
      node.status = "not_started";
      node.locked = false;
      state.sections[node.id] = createBlankSection(node);
    });
    state.meta ??= {};
    state.meta.modelTokenUsage = { input: 0, output: 0, total: 0, requests: 0, updatedAt: new Date().toISOString() };
    await writeState(state);
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
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
const server = app.listen(port, (error) => {
  if (error) {
    console.error(`Failed to start Puheng AI server on port ${port}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Puheng AI server running at http://localhost:${port}`);
});

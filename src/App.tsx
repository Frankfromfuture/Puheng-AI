import {
  Archive,
  BarChart3,
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  Download,
  Eraser,
  FileStack,
  FileText,
  GitBranch,
  GripVertical,
  Handshake,
  KeyRound,
  Layers3,
  Lock,
  MapPin,
  Maximize,
  Network,
  PlayCircle,
  Plus,
  Puzzle,
  QrCode,
  RefreshCcw,
  Save,
  Settings as SettingsIcon,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  Unlock,
  Upload,
  User,
  Zap
} from "lucide-react";
import { ChangeEvent, DragEvent, MouseEventHandler, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisDepth,
  AnalysisSection,
  AppState,
  AuthUser,
  ExternalApiSetting,
  LandingMethod,
  LandingRegion,
  ModelTokenUsage,
  PromptEngineering,
  ReportNode,
  ResearchRequirement,
  SectionStatus,
  Settings,
  StrongResource
} from "./types";

const api = {
  async getMe(): Promise<{ user: AuthUser }> {
    return request("/api/auth/me");
  },
  async login(username: string, password: string): Promise<{ user: AuthUser }> {
    return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  },
  async register(username: string, password: string, displayName?: string): Promise<{ user: AuthUser }> {
    return request("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, displayName }) });
  },
  async devLogin(): Promise<{ user: AuthUser }> {
    return request("/api/auth/dev", { method: "POST" });
  },
  async startWechatLogin(): Promise<{ state: string; mode: "local-mock" | "wechat-oauth"; expiresAt: string; qrSvg: string; scanUrl?: string }> {
    return request("/api/auth/wechat/start", { method: "POST" });
  },
  async checkWechatLogin(state: string): Promise<{ status: "pending" | "confirmed" | "authenticated" | "expired" | "consumed"; user?: AuthUser; message?: string }> {
    return request(`/api/auth/wechat/status/${encodeURIComponent(state)}`);
  },
  async logout(): Promise<{ ok: boolean }> {
    return request("/api/auth/logout", { method: "POST" });
  },
  async getState(): Promise<AppState> {
    return request("/api/state");
  },
  async patchProject(project: Partial<AppState["project"]>): Promise<AppState> {
    return request("/api/project", { method: "PATCH", body: JSON.stringify(project) });
  },
  async patchSettings(payload: unknown): Promise<AppState> {
    return request("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
  },
  async testQwen(): Promise<{ ok: boolean; sample: string }> {
    return request("/api/settings/qwen/test", { method: "POST" });
  },
  async patchFramework(framework: ReportNode[]): Promise<AppState> {
    return request("/api/framework", { method: "PATCH", body: JSON.stringify({ framework }) });
  },
  async patchSection(id: string, section: Partial<AnalysisSection>): Promise<AppState> {
    return request(`/api/sections/${id}`, { method: "PATCH", body: JSON.stringify(section) });
  },
  async draftSection(id: string): Promise<AppState> {
    return request(`/api/sections/${id}/draft`, { method: "POST" });
  },
  async clearReport(): Promise<AppState> {
    return request("/api/report/clear", { method: "POST" });
  },
  async confirmSection(id: string, section: Partial<AnalysisSection>): Promise<AppState> {
    return request(`/api/sections/${id}/confirm`, { method: "POST", body: JSON.stringify(section) });
  },
  async unlockSection(id: string): Promise<AppState> {
    return request(`/api/sections/${id}/unlock`, { method: "POST" });
  },
  async uploadFiles(files: FileList, category: string): Promise<AppState> {
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("files", file));
    body.append("category", category);
    return request("/api/upload", { method: "POST", body });
  },
  async exportDocx(): Promise<{ filename: string; url: string }> {
    return request("/api/export/docx", { method: "POST" });
  },
  async patchPromptEngineering(payload: Partial<PromptEngineering>): Promise<AppState> {
    return request("/api/prompt-engineering", { method: "PATCH", body: JSON.stringify(payload) });
  }
};

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers =
    init.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...(init.headers ?? {}) };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, headers, credentials: "include", signal: init.signal ?? controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "请求失败");
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请确认后端服务已启动后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTokenCount(value = 0) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
}

const depthOptions: AnalysisDepth[] = ["省略", "简版", "标准", "深入"];

const requirementOptions: Array<{ id: ResearchRequirement; label: string; shortLabel: string; focus: string; icon: typeof Zap }> = [
  { id: "brief", label: "简要分析", shortLabel: "简要", focus: "只生成一级目录，二级及以下省略", icon: Zap },
  { id: "fundamental", label: "基础深度分析", shortLabel: "基础", focus: "企业基本面深入，其余相应变化", icon: BarChart3 },
  { id: "investment", label: "投资合作分析", shortLabel: "投资", focus: "产业分析与资本分析重点", icon: Briefcase },
  { id: "landing", label: "招商落地分析", shortLabel: "招商", focus: "产业分析与区域交叉分析重点", icon: Building2 },
  { id: "enablement", label: "赋能合作分析", shortLabel: "赋能", focus: "资源复合与赋能分析重点", icon: Puzzle },
  { id: "comprehensive", label: "全面分析", shortLabel: "全面", focus: "所有重点展开", icon: Maximize }
];

const statusText: Record<SectionStatus, string> = {
  not_started: "未生成",
  generating: "生成中",
  needs_review: "待确认",
  confirmed: "已确认",
  insufficient: "资料不足"
};

const statusClass: Record<SectionStatus, string> = {
  not_started: "muted",
  generating: "working",
  needs_review: "review",
  confirmed: "confirmed",
  insufficient: "warning"
};

const granularityTitle = "颗粒度：指定本章节生成内容的展开程度，支持简版、标准、深入。";
const confidenceTitle = "置信度：提示本章节生成结果的可信程度或当前生成状态。";

function confidenceLabel(score: number | undefined, status: SectionStatus): { text: string; cls: string } {
  if (status === "generating") return { text: "生成中", cls: "working" };
  if (status === "confirmed") return { text: "已确认", cls: "confirmed" };
  if (score === undefined || score === 0) return { text: "-", cls: "muted" };
  if (score >= 85) return { text: "极高", cls: "confirmed" };
  if (score >= 65) return { text: "高", cls: "review" };
  if (score >= 45) return { text: "中", cls: "standard-conf" };
  if (score >= 25) return { text: "低", cls: "warning" };
  return { text: "极低", cls: "warning" };
}

type FlatNode = { node: ReportNode; level: number; parentId: string; numbering: string };
type ModelHealth = "not_configured" | "checking" | "connected" | "failed";
type ActiveView =
  | "home"
  | "dashboard"
  | "companyDatabase"
  | "companyGraph"
  | "projectManagement"
  | "parkAnalysis"
  | "settings"
  | "files"
  | "prompts";

type PlatformModule = {
  id: Exclude<ActiveView, "home" | "settings" | "files">;
  title: string;
  subtitle: string;
  description: string;
  art: string;
};

const platformModules: PlatformModule[] = [
  {
    id: "dashboard",
    title: "企业分析平台",
    subtitle: "Enterprise Analysis",
    description: "企业基础、市场、资本、赋能与落地分析的一体化生成工作台。",
    art: "/module-art/enterprise-analysis.svg"
  },
  {
    id: "companyDatabase",
    title: "项目追踪系统",
    subtitle: "Project Tracking",
    description: "追踪线索、任务节点、推进状态与交付记录，沉淀项目过程资产。",
    art: "/module-art/project-tracking.svg"
  },
  {
    id: "companyGraph",
    title: "企业赋能系统",
    subtitle: "Enterprise Enablement",
    description: "连接资本、客户、园区与产业资源，识别可推进的赋能路径。",
    art: "/module-art/enterprise-enablement.svg"
  },
  {
    id: "projectManagement",
    title: "企业知识库RAG",
    subtitle: "Knowledge Base RAG",
    description: "组织企业资料、公开信息与历史报告，为检索问答和事实追溯提供底座。",
    art: "/module-art/knowledge-base.svg"
  },
  {
    id: "parkAnalysis",
    title: "园区分析系统",
    subtitle: "Park Intelligence",
    description: "围绕园区载体、产业图谱和招商匹配，形成区域资源研判视图。",
    art: "/module-art/park-analysis.svg"
  },
  {
    id: "prompts",
    title: "Harness 工程",
    subtitle: "Prompt Engineering",
    description: "管理报告风格、颗粒度指令与生成规范，让输出持续可控。",
    art: "/module-art/prompt-engineering.svg"
  }
];

function greetingPeriod() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "早上";
  if (hour >= 11 && hour < 13) return "中午";
  if (hour >= 13 && hour < 18) return "下午";
  return "晚上";
}

function flatten(nodes: ReportNode[], level = 1, parentId = "", prefix = ""): FlatNode[] {
  return nodes.flatMap((node, index) => {
    const num = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    return [
      { node, level, parentId, numbering: num },
      ...flatten(node.children, level + 1, node.id, num)
    ];
  });
}

function updateNode(nodes: ReportNode[], id: string, patch: Partial<ReportNode>): ReportNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, ...patch };
    return { ...node, children: updateNode(node.children, id, patch) };
  });
}

function addChild(nodes: ReportNode[], id: string, child: ReportNode): ReportNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, children: [...node.children, child] };
    return { ...node, children: addChild(node.children, id, child) };
  });
}

function removeNode(nodes: ReportNode[], id: string): ReportNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNode(node.children, id) }));
}

function moveNode(nodes: ReportNode[], dragId: string, targetId: string): ReportNode[] {
  if (dragId === targetId) return nodes;
  let moved: ReportNode | null = null;

  const withoutDragged = (items: ReportNode[]): ReportNode[] =>
    items
      .filter((item) => {
        if (item.id === dragId) {
          moved = item;
          return false;
        }
        return true;
      })
      .map((item) => ({ ...item, children: withoutDragged(item.children) }));

  const insertBeforeTarget = (items: ReportNode[]): ReportNode[] => {
    const next: ReportNode[] = [];
    for (const item of items) {
      if (item.id === targetId && moved) next.push(moved);
      next.push({ ...item, children: insertBeforeTarget(item.children) });
    }
    return next;
  };

  const stripped = withoutDragged(nodes);
  return moved ? insertBeforeTarget(stripped) : nodes;
}

function createNode(title = "自定义章节"): ReportNode {
  const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id,
    title,
    enabled: true,
    includeInWord: true,
    depth: "标准",
    notes: "",
    searchKeywords: "",
    status: "not_started",
    locked: false,
    children: []
  };
}

function depthClass(depth: AnalysisDepth) {
  if (depth === "省略") return "omitted";
  if (depth === "深入") return "deep";
  if (depth === "简版") return "simple";
  return "standard";
}

function canGenerateNode(node: ReportNode) {
  return node.enabled && node.depth !== "省略";
}

function generatedAnalysisBody(section: AnalysisSection | undefined, node: ReportNode) {
  let text = section?.analysisText?.trim() ?? "";
  if (text.startsWith("{") && text.includes('"analysisText"')) {
    try {
      const parsed = JSON.parse(text);
      text = String(parsed.analysisText || text).trim();
    } catch {
      const match = text.match(/"analysisText"\s*:\s*"((?:\\.|[^"\\])*)"/s);
      if (match?.[1]) {
        try {
          text = JSON.parse(`"${match[1]}"`).trim();
        } catch {
          text = match[1].replace(/\\n/g, "\n").replace(/\\"/g, "\"").trim();
        }
      }
    }
  }
  if (!text) return "";
  const meaningfulLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const plainHeading = line.replace(/^#{1,6}\s*/, "").replace(/[：:]\s*$/, "").trim();
      return plainHeading !== node.title;
    });
  return meaningfulLines.join("\n").trim();
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToPrintHtml(text: string) {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  for (let index = 0; index < lines.length;) {
    const table = parseMarkdownTable(lines, index);
    if (table) {
      html.push("<table><thead><tr>");
      html.push(table.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join(""));
      html.push("</tr></thead><tbody>");
      for (const row of table.rows) {
        html.push("<tr>");
        html.push(table.headers.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] ?? "")}</td>`).join(""));
        html.push("</tr>");
      }
      html.push("</tbody></table>");
      index = table.nextIndex;
      continue;
    }
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      html.push(`<h3>${escapeHtml(heading[1])}</h3>`);
    } else {
      html.push(`<p>${escapeHtml(line).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`);
    }
    index += 1;
  }
  return html.join("");
}

function isMarkdownTableSeparator(line: string) {
  const cells = line.trim().split("|").map((cell) => cell.trim()).filter(Boolean);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  if (startIndex + 1 >= lines.length || !lines[startIndex].includes("|") || !isMarkdownTableSeparator(lines[startIndex + 1])) {
    return null;
  }

  const parseRow = (line: string) => {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const headers = parseRow(lines[startIndex]);
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    if (!isMarkdownTableSeparator(lines[index])) rows.push(parseRow(lines[index]));
    index += 1;
  }

  if (headers.length === 0 || rows.length === 0) return null;
  return { headers, rows, nextIndex: index };
}

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const block = paragraphLines.join("\n").trim();
    if (block) {
      elements.push(
        <p key={`p-${elements.length}`}>
          {block.split(/\n/).map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line)}
            </span>
          ))}
        </p>
      );
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const table = parseMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      elements.push(
        <div className="markdown-table-wrap" key={`table-${elements.length}`}>
          <table className="markdown-table">
            <thead>
              <tr>
                {table.headers.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {table.headers.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      index = table.nextIndex;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^###\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      elements.push(
        <h3 className="markdown-h3" key={`h3-${elements.length}`}>
          {renderInlineMarkdown(headingMatch[1].trim())}
        </h3>
      );
      index += 1;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }
  flushParagraph();

  return (
    <div className="report-section-body">
      {elements}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "", displayName: "" });
  const [wechatLogin, setWechatLogin] = useState<{
    state: string;
    mode: "local-mock" | "wechat-oauth";
    expiresAt: string;
    qrSvg: string;
    scanUrl?: string;
    status: "idle" | "pending" | "confirmed" | "expired";
  } | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [activeSectionId, setActiveSectionId] = useState("capital-cooperation");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [dragId, setDragId] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [uploadCategory, setUploadCategory] = useState("企业资料");
  const [exportLink, setExportLink] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modelHealth, setModelHealth] = useState<ModelHealth>("checking");
  const [genProgress, setGenProgress] = useState<{ current: string; index: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then(async ({ user }) => {
        if (cancelled) return;
        setAuthUser(user);
        const next = await api.getState();
        if (cancelled) return;
        setState(next);
        if (next.settings.qwen.apiKeyConfigured) {
          setModelHealth("checking");
          api
            .testQwen()
            .then(() => { if (!cancelled) setModelHealth("connected"); })
            .catch(() => { if (!cancelled) setModelHealth("failed"); });
        } else {
          setModelHealth("not_configured");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const status = (error as Error & { status?: number }).status;
          if (status === 401) {
            setAuthUser(null);
            setState(null);
            setModelHealth("not_configured");
          } else {
            setModelHealth("failed");
            setMessage(error.message);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, []);

  const flatNodes = useMemo(() => (state ? flatten(state.framework) : []), [state]);
  const activeSection = state?.sections[activeSectionId];
  const activeNode = flatNodes.find((item) => item.node.id === activeSectionId)?.node;
  const modelTokenUsage = state?.meta?.modelTokenUsage as ModelTokenUsage | undefined;
  const generatedCount = state
    ? flatNodes.filter(({ node }) => Boolean(generatedAnalysisBody(state.sections[node.id], node))).length
    : 0;
  const modelHealthCopy: Record<ModelHealth, { label: string; cls: string; hint: string }> = {
    not_configured: { label: "未配置", cls: "warn", hint: "请先在设置中保存模型 API Key" },
    checking: { label: "检测中", cls: "muted", hint: "正在测试模型连接" },
    connected: { label: "已联通", cls: "ok", hint: "模型连接测试成功" },
    failed: { label: "未联通", cls: "warn", hint: "模型连接测试失败，点击重试" }
  };
  const activeTitle =
    activeView === "home"
      ? "Atlas 智慧操作中台"
      : activeView === "settings"
        ? "设置"
        : platformModules.find((module) => module.id === activeView)?.title ?? "企业分析平台";

  async function withBusy<T>(label: string, action: () => Promise<T>) {
    setBusy(label);
    setMessage("");
    try {
      return await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function loadWorkspaceAfterAuth(user: AuthUser) {
    setAuthUser(user);
    setWorkspaceLoadError("");
    try {
      const next = await api.getState();
      applyState(next);
      if (next.settings.qwen.apiKeyConfigured) {
        setModelHealth("checking");
        api.testQwen().then(() => setModelHealth("connected")).catch(() => setModelHealth("failed"));
      } else {
        setModelHealth("not_configured");
      }
    } catch (error) {
      setModelHealth("failed");
      setWorkspaceLoadError(error instanceof Error ? error.message : "工作区加载失败。");
    }
  }

  async function submitAuth() {
    const username = authForm.username.trim();
    const password = authForm.password;
    if (!username || !password) {
      setMessage("请输入用户名和密码。");
      return;
    }
    try {
      setBusy(authMode === "login" ? "登录中" : "注册中");
      setMessage("");
      const result =
        authMode === "login"
          ? await api.login(username, password)
          : await api.register(username, password, authForm.displayName.trim() || username);
      await loadWorkspaceAfterAuth(result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败。");
    } finally {
      setBusy("");
    }
  }

  async function devLogin() {
    try {
      setBusy("Dev 登录中");
      setMessage("");
      const result = await api.devLogin();
      await loadWorkspaceAfterAuth(result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dev 登录失败。");
    } finally {
      setBusy("");
    }
  }

  async function startWechatLogin() {
    try {
      setBusy("生成微信二维码");
      setMessage("");
      const result = await api.startWechatLogin();
      setWechatLogin({ ...result, status: "pending" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "微信二维码生成失败。");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!wechatLogin || wechatLogin.status !== "pending") return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await api.checkWechatLogin(wechatLogin.state);
        if (cancelled) return;
        if (result.status === "authenticated" && result.user) {
          window.clearInterval(timer);
          setWechatLogin(null);
          await loadWorkspaceAfterAuth(result.user);
          return;
        }
        if (result.status === "expired") {
          window.clearInterval(timer);
          setWechatLogin((prev) => prev ? { ...prev, status: "expired" } : prev);
          setMessage(result.message || "微信二维码已过期，请刷新后重试。");
        } else if (result.status === "confirmed") {
          setWechatLogin((prev) => prev ? { ...prev, status: "confirmed" } : prev);
        }
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (!cancelled && (status === 404 || status === 410)) {
          window.clearInterval(timer);
          setWechatLogin((prev) => prev ? { ...prev, status: "expired" } : prev);
          setMessage(error instanceof Error ? error.message : "微信二维码已过期，请刷新后重试。");
        } else if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "微信登录状态检查失败。");
        }
      }
    }, 1600);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [wechatLogin?.state, wechatLogin?.status]);

  async function logout() {
    await api.logout().catch(() => undefined);
    setAuthUser(null);
    setState(null);
    setAuthMode("login");
    setMessage("");
  }

  function applyState(next: AppState) {
    setState(next);
    if (!next.sections[activeSectionId]) {
      setActiveSectionId(Object.keys(next.sections)[0] ?? "");
    }
  }

  async function pollSectionUntilSettled(id: string) {
    for (let attempt = 0; attempt < 150; attempt++) {
      await wait(2000);
      const next = await api.getState();
      applyState(next);
      if (next.sections[id]?.status !== "generating") return next;
    }
    throw new Error("生成仍在后台处理中，请稍后刷新查看结果。");
  }

  async function saveFramework(next: ReportNode[]) {
    if (!state) return;
    setState({ ...state, framework: next });
    const saved = await withBusy("保存框架", () => api.patchFramework(next));
    if (saved) applyState(saved);
  }

  async function saveProject(project: Partial<AppState["project"]>) {
    const saved = await withBusy("保存项目", () => api.patchProject(project));
    if (saved) applyState(saved);
  }

  async function saveSettings(payload: Partial<Settings> | Record<string, unknown>) {
    const saved = await withBusy("保存设置", () => api.patchSettings(payload));
    if (saved) {
      applyState(saved);
      const changedModelSettings = Object.prototype.hasOwnProperty.call(payload, "qwen");
      if (changedModelSettings) {
        setModelHealth(saved.settings.qwen.apiKeyConfigured ? "checking" : "not_configured");
      }
      if (changedModelSettings && saved.settings.qwen.apiKeyConfigured) {
        api
          .testQwen()
          .then(() => setModelHealth("connected"))
          .catch(() => setModelHealth("failed"));
      }
    }
  }

  async function retestModelConnection() {
    if (!state?.settings.qwen.apiKeyConfigured) {
      setModelHealth("not_configured");
      setMessage("请先在设置中保存模型 API Key。");
      return;
    }
    setModelHealth("checking");
    try {
      await api.testQwen();
      setModelHealth("connected");
      setMessage("模型连接测试成功。");
    } catch (error) {
      setModelHealth("failed");
      setMessage(error instanceof Error ? error.message : "模型连接测试失败。");
    }
  }

  async function saveSection(id: string, patch: Partial<AnalysisSection>) {
    const saved = await withBusy("保存章节", () => api.patchSection(id, patch));
    if (saved) applyState(saved);
  }

  async function generateSection(id: string) {
    if (!state?.settings.qwen.apiKeyConfigured) {
      setMessage("请先在设置菜单配置模型 API Key 并测试连接。");
      return;
    }
    const targetNode = flatNodes.find(({ node }) => node.id === id)?.node;
    if (targetNode?.depth === "省略") {
      setMessage("该章节颗粒度为省略，不参与生成。");
      return;
    }
    setState((prev) => {
      if (!prev) return prev;
      const currentSection = prev.sections[id];
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [id]: { ...currentSection, status: "generating" as SectionStatus }
        }
      };
    });
    const saved = await withBusy("生成章节", async () => {
      const started = await api.draftSection(id);
      applyState(started);
      return pollSectionUntilSettled(id);
    });
    if (saved) applyState(saved);
  }

  async function clearReport() {
    const saved = await withBusy("清空全部内容", () => api.clearReport());
    if (saved) {
      applyState(saved);
      setMessage("分析内容已全部清空。");
    }
  }

  async function copyGeneratedReport() {
    if (!state) return;
    const generated = flatNodes
      .map(({ node, numbering }) => {
        const section = state.sections[node.id];
        const body = generatedAnalysisBody(section, node);
        return body ? `${numbering} ${node.title}\n${body}` : "";
      })
      .filter(Boolean);

    if (generated.length === 0) {
      setMessage("暂无可复制的已生成分析内容。");
      return;
    }

    const text = generated.join("\n\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setMessage(`已复制 ${generated.length} 个已生成章节。`);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      setMessage(copied ? `已复制 ${generated.length} 个已生成章节。` : "复制失败，请确认浏览器允许剪贴板权限。");
    }
  }

  async function confirmSection(id: string) {
    const section = state?.sections[id];
    if (!section) return;
    const saved = await withBusy("确认章节", () => api.confirmSection(id, section));
    if (saved) applyState(saved);
  }

  async function unlockSection(id: string) {
    const saved = await withBusy("解锁章节", () => api.unlockSection(id));
    if (saved) applyState(saved);
  }

  function pauseGeneration() {
    abortRef.current?.abort();
  }

  async function generateReport() {
    if (!state?.settings.qwen.apiKeyConfigured) {
      setMessage("请先在设置菜单配置模型 API Key 并测试连接。");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setMessage("");
    setGenProgress(null);
    try {
      const response = await fetch("/api/report/generate", {
        method: "POST",
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        setMessage(err.message || "生成失败。");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const event = JSON.parse(trimmed.slice(5).trim());
            if (event.type === "start") {
              setGenProgress({ current: "", index: 0, total: event.total });
            } else if (event.type === "generating") {
              setGenProgress({ current: event.title, index: event.index + 1, total: event.total });
              setState((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: {
                    ...prev.sections,
                    [event.id]: { ...prev.sections[event.id], status: "generating" as SectionStatus }
                  }
                };
              });
            } else if (event.type === "section") {
              setState((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: { ...prev.sections, [event.id]: event.section }
                };
              });
            } else if (event.type === "section_error") {
              setMessage(`「${event.title}」生成失败：${event.message}`);
            } else if (event.type === "done") {
              setState(event.state);
              setGenProgress(null);
              setMessage("分析报告已全部生成完成。");
            } else if (event.type === "error") {
              setMessage(event.message);
            }
          } catch {
            // ignore parse errors on partial lines
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessage("已暂停生成。");
      } else {
        setMessage(err instanceof Error ? err.message : "网络错误，请重试。");
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
      setGenProgress(null);
    }
  }

  async function savePromptEngineering(payload: Partial<PromptEngineering>) {
    const saved = await withBusy("\u4fdd\u5b58\u63d0\u793a\u8bcd", () => api.patchPromptEngineering(payload));
    if (saved) applyState(saved);
  }

  async function exportDocx() {

    const result = await withBusy("生成 Word", () => api.exportDocx());
    if (result) {
      setExportLink(result.url);
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setMessage(`Word 已生成并开始下载：${result.filename}`);
    }
  }

  function exportPdf() {
    if (!state) return;
    const generated = flatNodes
      .map(({ node, numbering }) => {
        const section = state.sections[node.id];
        const body = generatedAnalysisBody(section, node);
        return body ? `<section><h2>${escapeHtml(`${numbering} ${node.title}`)}</h2>${markdownToPrintHtml(body)}</section>` : "";
      })
      .filter(Boolean)
      .join("");

    if (!generated) {
      setMessage("暂无可生成 PDF 的分析内容。");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setMessage("浏览器拦截了 PDF 打印窗口，请允许弹窗后重试。");
      return;
    }
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(state.project.companyName || "企业分析报告")} - PDF</title>
  <style>
    body { margin: 28px; font-family: "HarmonyOS Sans SC", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; color: #18181b; line-height: 1.7; }
    h1 { font-size: 24px; margin: 0 0 18px; }
    h2 { font-size: 18px; margin: 22px 0 10px; page-break-after: avoid; }
    h3 { font-size: 16px; font-weight: 900; margin: 20px 0 8px; page-break-after: avoid; }
    p { margin: 0 0 12px; white-space: pre-wrap; }
    strong { font-weight: 900; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 12px; }
    th, td { border: 1px solid #d4d4d8; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f4f4f5; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <h1>${escapeHtml(state.project.companyName || "企业分析报告")}</h1>
  ${generated}
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }

  if (!authChecked) {
    return (
      <main className="loading">
        <Sparkles />
        <span>正在唤醒 Atlas 智慧操作中台...</span>
      </main>
    );
  }

  if (!authUser) {
    return (
      <LoginView
        mode={authMode}
        form={authForm}
        busy={busy}
        message={message}
        setMode={setAuthMode}
        setForm={setAuthForm}
        onSubmit={submitAuth}
        onDevLogin={devLogin}
        onWechatLogin={startWechatLogin}
        wechatLogin={wechatLogin}
      />
    );
  }

  if (!state) {
    return (
      <main className="loading">
        <Sparkles />
        <span>正在载入个人操作空间...</span>
        {workspaceLoadError && <small>{workspaceLoadError}</small>}
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="brand" type="button" onClick={() => setActiveView("home")} title="返回 Atlas 智慧操作中台">
          <img src="/logo.svg" alt="浦恒 Logo" className={`brand-logo ${sidebarCollapsed ? "collapsed" : ""}`} />
          {!sidebarCollapsed && (
            <div className="brand-copy">
              <strong>清大浦恒 AI</strong>
            </div>
          )}
        </button>
        <nav>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")} title="企业分析平台">
            <Layers3 size={18} /> {!sidebarCollapsed && <span className="nav-label">企业分析平台</span>}
          </button>
          <button className={activeView === "companyDatabase" ? "active" : ""} onClick={() => setActiveView("companyDatabase")} title="项目追踪系统">
            <Database size={18} /> {!sidebarCollapsed && <span className="nav-label">项目追踪系统</span>}
          </button>
          <button className={activeView === "companyGraph" ? "active" : ""} onClick={() => setActiveView("companyGraph")} title="企业赋能系统">
            <Network size={18} /> {!sidebarCollapsed && <span className="nav-label">企业赋能系统</span>}
          </button>
          <button className={activeView === "projectManagement" ? "active" : ""} onClick={() => setActiveView("projectManagement")} title="企业知识库RAG">
            <Briefcase size={18} /> {!sidebarCollapsed && <span className="nav-label">企业知识库RAG</span>}
          </button>
          <button className={activeView === "parkAnalysis" ? "active" : ""} onClick={() => setActiveView("parkAnalysis")} title="园区分析系统">
            <Building2 size={18} /> {!sidebarCollapsed && <span className="nav-label">园区分析系统</span>}
          </button>
          <button className={activeView === "prompts" ? "active" : ""} onClick={() => setActiveView("prompts")} title="Harness 工程">
            <SlidersHorizontal size={18} /> {!sidebarCollapsed && <span className="nav-label">Harness 工程</span>}
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")} title="设置">
            <SettingsIcon size={18} /> {!sidebarCollapsed && <span className="nav-label">设置</span>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          {!sidebarCollapsed && (
            <button
              className={`sidebar-model-status ${modelHealthCopy[modelHealth].cls}`}
              onClick={retestModelConnection}
              title={modelHealthCopy[modelHealth].hint}
            >
              <span>当前模型</span>
              <strong>{modelHealthCopy[modelHealth].label}</strong>
              <small className="model-line" title={`当前模型：${state.settings.qwen.model}`}>
                {state.settings.qwen.provider === "opensearch" ? "OpenSearch" : "DashScope"} · {state.settings.qwen.model}
              </small>
              <small className="token-usage-line">
                Token 输入 {formatTokenCount(modelTokenUsage?.input ?? 0)} / 输出 {formatTokenCount(modelTokenUsage?.output ?? 0)}
              </small>
            </button>
          )}
          <div className="sidebar-meta">
            <div className="sidebar-meta-row">
              <span>GitHub v0.8</span>
              {!sidebarCollapsed && <button className="sidebar-logout" onClick={logout}>退出登录</button>}
            </div>
            {!sidebarCollapsed && (
              <p>{authUser.displayName}</p>
            )}
          </div>
        </div>
        <button
          className="sidebar-edge-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="mobile-top-brand">
            <img src="/logo.svg" alt="浦恒 Logo" />
            <strong>清大浦恒 AI</strong>
          </div>
          <div className="topbar-title">
            <h1>{activeTitle}</h1>
          </div>
          <div className="top-actions">
            {busy && <span className="busy">{busy}...</span>}
            {message && <span className="toast">{message}</span>}
            {activeView === "dashboard" && (
              <>
                {exportLink && (
                  <a className="button ghost" href={exportLink}>
                    <Download size={16} /> Word
                  </a>
                )}
                <button className="button primary" onClick={exportDocx} disabled={generatedCount === 0 || Boolean(busy)}>
                  <FileText size={16} /> Word
                </button>
                <button className="button ghost desktop-pdf-export" onClick={exportPdf} disabled={generatedCount === 0 || Boolean(busy)}>
                  <FileText size={16} /> PDF
                </button>
              </>
            )}
          </div>
        </header>

        {activeView === "home" && (
          <PlatformHome
            userName={authUser.displayName || authUser.username}
            modules={platformModules}
            onOpen={(view) => setActiveView(view)}
          />
        )}

        {activeView === "dashboard" && (
          <Dashboard
            state={state}
            flatNodes={flatNodes}
            dragId={dragId}
            setDragId={setDragId}
            setActiveSectionId={setActiveSectionId}
            saveFramework={saveFramework}
            saveProject={saveProject}
            saveSettings={saveSettings}
            saveSection={saveSection}
            generateSection={generateSection}
            generateReport={generateReport}
            exportPdf={exportPdf}
            clearReport={clearReport}
            copyGeneratedReport={copyGeneratedReport}
            pauseGeneration={pauseGeneration}
            confirmSection={confirmSection}
            unlockSection={unlockSection}
            busy={busy}
            generating={generating}
            generatedCount={generatedCount}
            genProgress={genProgress}
          />
        )}

        {activeView === "companyDatabase" && (
          <ConstructionView
            title="项目追踪系统"
            subtitle="Project Tracking Workspace"
            description="沉淀企业线索、推进阶段、关键任务、交付记录与历史报告，形成可追踪、可复用的项目情报底座。"
            signals={["项目档案", "推进阶段", "任务节点", "报告版本"]}
          />
        )}

        {activeView === "companyGraph" && (
          <ConstructionView
            title="企业赋能系统"
            subtitle="Enablement Graph & Resource Radar"
            description="构建企业、人物、机构、基金、园区与政府平台之间的资源图谱，支撑赋能路径识别与合作抓手发现。"
            signals={["资源图谱", "股权穿透", "赋能路径", "风险链路"]}
          />
        )}

        {activeView === "projectManagement" && (
          <ConstructionView
            title="企业知识库RAG"
            subtitle="Enterprise Knowledge Base RAG"
            description="将企业资料、公开信息、历史报告和业务判断组织为可检索的知识库，服务报告生成、问答检索与事实追溯。"
            signals={["知识库", "RAG 检索", "事实追溯", "报告复用"]}
          />
        )}

        {activeView === "parkAnalysis" && (
          <ConstructionView
            title="园区分析系统"
            subtitle="Park Intelligence & Attraction Radar"
            description="围绕园区载体、产业图谱、企业匹配和招商研判，形成区域资源与目标企业之间的智能匹配视图。"
            signals={["园区载体", "产业图谱", "企业匹配", "招商研判"]}
          />
        )}

        {activeView === "files" && (
          <FilesView
            state={state}
            uploadCategory={uploadCategory}
            setUploadCategory={setUploadCategory}
            onUpload={async (event) => {
              if (!event.target.files?.length) return;
              const saved = await withBusy("上传资料", () => api.uploadFiles(event.target.files!, uploadCategory));
              if (saved) applyState(saved);
              event.target.value = "";
            }}
          />
        )}

        {activeView === "settings" && (
          <SettingsView
            state={state}
            apiKeyDraft={apiKeyDraft}
            setApiKeyDraft={setApiKeyDraft}
            saveSettings={saveSettings}
            testQwen={async () => {
              const result = await withBusy("测试模型", () => api.testQwen());
              if (result) {
                setModelHealth("connected");
                setMessage("模型连接测试成功。");
              }
            }}
          />
        )}

        {activeView === "prompts" && (
          <PromptEngineeringView
            state={state}
            flatNodes={flatNodes}
            savePromptEngineering={savePromptEngineering}
            saveFramework={saveFramework}
            saveSettings={saveSettings}
          />
        )}
      </main>

    </div>
  );
}

function ConstructionView({
  title,
  subtitle = "AI Powered Workspace Module",
  description = "该模块正在接入 Atlas 智慧操作中台的企业情报、任务流与智能体能力。",
  signals = ["智能研判", "任务流", "情报中枢", "持续追踪"]
}: {
  title: string;
  subtitle?: string;
  description?: string;
  signals?: string[];
}) {
  return (
    <section className="construction-view" aria-label={title}>
      <img src="/logo.svg" alt="浦恒 Logo" className="construction-logo" />
      <div className="construction-copy">
        <span className="construction-kicker">{subtitle}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="construction-signals" aria-label={`${title}能力点`}>
          {signals.map((signal) => (
            <span key={signal}>{signal}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformHome({
  userName,
  modules,
  onOpen
}: {
  userName: string;
  modules: PlatformModule[];
  onOpen: (view: PlatformModule["id"]) => void;
}) {
  const [hoveredModule, setHoveredModule] = useState<PlatformModule["id"] | null>(null);
  const widgetRefs = useRef(new Map<PlatformModule["id"], HTMLButtonElement>());

  useEffect(() => {
    const syncHoverFromPoint = (event: MouseEvent | PointerEvent) => {
      let next: PlatformModule["id"] | null = null;
      for (const module of modules) {
        const element = widgetRefs.current.get(module.id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          next = module.id;
          break;
        }
      }
      setHoveredModule((current) => (current === next ? current : next));
    };

    const clearHover = () => setHoveredModule(null);
    document.addEventListener("mousemove", syncHoverFromPoint, { passive: true });
    document.addEventListener("pointermove", syncHoverFromPoint, { passive: true });
    window.addEventListener("blur", clearHover);
    return () => {
      document.removeEventListener("mousemove", syncHoverFromPoint);
      document.removeEventListener("pointermove", syncHoverFromPoint);
      window.removeEventListener("blur", clearHover);
    };
  }, [modules]);

  return (
    <section className="platform-home" aria-label="Atlas 智慧操作中台主界面">
      <div className="platform-hero">
        <div>
          <p className="platform-kicker">Atlas 智慧操作中台</p>
          <h2>
            <span>{userName}，{greetingPeriod()}好，</span>
            <span>工作辛苦了！</span>
          </h2>
        </div>
        <p>
          从这里进入企业分析、项目追踪、赋能协同、知识库、园区分析与 Harness 工程，
          将分散信息组织成可行动的工作流。
        </p>
      </div>

      <div className="platform-widget-grid">
        {modules.map((module) => (
          <button
            key={module.id}
            ref={(element) => {
              if (element) {
                widgetRefs.current.set(module.id, element);
              } else {
                widgetRefs.current.delete(module.id);
              }
            }}
            className={`platform-widget ${hoveredModule === module.id ? "is-hovered" : ""}`}
            type="button"
            onClick={() => onOpen(module.id)}
            onFocus={() => setHoveredModule(module.id)}
            onBlur={() => setHoveredModule(null)}
            onMouseEnter={() => setHoveredModule(module.id)}
            onMouseLeave={() => setHoveredModule(null)}
            onPointerEnter={() => setHoveredModule(module.id)}
            onPointerLeave={() => setHoveredModule(null)}
            aria-label={`进入${module.title}`}
          >
            <img className="module-line-art" src={module.art} alt="" aria-hidden="true" />
            <strong>{module.title}</strong>
            <small>{module.subtitle}</small>
            <p>{module.description}</p>
            <span className="platform-widget-action">进入</span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface DashboardProps {
  state: AppState;
  flatNodes: FlatNode[];
  dragId: string;
  setDragId: (id: string) => void;
  setActiveSectionId: (id: string) => void;
  saveFramework: (framework: ReportNode[]) => Promise<void>;
  saveProject: (project: Partial<AppState["project"]>) => Promise<void>;
  saveSettings: (payload: Partial<Settings> | Record<string, unknown>) => Promise<void>;
  saveSection: (id: string, patch: Partial<AnalysisSection>) => Promise<void>;
  generateSection: (id: string) => Promise<void>;
  generateReport: () => Promise<void>;
  exportPdf: () => void;
  clearReport: () => Promise<void>;
  copyGeneratedReport: () => Promise<void>;
  pauseGeneration: () => void;
  confirmSection: (id: string) => Promise<void>;
  unlockSection: (id: string) => Promise<void>;
  busy: string;
  generating: boolean;
  generatedCount: number;
  genProgress: { current: string; index: number; total: number } | null;
}

function Dashboard(props: DashboardProps) {
  const {
    state,
    flatNodes,
    dragId,
    setDragId,
    setActiveSectionId,
    saveFramework,
    saveProject,
    saveSettings,
    saveSection,
    generateSection,
    generateReport,
    exportPdf,
    clearReport,
    copyGeneratedReport,
    pauseGeneration,
    confirmSection,
    unlockSection,
    busy,
    generating,
    generatedCount,
    genProgress
  } = props;
  const [companyDraft, setCompanyDraft] = useState(state.project.companyName);

  useEffect(() => {
    setCompanyDraft(state.project.companyName);
  }, [state.project.companyName]);

  function patchNode(id: string, patch: Partial<ReportNode>) {
    return saveFramework(updateNode(state.framework, id, patch));
  }

  function addRoot() {
    return saveFramework([...state.framework, createNode("新增一级章节")]);
  }

  function addSubsection(id: string) {
    return saveFramework(addChild(state.framework, id, createNode("新增二级章节")));
  }

  function remove(id: string) {
    const next = removeNode(state.framework, id);
    return saveFramework(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (dragId) saveFramework(moveNode(state.framework, dragId, targetId));
    setDragId("");
  }

  function updateSettingItem<T extends StrongResource | LandingRegion | LandingMethod>(
    key: "strongResources" | "landingRegions" | "landingMethods",
    id: string,
    patch: Partial<T>
  ) {
    const list = (state.settings[key] as T[]).map((item) => (item.id === id ? { ...item, ...patch } : item));
    return saveSettings({ [key]: list });
  }

  function addSettingItem(key: "strongResources" | "landingRegions" | "landingMethods") {
    const id = `custom-${key}-${Date.now()}`;
    const base =
      key === "landingRegions"
        ? { id, name: "自定义区域", enabled: true, industries: "", resources: "", constraints: "", notes: "" }
        : key === "landingMethods"
          ? { id, name: "自定义方式", enabled: true, notes: "" }
          : { id, name: "自定义强资源", type: "自定义", enabled: true, notes: "" };
    return saveSettings({ [key]: [...(state.settings[key] as unknown[]), base] });
  }

  function removeSettingItem(key: "strongResources" | "landingRegions" | "landingMethods", id: string) {
    return saveSettings({ [key]: (state.settings[key] as Array<{ id: string }>).filter((item) => item.id !== id) });
  }

  async function confirmCompanyName() {
    await saveProject({ companyName: companyDraft.trim() });
    await clearReport();
  }

  async function commitCompanyName(value: string) {
    await saveProject({ companyName: value.trim() });
  }

  const [mobilePanel, setMobilePanel] = useState<"framework" | "resources" | "preview">("preview");
  const mobilePanels = [
    { id: "framework" as const, label: "框架", icon: Layers3 },
    { id: "resources" as const, label: "合作点", icon: Handshake },
    { id: "preview" as const, label: "分章节报告", icon: FileText }
  ];

  return (
    <section className="dashboard-grid">
      {/* Row 1: Compact Research Entry */}
      <div className="panel command-panel-compact">
        <div className="command-compact-row">
          <Target size={16} className="command-icon" />
          <div className="company-input-wrap">
            <DraftInput
              className="company-input"
              value={state.project.companyName}
              onCommit={commitCompanyName}
              onDraftChange={setCompanyDraft}
              placeholder="输入公司名称"
            />
            <button
              className="company-confirm-btn"
              type="button"
              onClick={confirmCompanyName}
              disabled={Boolean(busy) || generating}
              title="确认企业名称并清空原分章节生成报告"
            >
              确认
            </button>
            {!state.project.companyName.trim() && (
              <div className="company-guide-bubble">先输入企业名称</div>
            )}
          </div>
          <div className="requirement-control">
            <span className="report-type-label">报告类型：</span>
            <div className="requirement-pills" aria-label="报告类型">
              {requirementOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    className={`req-pill ${state.project.researchRequirement === option.id ? "selected" : ""}`}
                    onClick={() => saveProject({ researchRequirement: option.id })}
                    title={`${option.label}：${option.focus}`}
                  >
                    <Icon size={14} />
                    <span>{option.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="gen-report-area">
            {genProgress && (
              <span className="gen-progress">
                {genProgress.index}/{genProgress.total}
                {genProgress.current && <> · {genProgress.current}</>}
              </span>
            )}
            <button
              className="button ghost clear-report-btn"
              onClick={clearReport}
              disabled={Boolean(busy) || generating}
              title="清空全部已生成分析内容"
            >
              <Eraser size={15} />
              清空全部内容
            </button>
            <button
              className={`button gen-report-btn ${generating ? "pausing" : ""}`}
              onClick={generating ? pauseGeneration : generateReport}
              disabled={!generating && Boolean(busy)}
              title={generating ? "点击暂停生成" : "根据报告框架与资源条件生成完整报告"}
            >
              <PlayCircle size={15} />
              {generating ? "暂停生成" : "生成完整报告"}
            </button>
          </div>
        </div>
      </div>

      <div className="mobile-panel-tabs" aria-label="手机面板切换">
        {mobilePanels.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={mobilePanel === item.id ? "active" : ""}
              onClick={() => setMobilePanel(item.id)}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Three columns — Framework | Resources | Preview */}
      <div className="dashboard-body">
        <div className={`panel framework-panel mobile-panel ${mobilePanel === "framework" ? "mobile-active" : ""}`}>
          <div className="panel-title dashboard-section-title">
            <span className="dashboard-title-label">
              <GitBranch size={18} />
              分析框架
            </span>
            <button className="icon-button bare-action" onClick={addRoot} title="增加一级章节">
              <Plus size={16} />
            </button>
          </div>
          <div className="tree">
            <div className="tree-header" aria-hidden="true">
              <span className="tree-header-depth" title={granularityTitle}>颗粒度</span>
              <span className="tree-header-confidence" title={confidenceTitle}>置信度</span>
            </div>
            {flatNodes.map(({ node, level, numbering }) => (
              <div
                key={node.id}
                className={`tree-row`}
                style={{ paddingLeft: `${(level - 1) * 22 + 10}px` }}
                draggable
                onDragStart={() => setDragId(node.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, node.id)}
                onClick={() => setActiveSectionId(node.id)}
              >
                <GripVertical size={15} className="drag" />
                <input
                  className="tree-check"
                  type="checkbox"
                  checked={node.enabled}
                  onChange={(event) => patchNode(node.id, { enabled: event.target.checked })}
                  onClick={(event) => event.stopPropagation()}
                  title="是否生成"
                />
                <span className="tree-numbering">{numbering}</span>
                <DraftInput
                  className="tree-title"
                  value={node.title}
                  onCommit={(value) => patchNode(node.id, { title: value })}
                  onClick={(event) => event.stopPropagation()}
                />
                <select
                  className={`depth-badge ${depthClass(node.depth)}`}
                  value={node.depth}
                  onChange={(event) => patchNode(node.id, { depth: event.target.value as AnalysisDepth })}
                  onClick={(event) => event.stopPropagation()}
                  title={granularityTitle}
                >
                  {depthOptions.map((depth) => (
                    <option key={depth}>{depth}</option>
                  ))}
                </select>
                {(() => { const conf = confidenceLabel(state.sections[node.id]?.confidenceScore, node.status); return <span className={`status ${conf.cls}`} title={confidenceTitle}>{conf.text}</span>; })()}
                {node.locked ? <Lock size={14} className="lock" /> : <span aria-hidden="true" />}
                {level === 1 ? (
                  <button className="icon-button bare-action" onClick={(event) => { event.stopPropagation(); addSubsection(node.id); }} title="增加二级章节">
                    <Plus size={15} />
                  </button>
                ) : <span className="tree-action-spacer" aria-hidden="true" />}
                <button className="icon-button delete-x" onClick={(event) => { event.stopPropagation(); remove(node.id); }} title="删除章节">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`resource-panel-shell mobile-panel ${mobilePanel === "resources" ? "mobile-active" : ""}`}>
          <ResourcePanel
            state={state}
            updateItem={updateSettingItem}
            addItem={addSettingItem}
            removeItem={removeSettingItem}
          />
        </div>

        <div className={`panel report-preview-panel mobile-panel ${mobilePanel === "preview" ? "mobile-active" : ""}`}>
          <div className="panel-title dashboard-section-title">
            <span className="dashboard-title-label">
              <FileStack size={18} />
              分章节生成报告
            </span>
            <button className="icon-button" onClick={copyGeneratedReport} title="复制已生成分析报告">
              <Clipboard size={16} />
            </button>
          </div>
          <div className="report-preview-scroll">
            {flatNodes.filter(({ node }) => node.enabled).length === 0 ? (
              <div className="empty-state">
                <Archive />
                <p>暂无已启用的章节。</p>
              </div>
            ) : (
              flatNodes
                .filter(({ node }) => node.enabled)
                .map(({ node, level, numbering }) => {
                  const section = state.sections[node.id];
                  const body = generatedAnalysisBody(section, node);
                  const conf = confidenceLabel(section?.confidenceScore, node.status);
                  return (
                    <div key={node.id} className={`report-section level-${level}${level === 1 ? " level-1-divider" : ""}`}>
	                      <div className="report-section-head">
	                        <span className="report-numbering">{numbering}</span>
	                        <span className="report-title">
	                          {node.title}
	                          {section?.status === "generating" && <span className="generating-ellipsis" aria-label="生成中" />}
	                        </span>
	                        {level <= 2 && (
	                          <button
	                            className="icon-button report-play-btn"
	                            onClick={() => {
	                              setActiveSectionId(node.id);
	                              generateSection(node.id);
	                            }}
	                            disabled={Boolean(busy) || generating || node.locked || !canGenerateNode(node)}
	                            title={node.depth === "省略" ? "该章节颗粒度为省略，不参与生成" : "单独生成本章节分析报告"}
	                          >
	                            <PlayCircle size={14} />
	                          </button>
	                        )}
	                        <span className={`depth-badge ${depthClass(node.depth)}`}>{node.depth}</span>
                        <span className={`status ${conf.cls}`}>{conf.text}</span>
                      </div>
                      {body && <MarkdownPreview text={body} />}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LoginView({
  mode,
  form,
  busy,
  message,
  setMode,
  setForm,
  onSubmit,
  onDevLogin,
  onWechatLogin,
  wechatLogin
}: {
  mode: "login" | "register";
  form: { username: string; password: string; displayName: string };
  busy: string;
  message: string;
  setMode: (mode: "login" | "register") => void;
  setForm: (form: { username: string; password: string; displayName: string }) => void;
  onSubmit: () => void;
  onDevLogin: () => void;
  onWechatLogin: () => void;
  wechatLogin: {
    state: string;
    mode: "local-mock" | "wechat-oauth";
    expiresAt: string;
    qrSvg: string;
    scanUrl?: string;
    status: "idle" | "pending" | "confirmed" | "expired";
  } | null;
}) {
  const isRegister = mode === "register";
  const [focused, setFocused] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer = { x: null as number | null, y: null as number | null, radius: 140 };
    let running = true;
    let frame = 0;
    let width = 0;
    let height = 0;
    let particles: Array<{
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      density: number;
      repelDist: number;
      phase: number;
      microAmp: number;
      microSpd: number;
      color: string;
    }> = [];

    const colors = ["30,58,95", "30,58,95", "58,95,138", "58,95,138", "100,145,190", "125,160,200"];
    const buildParticles = () => {
      particles = Array.from({ length: Math.min(900, Math.floor((width * height) / 1200)) }, () => {
        const x = Math.random() * width;
        const y = Math.random() * height;
        return {
          x,
          y,
          baseX: x,
          baseY: y,
          size: Math.random() * 1.8 + 0.5,
          density: Math.random() * 28 + 2,
          repelDist: (0.45 + Math.random() * 0.5) * pointer.radius,
          phase: Math.random() * Math.PI * 2,
          microAmp: 0.25 + Math.random() * 0.45,
          microSpd: 0.06 + Math.random() * 0.09,
          color: colors[Math.floor(Math.random() * colors.length)]
        };
      });
    };

    const setSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const onMove = (event: MouseEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onLeave = () => {
      pointer.x = null;
      pointer.y = null;
    };

    setSize();
    window.addEventListener("resize", setSize);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);

    const render = (now: number) => {
      if (!running) return;
      const t = now / 1000;
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        ctx.fillStyle = `rgba(${particle.color},0.58)`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();

        if (pointer.x !== null && pointer.y !== null) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < pointer.radius) {
            if (dist > particle.repelDist) {
              const force = (pointer.radius - dist) / pointer.radius;
              let fx = (dx / dist) * force * particle.density;
              let fy = (dy / dist) * force * particle.density;
              const step = Math.sqrt(fx * fx + fy * fy);
              const maxStep = dist - particle.repelDist;
              if (step > maxStep) {
                const scale = maxStep / step;
                fx *= scale;
                fy *= scale;
              }
              particle.x += fx;
              particle.y += fy;
            }
            particle.x += Math.sin(t * particle.microSpd + particle.phase) * particle.microAmp;
            particle.y += Math.cos(t * particle.microSpd * 0.7 + particle.phase * 1.37) * particle.microAmp;
          } else {
            particle.x -= (particle.x - particle.baseX) / 14;
            particle.y -= (particle.y - particle.baseY) / 14;
          }
        } else {
          particle.x -= (particle.x - particle.baseX) / 14;
          particle.y -= (particle.y - particle.baseY) / 14;
        }
      }
      frame = requestAnimationFrame(render);
    };
    const restart = () => {
      if (!running) return;
      cancelAnimationFrame(frame);
      setSize();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    window.addEventListener("focus", restart);
    window.addEventListener("pageshow", restart);
    document.addEventListener("visibilitychange", restart);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", setSize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("focus", restart);
      window.removeEventListener("pageshow", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);

  return (
    <main className="auth-shell">
      <canvas ref={canvasRef} className="auth-particles" aria-hidden="true" />
      <header className="auth-topbar">
        <div className="auth-brand">
          <img src="/logo.svg" alt="清大浦恒 AI Logo" />
          <span>清大浦恒 AI</span>
        </div>
        <nav className="auth-nav" aria-label="登录页导航">
          <span>操作中台</span>
          <span>数据资产</span>
          <span>AI Workflow</span>
        </nav>
        <button className="auth-help" type="button">Need help?</button>
      </header>

      <section className="auth-main">
        <div className="auth-hero">
          <div className="auth-status">
            <span />
            <strong>Atlas OS</strong>
          </div>
          <h1>
            <span>清大浦恒 Atlas</span>
            <span>智慧数据分析中台</span>
          </h1>
          <p>AI 驱动的新型投资与管理工作流</p>
          <div className="auth-tags" aria-label="核心能力">
            <span>企业分析平台</span>
            <span>项目追踪系统</span>
            <span>企业赋能系统</span>
            <span>企业知识库RAG</span>
            <span>园区分析系统</span>
            <span>Harness 工程</span>
          </div>
        </div>

        <div className="auth-card-wrap">
          <div className="auth-card-glow" />
          <section className="auth-panel">
            <div className="auth-panel-line" />
            <div className="auth-copy">
              <div className="auth-lockline">
                <Lock size={13} />
                <span>Secure access</span>
              </div>
              <h2>{isRegister ? "创建操作空间" : "进入操作中台"}</h2>
              <p>
                {isRegister
                  ? "独立保存报告正文、提示词、模型配置与资料库。"
                  : "继续你的企业智能分析与报告生成工作。"}
              </p>
            </div>

            <div className="auth-quick-grid">
              <button type="button" onClick={onWechatLogin} disabled={Boolean(busy)}>
                <QrCode size={16} />
                <span>微信扫码</span>
              </button>
              <button type="button" onClick={onDevLogin} disabled={Boolean(busy)}>
                <Sparkles size={16} />
                <span>Dev</span>
              </button>
            </div>

            {wechatLogin && (
              <div className="wechat-login-card" aria-live="polite">
                <div
                  className="wechat-qr"
                  dangerouslySetInnerHTML={{ __html: wechatLogin.qrSvg }}
                />
                <div className="wechat-login-copy">
                  <strong>
                    {wechatLogin.status === "expired"
                      ? "二维码已过期"
                      : wechatLogin.status === "confirmed"
                        ? "已确认，正在进入"
                        : "请使用微信扫码登录"}
                  </strong>
                  <span>
                    {wechatLogin.mode === "local-mock"
                      ? "本地测试模式：扫码或打开链接后点击确认。"
                      : "微信开放平台模式：扫码授权后自动进入。"}
                  </span>
                  {wechatLogin.scanUrl && (
                    <a href={wechatLogin.scanUrl} target="_blank" rel="noreferrer">
                      本地测试打开授权页
                    </a>
                  )}
                  <button type="button" onClick={onWechatLogin} disabled={Boolean(busy)}>
                    <RefreshCcw size={14} />
                    刷新二维码
                  </button>
                </div>
              </div>
            )}

            <div className="auth-divider">
              <span>使用账号继续</span>
            </div>

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              {isRegister && (
                <label className="auth-field">
                  <span>显示名称</span>
                  <div className={focused === "displayName" ? "auth-input-wrap active" : "auth-input-wrap"}>
                    <User size={16} />
                    <input
                      value={form.displayName}
                      onFocus={() => setFocused("displayName")}
                      onBlur={() => setFocused(null)}
                      onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                      placeholder="例如 Frank"
                    />
                  </div>
                </label>
              )}
              <label className="auth-field">
                <span>用户名</span>
                <div className={focused === "username" ? "auth-input-wrap active" : "auth-input-wrap"}>
                  <User size={16} />
                  <input
                    value={form.username}
                    onFocus={() => setFocused("username")}
                    onBlur={() => setFocused(null)}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    placeholder="3-32位字母、数字、下划线"
                    autoComplete="username"
                  />
                </div>
              </label>
              <label className="auth-field">
                <span>密码</span>
                <div className={focused === "password" ? "auth-input-wrap active" : "auth-input-wrap"}>
                  <Lock size={16} />
                  <input
                    type="password"
                    value={form.password}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="至少8位"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                  />
                </div>
              </label>
              <label className="auth-remember">
                <input type="checkbox" />
                <span>保持登录 14 天</span>
              </label>
              {message && <span className="auth-message">{message}</span>}
              <button className="auth-submit" type="submit" disabled={Boolean(busy)}>
                <span>{busy || (isRegister ? "注册并进入" : "登录")}</span>
                <ChevronRight size={17} />
              </button>
            </form>

            <button
              className="auth-switch"
              type="button"
              onClick={() => setMode(isRegister ? "login" : "register")}
              disabled={Boolean(busy)}
            >
              {isRegister ? "已有账号，去登录" : "没有账号，创建一个"}
            </button>
            <div className="auth-panel-line bottom" />
          </section>

          <div className="auth-foot-meta">
            <span>support@puheng.ai</span>
            <span>CN / v0.8</span>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * DraftInput — React 受控输入框，兼容中文/日文/韩文 IME 输入法。
 * 在 IME 合成过程中（拼音未上屏时）不向父组件提交值，
 * 只在合成结束（onCompositionEnd）或失焦（onBlur）时才调用 onCommit，
 * 避免每次按键触发 API 请求导致输入法被打断。
 */
function DraftInput({
  value,
  onCommit,
  onDraftChange,
  className,
  placeholder,
  onClick
}: {
  value: string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  onClick?: MouseEventHandler<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  // 当外部 state 变化时同步（仅在非 IME 合成期间）
  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      className={className}
      placeholder={placeholder}
      value={draft}
      onClick={onClick}
      onChange={(event) => {
        setDraft(event.target.value);
        onDraftChange?.(event.target.value);
      }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        onDraftChange?.((event.target as HTMLInputElement).value);
        onCommit((event.target as HTMLInputElement).value);
      }}
      onBlur={() => {
        if (!composingRef.current) onCommit(draft);
      }}
    />
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <DraftInput value={value} onCommit={onChange} />
    </label>
  );
}

type ResourceKey = "strongResources" | "landingRegions" | "landingMethods";

function ResourcePanel({
  state,
  updateItem,
  addItem,
  removeItem
}: {
  state: AppState;
  updateItem: <T extends StrongResource | LandingRegion | LandingMethod>(
    key: ResourceKey,
    id: string,
    patch: Partial<T>
  ) => Promise<void>;
  addItem: (key: ResourceKey) => Promise<void>;
  removeItem: (key: ResourceKey, id: string) => Promise<void>;
}) {
  return (
    <div className="panel resource-panel">
      <div className="panel-title dashboard-section-title">
        <span className="dashboard-title-label">
          <Share2 size={18} />
          交叉分析
        </span>
        <SlidersHorizontal size={18} />
      </div>
      <div className="resource-scroll">
        <ResourceGroup
          title="强资源赋能"
          icon={<Handshake size={16} />}
          items={state.settings.strongResources}
          onAdd={() => addItem("strongResources")}
          render={(item: StrongResource) => (
            <ResourceItem
              checked={item.enabled}
              name={item.name}
              onEnabled={(enabled) => updateItem<StrongResource>("strongResources", item.id, { enabled })}
              onName={(name) => updateItem<StrongResource>("strongResources", item.id, { name })}
              onRemove={() => removeItem("strongResources", item.id)}
            />
          )}
        />
        <ResourceGroup
          title="重点落地区域"
          icon={<MapPin size={16} />}
          items={state.settings.landingRegions}
          onAdd={() => addItem("landingRegions")}
          render={(item: LandingRegion) => (
            <ResourceItem
              checked={item.enabled}
              name={item.name}
              onEnabled={(enabled) => updateItem<LandingRegion>("landingRegions", item.id, { enabled })}
              onName={(name) => updateItem<LandingRegion>("landingRegions", item.id, { name })}
              onRemove={() => removeItem("landingRegions", item.id)}
            />
          )}
        />
        <ResourceGroup
          title="落地合作"
          icon={<Target size={16} />}
          items={state.settings.landingMethods}
          onAdd={() => addItem("landingMethods")}
          render={(item: LandingMethod) => (
            <ResourceItem
              checked={item.enabled}
              name={item.name}
              onEnabled={(enabled) => updateItem<LandingMethod>("landingMethods", item.id, { enabled })}
              onName={(name) => updateItem<LandingMethod>("landingMethods", item.id, { name })}
              onRemove={() => removeItem("landingMethods", item.id)}
            />
          )}
        />
      </div>
    </div>
  );
}

function ResourceGroup<T extends { id: string }>({
  title,
  icon,
  items,
  onAdd,
  render
}: {
  title: string;
  icon: ReactNode;
  items: T[];
  onAdd: () => void;
  render: (item: T) => ReactNode;
}) {
  return (
    <section className="resource-group">
      <header>
        <span>{icon}{title}</span>
        <button className="icon-button bare-action" onClick={onAdd} title="增加自定义项">
          <Plus size={15} />
        </button>
      </header>
      <div className="resource-list">{items.map((item) => <div key={item.id}>{render(item)}</div>)}</div>
    </section>
  );
}

function ResourceItem({
  checked,
  name,
  onEnabled,
  onName,
  onRemove
}: {
  checked: boolean;
  name: string;
  onEnabled: (enabled: boolean) => void;
  onName: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`resource-item ${checked ? "enabled" : ""}`}>
      <button
        className="resource-switch"
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onEnabled(!checked)}
        title={checked ? "关闭" : "开启"}
      >
        <span />
      </button>
      <DraftInput className="resource-name" value={name} onCommit={onName} />
      <button className="icon-button delete-x" onClick={onRemove} title="删除">
        ×
      </button>
    </div>
  );
}

function FilesView({
  state,
  uploadCategory,
  setUploadCategory,
  onUpload
}: {
  state: AppState;
  uploadCategory: string;
  setUploadCategory: (category: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="single-grid">
      <div className="panel">
        <div className="panel-title">
          <span>合作企业资料库</span>
          <Upload size={18} />
        </div>
        <div className="upload-strip">
          <select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
            <option>企业资料</option>
            <option>合作企业资料</option>
            <option>年报/公告</option>
            <option>财务表</option>
            <option>新闻资料</option>
          </select>
          <label className="upload-button">
            <Upload size={16} /> 上传资料
            <input type="file" multiple onChange={onUpload} />
          </label>
        </div>
        <div className="file-table">
          {state.files.length === 0 ? (
            <div className="empty-state">
              <Upload />
              <p>还没有上传资料。可上传 BP、合作企业材料、年报、公告、财务表或新闻资料。</p>
            </div>
          ) : (
            state.files.map((file) => (
              <div className="file-row" key={file.id}>
                <FileText size={17} />
                <strong>{file.originalName}</strong>
                <span>{file.category}</span>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <span>{new Date(file.uploadedAt).toLocaleString("zh-CN")}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsView({
  state,
  apiKeyDraft,
  setApiKeyDraft,
  saveSettings,
  testQwen
}: {
  state: AppState;
  apiKeyDraft: string;
  setApiKeyDraft: (value: string) => void;
  saveSettings: (payload: Partial<Settings> | Record<string, unknown>) => Promise<void>;
  testQwen: () => Promise<void>;
}) {
  const qwen = state.settings.qwen;

  function updateResource<T extends StrongResource | LandingRegion | LandingMethod | ExternalApiSetting>(
    key: "strongResources" | "landingRegions" | "landingMethods" | "externalApis",
    id: string,
    patch: Partial<T>
  ) {
    const list = (state.settings[key] as T[]).map((item) => (item.id === id ? { ...item, ...patch } : item));
    return saveSettings({ [key]: list });
  }

  function addResource(key: "strongResources" | "landingRegions" | "landingMethods" | "externalApis") {
    const id = `custom-${key}-${Date.now()}`;
    const base =
      key === "landingRegions"
        ? { id, name: "自定义区域", enabled: true, industries: "", resources: "", constraints: "" }
        : key === "externalApis"
          ? { id, name: "自定义外部 API", enabled: false, endpoint: "", notes: "" }
          : key === "landingMethods"
            ? { id, name: "自定义方式", enabled: true, notes: "" }
            : { id, name: "自定义强资源", type: "自定义", enabled: true, notes: "" };
    return saveSettings({ [key]: [...(state.settings[key] as unknown[]), base] });
  }

  return (
    <section className="settings-grid">
      <div className="panel">
        <div className="panel-title">
          <span>模型 API</span>
          <KeyRound size={18} />
        </div>
        <div className="settings-form">
          <label>
            模型来源
            <select
              value={qwen.provider}
              onChange={(event) => saveSettings({ qwen: { provider: event.target.value } })}
            >
              <option value="opensearch">Qwen/OpenSerach/Deepseek v4 pro</option>
              <option value="dashscope">DashScope / OpenAI-compatible</option>
            </select>
          </label>
          <label>
            API Key
            <div className="inline-control">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={qwen.apiKeyConfigured ? `已保存 ${qwen.apiKeyPreview}` : "暂空，后续填写"}
              />
              <button className="button ghost" onClick={() => saveSettings({ qwen: { apiKey: apiKeyDraft } })}>
                <Save size={16} /> 保存
              </button>
              <button className="button ghost" onClick={() => saveSettings({ qwen: { clearApiKey: true } })}>
                清空
              </button>
            </div>
          </label>
          {qwen.provider === "opensearch" ? (
            <>
              <label>
                OpenSearch Host
                <input
                  value={qwen.openSearchHost}
                  onChange={(event) => saveSettings({ qwen: { openSearchHost: event.target.value } })}
                  placeholder="https://default-hea5.platform-cn-shanghai.opensearch.aliyuncs.com"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Base URL
                <input
                  value={qwen.baseUrl}
                  onChange={(event) => saveSettings({ qwen: { baseUrl: event.target.value } })}
                />
              </label>
              <label>
                Responses Base URL
                <input
                  value={qwen.responsesBaseUrl}
                  onChange={(event) => saveSettings({ qwen: { responsesBaseUrl: event.target.value } })}
                />
              </label>
            </>
          )}
          <div className="form-grid">
            <label>
              模型
              <input value={qwen.model} onChange={(event) => saveSettings({ qwen: { model: event.target.value } })} />
            </label>
            <label>
              地域
              <input value={qwen.region} onChange={(event) => saveSettings({ qwen: { region: event.target.value } })} />
            </label>
          </div>
          <button className="button primary" onClick={testQwen} disabled={!qwen.apiKeyConfigured}>
            <Sparkles size={16} /> 测试连接
          </button>
        </div>
      </div>

      <EditableList
        title="外部数据 API"
        icon={<Archive size={18} />}
        items={state.settings.externalApis}
        onAdd={() => addResource("externalApis")}
        render={(item: ExternalApiSetting) => (
          <>
            <input type="checkbox" checked={item.enabled} onChange={(event) => updateResource("externalApis", item.id, { enabled: event.target.checked })} />
            <input value={item.name} onChange={(event) => updateResource("externalApis", item.id, { name: event.target.value })} />
            <input value={item.endpoint} onChange={(event) => updateResource("externalApis", item.id, { endpoint: event.target.value })} placeholder="API 或公开入口地址" />
            <input value={item.notes} onChange={(event) => updateResource("externalApis", item.id, { notes: event.target.value })} placeholder="用途说明" />
          </>
        )}
      />

      <div className="panel about-panel">
        <div className="panel-title">
          <span>About</span>
          <Sparkles size={18} />
        </div>
        <div className="about-content">
          <section>
            <h3>产品功能</h3>
            <p>
              清大浦恒 AI 是面向企业研究、投资判断、招商落地、资本合作和资源赋能的企业智能分析平台。系统将分散的公开资料、人工经验和业务判断组织成可编辑、可追溯、可推理、可输出的企业知识网络，帮助用户判断一家公司是谁、为什么重要、与我们有什么关系、能如何合作、风险在哪里。
            </p>
          </section>
          <section>
            <h3>版本路线图</h3>
            <ul>
              <li>0.8：本地工作台，完成分析框架、章节生成、报告预览、Word 导出、移动端适配、模型联通检测和 MIT 开源协议。</li>
              <li>1.0：单机正式版，强化章节搜索、来源追踪、提示词体系、报告质量控制、导出模板和新增章节生成稳定性。</li>
              <li>2.0：云端访问版，支持服务器部署、域名、HTTPS、日志、备份、文件存储和安全配置。</li>
              <li>3.0：多用户数据库版，接入企业数据库、报告版本、用户组织、角色权限、审核确认和操作日志。</li>
              <li>4.0：企业知识库版，沉淀工商、融资、股东、团队、财务、客户、供应商、风险和合作记录，并与分析报告联动。</li>
              <li>5.0：企业立体关联分析版，建设企业、人物、机构、基金、园区、政府平台关系图谱，支撑知识抽取、路径分析、风险穿透和跨实体推理。</li>
              <li>6.0+：智能工作流与自动监控，跟踪企业新闻、融资、工商变更、招股书和公告更新。</li>
            </ul>
          </section>
          <section>
            <h3>开发者与 GitHub 开源</h3>
            <p>GitHub 版本：0.8</p>
            <p>developed by frankfromfuture</p>
            <p>项目代码通过 GitHub 仓库管理，后续可按开源项目方式持续迭代、部署和协作。</p>
            <p>协议：MIT License。</p>
            <p>
              链接：
              <a href="https://github.com/Frankfromfuture/Puheng-AI" target="_blank" rel="noreferrer">
                github.com/Frankfromfuture/Puheng-AI
              </a>
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

function EditableList<T extends { id: string; name: string }>({
  title,
  icon,
  items,
  onAdd,
  render
}: {
  title: string;
  icon: ReactNode;
  items: T[];
  onAdd: () => void;
  render: (item: T) => ReactNode;
}) {
  return (
    <div className="panel editable-list">
      <div className="panel-title">
        <span>{title}</span>
        <div>
          {icon}
          <button className="icon-button" onClick={onAdd}><Plus size={16} /></button>
        </div>
      </div>
      <div className="list-rows">
        {items.map((item) => (
          <div className="settings-row" key={item.id}>{render(item)}</div>
        ))}
      </div>
    </div>
  );
}

function PromptTextarea({ label, value, onSave, rows = 3 }: { label: string; value: string; onSave: (v: string) => void; rows?: number }) {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="prompt-field">
      <div className="prompt-field-label">{label}</div>
      <textarea
        className={`prompt-textarea${dirty ? " dirty" : ""}`}
        value={draft}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
      />
      {dirty && (
        <div className="prompt-field-actions">
          <button className="button prompt-save-btn" onClick={() => onSave(draft)}>
            <Check size={13} /> 确认保存
          </button>
          <button className="button ghost prompt-cancel-btn" onClick={() => setDraft(value)}>
            取消
          </button>
        </div>
      )}
    </div>
  );
}

function PromptEngineeringView({
  state, flatNodes, savePromptEngineering, saveFramework, saveSettings
}: {
  state: AppState;
  flatNodes: FlatNode[];
  savePromptEngineering: (p: Partial<PromptEngineering>) => Promise<void>;
  saveFramework: (f: ReportNode[]) => Promise<void>;
  saveSettings: (p: Partial<Settings> | Record<string, unknown>) => Promise<void>;
}) {
  const level1Nodes = flatNodes.filter(({ level }) => level === 1);
  function saveNodeNote(id: string, notes: string) {
    saveFramework(updateNode(state.framework, id, { notes }));
  }
  function saveNodeSearchKeywords(id: string, searchKeywords: string) {
    saveFramework(updateNode(state.framework, id, { searchKeywords }));
  }
  function saveResNote(key: "strongResources" | "landingRegions" | "landingMethods", id: string, notes: string) {
    const list = state.settings[key].map((item: StrongResource | LandingRegion | LandingMethod) =>
      item.id === id ? { ...item, notes } : item
    );
    saveSettings({ [key]: list });
  }
  return (
    <div className="prompt-view">
      <div className="prompt-view-header">
        <h2>Harness 工程</h2>
        <p>全局风格与各章节、各资源合作点的生成提示词。失焦自动保存，AI 生成时严格遵循。</p>
      </div>
      <section className="prompt-section">
        <div className="prompt-section-title">全局风格要求</div>
        <PromptTextarea
          label="适用于所有章节的文风、结构与视角要求"
          value={state.promptEngineering?.globalStyle ?? ""}
          onSave={(v) => savePromptEngineering({ globalStyle: v })}
        />
      </section>
      <section className="prompt-section">
        <div className="prompt-section-title">分析深度定义</div>
        <p className="prompt-section-desc">四种颗粒度的输出规则，AI 生成时按章节的颗粒度设定严格执行。修改后点击「确认保存」生效。</p>
        <div className="depth-instructions-grid">
          {depthOptions.map((depth) => (
            <PromptTextarea
              key={depth}
              label={depth}
              value={state.promptEngineering?.depthInstructions?.[depth] ?? ""}
              onSave={(v) => savePromptEngineering({ depthInstructions: { ...state.promptEngineering?.depthInstructions, [depth]: v } })}
              rows={10}
            />
          ))}
        </div>
      </section>
      <section className="prompt-section">
        <div className="prompt-section-title">报告章节提示词</div>
        {level1Nodes.map(({ node: l1, numbering: n1 }) => {
          const children = flatNodes.filter(({ node: l2, level }) =>
            level === 2 && state.framework.some(top =>
              top.id === l1.id && (top.children ?? []).some(c => c.id === l2.id)));
          return (
            <div key={l1.id} className="prompt-chapter-group two-col">
              <div className="prompt-chapter-label">{n1}&nbsp;&nbsp;{l1.title}</div>
              <div className="prompt-fields-grid">
                {children.length > 0
                  ? children.map(({ node: l2, numbering: n2 }) => (
                    <div key={l2.id} className="prompt-chapter-card">
                      <PromptTextarea
                        label={`${n2}  ${l2.title}｜信息检索关键词`}
                        value={l2.searchKeywords ?? ""}
                        onSave={(v) => saveNodeSearchKeywords(l2.id, v)}
                        rows={2}
                      />
                      <PromptTextarea
                        label={`${n2}  ${l2.title}｜章节提示词`}
                        value={l2.notes ?? ""}
                        onSave={(v) => saveNodeNote(l2.id, v)}
                      />
                    </div>
                  ))
                  : <div className="prompt-chapter-card">
                    <PromptTextarea
                      label={`${n1}  ${l1.title}｜信息检索关键词`}
                      value={l1.searchKeywords ?? ""}
                      onSave={(v) => saveNodeSearchKeywords(l1.id, v)}
                      rows={2}
                    />
                    <PromptTextarea
                      label={`${n1}  ${l1.title}｜章节提示词`}
                      value={l1.notes ?? ""}
                      onSave={(v) => saveNodeNote(l1.id, v)}
                    />
                  </div>
                }
              </div>
            </div>
          );
        })}
      </section>
      <section className="prompt-section">
        <div className="prompt-section-title">合作点交叉指引提示词</div>
        <div className="prompt-chapter-group">
          <div className="prompt-chapter-label">强资源赋能</div>
          {state.settings.strongResources.filter(r => r.enabled).map(r => (
            <PromptTextarea key={r.id} label={r.name} value={r.notes ?? ""}
              onSave={(v) => saveResNote("strongResources", r.id, v)} />
          ))}
        </div>
        <div className="prompt-chapter-group">
          <div className="prompt-chapter-label">重点落地区域</div>
          {state.settings.landingRegions.filter(r => r.enabled).map(r => (
            <PromptTextarea key={r.id} label={r.name} value={r.notes ?? ""}
              onSave={(v) => saveResNote("landingRegions", r.id, v)} />
          ))}
        </div>
        <div className="prompt-chapter-group">
          <div className="prompt-chapter-label">落地合作</div>
          {state.settings.landingMethods.filter(m => m.enabled).map(m => (
            <PromptTextarea key={m.id} label={m.name} value={m.notes ?? ""}
              onSave={(v) => saveResNote("landingMethods", m.id, v)} />
          ))}
        </div>
      </section>
    </div>
  );
}

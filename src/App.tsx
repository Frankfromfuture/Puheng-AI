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
  FileText,
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
  RefreshCcw,
  Save,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Unlock,
  Upload,
  Zap
} from "lucide-react";
import { ChangeEvent, DragEvent, MouseEventHandler, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisDepth,
  AnalysisSection,
  AppState,
  ExternalApiSetting,
  LandingMethod,
  LandingRegion,
  PromptEngineering,
  ReportNode,
  ResearchRequirement,
  SectionStatus,
  Settings,
  StrongResource
} from "./types";

const api = {
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
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "请求失败");
  return payload as T;
}

const depthOptions: AnalysisDepth[] = ["简版", "标准", "深入"];

const requirementOptions: Array<{ id: ResearchRequirement; label: string; shortLabel: string; focus: string; icon: typeof Zap }> = [
  { id: "brief", label: "简要分析", shortLabel: "简要", focus: "所有框架均简单分析", icon: Zap },
  { id: "fundamental", label: "基本面深度分析", shortLabel: "基本面", focus: "企业基本面深入，其余相应变化", icon: BarChart3 },
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
    status: "not_started",
    locked: false,
    children: []
  };
}

function depthClass(depth: AnalysisDepth) {
  if (depth === "深入") return "deep";
  if (depth === "简版") return "simple";
  return "standard";
}

function generatedAnalysisBody(section: AnalysisSection | undefined, node: ReportNode) {
  const text = section?.analysisText?.trim() ?? "";
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
  const [activeView, setActiveView] = useState<"dashboard" | "companyDatabase" | "companyGraph" | "settings" | "files" | "prompts">("dashboard");
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
      .getState()
      .then((next) => {
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
          setModelHealth("failed");
          setMessage(error.message);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const flatNodes = useMemo(() => (state ? flatten(state.framework) : []), [state]);
  const activeSection = state?.sections[activeSectionId];
  const activeNode = flatNodes.find((item) => item.node.id === activeSectionId)?.node;
  const generatedCount = state
    ? flatNodes.filter(({ node }) => Boolean(generatedAnalysisBody(state.sections[node.id], node))).length
    : 0;
  const modelHealthCopy: Record<ModelHealth, { label: string; cls: string; hint: string }> = {
    not_configured: { label: "未配置", cls: "warn", hint: "请先在设置中保存模型 API Key" },
    checking: { label: "检测中", cls: "muted", hint: "正在测试模型连接" },
    connected: { label: "已联通", cls: "ok", hint: "模型连接测试成功" },
    failed: { label: "未联通", cls: "warn", hint: "模型连接测试失败，点击重试" }
  };

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

  function applyState(next: AppState) {
    setState(next);
    if (!next.sections[activeSectionId]) {
      setActiveSectionId(Object.keys(next.sections)[0] ?? "");
    }
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
    const saved = await withBusy("生成章节", () => api.draftSection(id));
    if (saved) applyState(saved);
  }

  async function clearReport() {
    const saved = await withBusy("清空分析内容", () => api.clearReport());
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

  if (!state) {
    return (
      <main className="loading">
        <Sparkles />
        <span>正在打开清大浦恒 AI 工作台...</span>
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <img src="/logo.svg" alt="浦恒 Logo" className={`brand-logo ${sidebarCollapsed ? "collapsed" : ""}`} />
          {!sidebarCollapsed && (
            <div className="brand-copy">
              <strong>清大浦恒 AI</strong>
            </div>
          )}
        </div>
        <nav>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")} title="工作台">
            <Layers3 size={18} /> {!sidebarCollapsed && "工作台"}
          </button>
          <button className={activeView === "companyDatabase" ? "active" : ""} onClick={() => setActiveView("companyDatabase")} title="企业数据库">
            <Database size={18} /> {!sidebarCollapsed && "企业数据库"}
          </button>
          <button className={activeView === "companyGraph" ? "active" : ""} onClick={() => setActiveView("companyGraph")} title="企业立体关联信息">
            <Network size={18} /> {!sidebarCollapsed && "企业立体关联信息"}
          </button>
          <button className={activeView === "prompts" ? "active" : ""} onClick={() => setActiveView("prompts")} title="提示词工程">
            <SlidersHorizontal size={18} /> {!sidebarCollapsed && "提示词工程"}
          </button>
          <button className={activeView === "files" ? "active" : ""} onClick={() => setActiveView("files")} title="资料库">
            <Upload size={18} /> {!sidebarCollapsed && "资料库"}
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")} title="设置">
            <SettingsIcon size={18} /> {!sidebarCollapsed && "设置"}
          </button>
        </nav>
        <div className="sidebar-bottom">
          {!sidebarCollapsed && (
            <button
              className={`sidebar-model-status ${modelHealthCopy[modelHealth].cls}`}
              onClick={retestModelConnection}
              title={modelHealthCopy[modelHealth].hint}
            >
              <span>模型状态</span>
              <strong>{modelHealthCopy[modelHealth].label}</strong>
              <small>{state.settings.qwen.provider === "opensearch" ? "OpenSearch" : "DashScope"} · {state.settings.qwen.model}</small>
            </button>
          )}
          <div className="sidebar-meta">
            <span>GitHub v0.8</span>
            {!sidebarCollapsed && <p>developed by frankfromfuture</p>}
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
          <div>
            <h1>企业智能分析平台</h1>
          </div>
          <div className="top-actions">
            {busy && <span className="busy">{busy}...</span>}
            {message && <span className="toast">{message}</span>}
            {exportLink && (
              <a className="button ghost" href={exportLink}>
                <Download size={16} /> 打开 Word
              </a>
            )}
            <button className="button primary" onClick={exportDocx} disabled={generatedCount === 0 || Boolean(busy)}>
              <FileText size={16} /> 生成 Word
            </button>
          </div>
        </header>

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
            clearReport={clearReport}
            copyGeneratedReport={copyGeneratedReport}
            pauseGeneration={pauseGeneration}
            confirmSection={confirmSection}
            unlockSection={unlockSection}
            busy={busy}
            generating={generating}
            genProgress={genProgress}
          />
        )}

        {activeView === "companyDatabase" && (
          <ConstructionView title="企业数据库" />
        )}

        {activeView === "companyGraph" && (
          <ConstructionView title="企业立体关联信息" />
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

function ConstructionView({ title }: { title: string }) {
  return (
    <section className="construction-view" aria-label={title}>
      <img src="/logo.svg" alt="浦恒 Logo" className="construction-logo" />
      <div className="construction-copy">
        <h2>{title}</h2>
        <p>建设中，敬请期待</p>
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
  clearReport: () => Promise<void>;
  copyGeneratedReport: () => Promise<void>;
  pauseGeneration: () => void;
  confirmSection: (id: string) => Promise<void>;
  unlockSection: (id: string) => Promise<void>;
  busy: string;
  generating: boolean;
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
    clearReport,
    copyGeneratedReport,
    pauseGeneration,
    confirmSection,
    unlockSection,
    busy,
    generating,
    genProgress
  } = props;

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

  const [mobilePanel, setMobilePanel] = useState<"framework" | "resources" | "preview">("preview");
  const mobilePanels = [
    { id: "framework" as const, label: "框架", icon: Layers3 },
    { id: "resources" as const, label: "合作点", icon: Handshake },
    { id: "preview" as const, label: "预览", icon: FileText }
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
              onCommit={(value) => saveProject({ companyName: value })}
              placeholder="输入公司名称"
            />
            {!state.project.companyName.trim() && (
              <div className="company-guide-bubble">先输入企业名称</div>
            )}
          </div>
          <div className="requirement-pills" aria-label="研究要求">
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
              清空分析内容
            </button>
            <button
              className={`button gen-report-btn ${generating ? "pausing" : ""}`}
              onClick={generating ? pauseGeneration : generateReport}
              disabled={!generating && Boolean(busy)}
              title={generating ? "点击暂停生成" : "根据报告框架与资源条件生成完整分析报告"}
            >
              <PlayCircle size={15} />
              {generating ? "暂停生成" : "生成完整分析报告"}
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
          <div className="panel-title">
            <span>分析框架</span>
            <button className="icon-button" onClick={addRoot} title="增加一级章节">
              <Plus size={16} />
            </button>
          </div>
          <div className="tree">
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
                >
                  {depthOptions.map((depth) => (
                    <option key={depth}>{depth}</option>
                  ))}
                </select>
                {(() => { const conf = confidenceLabel(state.sections[node.id]?.confidenceScore, node.status); return <span className={`status ${conf.cls}`}>{conf.text}</span>; })()}
                {node.locked && <Lock size={14} className="lock" />}
                <button className="icon-button" onClick={(event) => { event.stopPropagation(); addSubsection(node.id); }} title="增加二级章节">
                  <Plus size={15} />
                </button>
                <button className="icon-button danger" onClick={(event) => { event.stopPropagation(); remove(node.id); }} title="删除章节">
                  <Trash2 size={15} />
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
          <div className="panel-title">
            <span>分析报告预览</span>
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
	                            disabled={Boolean(busy) || generating || node.locked}
	                            title="单独生成本章节分析报告"
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

/**
 * DraftInput — React 受控输入框，兼容中文/日文/韩文 IME 输入法。
 * 在 IME 合成过程中（拼音未上屏时）不向父组件提交值，
 * 只在合成结束（onCompositionEnd）或失焦（onBlur）时才调用 onCommit，
 * 避免每次按键触发 API 请求导致输入法被打断。
 */
function DraftInput({
  value,
  onCommit,
  className,
  placeholder,
  onClick
}: {
  value: string;
  onCommit: (value: string) => void;
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
      onChange={(event) => setDraft(event.target.value)}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
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
      <div className="panel-title">
        <span>合作点交叉指引</span>
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
              note={item.notes}
              onEnabled={(enabled) => updateItem<StrongResource>("strongResources", item.id, { enabled })}
              onName={(name) => updateItem<StrongResource>("strongResources", item.id, { name })}
              onNote={(notes) => updateItem<StrongResource>("strongResources", item.id, { notes })}
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
              note={item.notes ?? ""}
              onEnabled={(enabled) => updateItem<LandingRegion>("landingRegions", item.id, { enabled })}
              onName={(name) => updateItem<LandingRegion>("landingRegions", item.id, { name })}
              onNote={(notes) => updateItem<LandingRegion>("landingRegions", item.id, { notes })}
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
              note={item.notes}
              onEnabled={(enabled) => updateItem<LandingMethod>("landingMethods", item.id, { enabled })}
              onName={(name) => updateItem<LandingMethod>("landingMethods", item.id, { name })}
              onNote={(notes) => updateItem<LandingMethod>("landingMethods", item.id, { notes })}
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
        <button className="icon-button" onClick={onAdd} title="增加自定义项">
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
  note,
  onEnabled,
  onName,
  onNote,
  onRemove
}: {
  checked: boolean;
  name: string;
  note?: string;
  onEnabled: (enabled: boolean) => void;
  onName: (name: string) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`resource-item ${checked ? "enabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onEnabled(event.target.checked)} />
      <DraftInput className="resource-name" value={name} onCommit={onName} />
      <DraftInput className="resource-note" value={note ?? ""} onCommit={onNote} placeholder="注解" />
      <button className="icon-button danger" onClick={onRemove} title="删除">
        <Trash2 size={14} />
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
              <option value="opensearch">OpenSearch / AI 搜索开放平台</option>
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
              <label>
                工作空间 / workspace
                <input
                  value={qwen.openSearchAppName}
                  onChange={(event) => saveSettings({ qwen: { openSearchAppName: event.target.value } })}
                  placeholder="例如 default"
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
        rows={3}
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
  function saveResNote(key: "strongResources" | "landingRegions" | "landingMethods", id: string, notes: string) {
    const list = state.settings[key].map((item: StrongResource | LandingRegion | LandingMethod) =>
      item.id === id ? { ...item, notes } : item
    );
    saveSettings({ [key]: list });
  }
  return (
    <div className="prompt-view">
      <div className="prompt-view-header">
        <h2>提示词工程</h2>
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
        <p className="prompt-section-desc">三种深度的输出规则，AI 生成时按章节的深度设定严格执行。三栏并排编辑，修改后点击「确认保存」生效。</p>
        <div className="depth-instructions-grid">
          {(["简版", "标准", "深入"] as const).map((depth) => (
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
                      <PromptTextarea key={l2.id} label={`${n2}  ${l2.title}`}
                        value={l2.notes ?? ""} onSave={(v) => saveNodeNote(l2.id, v)} />
                    ))
                  : <PromptTextarea label={`${n1}  ${l1.title}`}
                      value={l1.notes ?? ""} onSave={(v) => saveNodeNote(l1.id, v)} />
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

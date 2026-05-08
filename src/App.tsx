import {
  Archive,
  BarChart3,
  Briefcase,
  Building2,
  Check,
  Download,
  FileText,
  GripVertical,
  Handshake,
  KeyRound,
  Layers3,
  Lock,
  MapPin,
  Maximize,
  PanelLeft,
  PanelLeftClose,
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
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

const depthOptions: AnalysisDepth[] = ["简版", "标准", "深入", "专项"];

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
  if (depth === "专项") return "special";
  return "standard";
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "settings" | "files" | "prompts">("dashboard");
  const [activeSectionId, setActiveSectionId] = useState("capital-cooperation");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [dragId, setDragId] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [uploadCategory, setUploadCategory] = useState("企业资料");
  const [exportLink, setExportLink] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: string; index: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .getState()
      .then(setState)
      .catch((error) => setMessage(error.message));
  }, []);

  const flatNodes = useMemo(() => (state ? flatten(state.framework) : []), [state]);
  const activeSection = state?.sections[activeSectionId];
  const activeNode = flatNodes.find((item) => item.node.id === activeSectionId)?.node;
  const confirmedCount = state
    ? Object.values(state.sections).filter((section) => section.status === "confirmed").length
    : 0;

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
    if (saved) applyState(saved);
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
    const saved = await withBusy("生成章节", () => api.draftSection(id));
    if (saved) applyState(saved);
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
      setMessage(`Word 已生成：${result.filename}`);
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
            <div>
              <strong>清大浦恒 AI</strong>
              <span>企业公开资料与合作分析</span>
            </div>
          )}
        </div>
        <nav>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")} title="工作台">
            <Layers3 size={18} /> {!sidebarCollapsed && "工作台"}
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
        {!sidebarCollapsed && (
          <>
            <div className="sidebar-card">
              <span>模型状态</span>
              <strong className={state.settings.qwen.apiKeyConfigured ? "ok" : "warn"}>
                {state.settings.qwen.apiKeyConfigured ? "已配置" : "未配置"}
              </strong>
              <p>{state.settings.qwen.provider === "opensearch" ? "OpenSearch" : "DashScope"} · {state.settings.qwen.model}</p>
            </div>
            <div className="sidebar-card">
              <span>已确认章节</span>
              <strong>{confirmedCount}</strong>
              <p>Word 只收录已确认内容</p>
            </div>
          </>
        )}
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>企业分析 Dashboard</h1>
            <p>先分块生成和微调，再统一输出 Word 报告。</p>
          </div>
          <div className="top-actions">
            {busy && <span className="busy">{busy}...</span>}
            {message && <span className="toast">{message}</span>}
            {exportLink && (
              <a className="button ghost" href={exportLink}>
                <Download size={16} /> 打开 Word
              </a>
            )}
            <button className="button primary" onClick={exportDocx} disabled={confirmedCount === 0 || Boolean(busy)}>
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
            pauseGeneration={pauseGeneration}
            confirmSection={confirmSection}
            unlockSection={unlockSection}
            busy={busy}
            generating={generating}
            genProgress={genProgress}
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
              if (result) setMessage("模型连接测试成功。");
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

  return (
    <section className="dashboard-grid">
      {/* Row 1: Compact Research Entry */}
      <div className="panel command-panel-compact">
        <div className="command-compact-row">
          <Target size={16} className="command-icon" />
          <input
            className="company-input"
            value={state.project.companyName}
            onChange={(event) => saveProject({ companyName: event.target.value })}
            placeholder="输入公司名称"
          />
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
              className={`button gen-report-btn ${generating ? "pausing" : ""}`}
              onClick={generating ? pauseGeneration : generateReport}
              disabled={!generating && Boolean(busy)}
              title={generating ? "点击暂停生成" : "根据报告框架与资源条件生成完整分析报告"}
            >
              <PlayCircle size={15} />
              {generating ? "暂停生成" : "生成分析报告"}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Three columns — Framework | Resources | Preview */}
      <div className="dashboard-body">
        <div className="panel framework-panel">
          <div className="panel-title">
            <span>报告框架图</span>
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
                <input
                  className="tree-title"
                  value={node.title}
                  onChange={(event) => patchNode(node.id, { title: event.target.value })}
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

        <ResourcePanel
          state={state}
          updateItem={updateSettingItem}
          addItem={addSettingItem}
          removeItem={removeSettingItem}
        />

        <div className="panel report-preview-panel">
          <div className="panel-title">
            <span>分析报告预览</span>
            <FileText size={18} />
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
                  const hasContent = section?.analysisText?.trim();
                  const conf = confidenceLabel(section?.confidenceScore, node.status);
                  return (
                    <div key={node.id} className={`report-section level-${level}${level === 1 ? " level-1-divider" : ""}`}>
                      <div className="report-section-head">
                        <span className="report-numbering">{numbering}</span>
                        <span className="report-title">{node.title}</span>
                        <span className={`depth-badge ${depthClass(node.depth)}`}>{node.depth}</span>
                        <span className={`status ${conf.cls}`}>{conf.text}</span>
                      </div>
                      {hasContent && (
                        <div className="report-section-body">{section.analysisText}</div>
                      )}
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label>
      {label}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(draft)}
      />
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
        <span>资源与落地要点</span>
        <SlidersHorizontal size={18} />
      </div>
      <div className="resource-scroll">
        <ResourceGroup
          title="我方强资源"
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
          title="落地方式"
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
      <input className="resource-name" value={name} onChange={(event) => onName(event.target.value)} />
      <input className="resource-note" value={note ?? ""} onChange={(event) => onNote(event.target.value)} placeholder="注解" />
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

function PromptTextarea({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="prompt-field">
      <div className="prompt-field-label">{label}</div>
      <textarea
        className="prompt-textarea"
        value={draft}
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); }}
      />
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
    const list = (state.settings[key] as Array<{ id: string; notes?: string; [k: string]: unknown }>)
      .map(item => item.id === id ? { ...item, notes } : item);
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
        <div className="prompt-section-title">报告章节提示词</div>
        {level1Nodes.map(({ node: l1, numbering: n1 }) => {
          const children = flatNodes.filter(({ node: l2, level }) =>
            level === 2 && state.framework.some(top =>
              top.id === l1.id && (top.children ?? []).some(c => c.id === l2.id)));
          return (
            <div key={l1.id} className="prompt-chapter-group">
              <div className="prompt-chapter-label">{n1}&nbsp;&nbsp;{l1.title}</div>
              {children.length > 0
                ? children.map(({ node: l2, numbering: n2 }) => (
                    <PromptTextarea key={l2.id} label={`${n2}  ${l2.title}`}
                      value={l2.notes ?? ""} onSave={(v) => saveNodeNote(l2.id, v)} />
                  ))
                : <PromptTextarea label={`${n1}  ${l1.title}`}
                    value={l1.notes ?? ""} onSave={(v) => saveNodeNote(l1.id, v)} />
              }
            </div>
          );
        })}
      </section>
      <section className="prompt-section">
        <div className="prompt-section-title">资源与落地要点提示词</div>
        <div className="prompt-chapter-group">
          <div className="prompt-chapter-label">我方强资源</div>
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
          <div className="prompt-chapter-label">落地方式</div>
          {state.settings.landingMethods.filter(m => m.enabled).map(m => (
            <PromptTextarea key={m.id} label={m.name} value={m.notes ?? ""}
              onSave={(v) => saveResNote("landingMethods", m.id, v)} />
          ))}
        </div>
      </section>
    </div>
  );
}

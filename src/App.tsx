import {
  AlertTriangle,
  Archive,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  Handshake,
  KeyRound,
  Layers3,
  Lock,
  MapPin,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Unlock,
  Upload,
  UsersRound
} from "lucide-react";
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type {
  AnalysisDepth,
  AnalysisSection,
  AppState,
  Citation,
  ExternalApiSetting,
  LandingMethod,
  LandingRegion,
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

const requirementOptions: Array<{ id: ResearchRequirement; label: string; focus: string }> = [
  { id: "brief", label: "简要分析", focus: "所有框架均简单分析" },
  { id: "fundamental", label: "基本面深度分析", focus: "企业基本面深入，其余相应变化" },
  { id: "investment", label: "投资合作分析", focus: "产业分析与资本分析重点" },
  { id: "landing", label: "招商落地分析", focus: "产业分析与区域交叉分析重点" },
  { id: "enablement", label: "赋能合作分析", focus: "资源复合与赋能分析重点" },
  { id: "comprehensive", label: "全面分析", focus: "所有重点展开" }
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

type FlatNode = { node: ReportNode; level: number; parentId: string };

function flatten(nodes: ReportNode[], level = 1, parentId = ""): FlatNode[] {
  return nodes.flatMap((node) => [
    { node, level, parentId },
    ...flatten(node.children, level + 1, node.id)
  ]);
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

function confidenceLabel(section?: AnalysisSection) {
  if (!section || section.status === "not_started") return "置信度：待生成";
  return `置信度：${section.confidenceScore}%｜${section.confidenceReason || "暂无说明"}｜资料覆盖：${section.sourceCoverage || "未说明"}`;
}

function depthClass(depth: AnalysisDepth) {
  if (depth === "深入") return "deep";
  if (depth === "简版") return "simple";
  if (depth === "专项") return "special";
  return "standard";
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "settings" | "files">("dashboard");
  const [activeSectionId, setActiveSectionId] = useState("capital-cooperation");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [dragId, setDragId] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [uploadCategory, setUploadCategory] = useState("企业资料");
  const [exportLink, setExportLink] = useState("");

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">浦</div>
          <div>
            <strong>清大浦恒 AI</strong>
            <span>企业公开资料与合作分析</span>
          </div>
        </div>
        <nav>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
            <Layers3 size={18} /> 工作台
          </button>
          <button className={activeView === "files" ? "active" : ""} onClick={() => setActiveView("files")}>
            <Upload size={18} /> 资料库
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
            <SettingsIcon size={18} /> 设置
          </button>
        </nav>
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
            activeSectionId={activeSectionId}
            activeSection={activeSection}
            activeNode={activeNode}
            flatNodes={flatNodes}
            dragId={dragId}
            setDragId={setDragId}
            setActiveSectionId={setActiveSectionId}
            saveFramework={saveFramework}
            saveProject={saveProject}
            saveSettings={saveSettings}
            saveSection={saveSection}
            generateSection={generateSection}
            confirmSection={confirmSection}
            unlockSection={unlockSection}
            busy={busy}
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
      </main>
    </div>
  );
}

interface DashboardProps {
  state: AppState;
  activeSectionId: string;
  activeSection?: AnalysisSection;
  activeNode?: ReportNode;
  flatNodes: FlatNode[];
  dragId: string;
  setDragId: (id: string) => void;
  setActiveSectionId: (id: string) => void;
  saveFramework: (framework: ReportNode[]) => Promise<void>;
  saveProject: (project: Partial<AppState["project"]>) => Promise<void>;
  saveSettings: (payload: Partial<Settings> | Record<string, unknown>) => Promise<void>;
  saveSection: (id: string, patch: Partial<AnalysisSection>) => Promise<void>;
  generateSection: (id: string) => Promise<void>;
  confirmSection: (id: string) => Promise<void>;
  unlockSection: (id: string) => Promise<void>;
  busy: string;
}

function Dashboard(props: DashboardProps) {
  const {
    state,
    activeSectionId,
    activeSection,
    activeNode,
    flatNodes,
    dragId,
    setDragId,
    setActiveSectionId,
    saveFramework,
    saveProject,
    saveSettings,
    saveSection,
    generateSection,
    confirmSection,
    unlockSection,
    busy
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
      <div className="panel project-panel command-panel">
        <div className="panel-title">
          <span>研究入口</span>
          <Target size={18} />
        </div>
        <div className="command-row">
          <Field label="公司名称" value={state.project.companyName} onChange={(companyName) => saveProject({ companyName })} />
          <div className="model-token">
            <span>当前模型</span>
            <strong>{state.settings.qwen.model}</strong>
          </div>
        </div>
        <div className="requirement-grid" aria-label="研究要求">
          {requirementOptions.map((option) => (
            <button
              key={option.id}
              className={state.project.researchRequirement === option.id ? "selected" : ""}
              onClick={() => saveProject({ researchRequirement: option.id })}
            >
              <strong>{option.label}</strong>
              <span>{option.focus}</span>
            </button>
          ))}
        </div>
      </div>

      <ResourcePanel
        state={state}
        updateItem={updateSettingItem}
        addItem={addSettingItem}
        removeItem={removeSettingItem}
      />

      <div className="panel framework-panel">
        <div className="panel-title">
          <span>报告框架图</span>
          <button className="icon-button" onClick={addRoot} title="增加一级章节">
            <Plus size={16} />
          </button>
        </div>
        <div className="tree">
          {flatNodes.map(({ node, level }) => (
            <div
              key={node.id}
              className={`tree-row ${activeSectionId === node.id ? "selected" : ""}`}
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
              <span className={`status ${statusClass[node.status]}`}>{statusText[node.status]}</span>
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

      <div className="panel section-panel">
        {activeSection && activeNode ? (
          <>
            <div className="section-head">
              <div>
                <span className={`status ${statusClass[activeSection.status]}`}>{statusText[activeSection.status]}</span>
                <h2>{activeSection.title}</h2>
                <p>{confidenceLabel(activeSection)}</p>
              </div>
              <div className="section-actions">
                {activeSection.locked ? (
                  <button className="button ghost" onClick={() => unlockSection(activeSection.id)} disabled={Boolean(busy)}>
                    <Unlock size={16} /> 解锁
                  </button>
                ) : (
                  <>
                    <button className="button ghost" onClick={() => generateSection(activeSection.id)} disabled={Boolean(busy)}>
                      <RefreshCcw size={16} /> 模型生成
                    </button>
                    <button className="button primary" onClick={() => confirmSection(activeSection.id)} disabled={Boolean(busy)}>
                      <Check size={16} /> 确认本节
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="section-meta">
              <label>
                备注要求
                <input
                  value={activeNode.notes}
                  disabled={activeSection.locked}
                  onChange={(event) => patchNode(activeNode.id, { notes: event.target.value })}
                  placeholder="例如：重点看基金出资与合作基金可能性"
                />
              </label>
              <label>
                研究深度
                <select
                  className={`depth-input ${depthClass(activeNode.depth)}`}
                  value={activeNode.depth}
                  disabled={activeSection.locked}
                  onChange={(event) => patchNode(activeNode.id, { depth: event.target.value as AnalysisDepth })}
                >
                  {depthOptions.map((depth) => (
                    <option key={depth}>{depth}</option>
                  ))}
                </select>
              </label>
              <label className="word-toggle">
                进入 Word
                <input
                  type="checkbox"
                  checked={activeNode.includeInWord}
                  disabled={activeSection.locked}
                  onChange={(event) => patchNode(activeNode.id, { includeInWord: event.target.checked })}
                />
              </label>
              <label>
                置信度
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={activeSection.confidenceScore}
                  disabled={activeSection.locked}
                  onChange={(event) => saveSection(activeSection.id, { confidenceScore: Number(event.target.value) })}
                />
              </label>
            </div>

            <label className="textarea-label">
              置信度分析
              <textarea
                value={activeSection.confidenceReason}
                disabled={activeSection.locked}
                onChange={(event) => saveSection(activeSection.id, { confidenceReason: event.target.value })}
              />
            </label>

            <label className="textarea-label body-editor">
              章节正文
              <textarea
                value={activeSection.analysisText}
                disabled={activeSection.locked}
                onChange={(event) => saveSection(activeSection.id, { analysisText: event.target.value })}
                placeholder="模型生成后可在这里微调；也可以先手工输入再确认。"
              />
            </label>
          </>
        ) : (
          <div className="empty-state">
            <Archive />
            <p>请选择一个章节。</p>
          </div>
        )}
      </div>

      <CapitalPanel state={state} setActiveSectionId={setActiveSectionId} />
      <EvidencePanel section={activeSection} sources={state.sources} />
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

function CapitalPanel({ state, setActiveSectionId }: { state: AppState; setActiveSectionId: (id: string) => void }) {
  const capitalIds = new Set(["capital-cooperation", ...flatten(state.framework).filter((item) => item.parentId === "capital-cooperation").map((item) => item.node.id)]);
  const items = Object.values(state.sections).filter((section) => capitalIds.has(section.id));
  const citations = items.flatMap((section) => section.citations);
  return (
    <div className="panel capital-panel">
      <div className="panel-title">
        <span>资本合作分析工作区</span>
        <BarChart3 size={18} />
      </div>
      <div className="capital-list">
        {items.map((section) => (
          <button key={section.id} onClick={() => setActiveSectionId(section.id)}>
            <span>{section.title}</span>
            <strong>{section.confidenceScore ? `${section.confidenceScore}%` : "待生成"}</strong>
          </button>
        ))}
      </div>
      <div className="capital-facts">
        <h3>资本事实约束</h3>
        <p>融资金额、估值、主要投资者、基金出资与合作基金线索必须绑定来源；无法确认的信息只进入“待核实”。</p>
        <div className="source-count">{citations.length} 条资本相关引用</div>
      </div>
    </div>
  );
}

function EvidencePanel({ section, sources }: { section?: AnalysisSection; sources: Citation[] }) {
  return (
    <div className="panel evidence-panel">
      <div className="panel-title">
        <span>引用与缺口</span>
        <FileText size={18} />
      </div>
      <h3>本节引用</h3>
      {section?.citations.length ? (
        <div className="citation-list">
          {section.citations.map((cite) => (
            <div key={`${cite.id}-${cite.usedIn}`} className="citation">
              <strong>{cite.title}</strong>
              <span>{cite.sourceType} · {cite.publishedAt || "日期待补充"}</span>
              {cite.url && <a href={cite.url} target="_blank" rel="noreferrer">打开来源</a>}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-text">本节暂无引用。未绑定来源的资本信息不会进入确定性正文。</p>
      )}
      <h3>待核实问题</h3>
      {section?.missingInfo.length ? (
        <ul className="gap-list">
          {section.missingInfo.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      ) : (
        <p className="muted-text">暂无待核实事项。</p>
      )}
      <h3>全局来源池</h3>
      <div className="source-pool">
        {sources.map((source) => (
          <span key={source.id}>{source.title}</span>
        ))}
      </div>
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

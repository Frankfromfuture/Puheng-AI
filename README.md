# 清大浦恒 AI

清大浦恒 AI 是面向企业研究、投资判断、招商落地、资本合作与资源赋能的企业智能分析平台。

它不是一个单纯的报告生成器，而是一个面向企业事实、产业关系、资本事件、团队背景、区域资源和合作路径的智能分析工作台。平台将分散的公开资料、人工经验和业务判断组织成可编辑、可追溯、可推理、可输出的企业知识网络，并围绕“这家公司是谁、为什么重要、与我们有什么关系、能如何合作、风险在哪里”形成结构化判断。

清大浦恒 AI 的长期目标，是把企业分析从文本整理升级为知识驱动的决策系统：先建立企业与人物、机构、基金、区域、产业链、客户、供应商、政策和风险之间的关系，再基于这些关系生成面向投资、招商、资本合作和落地赋能的分析报告。

## 项目定位

- 企业智能分析平台：把公开信息、搜索结果、内部资源和人工判断沉淀为企业分析资产。
- 投资与招商决策工具：突出公司价值、市场地位、融资资本、股东资源、合作窗口和落地路径。
- 合作赋能工作台：将“我方强资源、重点区域、落地方式”与企业需求进行交叉分析。
- 企业知识网络雏形：逐步连接企业、人物、机构、基金、产业链、园区、政府平台和风险事件。
- 报告生产系统：支持章节级生成、完整报告生成、Markdown 预览、复制和 Word 导出。

## 核心能力

- 可编辑分析框架：支持一级、二级章节配置，新增章节可参与搜索、提示词和报告生成流程。
- 章节级智能生成：每个一级、二级章节都可以单独生成，也可以一键生成完整分析报告。
- 多渠道资料搜索：章节生成前自动扩展搜索词，整理公开来源，为模型推理提供数据底座。
- 投资与合作导向提示词：围绕投资判断、招商落地、资本合作、资源赋能进行交叉分析。
- Markdown 报告预览：支持加粗、段落留白、结论性表达和真实 Markdown 表格渲染。
- Word 报告导出：按大标题、一级标题、二级标题、正文和表格结构自动生成 Word 文件。
- 已生成内容复制：只复制真正有内容的章节，自动排除空章节或只有标题的章节。
- 模型联通检测：设置中的模型状态会真实测试接口联通情况，而不是只判断是否已填写配置。
- 移动端适配：通过侧边栏隐藏、面板切换和紧凑布局支持手机查看与操作。
- 扩展模块预留：已预留企业数据库、企业立体关联信息等未来入口。

## 默认分析框架

当前默认框架覆盖：

- 基础信息速览
- 工商信息
- 创始人与核心团队
- 股东结构
- 公告、年报与财务要点
- 企业资产情况
- 负面信息
- 市场地位分析
- 资本合作分析
- 融资进展
- 重要股东
- 产业基金进展
- 资本动态
- 合作点交叉指引
- 落地合作
- 企业风险分析
- 引用来源附录

框架可以在界面中继续编辑。后续新增章节会走统一的搜索、提示词和生成链路，便于把新的分析维度纳入同一套工作流。

## 搜索与数据源流程

章节生成前，后端会根据以下信息构造搜索词：

- 企业名称
- 章节标题
- 章节备注
- 已知章节类型
- 资本、工商、新闻、产业和落地相关定向信源

检索结果会经过去重、排序、摘要提取和来源整理，再作为模型推理的数据底座。模型被要求优先引用已列明来源 ID，对不确定事项标注“待核实”，禁止编造融资金额、估值、股东、客户、负面信息等事实。

## 报告风格

- 结论先行，先写判断，再写依据。
- 表达简洁、直接、有逻辑。
- 突出与投资、招商落地、合作赋能相关的交叉分析。
- 不能编造无来源事实。
- 适合结构化的信息尽量使用表格。
- 表格与关键文字判断穿插，不做全表格堆砌。
- 关键结论使用 Markdown 加粗。
- 段落之间保留空行，提高可读性。

## 版本路线图

### 0.8：本地工作台

- 完成企业智能分析平台基础界面。
- 完成分析框架、章节生成、完整报告生成、Markdown 预览和 Word 导出。
- 完成模型配置、模型联通检测、公开资料搜索增强和来源整理。
- 完成手机端响应式显示、侧边栏隐藏与面板切换。
- 补充 MIT License 与基础开源说明。

### 1.0：单机正式版

- 强化章节级搜索、引用来源、表格与文字混排、报告质量控制和导出模板。
- 支持更稳定的本地状态保存、企业报告版本管理、批量章节刷新和历史报告复用。
- 将投资判断、招商落地、资本合作、资源赋能的交叉分析进一步产品化。
- 完善提示词工作区，使用户新增章节后也能稳定获得有效内容。

### 2.0：云端访问版

- 部署到云服务器，支持公网或内网访问。
- 配置生产域名、HTTPS、反向代理、日志、备份和监控。
- 将模型 API、搜索接口、文件存储等配置迁移到服务端安全配置。
- 支持云端文件存储、报告导出记录、来源快照和基础运维面板。

### 3.0：多用户数据库版

- 接入数据库，持久化企业项目、分析框架、章节内容、来源、文件、报告版本和导出记录。
- 增加用户登录、组织空间、角色权限、项目权限、章节锁定、评论、审核确认和操作日志。
- 建设企业数据库模块，支持企业列表、筛选、标签、行业分类、区域分类、融资状态、合作阶段和跟进状态。
- 支持不同团队维护各自的资源池、区域库、提示词模板和报告模板。

### 4.0：企业知识库版

- 建立企业知识库，统一管理工商信息、融资事件、股东、团队、财务、客户、供应商、风险和合作记录。
- 支持资料上传、网页快照、搜索结果、人工标注、结构化字段沉淀和跨报告事实复用。
- 将企业知识库与分析报告连接，报告引用可追溯到知识库条目和来源证据。
- 支持同一企业多次分析、跨报告复用事实、自动发现信息变化。

### 5.0：企业立体关联分析版

- 建设企业立体关联信息系统，展示企业、创始人、高管、股东、投资机构、基金、客户、供应商、园区和政府平台之间的多层关系。
- 支持股权、投资、任职、校友、产业链、基金 LP/GP、合作关系、路径分析、关键节点识别和风险穿透。
- 建立企业语义知识模型，将自然语言资料抽取为结构化知识。
- 支持跨实体推理、共同关联方发现和基于知识结构的报告生成。

### 6.0+：智能工作流与自动监控

- 自动监控企业新闻、融资、工商变更、诉讼风险、招股书和公告更新。
- 对重要变化触发提醒、生成更新摘要或自动刷新相关章节。
- 支持定期企业跟踪报告、重点企业周报、招商项目看板和投资机会雷达。

## 本地开发

```bash
npm install
npm run dev
```

前端：

```text
http://localhost:5173/
```

后端：

```text
http://localhost:8787/
```

## 校验

```bash
npm run check
npm run build
```

## 配置

模型配置在应用内完成。当前支持：

- DashScope / OpenAI-compatible chat completion APIs
- Alibaba Cloud OpenSearch LLM text-generation endpoint

API Key 会保存在本地应用状态中，界面只显示脱敏信息。

## 项目结构

```text
src/              React 前端
server/           Express 后端与报告生成逻辑
data/             本地应用状态
uploads/          上传资料
exports/          导出的 Word 文件
public/           logo.svg 等静态资源
```

## 开源协议

本项目使用 MIT License。详见 [LICENSE](LICENSE)。

## 注意事项

当前项目仍以本地使用为主。生成报告需要人工审核，尤其是公开资料不完整、来源冲突或标记为“待核实”的内容。

---

# Puheng AI

Puheng AI is an enterprise intelligence platform for company research, investment assessment, landing cooperation, capital collaboration, and resource enablement.

It is not merely a report generator. It is an analytical workspace that organizes company facts, industry relationships, capital events, team backgrounds, regional resources, and cooperation paths into an editable, traceable, and reasoning-ready enterprise knowledge network. Around one company, the system helps answer: who it is, why it matters, how it relates to us, how we can work with it, and where the risks are.

The long-term vision of Puheng AI is to move enterprise analysis from text assembly to knowledge-driven decision support. The platform first connects companies with people, institutions, funds, regions, industrial chains, customers, suppliers, policies, and risk events, then generates reports for investment, landing, capital cooperation, and resource enablement.

## Positioning

- Enterprise intelligence platform: turns public information, search results, internal resources, and human judgment into reusable analysis assets.
- Investment and landing decision tool: highlights company value, market position, financing history, shareholder resources, cooperation windows, and landing paths.
- Cooperation enablement workspace: cross-analyzes Puheng's strong resources, target regions, and cooperation methods against company needs.
- Enterprise knowledge network foundation: gradually connects companies, people, institutions, funds, industrial chains, parks, government platforms, and risk events.
- Report production system: supports section-level generation, full-report generation, Markdown preview, copying, and Word export.

## Core Capabilities

- Editable analysis framework: supports configurable first-level and second-level sections. Newly added sections participate in search, prompting, and report generation.
- Section-level generation: each section can be generated independently, while full reports can be generated in one flow.
- Multi-source public search: expands search queries before generation and organizes sources for model reasoning.
- Investment and cooperation-oriented prompts: emphasizes investment assessment, landing cooperation, capital collaboration, and resource enablement.
- Markdown report preview: supports bold text, paragraph spacing, conclusion-first writing, and real Markdown table rendering.
- Word export: automatically exports titles, headings, body text, and tables into a Word document.
- Generated-content copying: copies only sections with real generated content and excludes empty or title-only sections.
- Model connection checks: the settings panel tests actual model connectivity rather than only checking whether fields are filled.
- Mobile optimization: supports sidebar collapse, panel switching, and compact layouts.
- Reserved expansion modules: includes placeholders for enterprise databases and relationship intelligence.

## Default Analysis Framework

The default framework covers:

- Basic enterprise overview
- Business registration
- Founder and core team
- Shareholding structure
- Filings, annual reports, and financial highlights
- Enterprise assets
- Negative information
- Market position analysis
- Capital cooperation analysis
- Financing progress
- Important shareholders
- Industrial fund progress
- Capital dynamics
- Cooperation-point cross guidance
- Landing cooperation
- Enterprise risk analysis
- Citation appendix

The framework can be edited in the UI. Newly added sections follow the same search, prompting, and generation workflow.

## Search And Source Workflow

Before section generation, the backend builds search queries from:

- Company name
- Section title
- Section notes
- Known section type
- Capital, registry, news, industry, and landing-related source domains

Search results are deduplicated, ranked, summarized, and injected into the model prompt as source material. The model is instructed to cite available source IDs, mark uncertain items as pending verification, and avoid unsupported claims such as financing amounts, valuations, shareholders, customers, or negative information.

## Report Style

- Conclusion first, followed by evidence.
- Concise, direct, and logical writing.
- Emphasize cross-analysis for investment, landing, cooperation, and resource enablement.
- No unsupported factual claims.
- Use tables whenever information is naturally structured.
- Interleave tables with key narrative judgments instead of table-only output.
- Highlight key conclusions with Markdown bold.
- Keep paragraph spacing for readability.

## Roadmap

### 0.8: Local Workspace

- Complete the core enterprise intelligence platform UI.
- Complete the analysis framework, section generation, full-report generation, Markdown preview, and Word export.
- Add model configuration, model connection checks, stronger public-source search, and source organization.
- Complete mobile-responsive display, sidebar collapse, and panel switching.
- Add MIT License and basic open-source information.

### 1.0: Single-User Stable Release

- Improve section-level search, citations, mixed table-and-narrative output, report quality control, and export templates.
- Support more reliable local state, report version management, batch section refresh, and historical report reuse.
- Productize cross-analysis for investment assessment, landing cooperation, capital cooperation, and resource enablement.
- Improve the prompt workspace so user-added sections can reliably generate useful content.

### 2.0: Cloud Access Release

- Deploy to cloud servers with public or private network access.
- Configure production domains, HTTPS, reverse proxy, logging, backups, and monitoring.
- Move model APIs, search integrations, and file storage configuration to secure server-side configuration.
- Support cloud file storage, export records, source snapshots, and a basic operations dashboard.

### 3.0: Multi-User Database Release

- Connect a database to persist projects, frameworks, sections, sources, files, report versions, and export records.
- Add login, workspaces, roles, project permissions, section locking, comments, review confirmation, and operation logs.
- Build an enterprise database module with company lists, filters, tags, industry/region categories, financing status, cooperation stage, and follow-up status.
- Allow different teams to maintain their own resource pools, regional libraries, prompt templates, and report templates.

### 4.0: Enterprise Knowledge Base Release

- Build an enterprise knowledge base for registry data, financing events, shareholders, teams, finance, customers, suppliers, risks, and cooperation records.
- Support uploads, web snapshots, search results, manual annotations, structured fields, and fact reuse across reports.
- Connect the knowledge base with analysis reports so citations trace back to knowledge entries and source evidence.
- Support repeated analysis of the same company, fact reuse across reports, and automatic change detection.

### 5.0: Enterprise Relationship Intelligence Release

- Build a relationship intelligence system mapping companies, founders, executives, shareholders, investors, funds, customers, suppliers, parks, and government platforms.
- Support equity, investment, employment, alumni, industrial-chain, fund LP/GP, cooperation relationships, path analysis, key-node detection, and risk penetration.
- Build an enterprise semantic knowledge model that extracts structured knowledge from natural-language materials.
- Support cross-entity reasoning, shared-party discovery, and knowledge-structured report generation.

### 6.0+: Intelligent Workflow And Monitoring

- Monitor company news, financing, registry changes, litigation risks, prospectuses, and announcements.
- Trigger alerts, generate update summaries, or refresh related report sections when important changes occur.
- Support periodic company tracking reports, weekly key-company updates, landing project dashboards, and investment opportunity radar.

## Local Development

```bash
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

Backend:

```text
http://localhost:8787/
```

## Validation

```bash
npm run check
npm run build
```

## Configuration

Model settings are configured inside the app. The current backend supports:

- DashScope / OpenAI-compatible chat completion APIs
- Alibaba Cloud OpenSearch LLM text-generation endpoint

API keys are stored in local app state and only masked previews are shown in the UI.

## Project Structure

```text
src/              React frontend
server/           Express backend and report generation logic
data/             Local app state
uploads/          Uploaded source materials
exports/          Generated Word files
public/           Static assets such as logo.svg
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Notes

This project is currently optimized for local use. Generated reports should be reviewed by humans, especially when public sources are incomplete, conflicting, or marked as pending verification.

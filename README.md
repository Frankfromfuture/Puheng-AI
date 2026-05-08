# Puheng AI / 清大浦恒 AI

## 中文简介

清大浦恒 AI 是面向企业研究、投资判断、招商落地、资本合作和资源赋能的企业智能分析平台。系统支持搭建可编辑的分析框架，自动检索公开资料，按章节生成分析内容，预览和修订报告，并导出 Word 分析报告。

平台服务于浦恒的企业评估与合作推进工作流，重点覆盖企业基础信息、创始人与核心团队、市场地位、资本合作、合作点交叉指引、落地合作和企业风险分析。系统目标不是生成泛泛的企业介绍，而是形成可用于投资、招商、资源对接和合作判断的结构化分析。

## English Overview

Puheng AI is an enterprise intelligence analysis platform for company research, investment assessment, investment-attraction landing, capital cooperation, and resource enablement. It helps users build editable report frameworks, search public information, generate section-level analysis, preview and refine reports, and export Word documents.

The platform is designed for Puheng's enterprise evaluation and cooperation workflow. It focuses on company fundamentals, founder and management teams, market position, capital cooperation, cooperation-point cross-analysis, landing cooperation, and enterprise risk analysis. Its goal is not generic company profiling, but actionable analysis for investment, landing, resource matching, and cooperation decisions.

## 核心功能 / Core Features

- 可编辑的企业分析框架，支持一级、二级章节配置。
- Editable enterprise analysis framework with first-level and second-level sections.

- 支持单章节生成与完整报告生成。
- Section-by-section generation and full-report generation.

- 章节生成前自动进行公开资料搜索，包括搜索词扩展、多渠道检索、来源排序和摘要提取。
- Automatic public-source search before section generation, including query expansion, multi-channel retrieval, source ranking, and source summaries.

- 提示词工程工作区，支持全局风格、章节提示词、深度要求和资源说明维护。
- Prompt engineering workspace for global style, section prompts, depth instructions, and resource notes.

- Markdown 分析报告预览，支持加粗、段落留白和真实表格渲染。
- Markdown report preview with bold text, readable paragraph spacing, and rendered tables.

- 每个一级、二级章节支持单独生成。
- Independent generation for each first-level and second-level section.

- 支持复制已生成内容，自动排除空章节或只有标题的章节。
- Copy generated content while excluding empty or title-only sections.

- 支持 Word 导出，包含大标题、副标题、章节标题、正文和 Markdown 表格转换。
- Word export with title, subtitle, headings, body text, and Markdown table conversion.

- 支持配置强资源赋能、重点落地区域和落地合作方式。
- Configurable strong resources, landing regions, and landing cooperation methods.

- 手机端支持菜单栏和面板切换，适配框架、合作点和报告预览。
- Mobile-responsive layout with menu and panel switching for framework, cooperation guide, and report preview.

- 已预留企业数据库与企业立体关联信息入口。
- Placeholder modules for enterprise database and enterprise relationship intelligence.

## 默认分析框架 / Default Analysis Framework

中文框架包括：

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

English framework coverage:

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

The framework can be edited in the UI. Newly added sections are supported by dynamic search-query generation and generic prompt handling, so custom chapters can participate in the same generation workflow.

## 搜索与数据源流程 / Search And Source Workflow

章节生成前，后端会根据以下信息构造搜索词：

- 企业名称
- 章节标题
- 章节备注
- 已知章节类型
- 资本、工商、新闻、产业和落地相关定向信源

Before section generation, the backend builds search queries from:

- Company name
- Section title
- Section notes
- Known section type
- Capital, registry, news, industry, and landing-related source domains

检索结果会经过去重、排序、摘要提取和来源整理，再作为模型推理的数据底座。模型被要求优先引用已列明来源 ID，对不确定事项标注“待核实”，禁止编造融资金额、估值、股东、客户、负面信息等事实。

Search results are deduplicated, ranked, summarized, and injected into the model prompt as source material. The model is instructed to cite available source IDs, mark uncertain items as pending verification, and avoid unsupported claims such as financing amounts, valuations, shareholders, customers, or negative information.

## 报告风格 / Report Style

中文报告风格：

- 结论先行，先写判断，再写依据。
- 表达简洁、直接、有逻辑。
- 不能编造无来源事实。
- 适合结构化的信息使用表格。
- 表格与关键文字判断穿插，不做全表格堆砌。
- 关键结论使用 Markdown 加粗。
- 段落之间保留空行，提高可读性。

English report style:

- Conclusion first, followed by evidence.
- Concise, direct, and logical writing.
- No unsupported factual claims.
- Use tables for structured information.
- Interleave tables with key narrative judgments instead of table-only output.
- Highlight key conclusions with Markdown bold.
- Keep paragraph spacing for readability.

## 路线图 / Roadmap

### 阶段 1：本地原型与单机工作台 / Phase 1: Local Prototype And Single-User Workspace

- 完成企业智能分析平台基础界面。
- Build the core enterprise intelligence analysis dashboard.

- 支持本地状态保存、章节生成、报告预览和 Word 导出。
- Support local state, section generation, report preview, and Word export.

- 优化提示词工程、公开资料搜索和章节级引用。
- Improve prompt engineering, public-source search, and section-level citations.

- 完成手机端响应式显示和面板切换。
- Complete mobile-responsive display and panel switching.

### 阶段 2：上云与服务器访问 / Phase 2: Cloud Deployment And Server Access

- 部署到云服务器，支持公网或内网访问。
- Deploy to a cloud server with public or private network access.

- 配置生产环境域名、HTTPS、反向代理和日志管理。
- Configure production domain, HTTPS, reverse proxy, and logging.

- 将模型 API、搜索接口、文件存储等配置从本地状态迁移到服务端安全配置。
- Move model APIs, search integrations, and file storage configuration from local state to secure server-side configuration.

- 建立服务器级备份、恢复和监控机制。
- Add server-level backup, recovery, and monitoring.

### 阶段 3：数据库化与持久化 / Phase 3: Database And Persistent Storage

- 接入数据库，持久化企业项目、分析框架、章节内容、来源、文件和导出记录。
- Connect a database to persist projects, frameworks, sections, sources, files, and export records.

- 支持企业历史版本、报告版本、章节版本和来源追踪。
- Support company history, report versions, section versions, and source lineage.

- 将上传文件、Word 报告、来源快照迁移到对象存储或云文件系统。
- Move uploaded files, Word reports, and source snapshots to object storage or cloud file systems.

- 建立数据备份、权限隔离和审计日志。
- Add backups, permission isolation, and audit logs.

### 阶段 4：多用户与组织协作 / Phase 4: Multi-User And Team Collaboration

- 增加用户登录、组织空间、角色权限和项目权限。
- Add user login, workspaces, roles, and project permissions.

- 支持多人协作编辑、章节锁定、评论、审核和确认流程。
- Support collaborative editing, section locking, comments, review, and confirmation workflows.

- 增加任务分配、生成记录、操作日志和报告审批。
- Add task assignment, generation records, operation logs, and report approval.

- 支持不同团队维护各自的资源池、区域库、提示词模板和报告模板。
- Allow teams to maintain their own resource pools, region libraries, prompt templates, and report templates.

### 阶段 5：企业知识库管理 / Phase 5: Enterprise Knowledge Base Management

- 建立企业知识库，统一管理工商信息、融资事件、股东、团队、财务、客户、供应商、风险和合作记录。
- Build an enterprise knowledge base for business registration, financing events, shareholders, teams, finance, customers, suppliers, risks, and cooperation records.

- 支持资料上传、网页快照、搜索结果、人工标注和结构化字段沉淀。
- Support uploads, web snapshots, search results, manual annotations, and structured fields.

- 将企业知识库与分析报告连接，报告引用可追溯到知识库条目。
- Connect the knowledge base with analysis reports so report citations trace back to knowledge entries.

- 支持同一企业多次分析、跨报告复用事实、自动发现信息变化。
- Support repeated analysis of the same company, fact reuse across reports, and automatic change detection.

### 阶段 6：企业数据库 / Phase 6: Enterprise Database

- 建设企业数据库模块，支持企业列表、筛选、标签、行业分类和区域分类。
- Build an enterprise database module with company lists, filters, tags, industry categories, and regional categories.

- 支持企业画像卡片、融资状态、合作阶段、招商阶段、风险等级和跟进状态。
- Support company profile cards, financing status, cooperation stage, landing stage, risk level, and follow-up status.

- 支持批量导入、批量更新、企业去重和企业别名管理。
- Support batch import, batch update, entity deduplication, and alias management.

- 与报告生成模块打通，从企业数据库直接发起分析报告。
- Connect the enterprise database to report generation.

### 阶段 7：企业立体关联信息系统 / Phase 7: Enterprise Relationship Intelligence System

- 建设企业立体关联信息模块，展示企业、创始人、高管、股东、投资机构、基金、客户、供应商、园区、政府平台之间的多层关系。
- Build a relationship intelligence module to map companies, founders, executives, shareholders, investors, funds, customers, suppliers, parks, and government platforms.

- 支持股权关系、投资关系、任职关系、校友关系、产业链关系、基金 LP/GP 关系和合作关系。
- Support equity, investment, employment, alumni, industrial-chain, fund LP/GP, and cooperation relationships.

- 提供关系图谱、路径分析、关键节点识别、共同关联方发现和风险穿透。
- Provide relationship graphs, path analysis, key node identification, shared-party discovery, and risk penetration.

- 与报告章节联动，让“股东结构、重要股东、产业基金、上下游企业、合作点”能够直接调用关系图谱结果。
- Connect relationship intelligence with report sections such as shareholding, important shareholders, industrial funds, upstream/downstream companies, and cooperation points.

### 阶段 8：本体论方向分析系统 / Phase 8: Ontology-Oriented Analysis System

- 建立企业分析本体，定义企业、人物、机构、基金、项目、区域、政策、资产、事件、风险、合作点等核心实体。
- Build an enterprise-analysis ontology covering companies, people, institutions, funds, projects, regions, policies, assets, events, risks, and cooperation points.

- 建立关系类型、事件类型、证据类型、置信度、时间有效性和来源可信度模型。
- Define relationship types, event types, evidence types, confidence, temporal validity, and source reliability models.

- 将自然语言资料抽取为结构化知识，并支持企业间横向比较和跨实体推理。
- Extract structured knowledge from natural-language materials and support cross-company comparison and cross-entity reasoning.

- 支持基于本体的分析报告生成，使报告逻辑从“文本生成”升级为“知识推理 + 报告生成”。
- Enable ontology-driven report generation, upgrading the logic from text generation to knowledge reasoning plus report generation.

### 阶段 9：智能工作流与自动监控 / Phase 9: Intelligent Workflow And Monitoring

- 自动监控企业新闻、融资、工商变更、诉讼风险、招股书和公告更新。
- Monitor company news, financing, registry changes, litigation risks, prospectuses, and announcements.

- 对重要变化触发提醒、生成更新摘要或自动刷新相关章节。
- Trigger alerts, generate update summaries, or refresh related report sections when important changes occur.

- 支持定期企业跟踪报告、重点企业周报、招商项目看板和投资机会雷达。
- Support periodic company tracking reports, weekly key-company updates, landing project dashboards, and investment opportunity radar.

## 本地开发 / Local Development

```bash
npm install
npm run dev
```

前端 / Frontend:

```text
http://localhost:5173/
```

后端 / Backend:

```text
http://localhost:8787/
```

## 校验 / Validation

```bash
npm run check
npm run build
```

## 配置 / Configuration

模型配置在应用内完成。当前支持：

- DashScope / OpenAI-compatible chat completion APIs
- Alibaba Cloud OpenSearch LLM text-generation endpoint

Model settings are configured inside the app. The current backend supports DashScope/OpenAI-compatible APIs and Alibaba Cloud OpenSearch LLM.

API Key 会保存在本地应用状态中，界面只显示脱敏信息。

API keys are stored in local app state and only masked previews are shown in the UI.

## 项目结构 / Project Structure

```text
src/              React frontend / React 前端
server/           Express backend and report generation logic / Express 后端与报告生成逻辑
data/             Local app state / 本地应用状态
uploads/          Uploaded source materials / 上传资料
exports/          Generated Word files / 导出的 Word 文件
public/           Static assets such as logo.svg / 静态资源
```

## 注意事项 / Notes

当前项目仍以本地使用为主。生成报告需要人工审核，尤其是公开资料不完整、来源冲突或标记为“待核实”的内容。

This project is currently optimized for local use. Generated reports should be reviewed by humans, especially when public sources are incomplete, conflicting, or marked as pending verification.

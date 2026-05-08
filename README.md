# Puheng AI

Puheng AI is an enterprise intelligence analysis platform for investment research, capital cooperation, investment-attraction landing, and resource enablement workflows. It helps users build a flexible analysis framework, collect public information, generate section-level Chinese research content, review sources, and export a Word report.

The product is designed for Puheng's enterprise evaluation workflow. It combines company fundamentals, market position, capital cooperation, landing feasibility, strong-resource matching, and risk analysis into one editable report workspace.

## Core Features

- Enterprise analysis dashboard with a configurable first-level and second-level report framework.
- Section-by-section generation and full-report generation.
- Automatic public-source search before section generation, including search-query expansion, multi-channel retrieval, source ranking, and source summaries.
- Prompt engineering workspace for global style rules, section prompts, depth instructions, and resource notes.
- Markdown report preview with bold text, readable paragraph spacing, and rendered Markdown tables.
- Per-section play buttons for generating individual chapters.
- Copy generated report content to clipboard, excluding empty or title-only sections.
- Word export with report title, subtitle, headings, body text, and Markdown table conversion.
- Configurable cooperation resources, landing regions, and landing methods.
- Mobile-responsive dashboard with panel switching for framework, cooperation guide, and report preview.
- Placeholder views for future enterprise database and enterprise relationship graph modules.

## Analysis Framework

The default framework includes:

- Basic enterprise information
- Founder and core team
- Shareholding and finance
- Market position
- Capital cooperation analysis
- Resource enablement and cooperation points
- Landing cooperation
- Enterprise risk analysis
- Citation appendix

The framework can be edited in the UI. New sections are supported by dynamic search-query generation and generic prompt handling, so added chapters can participate in the same generation workflow.

## Search And Source Workflow

Before generating a section, the backend builds targeted search queries from:

- Company name
- Section title
- Section notes
- Known section type
- Capital, registry, news, and landing-related source domains

Search results are collected from multiple public channels, deduplicated, ranked, optionally enriched with page snippets, and then injected into the section prompt as source material. The model is instructed to cite available source IDs, mark uncertain items as pending verification, and avoid unsupported claims.

## Report Style

Generated reports follow these principles:

- Clear conclusion first
- Direct and logical writing
- No unsupported facts, financing amounts, valuations, shareholders, customers, or negative information
- Tables for structured information when useful
- Text and tables interleaved, rather than table-only output
- Key conclusions highlighted with Markdown bold
- Paragraph spacing for readability

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

Model settings are configured inside the app. The backend supports:

- DashScope / OpenAI-compatible chat completion APIs
- Alibaba Cloud OpenSearch LLM text-generation endpoint

API keys are stored in local app state and are not shown in full in the UI.

## Project Structure

```text
src/              React frontend
server/           Express backend and report generation logic
data/             Local app state
uploads/          Uploaded source materials
exports/          Generated Word files
public/           Static assets such as logo.svg
```

## Notes

This project is optimized for local use. Generated reports should still be reviewed by a human, especially when public sources are incomplete, conflicting, or marked as pending verification.

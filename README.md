# Puheng AI

Puheng AI is a web-based investment research and cooperation analysis tool built for Puheng's enterprise evaluation workflow. It helps users upload company materials, configure a flexible report framework, and generate structured Chinese-language analysis with section-level confidence indicators and source citations.

The tool focuses on public company disclosures, annual reports, financial data, capital market news, financing history, valuation signals, major investors, business registry information, market position, competitive landscape, and potential cooperation opportunities. It also supports Puheng-specific resource matching, including Tsinghua-related enterprises, Shanghai SOEs, Shanghai medical systems, Shanghai Qingpu District, and Shenzhen Longhua District, with configurable landing scenarios such as investment attraction, leasing, land cooperation, and joint funds.

Each report section can be generated, reviewed, edited, confirmed, or excluded before final export. Confirmed sections are compiled into a Word report with a citation appendix. The system is designed to integrate with Qwen API through configurable settings while keeping API keys out of source code.

## Features

- Visual report framework editor with first-level and second-level sections.
- Qwen API configuration panel with empty API key by default.
- Section-by-section generation, editing, confirmation, and locking.
- Capital cooperation analysis workspace.
- Configurable strong resources, landing regions, landing methods, and external API sources.
- Word export from confirmed sections only, including confidence analysis and source appendix.

## Local Development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173/`

Backend: `http://localhost:8787/`

## Validation

```bash
npm run check
npm run build
```

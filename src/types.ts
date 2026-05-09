export type AnalysisDepth = "省略" | "简版" | "标准" | "深入";
export type ResearchRequirement =
  | "brief"
  | "fundamental"
  | "investment"
  | "landing"
  | "enablement"
  | "comprehensive";
export type SectionStatus =
  | "not_started"
  | "generating"
  | "needs_review"
  | "confirmed"
  | "insufficient";

export interface Citation {
  id: string;
  title: string;
  url?: string;
  sourceType: string;
  publishedAt?: string;
  usedIn: string;
}

export interface ReportNode {
  id: string;
  title: string;
  enabled: boolean;
  includeInWord: boolean;
  depth: AnalysisDepth;
  notes: string;
  status: SectionStatus;
  locked: boolean;
  children: ReportNode[];
}

export interface AnalysisSection {
  id: string;
  title: string;
  confidenceScore: number;
  confidenceReason: string;
  sourceCoverage: string;
  keyFindings: string[];
  analysisText: string;
  missingInfo: string[];
  citations: Citation[];
  status: SectionStatus;
  locked: boolean;
  updatedAt?: string;
}

export interface ExternalApiSetting {
  id: string;
  name: string;
  enabled: boolean;
  endpoint: string;
  notes: string;
}

export interface StrongResource {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  notes: string;
}

export interface LandingRegion {
  id: string;
  name: string;
  enabled: boolean;
  industries: string;
  resources: string;
  constraints: string;
  notes?: string;
}

export interface LandingMethod {
  id: string;
  name: string;
  enabled: boolean;
  notes: string;
}

export interface Settings {
  qwen: {
    apiKeyConfigured: boolean;
    apiKeyPreview?: string;
    provider: "dashscope" | "opensearch";
    baseUrl: string;
    responsesBaseUrl: string;
    openSearchHost: string;
    openSearchAppName: string;
    model: string;
    region: string;
  };
  externalApis: ExternalApiSetting[];
  strongResources: StrongResource[];
  landingRegions: LandingRegion[];
  landingMethods: LandingMethod[];
}

export interface UploadedFile {
  id: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  category: string;
}

export interface Project {
  id: string;
  companyName: string;
  researchRequirement: ResearchRequirement;
  stockCode: string;
  creditCode: string;
  industry: string;
  region: string;
  description: string;
}

export interface DepthInstructions {
  省略: string;
  简版: string;
  标准: string;
  深入: string;
}

export interface PromptEngineering {
  globalStyle: string;
  depthInstructions: DepthInstructions;
}

export interface ModelTokenUsage {
  input: number;
  output: number;
  total: number;
  requests: number;
  updatedAt?: string;
}

export interface AppState {
  project: Project;
  settings: Settings;
  framework: ReportNode[];
  sections: Record<string, AnalysisSection>;
  files: UploadedFile[];
  sources: Citation[];
  promptEngineering: PromptEngineering;
  meta?: Record<string, unknown> & {
    modelTokenUsage?: ModelTokenUsage;
  };
}

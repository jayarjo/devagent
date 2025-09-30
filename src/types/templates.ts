/**
 * TypeScript interfaces for template data structures
 */

// System prompt template data
export interface SystemPromptData {
  type: string;
  project: string;
}

// Issue context template data
export interface IssueContextData {
  issueNumber: string;
  issueTitle: string;
  issueBody: string;
  relevantFiles: string[];
  fromCache: boolean;
  cacheStatus: string;
}

// Combined prompt data (stable prefix + issue context)
export interface PromptData {
  system: SystemPromptData;
  issue: IssueContextData;
}

// GitHub PR template data
export interface PRTemplateData {
  issueNumber: string;
  title?: string;
  gitUserName: string;
  gitUserEmail: string;
}

// Error template data for providers
export interface ErrorTemplateData {
  provider: string;
  timeoutSeconds: number;
  command?: string;
  errorType?: string;
}

// Rate limit template data
export interface RateLimitTemplateData {
  provider: string;
  apiName: string;
}

// Template configuration
export interface TemplateConfig {
  templateDir: string;
  templates: {
    [key: string]: string;
  };
  defaultEncoding: string;
}

// Template render result
export interface TemplateRenderResult {
  content: string;
  templatePath: string;
  renderTime: number;
}
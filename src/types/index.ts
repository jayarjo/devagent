export interface RepositoryStructure {
  type: string;
  mainLanguage: string;
  directories: string[];
  configFiles: string[];
  relevantFiles: string[];
  fromCache: boolean;
}

export interface FileSummary {
  lineCount: number;
  functions: string[];
  lastModified: Date;
  purpose: string;
}

export interface RepositoryCacheData {
  repository: string;
  timestamp: number;
  structure?: RepositoryStructure;
  summaries?: Record<string, FileSummary>;
  patterns?: Record<string, string[]>;
}

export interface ClaudeResponse {
  messages?: Array<{
    role: string;
    content: string;
  }>;
  error?: {
    message: string;
    code?: string;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface AIResponse {
  messages?: Array<{
    role: string;
    content: string;
  }>;
  usage?: TokenUsage;
  error?: {
    message: string;
    code?: string;
  };
}

export enum AIProvider {
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  OPENAI = 'openai',
}

export interface ProviderConfig {
  provider: AIProvider;
  model?: string;
  apiKey?: string;
  timeout?: number;
  maxBufferSize?: number;
  allowedTools?: string;
}

export interface IAIProvider {
  validateCLI(): void;
  runPrompt(prompt: string, config?: ProviderConfig): Promise<AIResponse>;
  parseResponse(rawOutput: string): AIResponse;
  calculateCost(usage: TokenUsage): number;
  getProviderName(): AIProvider;
}

export interface GitHubPullRequest {
  number: number;
  html_url: string;
  head: {
    ref: string;
  };
}

export interface DevAgentConfig {
  issueNumber?: string;
  issueTitle?: string;
  issueBody?: string;
  repository: string;
  baseBranch: string;
  branchName?: string;
  logDir: string;
  gitUserName?: string;
  gitUserEmail?: string;
}

export interface EnvironmentVariables {
  GITHUB_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  ISSUE_NUMBER?: string;
  ISSUE_TITLE?: string;
  ISSUE_BODY?: string;
  REPOSITORY?: string;
  BASE_BRANCH?: string;
  GIT_USER_NAME?: string;
  GIT_USER_EMAIL?: string;
  CHANGED_FILES?: string;
}

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum DevAgentMode {
  FIX = 'fix',
  CACHE_UPDATE = 'cache-update',
}

export interface IssueKeywords {
  terms: string[];
  type: 'bug' | 'feature' | 'enhancement' | 'fix' | 'general';
}

export interface FileRelevanceScore {
  file: string;
  score: number;
  reasons: string[];
}

export interface SpawnError extends Error {
  code?: string;
  errno?: number;
}

export interface RepositoryContext {
  type: string;
  mainLanguage: string;
  directories: string[];
  configFiles: string[];
  relevantFiles: string[];
  fromCache: boolean;
}
export const CACHE_EXPIRY = {
  REPOSITORY_STRUCTURE: 30, // minutes
  FILE_SUMMARIES: 60 * 24 * 7, // 7 days in minutes
  ISSUE_PATTERNS: 60 * 24, // 1 day in minutes
} as const;

export const CLAUDE_CONFIG = {
  DEFAULT_ALLOWED_TOOLS: 'Bash,Read,Edit,Write,Glob,Grep',
  TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  MAX_BUFFER_SIZE: 20 * 1024 * 1024, // 20MB
  AUTH_CHECK_TIMEOUT_MS: 30 * 1000, // 30 seconds
} as const;

export const GIT_CONFIG = {
  DEFAULT_BASE_BRANCH: 'main',
  BRANCH_PREFIX: 'ai/issue-',
} as const;

export const FILE_RELEVANCE = {
  MAX_RELEVANT_FILES: 20,
  SCORES: {
    MENTIONED_IN_ISSUE: 100,
    KEYWORD_MATCH: 50,
    RELEVANT_EXTENSION: 25,
    RECENTLY_MODIFIED: 10,
    TEST_FILE_PENALTY: -20,
  },
  RECENCY_THRESHOLD_DAYS: 7,
} as const;

export const SKIP_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist\/|build\/|out\//,
  /\.test\.|\.spec\./,
  /test\/|tests\/|__tests__/,
  /\.md$|\.txt$/,
  /\.json$/, // Most JSON files except package.json
  /\.lock$|yarn\.lock|package-lock\.json/,
] as const;

export const INCLUDE_PATTERNS = [
  /\.(js|ts|jsx|tsx|py|go|java|cpp|c|php|rb)$/,
  /package\.json$/, // Exception for package.json
] as const;

export const REQUIRED_ENV_VARS = {
  FIX_MODE: ['GITHUB_TOKEN', 'ISSUE_NUMBER', 'REPOSITORY'], // AI provider keys validated separately
  CACHE_UPDATE_MODE: ['GITHUB_TOKEN', 'REPOSITORY'],
} as const;
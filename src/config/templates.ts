import * as path from 'path';
import { TemplateConfig } from '../types/templates';

/**
 * Template configuration and constants
 */
export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  templateDir: path.join(__dirname, '..', 'templates'),
  templates: {
    'system-prompt': 'prompts/system-prompt.mustache',
    'stable-prefix': 'prompts/stable-prefix.mustache',
    'issue-context': 'prompts/issue-context.mustache',
    'pr-body': 'github/pr-body.mustache',
    'pr-title': 'github/pr-title.mustache',
    'rate-limit': 'errors/rate-limit.mustache',
    'timeout': 'errors/timeout.mustache',
    'common-errors': 'errors/common-errors.mustache',
    'default-tools': 'config/default-tools.mustache'
  },
  defaultEncoding: 'utf8'
};

/**
 * Template name constants for type safety
 */
export const TEMPLATE_NAMES = {
  SYSTEM_PROMPT: 'system-prompt',
  STABLE_PREFIX: 'stable-prefix',
  ISSUE_CONTEXT: 'issue-context',
  PR_BODY: 'pr-body',
  PR_TITLE: 'pr-title',
  RATE_LIMIT: 'rate-limit',
  TIMEOUT: 'timeout',
  COMMON_ERRORS: 'common-errors',
  DEFAULT_TOOLS: 'default-tools'
} as const;

/**
 * Rate limit detection patterns for different providers
 */
export const RATE_LIMIT_PATTERNS = {
  CLAUDE: [
    'rate limit',
    'usage limit',
    'quota exceeded',
    'try again later',
    'too many requests'
  ],
  GEMINI: [
    'rate limit',
    'usage limit',
    'quota',
    'too many requests',
    '429'
  ],
  OPENAI: [
    'rate limit',
    'usage limit',
    'quota',
    'too many requests',
    '429'
  ]
};

/**
 * Error message patterns for detection
 */
export const ERROR_PATTERNS = {
  TIMEOUT: ['timeout', 'timed out'],
  RATE_LIMIT: ['rate limit', 'usage limit', 'quota exceeded'],
  AUTH_FAILURE: ['authentication', 'unauthorized', 'invalid key'],
  COMMAND_NOT_FOUND: ['command not found', 'not found'],
  SIGNAL_INTERRUPT: ['interrupted by signal', 'SIGTERM', 'SIGKILL']
};

/**
 * Provider-specific configuration
 */
export const PROVIDER_CONFIG = {
  CLAUDE: {
    name: 'Claude',
    timeoutSeconds: 300,
    rateLimitHint: 'Claude API has usage limits that may cause delays up to several hours.'
  },
  GEMINI: {
    name: 'Gemini',
    timeoutSeconds: 180,
    rateLimitHint: 'Gemini API has usage limits.'
  },
  OPENAI: {
    name: 'OpenAI',
    timeoutSeconds: 240,
    rateLimitHint: 'OpenAI API has usage limits.'
  }
};

/**
 * Load template configuration from environment or defaults
 */
export function loadTemplateConfig(): TemplateConfig {
  const customTemplateDir = process.env.DEVAGENT_TEMPLATE_DIR;

  if (customTemplateDir) {
    return {
      ...DEFAULT_TEMPLATE_CONFIG,
      templateDir: customTemplateDir
    };
  }

  return DEFAULT_TEMPLATE_CONFIG;
}
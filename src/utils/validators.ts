import { DevAgentMode, EnvironmentVariables, AIProvider } from '../types';
import { REQUIRED_ENV_VARS } from '../config/constants';

export class EnvironmentValidator {
  static validate(mode: DevAgentMode): void {
    const baseRequiredVars = mode === DevAgentMode.CACHE_UPDATE
      ? REQUIRED_ENV_VARS.CACHE_UPDATE_MODE
      : ['GITHUB_TOKEN', 'ISSUE_NUMBER', 'REPOSITORY']; // Updated for multi-provider

    const missing = baseRequiredVars.filter(env => !process.env[env]);

    if (missing.length > 0) {
      const modeText = mode === DevAgentMode.CACHE_UPDATE ? 'cache update' : 'fix mode';
      throw new Error(`Missing required environment variables for ${modeText}: ${missing.join(', ')}`);
    }

    // Validate AI provider availability in fix mode
    if (mode === DevAgentMode.FIX) {
      this.validateAIProvider();
    }

    // Validate repository format (required for both modes)
    const repository = process.env.REPOSITORY;
    if (repository && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
      throw new Error(`Invalid repository format: ${repository}`);
    }

    // Validate issue number only in fix mode
    if (mode === DevAgentMode.FIX) {
      const issueNumber = process.env.ISSUE_NUMBER;
      if (issueNumber && !/^\d+$/.test(issueNumber)) {
        throw new Error(`Invalid issue number: ${issueNumber}`);
      }
    }
  }

  private static validateAIProvider(): void {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    if (!hasAnthropicKey && !hasGoogleKey && !hasOpenAIKey) {
      throw new Error(
        'At least one AI provider API key is required: ANTHROPIC_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY'
      );
    }

    const envProvider = process.env.AI_PROVIDER?.toLowerCase();
    if (envProvider && !Object.values(AIProvider).includes(envProvider as AIProvider)) {
      throw new Error(
        `Invalid AI_PROVIDER: ${envProvider}. Valid options: ${Object.values(AIProvider).join(', ')}`
      );
    }

    // Validate that the specified provider has an API key
    if (envProvider) {
      const providerKeyMap = {
        [AIProvider.CLAUDE]: hasAnthropicKey,
        [AIProvider.GEMINI]: hasGoogleKey,
        [AIProvider.OPENAI]: hasOpenAIKey,
      };

      if (!providerKeyMap[envProvider as AIProvider]) {
        const keyNameMap = {
          [AIProvider.CLAUDE]: 'ANTHROPIC_API_KEY',
          [AIProvider.GEMINI]: 'GOOGLE_API_KEY',
          [AIProvider.OPENAI]: 'OPENAI_API_KEY',
        };
        throw new Error(
          `AI_PROVIDER is set to ${envProvider} but ${keyNameMap[envProvider as AIProvider]} is not provided`
        );
      }
    }
  }

  static getEnvironmentVariables(): EnvironmentVariables {
    return {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      AI_PROVIDER: process.env.AI_PROVIDER,
      AI_MODEL: process.env.AI_MODEL,
      ISSUE_NUMBER: process.env.ISSUE_NUMBER,
      ISSUE_TITLE: process.env.ISSUE_TITLE,
      ISSUE_BODY: process.env.ISSUE_BODY,
      REPOSITORY: process.env.REPOSITORY,
      BASE_BRANCH: process.env.BASE_BRANCH,
      GIT_USER_NAME: process.env.GIT_USER_NAME,
      GIT_USER_EMAIL: process.env.GIT_USER_EMAIL,
      CHANGED_FILES: process.env.CHANGED_FILES,
    };
  }
}
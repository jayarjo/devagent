import { DevAgentMode, EnvironmentVariables } from '../types';
import { REQUIRED_ENV_VARS } from '../config/constants';

export class EnvironmentValidator {
  static validate(mode: DevAgentMode): void {
    const requiredVars = mode === DevAgentMode.CACHE_UPDATE
      ? REQUIRED_ENV_VARS.CACHE_UPDATE_MODE
      : REQUIRED_ENV_VARS.FIX_MODE;

    const missing = requiredVars.filter(env => !process.env[env]);

    if (missing.length > 0) {
      const modeText = mode === DevAgentMode.CACHE_UPDATE ? 'cache update' : 'fix mode';
      throw new Error(`Missing required environment variables for ${modeText}: ${missing.join(', ')}`);
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

  static getEnvironmentVariables(): EnvironmentVariables {
    return {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
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
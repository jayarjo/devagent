import * as fs from 'fs';
import { DevAgentConfig, DevAgentMode, EnvironmentVariables, FileSummary, RepositoryContext } from '../types';
import { RepositoryCache } from './RepositoryCache';
import { RepositoryAnalyzer } from '../analyzers/RepositoryAnalyzer';
import { FileRelevanceAnalyzer } from '../analyzers/FileRelevance';
import { ClaudeService } from '../services/ClaudeService';
import { GitService } from '../services/GitService';
import { GitHubService } from '../services/GitHubService';
import { Logger } from '../utils/logger';
import { Sanitizers } from '../utils/sanitizers';
import { EnvironmentValidator } from '../utils/validators';
import { GIT_CONFIG } from '../config/constants';
import { CostTracker } from '../telemetry/costTracker';

export class DevAgent {
  private readonly config: DevAgentConfig;
  private readonly cache: RepositoryCache;
  private readonly analyzer: RepositoryAnalyzer;
  private readonly logger: Logger;
  private readonly isUpdateCacheMode: boolean;

  // Services (initialized conditionally based on mode)
  private claudeService?: ClaudeService;
  private gitService?: GitService;
  private githubService?: GitHubService;

  constructor(mode: DevAgentMode) {
    this.isUpdateCacheMode = mode === DevAgentMode.CACHE_UPDATE;
    this.logger = new Logger();

    // Validate environment variables
    EnvironmentValidator.validate(mode);

    const env = EnvironmentValidator.getEnvironmentVariables();

    // Build configuration
    this.config = this.buildConfig(env);

    // Initialize core components
    this.cache = new RepositoryCache(this.config.repository);
    this.analyzer = new RepositoryAnalyzer(this.config.repository);

    // Initialize services based on mode
    if (!this.isUpdateCacheMode) {
      this.initializeFixModeServices(env);
    }

    // Ensure log directory exists
    fs.mkdirSync(this.config.logDir, { recursive: true });
  }

  private buildConfig(env: EnvironmentVariables): DevAgentConfig {
    const repository = env.REPOSITORY!;
    const issueNumber = env.ISSUE_NUMBER;
    const issueTitle = env.ISSUE_TITLE ? Sanitizers.sanitizeTitle(env.ISSUE_TITLE) : undefined;

    return {
      repository,
      issueNumber,
      issueTitle,
      issueBody: env.ISSUE_BODY,
      baseBranch: env.BASE_BRANCH || GIT_CONFIG.DEFAULT_BASE_BRANCH,
      branchName: issueNumber ? Sanitizers.createSafeBranchName(issueNumber) : undefined,
      logDir: '/tmp/agent-logs',
      gitUserName: env.GIT_USER_NAME,
      gitUserEmail: env.GIT_USER_EMAIL,
    };
  }

  private initializeFixModeServices(env: EnvironmentVariables): void {
    if (!env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is required for fix mode');
    }

    this.claudeService = new ClaudeService(this.config.logDir);
    this.gitService = new GitService(this.config.logDir, this.config.gitUserName, this.config.gitUserEmail);
    this.githubService = new GitHubService(
      env.GITHUB_TOKEN,
      this.config.repository,
      this.config.gitUserName,
      this.config.gitUserEmail
    );
  }

  async run(): Promise<void> {
    const startTime = Date.now();
    const mode = this.isUpdateCacheMode ? 'cache-update' : 'fix';

    try {
      if (this.isUpdateCacheMode) {
        await this.runCacheUpdateMode();
      } else {
        await this.runFixMode();
      }

      const durationMs = Date.now() - startTime;
      CostTracker.recordExecution(mode, durationMs, true, {
        repository: this.config.repository,
        issueNumber: this.config.issueNumber,
        mode: mode,
      });

      this.logger.info(`DevAgent ${mode} completed successfully in ${durationMs}ms`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      CostTracker.recordError(`devagent_${mode}`, {
        repository: this.config.repository,
        mode: mode,
      });

      CostTracker.recordExecution(mode, durationMs, false, {
        repository: this.config.repository,
        issueNumber: this.config.issueNumber,
        mode: mode,
      });

      this.logger.error(`DevAgent ${mode} failed after ${durationMs}ms: ${errorMessage}`);
      throw error;
    }
  }

  private async runFixMode(): Promise<void> {
    try {
      this.logger.info('Starting DevAgent execution');
      this.logger.info(`Issue: #${this.config.issueNumber} - ${this.config.issueTitle}`);
      this.logger.info(`Repository: ${this.config.repository}`);
      this.logger.info(`Base branch: ${this.config.baseBranch}`);

      if (!this.config.issueNumber || !this.config.branchName) {
        throw new Error('Issue number and branch name are required for fix mode');
      }

      // Create working branch
      await this.gitService!.createBranch(this.config.branchName);

      // Prepare context for Claude
      this.logger.info('Gathering repository context...');
      const context = this.analyzer.getRepositoryContext(this.config.issueTitle, this.config.issueBody);
      this.logger.info(`Context: ${context.type} repository with ${context.relevantFiles.length} relevant files`);

      // Record cache hit/miss for repository analysis
      CostTracker.recordCacheHit('repository_context', context.fromCache || false, {
        repository: this.config.repository,
        mode: 'fix',
      });

      // Build prompt for Claude
      const prompt = this.buildOptimizedPrompt(context);
      this.logger.info(`Prompt length: ${prompt.length} characters`);

      // Run Claude to fix the issue
      const result = await this.claudeService!.runClaude(prompt);
      this.logger.info(`Claude completed with ${result.messages?.length || 0} messages`);

      // Check if any changes were made
      this.logger.info('Checking for file changes...');
      if (this.gitService!.checkForChanges()) {
        this.logger.info('Changes detected, creating PR');
        await this.gitService!.commitAndPush(this.config.branchName, this.config.issueTitle || '', this.config.issueNumber);
        const pr = await this.githubService!.createPR(
          this.config.issueTitle || '',
          this.config.branchName,
          this.config.baseBranch,
          this.config.issueNumber
        );
        this.logger.info(`Successfully created PR: ${pr.html_url}`);
      } else {
        this.logger.warn('No changes were made by the agent');
      }
    } catch (error) {
      this.logger.error(`DevAgent execution failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async runCacheUpdateMode(): Promise<void> {
    try {
      this.logger.info('Running in cache update mode');

      // Read changed files from environment
      let changedFiles: string[] = [];
      const changedFilesPath = process.env.CHANGED_FILES;
      if (changedFilesPath && fs.existsSync(changedFilesPath)) {
        const fileList = fs.readFileSync(changedFilesPath, 'utf8');
        changedFiles = fileList.split('\n').filter(f => f.trim());
      }

      this.logger.info(`Processing ${changedFiles.length} changed files`);

      // Update file summaries for changed files only
      let updatedFiles = 0;
      for (const file of changedFiles) {
        if (FileRelevanceAnalyzer.isRelevantFileForCache(file)) {
          await this.updateFileSummary(file);
          updatedFiles++;
        }
      }

      // Update repository structure if config files changed
      const structuralChanges = changedFiles.some(f =>
        f.includes('package.json') ||
        f.includes('.config.') ||
        f.includes('tsconfig.json') ||
        f.includes('webpack.config') ||
        f.includes('next.config')
      );

      if (structuralChanges) {
        this.logger.info('Structural changes detected, updating repository structure');
        const context = this.analyzer.getRepositoryContext();
        this.cache.saveRepositoryStructure(context);
      }

      this.logger.info(`Cache update completed. Updated ${updatedFiles} file summaries`);
    } catch (error) {
      this.logger.error(`Cache update failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async updateFileSummary(file: string): Promise<void> {
    try {
      if (!fs.existsSync(file)) {
        this.logger.info(`File ${file} no longer exists, removing from cache`);
        this.cache.removeFileSummary(file);
        return;
      }

      this.logger.info(`Updating summary for ${file}`);
      const content = fs.readFileSync(file, 'utf8');

      const lines = content.split('\n');
      const summary: FileSummary = {
        lineCount: lines.length,
        functions: this.extractFunctions(content),
        lastModified: fs.statSync(file).mtime,
        purpose: this.inferFilePurpose(file, content),
      };

      this.cache.saveFileSummary(file, summary);
    } catch (error) {
      this.logger.warn(`Failed to update summary for ${file}: ${(error as Error).message}`);
    }
  }

  private extractFunctions(content: string): string[] {
    // Simple function extraction
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=|class\s+(\w+))/g;
    const functions: string[] = [];
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      functions.push(match[1] || match[2] || match[3]);
    }

    return functions.slice(0, 10); // Limit to avoid bloat
  }

  private inferFilePurpose(file: string, content: string): string {
    const fileName = file.split('/').pop() || '';

    if (fileName.includes('test') || fileName.includes('spec')) return 'Testing';
    if (fileName.includes('config')) return 'Configuration';
    if (file.includes('api/') || file.includes('routes/')) return 'API/Routes';
    if (file.includes('component') || fileName.includes('Component')) return 'UI Component';
    if (file.includes('util') || file.includes('helper')) return 'Utility';
    if (content.includes('export default') && content.includes('React')) return 'React Component';
    if (content.includes('app.use') || content.includes('express')) return 'Server/Express';

    return 'Source Code';
  }

  private buildOptimizedPrompt(context: RepositoryContext): string {
    // Build a stable prefix for Claude API caching
    const stablePrefix = `You are DevAgent, an AI assistant that fixes GitHub issues.

REPOSITORY INFO:
Type: ${context.type}
Project: ${this.config.repository}

INSTRUCTIONS:
- Make minimal, targeted changes
- Follow existing code patterns
- Focus on the specific issue described
- Avoid unnecessary modifications

`;

    // Variable issue context (not cached)
    const issueContext = `CURRENT ISSUE:
Number: #${this.config.issueNumber}
Title: ${this.config.issueTitle}
Description:
${this.config.issueBody}

RELEVANT FILES:
${context.relevantFiles.join('\n')}

${context.fromCache ? '(Using cached repository analysis)' : '(Fresh repository analysis)'}

TASK: Analyze the issue and implement the necessary fix. Start by exploring the most relevant files to understand the current implementation.`;

    return stablePrefix + issueContext;
  }
}
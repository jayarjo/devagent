import * as fs from 'fs';
import * as path from 'path';
import mustache from 'mustache';
import {
  TemplateConfig,
  TemplateRenderResult,
  SystemPromptData,
  IssueContextData,
  PRTemplateData,
  ErrorTemplateData,
  RateLimitTemplateData
} from '../types/templates';

/**
 * TemplateManager handles loading and rendering of mustache templates
 * Provides caching for performance and centralized template management
 */
export class TemplateManager {
  private templateCache: Map<string, string> = new Map();
  private config: TemplateConfig;

  constructor(config?: Partial<TemplateConfig>) {
    this.config = {
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
      defaultEncoding: 'utf8',
      ...config
    };
  }

  /**
   * Load a template from file system with caching
   */
  private loadTemplate(templateName: string): string {
    if (this.templateCache.has(templateName)) {
      const cached = this.templateCache.get(templateName);
      if (cached) return cached;
    }

    const templatePath = this.config.templates[templateName];
    if (!templatePath) {
      throw new Error(`Template '${templateName}' not found in configuration`);
    }

    const fullPath = path.join(this.config.templateDir, templatePath);

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      this.templateCache.set(templateName, content);
      return content;
    } catch (error) {
      throw new Error(`Failed to load template '${templateName}' from '${fullPath}': ${error}`);
    }
  }

  /**
   * Render a template with provided data
   */
  public renderTemplate(templateName: string, data: unknown): TemplateRenderResult {
    const startTime = Date.now();

    try {
      const template = this.loadTemplate(templateName);
      // Disable HTML escaping since we're generating plain text, not HTML
      const content = mustache.render(template, data, {}, {
        escape: (text: string) => text
      });
      const renderTime = Date.now() - startTime;

      return {
        content,
        templatePath: this.config.templates[templateName],
        renderTime
      };
    } catch (error) {
      throw new Error(`Failed to render template '${templateName}': ${error}`);
    }
  }

  /**
   * Render system prompt with repository and instruction data
   */
  public renderSystemPrompt(data: SystemPromptData): string {
    const result = this.renderTemplate('stable-prefix', data);
    return result.content;
  }

  /**
   * Render issue context with dynamic issue data
   */
  public renderIssueContext(data: IssueContextData): string {
    const contextData = {
      ...data,
      relevantFilesText: data.relevantFiles.join('\n'),
      cacheStatus: data.fromCache ? '(Using cached repository analysis)' : '(Fresh repository analysis)'
    };

    const result = this.renderTemplate('issue-context', contextData);
    return result.content;
  }

  /**
   * Render complete optimized prompt (stable prefix + issue context)
   */
  public renderOptimizedPrompt(systemData: SystemPromptData, issueData: IssueContextData): string {
    const systemPrompt = this.renderSystemPrompt(systemData);
    const issueContext = this.renderIssueContext(issueData);
    return systemPrompt + issueContext;
  }

  /**
   * Render GitHub PR body template
   */
  public renderPRBody(data: PRTemplateData): string {
    const result = this.renderTemplate('pr-body', data);
    return result.content;
  }

  /**
   * Render GitHub PR title template
   */
  public renderPRTitle(data: PRTemplateData): string {
    const result = this.renderTemplate('pr-title', data);
    return result.content;
  }

  /**
   * Render rate limit error message
   */
  public renderRateLimitError(data: RateLimitTemplateData): string {
    const result = this.renderTemplate('rate-limit', data);
    return result.content;
  }

  /**
   * Render timeout error message
   */
  public renderTimeoutError(data: ErrorTemplateData): string {
    const result = this.renderTemplate('timeout', data);
    return result.content;
  }

  /**
   * Render common error message
   */
  public renderCommonError(data: ErrorTemplateData): string {
    const result = this.renderTemplate('common-errors', data);
    return result.content;
  }

  /**
   * Clear template cache (useful for development/testing)
   */
  public clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get current cache size for monitoring
   */
  public getCacheSize(): number {
    return this.templateCache.size;
  }

  /**
   * Check if template exists
   */
  public hasTemplate(templateName: string): boolean {
    return templateName in this.config.templates;
  }

  /**
   * List all available templates
   */
  public getAvailableTemplates(): string[] {
    return Object.keys(this.config.templates);
  }
}
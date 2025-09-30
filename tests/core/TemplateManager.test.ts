import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateManager } from '../../src/core/TemplateManager';
import { SystemPromptData, IssueContextData, PRTemplateData, ErrorTemplateData, RateLimitTemplateData } from '../../src/types/templates';

describe('TemplateManager', () => {
  let templateManager: TemplateManager;
  let testTempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test templates
    testTempDir = '/tmp/devagent-test-templates';
    fs.mkdirSync(testTempDir, { recursive: true });
    fs.mkdirSync(path.join(testTempDir, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(testTempDir, 'github'), { recursive: true });
    fs.mkdirSync(path.join(testTempDir, 'errors'), { recursive: true });

    // Create test templates
    fs.writeFileSync(
      path.join(testTempDir, 'prompts', 'stable-prefix.mustache'),
      'You are DevAgent, an AI assistant that fixes GitHub issues.\n\nREPOSITORY INFO:\nType: {{type}}\nProject: {{project}}\n\nINSTRUCTIONS:\n- Make minimal, targeted changes\n- Follow existing code patterns\n- Focus on the specific issue described\n- Avoid unnecessary modifications\n'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'prompts', 'issue-context.mustache'),
      'CURRENT ISSUE:\nNumber: #{{issueNumber}}\nTitle: {{issueTitle}}\nDescription:\n{{issueBody}}\n\nRELEVANT FILES:\n{{relevantFilesText}}\n\n{{cacheStatus}}\n\nTASK: Analyze the issue and implement the necessary fix. Start by exploring the most relevant files to understand the current implementation.'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'github', 'pr-body.mustache'),
      '## Summary\nThis PR addresses the issue described in #{{issueNumber}}.\n\n## Changes Made\nThe AI agent analyzed the issue and implemented the following changes:\n- Analyzed the codebase and issue requirements\n- Generated appropriate fixes based on the issue description\n- Applied changes while maintaining code quality and conventions\n\n## Issue Reference\nFixes #{{issueNumber}}\n\n---\n🤖 Generated with [DevAgent](https://github.com/jayarjo/devagent)\n\nCo-Authored-By: {{gitUserName}} <{{gitUserEmail}}>'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'github', 'pr-title.mustache'),
      '[AI Fix] {{#title}}{{title}}{{/title}}{{^title}}Issue #{{issueNumber}}{{/title}}'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'errors', 'rate-limit.mustache'),
      '⚠️  This appears to be a rate limiting issue. {{provider}} API has usage limits that may cause delays up to several hours.'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'errors', 'timeout.mustache'),
      '{{provider}} CLI timed out after {{timeoutSeconds}}s. This could be due to:\n- Rate limiting ({{provider}} API usage limits reached)\n- Network issues\n- Large prompt processing\nConsider trying again later or checking your API usage limits.'
    );

    fs.writeFileSync(
      path.join(testTempDir, 'errors', 'common-errors.mustache'),
      ' (common causes: authentication failure, rate limits, invalid prompt, or permission issues)'
    );

    // Initialize TemplateManager with test configuration
    templateManager = new TemplateManager({
      templateDir: testTempDir,
      templates: {
        'stable-prefix': 'prompts/stable-prefix.mustache',
        'issue-context': 'prompts/issue-context.mustache',
        'pr-body': 'github/pr-body.mustache',
        'pr-title': 'github/pr-title.mustache',
        'rate-limit': 'errors/rate-limit.mustache',
        'timeout': 'errors/timeout.mustache',
        'common-errors': 'errors/common-errors.mustache'
      },
      defaultEncoding: 'utf8'
    });
  });

  afterEach(() => {
    // Clean up test templates
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  describe('Template Loading and Caching', () => {
    it('should load and cache templates correctly', () => {
      const systemData: SystemPromptData = {
        type: 'TypeScript',
        project: 'test/repo'
      };

      // First render should load from file
      const result1 = templateManager.renderSystemPrompt(systemData);
      expect(result1).toContain('You are DevAgent');
      expect(result1).toContain('Type: TypeScript');
      expect(result1).toContain('Project: test/repo');

      // Second render should use cache
      const result2 = templateManager.renderSystemPrompt(systemData);
      expect(result1).toBe(result2);

      // Verify cache size
      expect(templateManager.getCacheSize()).toBeGreaterThan(0);
    });

    it('should clear cache when requested', () => {
      const systemData: SystemPromptData = {
        type: 'TypeScript',
        project: 'test/repo'
      };

      templateManager.renderSystemPrompt(systemData);
      expect(templateManager.getCacheSize()).toBeGreaterThan(0);

      templateManager.clearCache();
      expect(templateManager.getCacheSize()).toBe(0);
    });
  });

  describe('System Prompt Rendering', () => {
    it('should render system prompt with correct data', () => {
      const systemData: SystemPromptData = {
        type: 'JavaScript',
        project: 'owner/repository'
      };

      const result = templateManager.renderSystemPrompt(systemData);

      expect(result).toContain('You are DevAgent, an AI assistant that fixes GitHub issues.');
      expect(result).toContain('Type: JavaScript');
      expect(result).toContain('Project: owner/repository');
      expect(result).toContain('Make minimal, targeted changes');
    });
  });

  describe('Issue Context Rendering', () => {
    it('should render issue context with all data', () => {
      const issueData: IssueContextData = {
        issueNumber: '123',
        issueTitle: 'Fix authentication bug',
        issueBody: 'Users cannot log in with valid credentials',
        relevantFiles: ['src/auth.ts', 'src/login.ts'],
        fromCache: true,
        cacheStatus: '(Using cached repository analysis)'
      };

      const result = templateManager.renderIssueContext(issueData);

      expect(result).toContain('Number: #123');
      expect(result).toContain('Title: Fix authentication bug');
      expect(result).toContain('Users cannot log in with valid credentials');
      expect(result).toContain('src/auth.ts\nsrc/login.ts');
      expect(result).toContain('(Using cached repository analysis)');
      expect(result).toContain('TASK: Analyze the issue');
    });

    it('should handle cache status correctly', () => {
      const issueData: IssueContextData = {
        issueNumber: '456',
        issueTitle: 'Test issue',
        issueBody: 'Test description',
        relevantFiles: ['test.ts'],
        fromCache: false,
        cacheStatus: '(Fresh repository analysis)'
      };

      const result = templateManager.renderIssueContext(issueData);
      expect(result).toContain('(Fresh repository analysis)');
    });
  });

  describe('Optimized Prompt Rendering', () => {
    it('should combine system prompt and issue context', () => {
      const systemData: SystemPromptData = {
        type: 'TypeScript',
        project: 'test/repo'
      };

      const issueData: IssueContextData = {
        issueNumber: '789',
        issueTitle: 'Add new feature',
        issueBody: 'Need to implement user dashboard',
        relevantFiles: ['src/dashboard.ts'],
        fromCache: false,
        cacheStatus: '(Fresh repository analysis)'
      };

      const result = templateManager.renderOptimizedPrompt(systemData, issueData);

      // Should contain both system and issue sections
      expect(result).toContain('You are DevAgent');
      expect(result).toContain('Type: TypeScript');
      expect(result).toContain('Number: #789');
      expect(result).toContain('Add new feature');
      expect(result).toContain('src/dashboard.ts');
    });
  });

  describe('GitHub PR Template Rendering', () => {
    it('should render PR body correctly', () => {
      const prData: PRTemplateData = {
        issueNumber: '42',
        title: 'Fix critical bug',
        gitUserName: 'TestUser',
        gitUserEmail: 'test@example.com'
      };

      const result = templateManager.renderPRBody(prData);

      expect(result).toContain('## Summary');
      expect(result).toContain('This PR addresses the issue described in #42');
      expect(result).toContain('Fixes #42');
      expect(result).toContain('🤖 Generated with [DevAgent]');
      expect(result).toContain('Co-Authored-By: TestUser <test@example.com>');
    });

    it('should render PR title with custom title', () => {
      const prData: PRTemplateData = {
        issueNumber: '100',
        title: 'Custom PR Title',
        gitUserName: 'TestUser',
        gitUserEmail: 'test@example.com'
      };

      const result = templateManager.renderPRTitle(prData);
      expect(result).toBe('[AI Fix] Custom PR Title');
    });

    it('should render PR title without custom title', () => {
      const prData: PRTemplateData = {
        issueNumber: '100',
        gitUserName: 'TestUser',
        gitUserEmail: 'test@example.com'
      };

      const result = templateManager.renderPRTitle(prData);
      expect(result).toBe('[AI Fix] Issue #100');
    });
  });

  describe('Error Template Rendering', () => {
    it('should render rate limit error', () => {
      const rateLimitData: RateLimitTemplateData = {
        provider: 'Claude',
        apiName: 'Claude'
      };

      const result = templateManager.renderRateLimitError(rateLimitData);
      expect(result).toContain('⚠️  This appears to be a rate limiting issue');
      expect(result).toContain('Claude API has usage limits');
    });

    it('should render timeout error', () => {
      const timeoutData: ErrorTemplateData = {
        provider: 'Gemini',
        timeoutSeconds: 180
      };

      const result = templateManager.renderTimeoutError(timeoutData);
      expect(result).toContain('Gemini CLI timed out after 180s');
      expect(result).toContain('Rate limiting (Gemini API usage limits reached)');
      expect(result).toContain('Consider trying again later');
    });

    it('should render common error', () => {
      const errorData: ErrorTemplateData = {
        provider: 'OpenAI',
        timeoutSeconds: 240
      };

      const result = templateManager.renderCommonError(errorData);
      expect(result).toContain('common causes: authentication failure, rate limits');
    });
  });

  describe('Template Management', () => {
    it('should check if template exists', () => {
      expect(templateManager.hasTemplate('stable-prefix')).toBe(true);
      expect(templateManager.hasTemplate('pr-body')).toBe(true);
      expect(templateManager.hasTemplate('nonexistent')).toBe(false);
    });

    it('should list available templates', () => {
      const templates = templateManager.getAvailableTemplates();
      expect(templates).toContain('stable-prefix');
      expect(templates).toContain('issue-context');
      expect(templates).toContain('pr-body');
      expect(templates).toContain('pr-title');
      expect(templates).toContain('rate-limit');
      expect(templates).toContain('timeout');
      expect(templates).toContain('common-errors');
    });

    it('should throw error for missing template', () => {
      expect(() => {
        templateManager.renderTemplate('nonexistent', {});
      }).toThrow('Template \'nonexistent\' not found in configuration');
    });

    it('should throw error for missing template file', () => {
      const badTemplateManager = new TemplateManager({
        templateDir: testTempDir,
        templates: {
          'missing': 'nonexistent/template.mustache'
        },
        defaultEncoding: 'utf8'
      });

      expect(() => {
        badTemplateManager.renderTemplate('missing', {});
      }).toThrow('Failed to load template \'missing\'');
    });
  });

  describe('Performance and Metrics', () => {
    it('should track render time', () => {
      const systemData: SystemPromptData = {
        type: 'TypeScript',
        project: 'test/repo'
      };

      const result = templateManager.renderTemplate('stable-prefix', systemData);
      expect(result.renderTime).toBeGreaterThanOrEqual(0);
      expect(result.templatePath).toBe('prompts/stable-prefix.mustache');
      expect(result.content).toContain('You are DevAgent');
    });
  });
});
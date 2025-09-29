#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const { execSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class RepositoryCache {
  constructor(repository) {
    this.repository = repository;
    this.cacheDir = '/tmp/devagent-cache';
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  getCacheFile(name) {
    return path.join(this.cacheDir, `${name}.json`);
  }

  isExpired(filePath, maxAgeMinutes = 30) {
    if (!fs.existsSync(filePath)) return true;

    const stat = fs.statSync(filePath);
    const ageMinutes = (Date.now() - stat.mtime) / 1000 / 60;
    return ageMinutes > maxAgeMinutes;
  }

  getRepositoryStructure() {
    const cacheFile = this.getCacheFile('repo-structure');

    if (!this.isExpired(cacheFile, 30)) {
      try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch (error) {
        console.log(`Cache read error: ${error.message}`);
      }
    }

    return null;
  }

  saveRepositoryStructure(structure) {
    const cacheFile = this.getCacheFile('repo-structure');
    const cacheData = {
      repository: this.repository,
      timestamp: Date.now(),
      structure
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.log(`Cache write error: ${error.message}`);
    }
  }

  getFileSummaries() {
    const cacheFile = this.getCacheFile('file-summaries');

    if (!this.isExpired(cacheFile, 60 * 24 * 7)) { // 7 days
      try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch (error) {
        console.log(`Summaries cache read error: ${error.message}`);
      }
    }

    return {};
  }

  saveFileSummaries(summaries) {
    const cacheFile = this.getCacheFile('file-summaries');
    const existing = this.getFileSummaries();
    const merged = { ...existing, ...summaries };

    const cacheData = {
      repository: this.repository,
      timestamp: Date.now(),
      summaries: merged
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.log(`Summaries cache write error: ${error.message}`);
    }
  }

  getIssuePatterns() {
    const cacheFile = this.getCacheFile('issue-patterns');

    if (!this.isExpired(cacheFile, 60 * 24)) { // 1 day
      try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch (error) {
        console.log(`Patterns cache read error: ${error.message}`);
      }
    }

    return {};
  }

  saveFileSummary(filePath, summary) {
    const summaries = this.getFileSummaries();
    summaries.summaries = summaries.summaries || {};
    summaries.summaries[filePath] = summary;
    this.saveFileSummaries(summaries.summaries);
  }

  removeFileSummary(filePath) {
    const summaries = this.getFileSummaries();
    if (summaries.summaries && summaries.summaries[filePath]) {
      delete summaries.summaries[filePath];
      this.saveFileSummaries(summaries.summaries);
    }
  }

  saveIssuePattern(issueType, relevantFiles) {
    const cacheFile = this.getCacheFile('issue-patterns');
    const existing = this.getIssuePatterns();

    if (!existing.patterns) existing.patterns = {};
    existing.patterns[issueType] = relevantFiles;
    existing.timestamp = Date.now();

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(existing, null, 2), 'utf8');
    } catch (error) {
      console.log(`Patterns cache write error: ${error.message}`);
    }
  }
}

class DevAgent {
  constructor() {
    // Check if we're in cache update mode
    const args = process.argv.slice(2);
    this.isUpdateCacheMode = args.includes('--update-cache-mode');

    // Validate required environment variables
    this.validateEnvironment();

    // Always initialize these
    this.repository = process.env.REPOSITORY;
    this.logDir = '/tmp/agent-logs';
    this.cache = new RepositoryCache(this.repository);

    if (!this.isUpdateCacheMode) {
      // Only initialize these for fix mode
      this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      this.issueNumber = process.env.ISSUE_NUMBER;
      this.issueTitle = this.sanitizeTitle(process.env.ISSUE_TITLE || '');
      this.issueBody = process.env.ISSUE_BODY || '';
      this.baseBranch = process.env.BASE_BRANCH || 'main';
      this.branchName = this.createSafeBranchName(this.issueNumber);
    } else {
      // For cache update mode, we still need basic GitHub access
      this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    }

    // Ensure log directory exists
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  validateEnvironment() {
    // Check if we're in cache update mode
    const args = process.argv.slice(2);
    const isUpdateCacheMode = args.includes('--update-cache-mode');

    if (isUpdateCacheMode) {
      // Cache update mode only needs basic environment
      const required = [
        'GITHUB_TOKEN',
        'REPOSITORY'
      ];

      const missing = required.filter(env => !process.env[env]);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables for cache update: ${missing.join(', ')}`);
      }
    } else {
      // Fix mode needs full environment
      const required = [
        'GITHUB_TOKEN',
        'ANTHROPIC_API_KEY',
        'ISSUE_NUMBER',
        'REPOSITORY'
      ];

      const missing = required.filter(env => !process.env[env]);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables for fix mode: ${missing.join(', ')}`);
      }

      // Validate issue number only in fix mode
      if (!/^\d+$/.test(process.env.ISSUE_NUMBER)) {
        throw new Error(`Invalid issue number: ${process.env.ISSUE_NUMBER}`);
      }
    }

    // Validate repository format (required for both modes)
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(process.env.REPOSITORY)) {
      throw new Error(`Invalid repository format: ${process.env.REPOSITORY}`);
    }
  }

  sanitizeTitle(title) {
    // Remove control characters and limit length
    return title
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[^\w\s-]/g, '') // Keep only word chars, spaces, hyphens
      .trim()
      .substring(0, 100); // Limit length
  }

  createSafeBranchName(issueNumber) {
    // Create a safe branch name
    const sanitized = this.sanitizeTitle(this.issueTitle)
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    return `ai/issue-${issueNumber}${sanitized ? '-' + sanitized : ''}`;
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(path.join(this.logDir, 'devagent.log'), logMessage);
  }

  checkForRateLimiting(output) {
    const rateLimitIndicators = [
      'rate limit',
      'usage limit',
      'quota exceeded',
      'try again later',
      'too many requests',
      'limit exceeded',
      'please wait',
      'retry after',
      'throttled'
    ];

    const lowerOutput = output.toLowerCase();
    for (const indicator of rateLimitIndicators) {
      if (lowerOutput.includes(indicator)) {
        this.log(`🚨 Rate limiting detected in output: "${indicator}"`, 'warn');
        this.log(`Full rate limiting message: ${output.substring(0, 500)}`, 'warn');

        // Extract any retry time if mentioned
        const retryMatch = output.match(/(\d+)\s*(minutes?|hours?|seconds?)/i);
        if (retryMatch) {
          this.log(`⏱️  Suggested retry time: ${retryMatch[0]}`, 'warn');
        }
        return true;
      }
    }
    return false;
  }

  isRateLimitError(error) {
    if (!error) return false;

    const errorStr = JSON.stringify(error).toLowerCase();
    const rateLimitCodes = [
      'rate_limit',
      'usage_limit',
      'quota_exceeded',
      'too_many_requests',
      'throttled',
      '429'
    ];

    return rateLimitCodes.some(code => errorStr.includes(code));
  }

  getRepositoryContext() {
    // Try to get cached repository structure
    let cachedStructure = this.cache.getRepositoryStructure();

    if (cachedStructure) {
      this.log('Using cached repository structure');
      return this.buildContextFromCache(cachedStructure.structure);
    }

    this.log('Analyzing repository structure...');

    // Detect repository type and structure
    const repoType = this.detectRepositoryType();
    const relevantFiles = this.findRelevantFiles();
    const structure = {
      type: repoType,
      mainLanguage: this.detectMainLanguage(),
      relevantFiles: relevantFiles.slice(0, 20), // Limit to 20 files
      directories: this.getKeyDirectories(),
      configFiles: this.getConfigFiles()
    };

    // Cache the structure
    this.cache.saveRepositoryStructure(structure);

    return {
      type: repoType,
      relevantFiles: relevantFiles.slice(0, 20),
      fromCache: false
    };
  }

  buildContextFromCache(structure) {
    return {
      type: structure.type,
      relevantFiles: structure.relevantFiles || [],
      fromCache: true
    };
  }

  detectRepositoryType() {
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (pkg.dependencies?.react || pkg.dependencies?.next) return 'react-app';
      if (pkg.dependencies?.express || pkg.dependencies?.fastify) return 'node-backend';
      return 'node-project';
    }
    if (fs.existsSync('requirements.txt') || fs.existsSync('pyproject.toml')) return 'python-project';
    if (fs.existsSync('go.mod')) return 'go-project';
    if (fs.existsSync('pom.xml') || fs.existsSync('build.gradle')) return 'java-project';
    return 'unknown';
  }

  detectMainLanguage() {
    const extensions = ['.js', '.ts', '.py', '.go', '.java', '.cpp', '.c'];
    const counts = {};

    for (const ext of extensions) {
      try {
        const result = execSync(`find . -name "*${ext}" | wc -l`, { encoding: 'utf8' });
        counts[ext] = parseInt(result.trim());
      } catch (error) {
        counts[ext] = 0;
      }
    }

    const maxExt = Object.entries(counts).reduce((a, b) => counts[a[0]] > counts[b[0]] ? a : b);
    return maxExt[0].substring(1); // Remove the dot
  }

  findRelevantFiles() {
    // Filter files based on issue keywords and common patterns
    const issueKeywords = this.extractIssueKeywords();

    try {
      const allFiles = execSync(
        'find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" \\) | grep -v node_modules | grep -v ".git" | head -50',
        { encoding: 'utf8' }
      ).split('\n').filter(line => line.trim());

      // Score files by relevance
      const scoredFiles = allFiles.map(file => ({
        file,
        score: this.calculateFileRelevance(file, issueKeywords)
      }));

      // Sort by score and return top files
      return scoredFiles
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(item => item.file);

    } catch (error) {
      this.log(`Error finding files: ${error.message}`, 'warn');
      return [];
    }
  }

  extractIssueKeywords() {
    const text = `${this.issueTitle} ${this.issueBody}`.toLowerCase();
    const keywords = [];

    // Extract file/path mentions
    const fileMatches = text.match(/\b\w+\.\w+\b/g) || [];
    keywords.push(...fileMatches);

    // Extract component/function mentions
    const componentMatches = text.match(/\b[A-Z][a-zA-Z]*\b/g) || [];
    keywords.push(...componentMatches);

    // Common technical terms
    const techTerms = ['auth', 'api', 'route', 'component', 'service', 'util', 'config', 'model', 'controller'];
    techTerms.forEach(term => {
      if (text.includes(term)) keywords.push(term);
    });

    return [...new Set(keywords)]; // Remove duplicates
  }

  calculateFileRelevance(file, keywords) {
    let score = 0;
    const fileName = path.basename(file).toLowerCase();
    const filePath = file.toLowerCase();

    // Direct mentions in issue
    if (this.issueBody.toLowerCase().includes(fileName)) score += 100;

    // Keyword matches in filename
    keywords.forEach(keyword => {
      if (fileName.includes(keyword.toLowerCase())) score += 50;
      if (filePath.includes(keyword.toLowerCase())) score += 25;
    });

    // Penalize test files unless issue mentions testing
    if (filePath.includes('test') || filePath.includes('spec')) {
      score -= this.issueBody.toLowerCase().includes('test') ? 0 : 30;
    }

    // Boost recently modified files
    try {
      const stat = fs.statSync(file);
      const daysSinceModified = (Date.now() - stat.mtime) / (1000 * 60 * 60 * 24);
      if (daysSinceModified < 7) score += 10;
    } catch (error) {
      // File might not exist
    }

    return score;
  }

  getKeyDirectories() {
    const commonDirs = ['src', 'lib', 'components', 'pages', 'api', 'routes', 'controllers', 'services'];
    return commonDirs.filter(dir => {
      try {
        return fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
  }

  getConfigFiles() {
    const configFiles = ['package.json', 'tsconfig.json', 'next.config.js', 'webpack.config.js', 'requirements.txt'];
    return configFiles.filter(file => fs.existsSync(file));
  }

  buildOptimizedPrompt(context) {
    // Build a stable prefix for Claude API caching
    const stablePrefix = `You are DevAgent, an AI assistant that fixes GitHub issues.

REPOSITORY INFO:
Type: ${context.type}
Project: ${this.repository}

INSTRUCTIONS:
- Make minimal, targeted changes
- Follow existing code patterns
- Focus on the specific issue described
- Avoid unnecessary modifications

`;

    // Variable issue context (not cached)
    const issueContext = `CURRENT ISSUE:
Number: #${this.issueNumber}
Title: ${this.issueTitle}
Description:
${this.issueBody}

RELEVANT FILES:
${context.relevantFiles.join('\n')}

${context.fromCache ? '(Using cached repository analysis)' : '(Fresh repository analysis)'}

TASK: Analyze the issue and implement the necessary fix. Start by exploring the most relevant files to understand the current implementation.`;

    return stablePrefix + issueContext;
  }

  validateClaudeCLI() {
    try {
      // Check if Claude CLI is available
      this.log('Checking Claude CLI availability...');
      const versionResult = spawnSync('claude', ['--version'], {
        encoding: 'utf8',
        timeout: 5000
      });

      if (versionResult.error) {
        throw new Error(`Claude CLI not found: ${versionResult.error.message}`);
      }

      if (versionResult.status !== 0) {
        throw new Error(`Claude CLI version check failed with status ${versionResult.status}`);
      }

      this.log(`Claude CLI available: ${versionResult.stdout.trim()}`);

      // Check authentication by running a minimal command
      this.log('Checking Claude CLI authentication...');
      const authResult = spawnSync('claude', ['-p', 'hello', '--output-format', 'json'], {
        encoding: 'utf8',
        timeout: 30000, // Increased to 30 seconds
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        }
      });

      if (authResult.error) {
        this.log(`Auth check error: ${authResult.error.message}`, 'warn');
        if (authResult.error.code === 'TIMEOUT') {
          this.log('Auth check timed out - this may indicate rate limiting. Will proceed anyway.', 'warn');
          return; // Proceed without auth validation
        }
        this.log('Will proceed without auth validation', 'warn');
        return;
      }

      if (authResult.status !== 0) {
        this.log(`Auth check failed. stdout: ${authResult.stdout}`, 'warn');
        this.log(`Auth check failed. stderr: ${authResult.stderr}`, 'warn');

        // Status 143 = SIGTERM (process terminated)
        if (authResult.status === 143) {
          this.log('Auth check was terminated (likely timeout or system limit). Will proceed anyway.', 'warn');
          return;
        }

        this.log(`Auth check failed with status ${authResult.status}. Will proceed anyway.`, 'warn');
        return;
      }

      this.log('Claude CLI authentication successful');
    } catch (error) {
      this.log(`Claude CLI validation failed: ${error.message}`, 'warn');
      this.log('Will proceed without full validation', 'warn');
      // Don't throw - let the actual Claude execution handle auth issues
    }
  }

  async runClaude(prompt, allowedTools = 'Bash,Read,Edit,Write,Glob,Grep') {
    this.log(`Running Claude with prompt: ${prompt.substring(0, 100)}...`);
    this.log(`Allowed tools: ${allowedTools}`);
    this.log(`API key present: ${!!process.env.ANTHROPIC_API_KEY}`);

    // Validate Claude CLI before attempting to use it
    this.validateClaudeCLI();

    try {
      // Write prompt to temporary file to avoid shell escaping issues
      const promptFile = path.join(this.logDir, 'prompt.txt');
      fs.writeFileSync(promptFile, prompt, 'utf8');
      this.log(`Wrote prompt to file: ${promptFile}`);

      const args = [
        '-p', `@${promptFile}`,
        '--allowedTools', allowedTools,
        '--permission-mode', 'acceptEdits',
        '--output-format', 'json'
      ];

      this.log(`Executing: claude ${args.join(' ')}`);

      // Set reasonable timeout (5 minutes) to avoid hanging indefinitely
      const timeoutMs = 5 * 60 * 1000; // 5 minutes
      this.log(`Setting ${timeoutMs/1000}s timeout for Claude execution`);

      const result = spawnSync('claude', args, {
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024, // 20MB buffer (increased)
        timeout: timeoutMs
      });

      if (result.error) {
        this.log(`Claude spawn error: ${result.error.message}`, 'error');
        this.log(`Error code: ${result.error.code}`, 'error');
        this.log(`Error errno: ${result.error.errno}`, 'error');

        // Check for timeout specifically
        if (result.error.code === 'TIMEOUT') {
          throw new Error(`Claude CLI timed out after ${timeoutMs/1000}s. This could be due to:\n` +
            `- Rate limiting (Claude API usage limits reached)\n` +
            `- Network issues\n` +
            `- Large prompt processing\n` +
            `Consider trying again later or checking your API usage limits.`);
        }

        throw result.error;
      }

      if (result.status !== 0) {
        this.log(`Claude process details:`, 'error');
        this.log(`  Exit status: ${result.status}`, 'error');
        this.log(`  Signal: ${result.signal || 'none'}`, 'error');
        this.log(`  stdout length: ${result.stdout?.length || 0}`, 'error');
        this.log(`  stderr length: ${result.stderr?.length || 0}`, 'error');

        if (result.stdout) {
          this.log(`Claude stdout:`, 'error');
          this.log(result.stdout, 'error');
        }

        if (result.stderr) {
          this.log(`Claude stderr:`, 'error');
          this.log(result.stderr, 'error');
        }

        // Save outputs for debugging
        if (result.stdout) {
          fs.writeFileSync(path.join(this.logDir, 'claude-stdout.txt'), result.stdout, 'utf8');
        }
        if (result.stderr) {
          fs.writeFileSync(path.join(this.logDir, 'claude-stderr.txt'), result.stderr, 'utf8');
        }

        // Check for common issues
        let errorHint = '';
        if (result.status === 1) {
          errorHint = ' (common causes: authentication failure, rate limits, invalid prompt, or permission issues)';
        } else if (result.status === 127) {
          errorHint = ' (command not found - Claude CLI may not be installed)';
        } else if (result.status === 130) {
          errorHint = ' (interrupted by signal)';
        }

        // Check for rate limiting in stderr
        const stderrText = result.stderr || '';
        if (stderrText.includes('rate limit') || stderrText.includes('usage limit') || stderrText.includes('quota')) {
          errorHint += '\n⚠️  This appears to be a rate limiting issue. Claude API has usage limits that may cause delays up to several hours.';
        }

        throw new Error(`Claude exited with status ${result.status}${errorHint}. Check logs for details.`);
      }

      const output = result.stdout;

      this.log(`Claude raw output length: ${output.length}`);

      // Save raw output for debugging
      const outputFile = path.join(this.logDir, 'claude-output.json');
      fs.writeFileSync(outputFile, output, 'utf8');
      this.log(`Saved raw output to: ${outputFile}`);

      // Check for rate limiting or error messages in the output before parsing
      this.checkForRateLimiting(output);

      // Parse JSON with proper error handling
      let parsed;
      try {
        parsed = JSON.parse(output);
      } catch (jsonError) {
        this.log(`JSON parsing failed: ${jsonError.message}`, 'error');
        this.log(`Raw output preview: ${output.substring(0, 500)}`, 'error');

        // Check if the output contains rate limiting info instead of JSON
        if (output.includes('rate limit') || output.includes('usage limit') ||
            output.includes('quota exceeded') || output.includes('try again later')) {
          this.log(`⚠️  Output contains rate limiting message instead of JSON`, 'error');
          throw new Error(`Claude API rate limited. Output: ${output.substring(0, 200)}...`);
        }

        throw new Error(`Claude returned invalid JSON: ${jsonError.message}`);
      }

      // Check parsed response for error indicators
      if (parsed.error) {
        this.log(`Claude returned error in response: ${JSON.stringify(parsed.error)}`, 'error');
        if (this.isRateLimitError(parsed.error)) {
          throw new Error(`Claude API rate limited: ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }
        throw new Error(`Claude API error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
      }

      this.log(`Claude parsed successfully, messages: ${parsed.messages?.length || 0}`);
      return parsed;
    } catch (error) {
      this.log(`Claude execution failed: ${error.message}`, 'error');
      this.log(`Error code: ${error.code}`, 'error');
      this.log(`Error stderr: ${error.stderr || 'none'}`, 'error');
      this.log(`Error stdout: ${error.stdout || 'none'}`, 'error');
      throw error;
    }
  }

  async createBranch() {
    this.log(`Creating branch: ${this.branchName}`);

    try {
      // Check if branch already exists
      try {
        execSync(`git rev-parse --verify ${this.branchName}`, { encoding: 'utf8', stdio: 'ignore' });
        this.log(`Branch ${this.branchName} already exists, switching to it`);
        const result = execSync(`git checkout ${this.branchName}`, { encoding: 'utf8' });
        this.log(`Switched to existing branch: ${result.trim()}`);
      } catch {
        // Branch doesn't exist, create it
        const result = execSync(`git checkout -b ${this.branchName}`, { encoding: 'utf8' });
        this.log(`Branch created successfully: ${result.trim()}`);
      }
    } catch (error) {
      this.log(`Failed to create/switch branch: ${error.message}`, 'error');
      throw error;
    }
  }

  async commitAndPush() {
    this.log('Committing changes');

    try {
      this.log('Adding files to git...');
      const addResult = execSync('git add .', { encoding: 'utf8' });
      this.log(`Git add result: ${addResult || 'success'}`);

      const commitMessage = `[AI Fix] ${this.issueTitle}

Fixes #${this.issueNumber}

🤖 Generated with DevAgent
Co-Authored-By: ${process.env.GIT_USER_NAME || 'DevAgent'} <${process.env.GIT_USER_EMAIL || 'devagent@github-actions.local'}>`;

      // Write commit message to file to avoid shell escaping issues
      const commitMsgFile = path.join(this.logDir, 'commit-message.txt');
      fs.writeFileSync(commitMsgFile, commitMessage, 'utf8');

      this.log(`Committing with message: ${commitMessage.substring(0, 100)}...`);
      const commitResult = execSync(`git commit -F "${commitMsgFile}"`, { encoding: 'utf8' });
      this.log(`Git commit result: ${commitResult.trim()}`);

      this.log(`Pushing to origin/${this.branchName}...`);
      try {
        const pushResult = execSync(`git push -u origin "${this.branchName}"`, { encoding: 'utf8' });
        this.log(`Git push result: ${pushResult.trim()}`);
      } catch (pushError) {
        // Retry push without -u flag in case branch already exists on remote
        this.log('Retrying push without -u flag...', 'warn');
        const retryResult = execSync(`git push origin "${this.branchName}"`, { encoding: 'utf8' });
        this.log(`Git push retry result: ${retryResult.trim()}`);
      }
    } catch (error) {
      this.log(`Git operation failed: ${error.message}`, 'error');
      this.log(`Git error stderr: ${error.stderr || 'none'}`, 'error');
      throw error;
    }
  }

  async createPR() {
    this.log('Creating pull request');

    try {
      const [owner, repo] = this.repository.split('/');
      this.log(`Repository: ${owner}/${repo}`);
      this.log(`Base branch: ${this.baseBranch}`);
      this.log(`Head branch: ${this.branchName}`);

      const prBody = `## Summary
This PR addresses the issue described in #${this.issueNumber}.

## Changes Made
The AI agent analyzed the issue and implemented the following changes:
- Analyzed the codebase and issue requirements
- Generated appropriate fixes based on the issue description
- Applied changes while maintaining code quality and conventions

## Issue Reference
Fixes #${this.issueNumber}

---
🤖 Generated with [DevAgent](https://github.com/jayarjo/devagent)

Co-Authored-By: ${process.env.GIT_USER_NAME || 'DevAgent'} <${process.env.GIT_USER_EMAIL || 'devagent@github-actions.local'}>`;

      const prTitle = `[AI Fix] ${this.issueTitle || `Issue #${this.issueNumber}`}`;
      this.log(`PR title: ${prTitle}`);
      this.log(`PR body length: ${prBody.length}`);

      const pr = await this.octokit.pulls.create({
        owner,
        repo,
        title: prTitle,
        head: this.branchName,
        base: this.baseBranch,
        body: prBody,
      });

      this.log(`Created PR #${pr.data.number}: ${pr.data.html_url}`);
      return pr.data;
    } catch (error) {
      this.log(`Failed to create PR: ${error.message}`, 'error');
      this.log(`PR creation error status: ${error.status}`, 'error');
      this.log(`PR creation error response: ${JSON.stringify(error.response?.data || {})}`, 'error');
      throw error;
    }
  }

  async run() {
    try {
      this.log('Starting DevAgent execution');
      this.log(`Issue: #${this.issueNumber} - ${this.issueTitle}`);
      this.log(`Repository: ${this.repository}`);
      this.log(`Base branch: ${this.baseBranch}`);
      this.log(`Working directory: ${process.cwd()}`);

      // Log environment variables (without sensitive data)
      this.log(`Environment check:`);
      this.log(`- GITHUB_TOKEN present: ${!!process.env.GITHUB_TOKEN}`);
      this.log(`- ANTHROPIC_API_KEY present: ${!!process.env.ANTHROPIC_API_KEY}`);
      this.log(`- GIT_USER_NAME: ${process.env.GIT_USER_NAME || 'default'}`);
      this.log(`- GIT_USER_EMAIL: ${process.env.GIT_USER_EMAIL || 'default'}`);

      // Create working branch
      await this.createBranch();

      // Prepare context for Claude with caching
      this.log('Gathering repository context...');
      const context = this.getRepositoryContext();
      this.log(`Context: ${context.type} repository with ${context.relevantFiles.length} relevant files`);

      const prompt = this.buildOptimizedPrompt(context);

      this.log(`Prompt length: ${prompt.length} characters`);

      // Run Claude to fix the issue
      const result = await this.runClaude(prompt);
      this.log(`Claude completed with ${result.messages?.length || 0} messages`);

      // Check if any changes were made
      this.log('Checking for file changes...');
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      this.log(`Git status output: ${status || '(no changes)'}`);

      if (status.trim()) {
        this.log('Changes detected, creating PR');
        await this.commitAndPush();
        const pr = await this.createPR();
        this.log(`Successfully created PR: ${pr.html_url}`);
      } else {
        this.log('No changes were made by the agent', 'warn');
      }
    } catch (error) {
      this.log(`DevAgent execution failed: ${error.message}`, 'error');
      this.log(`Error stack: ${error.stack}`, 'error');
      process.exit(1);
    }
  }
}

// Add cache update methods to DevAgent class
DevAgent.prototype.updateCacheMode = async function() {
  try {
    this.log('Running in cache update mode');

    // Read changed files from environment or file
    let changedFiles = [];
    if (process.env.CHANGED_FILES && fs.existsSync(process.env.CHANGED_FILES)) {
      const fileList = fs.readFileSync(process.env.CHANGED_FILES, 'utf8');
      changedFiles = fileList.split('\n').filter(f => f.trim());
    }

    this.log(`Processing ${changedFiles.length} changed files`);

    // Update file summaries for changed files only
    let updatedFiles = 0;
    for (const file of changedFiles) {
      if (this.isRelevantFileForCache(file)) {
        await this.updateFileSummary(file);
        updatedFiles++;
      }
    }

    // Update repository structure if package.json or config files changed
    const structuralChanges = changedFiles.some(f =>
      f.includes('package.json') ||
      f.includes('.config.') ||
      f.includes('tsconfig.json') ||
      f.includes('webpack.config') ||
      f.includes('next.config')
    );

    if (structuralChanges) {
      this.log('Structural changes detected, updating repository structure');
      const context = this.getRepositoryContext();
      this.cache.saveRepositoryStructure(context);
    }

    this.log(`Cache update completed. Updated ${updatedFiles} file summaries`);

  } catch (error) {
    this.log(`Cache update failed: ${error.message}`, 'error');
    process.exit(1);
  }
};

DevAgent.prototype.isRelevantFileForCache = function(file) {
  // Skip test files, build outputs, configs, docs
  const skipPatterns = [
    /node_modules/,
    /\.git/,
    /dist\/|build\/|out\//,
    /\.test\.|\.spec\./,
    /test\/|tests\/|__tests__/,
    /\.md$|\.txt$/,
    /\.json$/, // Skip most JSON files except package.json
    /\.lock$|yarn\.lock|package-lock\.json/
  ];

  if (skipPatterns.some(pattern => pattern.test(file))) {
    return false;
  }

  // Include source files
  const includePatterns = [
    /\.(js|ts|jsx|tsx|py|go|java|cpp|c|php|rb)$/,
    /package\.json$/ // Exception for package.json
  ];

  return includePatterns.some(pattern => pattern.test(file));
};

DevAgent.prototype.updateFileSummary = async function(file) {
  try {
    if (!fs.existsSync(file)) {
      this.log(`File ${file} no longer exists, removing from cache`);
      this.cache.removeFileSummary(file);
      return;
    }

    this.log(`Updating summary for ${file}`);
    const content = fs.readFileSync(file, 'utf8');

    // Generate a brief summary (you could use Claude for this, but for now a simple approach)
    const lines = content.split('\n');
    const summary = {
      lineCount: lines.length,
      functions: this.extractFunctions(content),
      lastModified: fs.statSync(file).mtime,
      purpose: this.inferFilePurpose(file, content)
    };

    this.cache.saveFileSummary(file, summary);
  } catch (error) {
    this.log(`Failed to update summary for ${file}: ${error.message}`, 'warn');
  }
};

DevAgent.prototype.extractFunctions = function(content) {
  // Simple function extraction (can be enhanced)
  const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=|class\s+(\w+))/g;
  const functions = [];
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1] || match[2] || match[3]);
  }

  return functions.slice(0, 10); // Limit to avoid bloat
};

DevAgent.prototype.inferFilePurpose = function(file, content) {
  const fileName = path.basename(file);

  if (fileName.includes('test') || fileName.includes('spec')) return 'Testing';
  if (fileName.includes('config')) return 'Configuration';
  if (file.includes('api/') || file.includes('routes/')) return 'API/Routes';
  if (file.includes('component') || fileName.includes('Component')) return 'UI Component';
  if (file.includes('util') || file.includes('helper')) return 'Utility';
  if (content.includes('export default') && content.includes('React')) return 'React Component';
  if (content.includes('app.use') || content.includes('express')) return 'Server/Express';

  return 'Source Code';
};

// Run the agent
if (require.main === module) {
  const agent = new DevAgent();

  if (agent.isUpdateCacheMode) {
    agent.updateCacheMode().catch((error) => {
      console.error('Cache update error:', error);
      process.exit(1);
    });
  } else {
    agent.run().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  }
}

module.exports = DevAgent;

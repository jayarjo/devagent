#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class DevAgent {
  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.issueNumber = process.env.ISSUE_NUMBER;
    this.issueTitle = process.env.ISSUE_TITLE;
    this.issueBody = process.env.ISSUE_BODY;
    this.repository = process.env.REPOSITORY;
    this.baseBranch = process.env.BASE_BRANCH || 'main';
    this.branchName = `ai/issue-${this.issueNumber}`;
    this.logDir = '/tmp/agent-logs';

    // Ensure log directory exists
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(path.join(this.logDir, 'devagent.log'), logMessage);
  }

  async runClaude(prompt, allowedTools = 'Bash,Read,Edit,Write,Glob,Grep') {
    this.log(`Running Claude with prompt: ${prompt.substring(0, 100)}...`);

    try {
      const result = execSync(`claude -p "${prompt.replace(/"/g, '\\"')}" --allowedTools "${allowedTools}" --permission-mode acceptEdits --output-format json`, {
        env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      return JSON.parse(result);
    } catch (error) {
      this.log(`Claude execution failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async createBranch() {
    this.log(`Creating branch: ${this.branchName}`);
    execSync(`git checkout -b ${this.branchName}`, { encoding: 'utf8' });
  }

  async commitAndPush() {
    this.log('Committing changes');

    execSync('git add .', { encoding: 'utf8' });

    const commitMessage = `[AI Fix] ${this.issueTitle}

Fixes #${this.issueNumber}

🤖 Generated with DevAgent
Co-Authored-By: Claude <noreply@anthropic.com>`;

    execSync(`git commit -m "${commitMessage}"`, { encoding: 'utf8' });
    execSync(`git push -u origin ${this.branchName}`, { encoding: 'utf8' });
  }

  async createPR() {
    this.log('Creating pull request');

    const [owner, repo] = this.repository.split('/');

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
🤖 Generated with [DevAgent](https://github.com/your-org/devagent)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    const pr = await this.octokit.pulls.create({
      owner,
      repo,
      title: `[AI Fix] ${this.issueTitle}`,
      head: this.branchName,
      base: this.baseBranch,
      body: prBody
    });

    this.log(`Created PR #${pr.data.number}: ${pr.data.html_url}`);
    return pr.data;
  }

  async run() {
    try {
      this.log('Starting DevAgent execution');
      this.log(`Issue: #${this.issueNumber} - ${this.issueTitle}`);

      // Create working branch
      await this.createBranch();

      // Prepare context for Claude
      const fileTree = execSync('find . -type f -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cpp" -o -name "*.c" | head -50', { encoding: 'utf8' });

      const prompt = `You are DevAgent, an AI assistant that fixes GitHub issues.

ISSUE TO FIX:
Title: ${this.issueTitle}
Number: #${this.issueNumber}
Description:
${this.issueBody}

REPOSITORY CONTEXT:
Key files found:
${fileTree}

TASK:
1. Analyze the issue description carefully
2. Explore the codebase to understand the current implementation
3. Identify the root cause of the issue
4. Implement a fix that addresses the issue completely
5. Ensure the fix follows the existing code patterns and conventions
6. Test your changes if possible

Please start by exploring the codebase to understand the issue better, then implement the necessary fixes.`;

      // Run Claude to fix the issue
      const result = await this.runClaude(prompt);
      this.log(`Claude completed with ${result.messages?.length || 0} messages`);

      // Check if any changes were made
      const status = execSync('git status --porcelain', { encoding: 'utf8' });

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
      process.exit(1);
    }
  }
}

// Run the agent
if (require.main === module) {
  const agent = new DevAgent();
  agent.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = DevAgent;
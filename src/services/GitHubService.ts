import { Octokit } from '@octokit/rest';
import { GitHubPullRequest } from '../types';
import { Logger } from '../utils/logger';

export class GitHubService {
  private readonly octokit: Octokit;
  private readonly logger: Logger;
  private readonly repository: string;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;

  constructor(token: string, repository: string, gitUserName?: string, gitUserEmail?: string) {
    this.octokit = new Octokit({ auth: token });
    this.logger = new Logger();
    this.repository = repository;
    this.gitUserName = gitUserName || 'DevAgent';
    this.gitUserEmail = gitUserEmail || 'devagent@github-actions.local';
  }

  async createPR(
    title: string,
    branchName: string,
    baseBranch: string,
    issueNumber: string
  ): Promise<GitHubPullRequest> {
    this.logger.info('Creating pull request');

    try {
      const [owner, repo] = this.repository.split('/');
      this.logger.info(`Repository: ${owner}/${repo}`);
      this.logger.info(`Base branch: ${baseBranch}`);
      this.logger.info(`Head branch: ${branchName}`);

      const prBody = `## Summary
This PR addresses the issue described in #${issueNumber}.

## Changes Made
The AI agent analyzed the issue and implemented the following changes:
- Analyzed the codebase and issue requirements
- Generated appropriate fixes based on the issue description
- Applied changes while maintaining code quality and conventions

## Issue Reference
Fixes #${issueNumber}

---
🤖 Generated with [DevAgent](https://github.com/jayarjo/devagent)

Co-Authored-By: ${this.gitUserName} <${this.gitUserEmail}>`;

      const prTitle = `[AI Fix] ${title || `Issue #${issueNumber}`}`;
      this.logger.info(`PR title: ${prTitle}`);
      this.logger.info(`PR body length: ${prBody.length}`);

      const pr = await this.octokit.pulls.create({
        owner,
        repo,
        title: prTitle,
        head: branchName,
        base: baseBranch,
        body: prBody,
      });

      this.logger.info(`Created PR #${pr.data.number}: ${pr.data.html_url}`);
      return {
        number: pr.data.number,
        html_url: pr.data.html_url,
        head: {
          ref: pr.data.head.ref,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create PR: ${(error as Error).message}`);
      throw error;
    }
  }
}
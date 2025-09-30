import { Octokit } from '@octokit/rest';
import { GitHubPullRequest } from '../types';
import { Logger } from '../utils/logger';
import { TemplateManager } from '../core/TemplateManager';
import { loadTemplateConfig } from '../config/templates';
import { PRTemplateData } from '../types/templates';

export class GitHubService {
  private readonly octokit: Octokit;
  private readonly logger: Logger;
  private readonly templateManager: TemplateManager;
  private readonly repository: string;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;

  constructor(token: string, repository: string, gitUserName?: string, gitUserEmail?: string) {
    this.octokit = new Octokit({ auth: token });
    this.logger = new Logger();
    this.templateManager = new TemplateManager(loadTemplateConfig());
    this.repository = repository;
    this.gitUserName = gitUserName || 'DevAgent';
    this.gitUserEmail = gitUserEmail || 'devagent@github-actions.local';
  }

  async createPR(
    title: string,
    branchName: string,
    baseBranch: string,
    issueNumber: string,
    changesSummary?: string[]
  ): Promise<GitHubPullRequest> {
    this.logger.info('Creating pull request');

    try {
      const [owner, repo] = this.repository.split('/');
      this.logger.info(`Repository: ${owner}/${repo}`);
      this.logger.info(`Base branch: ${baseBranch}`);
      this.logger.info(`Head branch: ${branchName}`);

      // Prepare template data for PR
      const prData: PRTemplateData = {
        issueNumber,
        title,
        gitUserName: this.gitUserName,
        gitUserEmail: this.gitUserEmail,
        changesSummary
      };

      // Use template manager to render PR content
      const prBody = this.templateManager.renderPRBody(prData);
      const prTitle = this.templateManager.renderPRTitle(prData);
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
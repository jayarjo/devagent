import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
export class GitService {
  private readonly logger: Logger;
  private readonly logDir: string;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;

  constructor(logDir: string, gitUserName?: string, gitUserEmail?: string) {
    this.logger = new Logger();
    this.logDir = logDir;
    this.gitUserName = gitUserName || 'DevAgent';
    this.gitUserEmail = gitUserEmail || 'devagent@github-actions.local';
  }

  async createBranch(branchName: string): Promise<void> {
    this.logger.info(`Creating branch: ${branchName}`);

    try {
      // Check if branch already exists
      try {
        execSync(`git rev-parse --verify ${branchName}`, { encoding: 'utf8', stdio: 'ignore' });
        this.logger.info(`Branch ${branchName} already exists, switching to it`);
        const result = execSync(`git checkout ${branchName}`, { encoding: 'utf8' });
        this.logger.info(`Switched to existing branch: ${result.trim()}`);
      } catch {
        // Branch doesn't exist, create it
        const result = execSync(`git checkout -b ${branchName}`, { encoding: 'utf8' });
        this.logger.info(`Branch created successfully: ${result.trim()}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create/switch branch: ${(error as Error).message}`);
      throw error;
    }
  }

  async commitAndPush(branchName: string, issueTitle: string, issueNumber: string): Promise<void> {
    this.logger.info('Committing changes');

    try {
      this.logger.info('Adding files to git...');
      const addResult = execSync('git add .', { encoding: 'utf8' });
      this.logger.info(`Git add result: ${addResult || 'success'}`);

      const commitMessage = `[AI Fix] ${issueTitle}

Fixes #${issueNumber}

🤖 Generated with DevAgent
Co-Authored-By: ${this.gitUserName} <${this.gitUserEmail}>`;

      // Write commit message to file to avoid shell escaping issues
      const commitMsgFile = path.join(this.logDir, 'commit-message.txt');
      fs.writeFileSync(commitMsgFile, commitMessage, 'utf8');

      this.logger.info(`Committing with message: ${commitMessage.substring(0, 100)}...`);
      const commitResult = execSync(`git commit -F "${commitMsgFile}"`, { encoding: 'utf8' });
      this.logger.info(`Git commit result: ${commitResult.trim()}`);

      this.logger.info(`Pushing to origin/${branchName}...`);
      try {
        const pushResult = execSync(`git push -u origin "${branchName}"`, { encoding: 'utf8' });
        this.logger.info(`Git push result: ${pushResult.trim()}`);
      } catch (_pushError) {
        // Retry push without -u flag in case branch already exists on remote
        this.logger.warn('Retrying push without -u flag...');
        const retryResult = execSync(`git push origin "${branchName}"`, { encoding: 'utf8' });
        this.logger.info(`Git push retry result: ${retryResult.trim()}`);
      }
    } catch (error) {
      this.logger.error(`Git operation failed: ${(error as Error).message}`);
      throw error;
    }
  }

  checkForChanges(): boolean {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      return status.trim().length > 0;
    } catch (error) {
      this.logger.error(`Failed to check git status: ${(error as Error).message}`);
      return false;
    }
  }
}
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { ClaudeResponse, SpawnError } from '../types';
import { CLAUDE_CONFIG } from '../config/constants';
import { Logger } from '../utils/logger';
import { CostTracker } from '../telemetry/costTracker';

export class ClaudeService {
  private readonly logger: Logger;
  private readonly logDir: string;

  constructor(logDir: string) {
    this.logger = new Logger();
    this.logDir = logDir;
  }

  validateClaudeCLI(): void {
    try {
      // Check if Claude CLI is available
      this.logger.info('Checking Claude CLI availability...');
      const versionResult = spawnSync('claude', ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      });

      if (versionResult.error) {
        throw new Error(`Claude CLI not found: ${versionResult.error.message}`);
      }

      if (versionResult.status !== 0) {
        throw new Error(`Claude CLI version check failed with status ${versionResult.status}`);
      }

      this.logger.info(`Claude CLI available: ${versionResult.stdout.trim()}`);

      // Check authentication by running a minimal command
      this.logger.info('Checking Claude CLI authentication...');
      const authResult = spawnSync('claude', ['-p', 'hello', '--output-format', 'json'], {
        encoding: 'utf8',
        timeout: CLAUDE_CONFIG.AUTH_CHECK_TIMEOUT_MS,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      });

      if (authResult.error) {
        this.logger.warn(`Auth check error: ${authResult.error.message}`);
        if ((authResult.error as SpawnError).code === 'TIMEOUT') {
          this.logger.warn('Auth check timed out - this may indicate rate limiting. Will proceed anyway.');
          return;
        }
        this.logger.warn('Will proceed without auth validation');
        return;
      }

      if (authResult.status !== 0) {
        this.logger.warn(`Auth check failed. stdout: ${authResult.stdout}`);
        this.logger.warn(`Auth check failed. stderr: ${authResult.stderr}`);

        // Status 143 = SIGTERM (process terminated)
        if (authResult.status === 143) {
          this.logger.warn('Auth check was terminated (likely timeout or system limit). Will proceed anyway.');
          return;
        }

        this.logger.warn(`Auth check failed with status ${authResult.status}. Will proceed anyway.`);
        return;
      }

      this.logger.info('Claude CLI authentication successful');
    } catch (error) {
      this.logger.warn(`Claude CLI validation failed: ${(error as Error).message}`);
      this.logger.warn('Will proceed without full validation');
      // Don't throw - let the actual Claude execution handle auth issues
    }
  }

  async runClaude(
    prompt: string,
    allowedTools: string = CLAUDE_CONFIG.DEFAULT_ALLOWED_TOOLS
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();

    try {
        this.logger.info(`Running Claude with prompt: ${prompt.substring(0, 100)}...`);
        this.logger.info(`Allowed tools: ${allowedTools}`);
        this.logger.info(`API key present: ${!!process.env.ANTHROPIC_API_KEY}`);

        // Validate Claude CLI before attempting to use it
        this.validateClaudeCLI();

        // Write prompt to temporary file to avoid shell escaping issues
        const promptFile = path.join(this.logDir, 'prompt.txt');
        fs.writeFileSync(promptFile, prompt, 'utf8');
        this.logger.info(`Wrote prompt to file: ${promptFile}`);

        const args = [
          '-p', `@${promptFile}`,
          '--allowedTools', allowedTools,
          '--permission-mode', 'acceptEdits',
          '--output-format', 'json',
        ];

        this.logger.info(`Executing: claude ${args.join(' ')}`);
        this.logger.info(`Setting ${CLAUDE_CONFIG.TIMEOUT_MS / 1000}s timeout for Claude execution`);

        const result = spawnSync('claude', args, {
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          },
          encoding: 'utf8',
          maxBuffer: CLAUDE_CONFIG.MAX_BUFFER_SIZE,
          timeout: CLAUDE_CONFIG.TIMEOUT_MS,
        });

        if (result.error) {
          this.logger.error(`Claude spawn error: ${result.error.message}`);
          this.logger.error(`Error code: ${(result.error as SpawnError).code}`);

          // Check for timeout specifically
          if ((result.error as SpawnError).code === 'TIMEOUT') {
            throw new Error(
              `Claude CLI timed out after ${CLAUDE_CONFIG.TIMEOUT_MS / 1000}s. This could be due to:\n` +
              `- Rate limiting (Claude API usage limits reached)\n` +
              `- Network issues\n` +
              `- Large prompt processing\n` +
              `Consider trying again later or checking your API usage limits.`
            );
          }

          throw result.error;
        }

        if (result.status !== 0) {
          this.logger.error('Claude process details:');
          this.logger.error(`  Exit status: ${result.status}`);
          this.logger.error(`  Signal: ${result.signal || 'none'}`);
          this.logger.error(`  stdout length: ${result.stdout?.length || 0}`);
          this.logger.error(`  stderr length: ${result.stderr?.length || 0}`);

          if (result.stdout) {
            this.logger.error('Claude stdout:');
            this.logger.error(result.stdout);
          }

          if (result.stderr) {
            this.logger.error('Claude stderr:');
            this.logger.error(result.stderr);
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
        this.logger.info(`Claude raw output length: ${output.length}`);

        // Save raw output for debugging
        const outputFile = path.join(this.logDir, 'claude-output.json');
        fs.writeFileSync(outputFile, output, 'utf8');
        this.logger.info(`Saved raw output to: ${outputFile}`);

        // Check for rate limiting or error messages in the output before parsing
        this.checkForRateLimiting(output);

        // Parse JSON with proper error handling
        let parsed: ClaudeResponse;
        try {
          parsed = JSON.parse(output) as ClaudeResponse;
        } catch (jsonError) {
          this.logger.error(`JSON parsing failed: ${(jsonError as Error).message}`);
          this.logger.error(`Raw output preview: ${output.substring(0, 500)}`);

          // Check if the output contains rate limiting info instead of JSON
          if (
            output.includes('rate limit') ||
            output.includes('usage limit') ||
            output.includes('quota exceeded') ||
            output.includes('try again later')
          ) {
            this.logger.error('⚠️  Output contains rate limiting message instead of JSON');
            throw new Error(`Claude API rate limited. Output: ${output.substring(0, 200)}...`);
          }

          throw new Error(`Claude returned invalid JSON: ${(jsonError as Error).message}`);
        }

        // Check parsed response for error indicators
        if (parsed.error) {
          this.logger.error(`Claude returned error in response: ${JSON.stringify(parsed.error)}`);
          if (this.isRateLimitError(parsed.error)) {
            throw new Error(`Claude API rate limited: ${parsed.error.message || JSON.stringify(parsed.error)}`);
          }
          throw new Error(`Claude API error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }

      this.logger.info(`Claude parsed successfully, messages: ${parsed.messages?.length || 0}`);

      // Record cost and performance metrics
      const durationMs = Date.now() - startTime;
      CostTracker.recordClaudeRequest(prompt, parsed, durationMs, {
        repository: process.env.REPOSITORY,
        issueNumber: process.env.ISSUE_NUMBER,
        mode: process.argv.includes('--update-cache-mode') ? 'cache-update' : 'fix',
      });

      return parsed;
    } catch (error) {
      const errorMessage = (error as Error).message;
      const isRateLimit = errorMessage.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        CostTracker.recordRateLimit('claude', {
          repository: process.env.REPOSITORY,
          mode: process.argv.includes('--update-cache-mode') ? 'cache-update' : 'fix',
        });
      }

      CostTracker.recordError('claude_request', {
        repository: process.env.REPOSITORY,
        mode: process.argv.includes('--update-cache-mode') ? 'cache-update' : 'fix',
      });

      this.logger.error(`Claude execution failed: ${errorMessage}`);
      throw error;
    }
  }

  private checkForRateLimiting(output: string): void {
    const rateLimitIndicators = [
      'rate limit',
      'usage limit',
      'quota exceeded',
      'try again later',
      'too many requests',
    ];

    const outputLower = output.toLowerCase();
    for (const indicator of rateLimitIndicators) {
      if (outputLower.includes(indicator)) {
        this.logger.warn(`⚠️  Detected potential rate limiting: "${indicator}" found in output`);

        // Record rate limit event
        CostTracker.recordRateLimit('claude_output', {
          repository: process.env.REPOSITORY,
          mode: process.argv.includes('--update-cache-mode') ? 'cache-update' : 'fix',
        });
        break;
      }
    }
  }

  private isRateLimitError(error: { message?: string; code?: string }): boolean {
    if (!error.message) return false;

    const rateLimitMessages = [
      'rate limit',
      'usage limit',
      'quota',
      'too many requests',
      '429',
    ];

    const messageLower = error.message.toLowerCase();
    return rateLimitMessages.some(msg => messageLower.includes(msg));
  }
}
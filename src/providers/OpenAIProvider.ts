import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { AIProvider, AIResponse, IAIProvider, ProviderConfig, SpawnError, TokenUsage } from '../types';
import { Logger } from '../utils/logger';

export class OpenAIProvider implements IAIProvider {
  private readonly logger: Logger;
  private readonly logDir: string;

  constructor(logDir: string) {
    this.logger = new Logger();
    this.logDir = logDir;
  }

  getProviderName(): AIProvider {
    return AIProvider.OPENAI;
  }

  validateCLI(): void {
    try {
      this.logger.info('Checking OpenAI Codex CLI availability...');
      const versionResult = spawnSync('codex', ['--upgrade'], {
        encoding: 'utf8',
        timeout: 5000,
      });

      if (versionResult.error) {
        throw new Error(`OpenAI Codex CLI not found: ${versionResult.error.message}`);
      }

      this.logger.info('OpenAI Codex CLI available');

      this.logger.info('Checking OpenAI Codex CLI authentication...');
      const authResult = spawnSync('codex', [], {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        },
        input: 'hello\n',
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
        this.logger.warn(`Auth check failed with status ${authResult.status}. Will proceed anyway.`);
        return;
      }

      this.logger.info('OpenAI Codex CLI authentication successful');
    } catch (error) {
      this.logger.warn(`OpenAI Codex CLI validation failed: ${(error as Error).message}`);
      this.logger.warn('Will proceed without full validation');
    }
  }

  async runPrompt(prompt: string, config?: ProviderConfig): Promise<AIResponse> {
    try {
      this.logger.info(`Running OpenAI Codex with prompt: ${prompt.substring(0, 100)}...`);
      this.logger.info(`API key present: ${!!process.env.OPENAI_API_KEY}`);

      this.validateCLI();

      const promptFile = path.join(this.logDir, 'openai-prompt.txt');
      fs.writeFileSync(promptFile, prompt, 'utf8');
      this.logger.info(`Wrote prompt to file: ${promptFile}`);

      this.logger.info('Executing: codex');

      const result = spawnSync('codex', [], {
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        },
        encoding: 'utf8',
        maxBuffer: config?.maxBufferSize || 20 * 1024 * 1024,
        timeout: config?.timeout || 5 * 60 * 1000,
        input: prompt + '\n',
      });

      if (result.error) {
        this.logger.error(`OpenAI Codex spawn error: ${result.error.message}`);
        this.logger.error(`Error code: ${(result.error as SpawnError).code}`);

        if ((result.error as SpawnError).code === 'TIMEOUT') {
          throw new Error(
            `OpenAI Codex CLI timed out. This could be due to:\n` +
            `- Rate limiting (OpenAI API usage limits reached)\n` +
            `- Network issues\n` +
            `- Large prompt processing\n` +
            `Consider trying again later or checking your API usage limits.`
          );
        }

        throw result.error;
      }

      if (result.status !== 0) {
        this.logger.error('OpenAI Codex process details:');
        this.logger.error(`  Exit status: ${result.status}`);
        this.logger.error(`  Signal: ${result.signal || 'none'}`);
        this.logger.error(`  stdout length: ${result.stdout?.length || 0}`);
        this.logger.error(`  stderr length: ${result.stderr?.length || 0}`);

        if (result.stdout) {
          this.logger.error('OpenAI Codex stdout:');
          this.logger.error(result.stdout);
        }

        if (result.stderr) {
          this.logger.error('OpenAI Codex stderr:');
          this.logger.error(result.stderr);
        }

        if (result.stdout) {
          fs.writeFileSync(path.join(this.logDir, 'openai-stdout.txt'), result.stdout, 'utf8');
        }
        if (result.stderr) {
          fs.writeFileSync(path.join(this.logDir, 'openai-stderr.txt'), result.stderr, 'utf8');
        }

        let errorHint = '';
        if (result.status === 1) {
          errorHint = ' (common causes: authentication failure, rate limits, invalid prompt, or permission issues)';
        } else if (result.status === 127) {
          errorHint = ' (command not found - OpenAI Codex CLI may not be installed)';
        } else if (result.status === 130) {
          errorHint = ' (interrupted by signal)';
        }

        const stderrText = result.stderr || '';
        if (stderrText.includes('rate limit') || stderrText.includes('usage limit') || stderrText.includes('quota')) {
          errorHint += '\n⚠️  This appears to be a rate limiting issue. OpenAI API has usage limits.';
        }

        throw new Error(`OpenAI Codex exited with status ${result.status}${errorHint}. Check logs for details.`);
      }

      const output = result.stdout;
      this.logger.info(`OpenAI Codex raw output length: ${output.length}`);

      const outputFile = path.join(this.logDir, 'openai-output.txt');
      fs.writeFileSync(outputFile, output, 'utf8');
      this.logger.info(`Saved raw output to: ${outputFile}`);

      return this.parseResponse(output);
    } catch (error) {
      this.logger.error(`OpenAI Codex execution failed: ${(error as Error).message}`);
      throw error;
    }
  }

  parseResponse(output: string): AIResponse {
    return {
      messages: [{
        role: 'assistant',
        content: output.trim(),
      }],
      usage: this.estimateTokenUsage(output),
      error: undefined,
    };
  }

  private estimateTokenUsage(output: string): TokenUsage {
    const estimatedTokens = Math.ceil(output.length / 4);
    return {
      inputTokens: 0, // OpenAI Codex CLI doesn't provide detailed usage info
      outputTokens: estimatedTokens,
      cachedTokens: 0,
    };
  }

  calculateCost(usage: TokenUsage): number {
    // OpenAI pricing (approximate for GPT-4)
    const PRICING = {
      inputTokenPrice: 30.0,   // $30 per 1M tokens (GPT-4)
      outputTokenPrice: 60.0,  // $60 per 1M tokens (GPT-4)
    };

    const { inputTokens, outputTokens } = usage;

    const inputCost = (inputTokens / 1_000_000) * PRICING.inputTokenPrice;
    const outputCost = (outputTokens / 1_000_000) * PRICING.outputTokenPrice;

    return inputCost + outputCost;
  }
}
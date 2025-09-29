import { grafanaMetrics } from './grafanaMetrics';
import { Logger } from '../utils/logger';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cachedCost: number;
  totalCost: number;
  tokensUsed: TokenUsage;
}

export class CostTracker {
  private static readonly logger = new Logger();
  private static readonly PRICING = {
    inputTokenPrice: 3.0,    // $3 per 1M tokens
    outputTokenPrice: 15.0,  // $15 per 1M tokens
    cachedInputPrice: 0.3,   // $0.30 per 1M cached tokens
  };

  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  static parseTokenUsage(claudeResponse: any): TokenUsage {
    const usage = claudeResponse?.usage || {};
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cachedTokens: usage.cache_read_input_tokens || 0,
    };
  }

  static calculateCost(tokenUsage: TokenUsage): CostBreakdown {
    const { inputTokens, outputTokens, cachedTokens = 0 } = tokenUsage;

    const inputCost = (inputTokens / 1_000_000) * this.PRICING.inputTokenPrice;
    const outputCost = (outputTokens / 1_000_000) * this.PRICING.outputTokenPrice;
    const cachedCost = (cachedTokens / 1_000_000) * this.PRICING.cachedInputPrice;

    return {
      inputCost,
      outputCost,
      cachedCost,
      totalCost: inputCost + outputCost + cachedCost,
      tokensUsed: tokenUsage,
    };
  }

  static recordClaudeRequest(
    promptText: string,
    response: any,
    durationMs: number,
    labels: Record<string, string | undefined> = {}
  ): CostBreakdown {
    const estimatedTokens = this.estimateTokens(promptText);
    const actualUsage = this.parseTokenUsage(response);
    const costs = this.calculateCost(actualUsage);
    const cacheHit = (actualUsage.cachedTokens || 0) > 0;

    const baseLabels = {
      repository: labels.repository || process.env.REPOSITORY || 'unknown',
      mode: labels.mode || (process.argv.includes('--update-cache-mode') ? 'cache-update' : 'fix'),
      cache_hit: cacheHit.toString(),
    };

    // Record token usage
    grafanaMetrics.recordCounter('devagent_tokens_total', actualUsage.inputTokens, {
      ...baseLabels,
      token_type: 'input',
    });

    grafanaMetrics.recordCounter('devagent_tokens_total', actualUsage.outputTokens, {
      ...baseLabels,
      token_type: 'output',
    });

    if (actualUsage.cachedTokens) {
      grafanaMetrics.recordCounter('devagent_tokens_total', actualUsage.cachedTokens, {
        ...baseLabels,
        token_type: 'cached',
      });
    }

    // Record costs
    grafanaMetrics.recordHistogram('devagent_cost_usd', costs.totalCost, baseLabels);

    // Record duration
    grafanaMetrics.recordHistogram('devagent_request_duration_ms', durationMs, baseLabels);

    // Record prompt and response sizes
    grafanaMetrics.recordHistogram('devagent_prompt_size_tokens', estimatedTokens, baseLabels);
    grafanaMetrics.recordHistogram('devagent_response_size_tokens', actualUsage.outputTokens, baseLabels);

    this.logger.info(`Claude request: $${costs.totalCost.toFixed(4)}, ${durationMs}ms, ${actualUsage.inputTokens}+${actualUsage.outputTokens} tokens${cacheHit ? ' (cached)' : ''}`);

    return costs;
  }

  static recordCacheHit(operation: string, hit: boolean, labels: Record<string, string | undefined> = {}): void {
    grafanaMetrics.recordGauge('devagent_cache_hit_rate', hit ? 1 : 0, {
      operation,
      repository: labels.repository || process.env.REPOSITORY || 'unknown',
      ...labels,
    });
  }

  static recordError(errorType: string, labels: Record<string, string | undefined> = {}): void {
    grafanaMetrics.recordCounter('devagent_errors_total', 1, {
      error_type: errorType,
      repository: labels.repository || process.env.REPOSITORY || 'unknown',
      ...labels,
    });
  }

  static recordExecution(operation: string, durationMs: number, success: boolean, labels: Record<string, string | undefined> = {}): void {
    const baseLabels = {
      operation,
      success: success.toString(),
      repository: labels.repository || process.env.REPOSITORY || 'unknown',
      ...labels,
    };

    grafanaMetrics.recordHistogram('devagent_execution_duration_ms', durationMs, baseLabels);
    grafanaMetrics.recordCounter('devagent_operations_total', 1, baseLabels);
  }

  static recordRateLimit(service: string, labels: Record<string, string | undefined> = {}): void {
    grafanaMetrics.recordCounter('devagent_rate_limits_total', 1, {
      service,
      repository: labels.repository || process.env.REPOSITORY || 'unknown',
      ...labels,
    });
  }

  static async shutdown(): Promise<void> {
    await grafanaMetrics.shutdown();
  }
}
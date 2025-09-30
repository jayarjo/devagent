import { AIProvider, IAIProvider, ProviderConfig } from '../types';
import { ClaudeProvider } from './ClaudeProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { Logger } from '../utils/logger';

export class ProviderFactory {
  private static readonly logger = new Logger();

  static createProvider(config: ProviderConfig, logDir: string): IAIProvider {
    switch (config.provider) {
      case AIProvider.CLAUDE:
        return new ClaudeProvider(logDir);
      case AIProvider.GEMINI:
        return new GeminiProvider(logDir);
      case AIProvider.OPENAI:
        return new OpenAIProvider(logDir);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  static detectProvider(): AIProvider {
    // Priority order: Claude > Gemini > OpenAI
    if (process.env.ANTHROPIC_API_KEY) {
      this.logger.info('Using Claude provider (priority 1) via ANTHROPIC_API_KEY');
      return AIProvider.CLAUDE;
    }

    if (process.env.GOOGLE_API_KEY) {
      this.logger.info('Using Gemini provider (priority 2) via GOOGLE_API_KEY');
      return AIProvider.GEMINI;
    }

    if (process.env.OPENAI_API_KEY) {
      this.logger.info('Using OpenAI provider (priority 3) via OPENAI_API_KEY');
      return AIProvider.OPENAI;
    }

    this.logger.warn('No AI provider detected via API keys, defaulting to Claude');
    return AIProvider.CLAUDE;
  }

  static getProviderConfig(): ProviderConfig {
    const envProvider = process.env.AI_PROVIDER?.toLowerCase();

    let provider: AIProvider;
    if (envProvider && Object.values(AIProvider).includes(envProvider as AIProvider)) {
      provider = envProvider as AIProvider;
      this.logger.info(`Using AI provider from AI_PROVIDER environment variable: ${provider}`);
    } else {
      provider = this.detectProvider();
    }

    const config: ProviderConfig = {
      provider,
      model: process.env.AI_MODEL,
    };

    switch (provider) {
      case AIProvider.CLAUDE:
        config.apiKey = process.env.ANTHROPIC_API_KEY;
        break;
      case AIProvider.GEMINI:
        config.apiKey = process.env.GOOGLE_API_KEY;
        break;
      case AIProvider.OPENAI:
        config.apiKey = process.env.OPENAI_API_KEY;
        break;
    }

    return config;
  }

  static async createProviderWithFallback(logDir: string): Promise<{ provider: IAIProvider; config: ProviderConfig }> {
    const primaryConfig = this.getProviderConfig();

    let provider: IAIProvider;
    let config = primaryConfig;

    try {
      provider = this.createProvider(primaryConfig, logDir);
      provider.validateCLI();
      this.logger.info(`Successfully initialized ${primaryConfig.provider} provider`);
      return { provider, config };
    } catch (error) {
      this.logger.warn(`Failed to initialize ${primaryConfig.provider} provider: ${(error as Error).message}`);

      const fallbackProviders = this.getFallbackProviders(primaryConfig.provider);

      for (const fallbackProvider of fallbackProviders) {
        try {
          const fallbackConfig = { ...primaryConfig, provider: fallbackProvider };

          switch (fallbackProvider) {
            case AIProvider.CLAUDE:
              fallbackConfig.apiKey = process.env.ANTHROPIC_API_KEY;
              break;
            case AIProvider.GEMINI:
              fallbackConfig.apiKey = process.env.GOOGLE_API_KEY;
              break;
            case AIProvider.OPENAI:
              fallbackConfig.apiKey = process.env.OPENAI_API_KEY;
              break;
          }

          if (!fallbackConfig.apiKey) {
            this.logger.info(`Skipping ${fallbackProvider} fallback: no API key available`);
            continue;
          }

          provider = this.createProvider(fallbackConfig, logDir);
          provider.validateCLI();

          this.logger.info(`Successfully fell back to ${fallbackProvider} provider`);
          return { provider, config: fallbackConfig };
        } catch (fallbackError) {
          this.logger.warn(`Fallback to ${fallbackProvider} failed: ${(fallbackError as Error).message}`);
        }
      }
    }

    throw new Error(`All AI providers failed to initialize. Available providers: ${Object.values(AIProvider).join(', ')}`);
  }

  private static getFallbackProviders(primaryProvider: AIProvider): AIProvider[] {
    // Maintain priority order: Claude > Gemini > OpenAI
    const priorityOrder = [AIProvider.CLAUDE, AIProvider.GEMINI, AIProvider.OPENAI];
    return priorityOrder.filter(p => p !== primaryProvider);
  }

  static validateProviderAvailability(provider: AIProvider): { available: boolean; reason?: string } {
    switch (provider) {
      case AIProvider.CLAUDE:
        if (!process.env.ANTHROPIC_API_KEY) {
          return { available: false, reason: 'ANTHROPIC_API_KEY not set' };
        }
        break;
      case AIProvider.GEMINI:
        if (!process.env.GOOGLE_API_KEY) {
          return { available: false, reason: 'GOOGLE_API_KEY not set' };
        }
        break;
      case AIProvider.OPENAI:
        if (!process.env.OPENAI_API_KEY) {
          return { available: false, reason: 'OPENAI_API_KEY not set' };
        }
        break;
      default:
        return { available: false, reason: `Unknown provider: ${provider}` };
    }

    return { available: true };
  }

  static listAvailableProviders(): { provider: AIProvider; available: boolean; reason?: string }[] {
    // Return providers in priority order: Claude > Gemini > OpenAI
    const priorityOrder = [AIProvider.CLAUDE, AIProvider.GEMINI, AIProvider.OPENAI];
    return priorityOrder.map(provider => ({
      provider,
      ...this.validateProviderAvailability(provider),
    }));
  }
}
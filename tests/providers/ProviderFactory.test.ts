import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../../src/providers/ProviderFactory';
import { AIProvider } from '../../src/types';

describe('ProviderFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('detectProvider', () => {
    it('should default to Claude when no API keys are present', () => {
      const provider = ProviderFactory.detectProvider();
      expect(provider).toBe(AIProvider.CLAUDE);
    });

    it('should prioritize Claude when all API keys are present', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';

      const provider = ProviderFactory.detectProvider();
      expect(provider).toBe(AIProvider.CLAUDE);
    });

    it('should use Gemini when only Gemini and OpenAI keys are present', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';

      const provider = ProviderFactory.detectProvider();
      expect(provider).toBe(AIProvider.GEMINI);
    });

    it('should use OpenAI when only OpenAI key is present', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const provider = ProviderFactory.detectProvider();
      expect(provider).toBe(AIProvider.OPENAI);
    });

    it('should follow priority order: Claude > Gemini > OpenAI', () => {
      // Test Claude priority
      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(ProviderFactory.detectProvider()).toBe(AIProvider.CLAUDE);

      // Remove Claude, should use Gemini
      delete process.env.ANTHROPIC_API_KEY;
      process.env.GOOGLE_API_KEY = 'test-key';
      expect(ProviderFactory.detectProvider()).toBe(AIProvider.GEMINI);

      // Remove Gemini, should use OpenAI
      delete process.env.GOOGLE_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';
      expect(ProviderFactory.detectProvider()).toBe(AIProvider.OPENAI);
    });
  });

  describe('getProviderConfig', () => {
    it('should respect explicit AI_PROVIDER setting', () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GOOGLE_API_KEY = 'test-key';

      const config = ProviderFactory.getProviderConfig();
      expect(config.provider).toBe(AIProvider.GEMINI);
      expect(config.apiKey).toBe('test-key');
    });

    it('should use auto-detection when AI_PROVIDER is not set', () => {
      process.env.ANTHROPIC_API_KEY = 'claude-key';
      process.env.GOOGLE_API_KEY = 'gemini-key';

      const config = ProviderFactory.getProviderConfig();
      expect(config.provider).toBe(AIProvider.CLAUDE); // Should prioritize Claude
      expect(config.apiKey).toBe('claude-key');
    });

    it('should set correct API key based on provider', () => {
      // Test Claude
      process.env.ANTHROPIC_API_KEY = 'claude-key';
      let config = ProviderFactory.getProviderConfig();
      expect(config.apiKey).toBe('claude-key');

      // Test Gemini
      delete process.env.ANTHROPIC_API_KEY;
      process.env.GOOGLE_API_KEY = 'gemini-key';
      config = ProviderFactory.getProviderConfig();
      expect(config.apiKey).toBe('gemini-key');

      // Test OpenAI
      delete process.env.GOOGLE_API_KEY;
      process.env.OPENAI_API_KEY = 'openai-key';
      config = ProviderFactory.getProviderConfig();
      expect(config.apiKey).toBe('openai-key');
    });
  });

  describe('listAvailableProviders', () => {
    it('should return providers in priority order', () => {
      const providers = ProviderFactory.listAvailableProviders();
      const providerOrder = providers.map(p => p.provider);

      expect(providerOrder).toEqual([
        AIProvider.CLAUDE,
        AIProvider.GEMINI,
        AIProvider.OPENAI
      ]);
    });

    it('should correctly identify available providers', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.GOOGLE_API_KEY = 'test-key';
      // No OpenAI key

      const providers = ProviderFactory.listAvailableProviders();

      expect(providers[0]).toEqual({
        provider: AIProvider.CLAUDE,
        available: true
      });

      expect(providers[1]).toEqual({
        provider: AIProvider.GEMINI,
        available: true
      });

      expect(providers[2]).toEqual({
        provider: AIProvider.OPENAI,
        available: false,
        reason: 'OPENAI_API_KEY not set'
      });
    });
  });

  describe('validateProviderAvailability', () => {
    it('should validate Claude provider correctly', () => {
      // Without API key
      let result = ProviderFactory.validateProviderAvailability(AIProvider.CLAUDE);
      expect(result).toEqual({
        available: false,
        reason: 'ANTHROPIC_API_KEY not set'
      });

      // With API key
      process.env.ANTHROPIC_API_KEY = 'test-key';
      result = ProviderFactory.validateProviderAvailability(AIProvider.CLAUDE);
      expect(result).toEqual({
        available: true
      });
    });

    it('should validate Gemini provider correctly', () => {
      // Without API key
      let result = ProviderFactory.validateProviderAvailability(AIProvider.GEMINI);
      expect(result).toEqual({
        available: false,
        reason: 'GOOGLE_API_KEY not set'
      });

      // With API key
      process.env.GOOGLE_API_KEY = 'test-key';
      result = ProviderFactory.validateProviderAvailability(AIProvider.GEMINI);
      expect(result).toEqual({
        available: true
      });
    });

    it('should validate OpenAI provider correctly', () => {
      // Without API key
      let result = ProviderFactory.validateProviderAvailability(AIProvider.OPENAI);
      expect(result).toEqual({
        available: false,
        reason: 'OPENAI_API_KEY not set'
      });

      // With API key
      process.env.OPENAI_API_KEY = 'test-key';
      result = ProviderFactory.validateProviderAvailability(AIProvider.OPENAI);
      expect(result).toEqual({
        available: true
      });
    });
  });
});
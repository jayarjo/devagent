import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../src/telemetry/costTracker';
import { AIProvider, TokenUsage } from '../../src/types';

describe('CostTracker', () => {
  describe('calculateCost', () => {
    const testUsage: TokenUsage = {
      inputTokens: 1000000, // 1M tokens
      outputTokens: 1000000, // 1M tokens
      cachedTokens: 100000, // 100K tokens
    };

    it('should calculate Claude costs correctly', () => {
      const cost = CostTracker.calculateCost(testUsage, AIProvider.CLAUDE);

      expect(cost.inputCost).toBeCloseTo(3.0); // $3/1M input tokens
      expect(cost.outputCost).toBeCloseTo(15.0); // $15/1M output tokens
      expect(cost.cachedCost).toBeCloseTo(0.03); // $0.30/1M cached tokens * 0.1M
      expect(cost.totalCost).toBeCloseTo(18.03);
      expect(cost.tokensUsed).toEqual(testUsage);
    });

    it('should calculate Gemini costs correctly', () => {
      const cost = CostTracker.calculateCost(testUsage, AIProvider.GEMINI);

      expect(cost.inputCost).toBeCloseTo(1.25); // $1.25/1M input tokens
      expect(cost.outputCost).toBeCloseTo(5.0); // $5/1M output tokens
      expect(cost.cachedCost).toBeCloseTo(0.0); // No cached tokens for Gemini
      expect(cost.totalCost).toBeCloseTo(6.25);
      expect(cost.tokensUsed).toEqual(testUsage);
    });

    it('should calculate OpenAI costs correctly', () => {
      const cost = CostTracker.calculateCost(testUsage, AIProvider.OPENAI);

      expect(cost.inputCost).toBeCloseTo(30.0); // $30/1M input tokens
      expect(cost.outputCost).toBeCloseTo(60.0); // $60/1M output tokens
      expect(cost.cachedCost).toBeCloseTo(0.0); // No cached tokens for OpenAI
      expect(cost.totalCost).toBeCloseTo(90.0);
      expect(cost.tokensUsed).toEqual(testUsage);
    });

    it('should default to Claude pricing when no provider specified', () => {
      const cost = CostTracker.calculateCost(testUsage);
      const claudeCost = CostTracker.calculateCost(testUsage, AIProvider.CLAUDE);

      expect(cost.totalCost).toBeCloseTo(claudeCost.totalCost);
    });

    it('should demonstrate cost savings between providers', () => {
      const claudeCost = CostTracker.calculateCost(testUsage, AIProvider.CLAUDE);
      const geminiCost = CostTracker.calculateCost(testUsage, AIProvider.GEMINI);
      const openaiCost = CostTracker.calculateCost(testUsage, AIProvider.OPENAI);

      // Gemini should be cheapest
      expect(geminiCost.totalCost).toBeLessThan(claudeCost.totalCost);
      expect(geminiCost.totalCost).toBeLessThan(openaiCost.totalCost);

      // Claude should be cheaper than OpenAI
      expect(claudeCost.totalCost).toBeLessThan(openaiCost.totalCost);

      // Calculate savings percentages
      const geminiVsClaudeSavings = ((claudeCost.totalCost - geminiCost.totalCost) / claudeCost.totalCost) * 100;
      const geminiVsOpenAISavings = ((openaiCost.totalCost - geminiCost.totalCost) / openaiCost.totalCost) * 100;

      expect(geminiVsClaudeSavings).toBeGreaterThan(65); // ~65% savings
      expect(geminiVsOpenAISavings).toBeGreaterThan(90); // ~93% savings
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      expect(CostTracker.estimateTokens('')).toBe(0);
      expect(CostTracker.estimateTokens('test')).toBe(1); // 4 chars = 1 token
      expect(CostTracker.estimateTokens('hello world')).toBe(3); // 11 chars = 3 tokens
      expect(CostTracker.estimateTokens('a'.repeat(400))).toBe(100); // 400 chars = 100 tokens
    });
  });

  describe('parseTokenUsage', () => {
    it('should parse Claude response format correctly', () => {
      const claudeResponse = {
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
        },
      };

      const usage = CostTracker.parseTokenUsage(claudeResponse);

      expect(usage).toEqual({
        inputTokens: 1000,
        outputTokens: 500,
        cachedTokens: 200,
      });
    });

    it('should handle missing usage data', () => {
      const emptyResponse = {};
      const usage = CostTracker.parseTokenUsage(emptyResponse);

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      });
    });

    it('should handle partial usage data', () => {
      const partialResponse = {
        usage: {
          input_tokens: 500,
          // missing output_tokens and cache_read_input_tokens
        },
      };

      const usage = CostTracker.parseTokenUsage(partialResponse);

      expect(usage).toEqual({
        inputTokens: 500,
        outputTokens: 0,
        cachedTokens: 0,
      });
    });
  });
});
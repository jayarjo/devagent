import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../src/telemetry/costTracker';

describe('Token Estimation Utils', () => {
  describe('estimateTokens', () => {
    it('should follow the 1 token ≈ 4 characters rule', () => {
      // Basic cases
      expect(CostTracker.estimateTokens('')).toBe(0);
      expect(CostTracker.estimateTokens('test')).toBe(1); // 4 chars = 1 token
      expect(CostTracker.estimateTokens('hello')).toBe(2); // 5 chars = 2 tokens (ceil)
      expect(CostTracker.estimateTokens('hello world')).toBe(3); // 11 chars = 3 tokens (ceil)
    });

    it('should handle typical code snippets correctly', () => {
      const codeSnippet = `function hello() {
  return "world";
}`;
      const expectedTokens = Math.ceil(codeSnippet.length / 4);
      expect(CostTracker.estimateTokens(codeSnippet)).toBe(expectedTokens);
    });

    it('should handle large text blocks', () => {
      const largeText = 'a'.repeat(4000); // 4000 characters
      expect(CostTracker.estimateTokens(largeText)).toBe(1000); // Should be exactly 1000 tokens
    });

    it('should handle edge cases', () => {
      expect(CostTracker.estimateTokens(null as any)).toBe(0);
      expect(CostTracker.estimateTokens(undefined as any)).toBe(0);
      expect(CostTracker.estimateTokens('a')).toBe(1); // 1 char = 1 token (ceil)
      expect(CostTracker.estimateTokens('abc')).toBe(1); // 3 chars = 1 token (ceil)
      expect(CostTracker.estimateTokens('abcd')).toBe(1); // 4 chars = 1 token (exact)
      expect(CostTracker.estimateTokens('abcde')).toBe(2); // 5 chars = 2 tokens (ceil)
    });
  });
});
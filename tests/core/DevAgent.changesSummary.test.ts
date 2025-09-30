import { describe, it, expect, beforeEach } from 'vitest';
import { DevAgent } from '../../src/core/DevAgent';
import { DevAgentMode, AIResponse } from '../../src/types';

describe('DevAgent - Changes Summary Extraction', () => {
  let devAgent: DevAgent;
  const originalEnv = process.env;

  beforeEach(() => {
    // Set up environment for testing
    process.env = {
      ...originalEnv,
      REPOSITORY: 'test/repo',
      ISSUE_NUMBER: '123',
      ISSUE_TITLE: 'Test Issue',
      ISSUE_BODY: 'Test issue description',
      GITHUB_TOKEN: 'test-token',
      ANTHROPIC_API_KEY: 'test-key'
    };

    devAgent = new DevAgent(DevAgentMode.FIX);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('extractChangesSummary', () => {
    it('should extract changes summary from AI response with proper format', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `I have analyzed the issue and made the necessary changes.

CHANGES_SUMMARY:
- Fixed authentication bug in login component
- Updated user validation logic in auth.ts
- Added error handling for invalid credentials
- Refactored password hashing function
END_SUMMARY

The changes should resolve the authentication issues.`
          }
        ]
      };

      // Access the private method using bracket notation for testing
      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(4);
      expect(changesSummary[0]).toBe('Fixed authentication bug in login component');
      expect(changesSummary[1]).toBe('Updated user validation logic in auth.ts');
      expect(changesSummary[2]).toBe('Added error handling for invalid credentials');
      expect(changesSummary[3]).toBe('Refactored password hashing function');
    });

    it('should extract changes summary from multiple messages', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: 'I will start by analyzing the codebase.'
          },
          {
            role: 'assistant',
            content: `I have completed the fixes.

CHANGES_SUMMARY:
- Fixed TypeScript errors in components
- Updated dependencies in package.json
END_SUMMARY`
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(2);
      expect(changesSummary[0]).toBe('Fixed TypeScript errors in components');
      expect(changesSummary[1]).toBe('Updated dependencies in package.json');
    });

    it('should handle multiline bullet points correctly', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `CHANGES_SUMMARY:
- Added new authentication method
  that supports OAuth and JWT tokens
- Fixed database connection issue
- Updated API endpoints:
  - /api/auth/login
  - /api/auth/logout
  - /api/user/profile
END_SUMMARY`
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(6);
      expect(changesSummary[0]).toBe('Added new authentication method\n  that supports OAuth and JWT tokens');
      expect(changesSummary[1]).toBe('Fixed database connection issue');
      expect(changesSummary[2]).toBe('Updated API endpoints:');
      expect(changesSummary[3]).toBe('/api/auth/login');
      expect(changesSummary[4]).toBe('/api/auth/logout');
      expect(changesSummary[5]).toBe('/api/user/profile');
    });

    it('should return empty array when no changes summary found', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: 'I analyzed the code but found no issues to fix.'
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(0);
    });

    it('should return empty array when no messages in response', () => {
      const aiResponse: AIResponse = {
        messages: []
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(0);
    });

    it('should return empty array when messages are undefined', () => {
      const aiResponse: AIResponse = {};

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(0);
    });

    it('should handle malformed summary section gracefully', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `CHANGES_SUMMARY:
Some text without bullet points
- This is a proper bullet point
More text without bullet points
END_SUMMARY`
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(1);
      expect(changesSummary[0]).toBe('This is a proper bullet point\n  More text without bullet points');
    });

    it('should filter out empty bullet points', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `CHANGES_SUMMARY:
- Valid change description
-
-
- Another valid change
-
END_SUMMARY`
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(2);
      expect(changesSummary[0]).toBe('Valid change description');
      expect(changesSummary[1]).toBe('Another valid change');
    });

    it('should handle summary with no END_SUMMARY marker', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `CHANGES_SUMMARY:
- Fixed authentication bug
- Updated validation logic`
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(0); // Should not match without END_SUMMARY
    });

    it('should extract changes from response with extra whitespace', () => {
      const aiResponse: AIResponse = {
        messages: [
          {
            role: 'assistant',
            content: `

CHANGES_SUMMARY:
   - Fixed authentication bug in login component
   -    Updated user validation logic
   - Added error handling for invalid credentials

END_SUMMARY

            `
          }
        ]
      };

      const changesSummary = (devAgent as any).extractChangesSummary(aiResponse);

      expect(changesSummary).toHaveLength(3);
      expect(changesSummary[0]).toBe('Fixed authentication bug in login component');
      expect(changesSummary[1]).toBe('Updated user validation logic');
      expect(changesSummary[2]).toBe('Added error handling for invalid credentials');
    });
  });
});
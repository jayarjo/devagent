import * as fs from 'fs';
import { execSync } from 'child_process';
import { FileRelevanceScore, IssueKeywords } from '../types';
import { FILE_RELEVANCE, SKIP_PATTERNS, INCLUDE_PATTERNS } from '../config/constants';

export class FileRelevanceAnalyzer {
  static extractIssueKeywords(issueTitle: string, issueBody: string): IssueKeywords {
    const text = `${issueTitle} ${issueBody}`.toLowerCase();

    // Extract common programming terms and file references
    const keywords = text.match(/\b[a-zA-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
    const uniqueKeywords = [...new Set(keywords)];

    // Determine issue type
    let type: IssueKeywords['type'] = 'general';
    if (text.includes('bug') || text.includes('error') || text.includes('fail')) type = 'bug';
    else if (text.includes('feature') || text.includes('add')) type = 'feature';
    else if (text.includes('enhance') || text.includes('improve')) type = 'enhancement';
    else if (text.includes('fix')) type = 'fix';

    return {
      terms: uniqueKeywords.slice(0, 10), // Limit to avoid noise
      type,
    };
  }

  static calculateFileRelevance(file: string, keywords: IssueKeywords, issueBody: string): number {
    let score = 0;
    const fileName = file.split('/').pop() || '';
    const fileNameLower = fileName.toLowerCase();

    // File mentioned explicitly in issue
    if (issueBody.toLowerCase().includes(fileName)) {
      score += FILE_RELEVANCE.SCORES.MENTIONED_IN_ISSUE;
    }

    // Keywords match filename or path
    const keywordMatches = keywords.terms.filter(keyword =>
      fileNameLower.includes(keyword.toLowerCase()) || file.toLowerCase().includes(keyword.toLowerCase())
    );
    score += keywordMatches.length * FILE_RELEVANCE.SCORES.KEYWORD_MATCH;

    // File extension relevance based on issue type
    if (this.isRelevantExtension(file, keywords.type)) {
      score += FILE_RELEVANCE.SCORES.RELEVANT_EXTENSION;
    }

    // Recently modified files get a boost
    try {
      const stat = fs.statSync(file);
      const daysSinceModified = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceModified < FILE_RELEVANCE.RECENCY_THRESHOLD_DAYS) {
        score += FILE_RELEVANCE.SCORES.RECENTLY_MODIFIED;
      }
    } catch (error) {
      // File might not exist, ignore
    }

    // Penalty for test files unless it's a test-related issue
    if (!keywords.terms.includes('test') && /\.test\.|\.spec\.|test\/|tests\//.test(file)) {
      score += FILE_RELEVANCE.SCORES.TEST_FILE_PENALTY;
    }

    return Math.max(0, score); // Ensure non-negative
  }

  private static isRelevantExtension(file: string, issueType: IssueKeywords['type']): boolean {
    const ext = file.split('.').pop()?.toLowerCase();

    if (!ext) return false;

    // Language-specific relevance
    const webExtensions = ['js', 'ts', 'jsx', 'tsx', 'css', 'html', 'vue'];
    const backendExtensions = ['py', 'java', 'go', 'rb', 'php', 'cs'];
    const configExtensions = ['json', 'yml', 'yaml', 'toml', 'ini'];

    switch (issueType) {
      case 'bug':
      case 'fix':
        return [...webExtensions, ...backendExtensions].includes(ext);
      case 'feature':
      case 'enhancement':
        return [...webExtensions, ...backendExtensions, ...configExtensions].includes(ext);
      default:
        return [...webExtensions, ...backendExtensions].includes(ext);
    }
  }

  static findRelevantFiles(keywords: IssueKeywords, issueBody: string): string[] {
    try {
      // Get all files in the repository
      const output = execSync('find . -type f -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "*.vue" -o -name "*.css" -o -name "*.html" | head -100', {
        encoding: 'utf8',
        timeout: 10000,
      });

      const files = output.trim().split('\n').filter(Boolean);

      // Calculate relevance scores
      const scoredFiles: FileRelevanceScore[] = files
        .map(file => ({
          file,
          score: this.calculateFileRelevance(file, keywords, issueBody),
          reasons: [], // Could be enhanced to track reasons
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      // Return top relevant files
      return scoredFiles
        .slice(0, FILE_RELEVANCE.MAX_RELEVANT_FILES)
        .map(item => item.file);

    } catch (error) {
      console.warn('Failed to find relevant files:', (error as Error).message);
      return [];
    }
  }

  static isRelevantFileForCache(file: string): boolean {
    // Skip patterns
    if (SKIP_PATTERNS.some(pattern => pattern.test(file))) {
      return false;
    }

    // Include patterns
    return INCLUDE_PATTERNS.some(pattern => pattern.test(file));
  }
}
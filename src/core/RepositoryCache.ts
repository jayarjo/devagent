import * as fs from 'fs';
import * as path from 'path';
import { RepositoryStructure, FileSummary, RepositoryCacheData } from '../types';
import { CACHE_EXPIRY } from '../config/constants';

export class RepositoryCache {
  private readonly repository: string;
  private readonly cacheDir: string;

  constructor(repository: string) {
    this.repository = repository;
    this.cacheDir = '/tmp/devagent-cache';
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  private getCacheFile(name: string): string {
    return path.join(this.cacheDir, `${name}.json`);
  }

  private isExpired(filePath: string, maxAgeMinutes: number): boolean {
    if (!fs.existsSync(filePath)) return true;

    const stat = fs.statSync(filePath);
    const ageMinutes = (Date.now() - stat.mtime.getTime()) / 1000 / 60;
    return ageMinutes > maxAgeMinutes;
  }

  getRepositoryStructure(): RepositoryCacheData | null {
    const cacheFile = this.getCacheFile('repo-structure');

    if (!this.isExpired(cacheFile, CACHE_EXPIRY.REPOSITORY_STRUCTURE)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf8');
        return JSON.parse(data) as RepositoryCacheData;
      } catch (error) {
        console.log(`Cache read error: ${(error as Error).message}`);
      }
    }

    return null;
  }

  saveRepositoryStructure(structure: RepositoryStructure): void {
    const cacheFile = this.getCacheFile('repo-structure');
    const cacheData: RepositoryCacheData = {
      repository: this.repository,
      timestamp: Date.now(),
      structure,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.log(`Cache write error: ${(error as Error).message}`);
    }
  }

  getFileSummaries(): RepositoryCacheData {
    const cacheFile = this.getCacheFile('file-summaries');

    if (!this.isExpired(cacheFile, CACHE_EXPIRY.FILE_SUMMARIES)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf8');
        return JSON.parse(data) as RepositoryCacheData;
      } catch (error) {
        console.log(`Summaries cache read error: ${(error as Error).message}`);
      }
    }

    return { repository: this.repository, timestamp: Date.now(), summaries: {} };
  }

  saveFileSummaries(summaries: Record<string, FileSummary>): void {
    const cacheFile = this.getCacheFile('file-summaries');
    const existing = this.getFileSummaries();
    const merged = { ...existing.summaries, ...summaries };

    const cacheData: RepositoryCacheData = {
      repository: this.repository,
      timestamp: Date.now(),
      summaries: merged,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.log(`Summaries cache write error: ${(error as Error).message}`);
    }
  }

  getIssuePatterns(): RepositoryCacheData {
    const cacheFile = this.getCacheFile('issue-patterns');

    if (!this.isExpired(cacheFile, CACHE_EXPIRY.ISSUE_PATTERNS)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf8');
        return JSON.parse(data) as RepositoryCacheData;
      } catch (error) {
        console.log(`Patterns cache read error: ${(error as Error).message}`);
      }
    }

    return { repository: this.repository, timestamp: Date.now(), patterns: {} };
  }

  saveFileSummary(filePath: string, summary: FileSummary): void {
    const summaries = this.getFileSummaries();
    const currentSummaries = summaries.summaries ?? {};
    currentSummaries[filePath] = summary;
    this.saveFileSummaries(currentSummaries);
  }

  removeFileSummary(filePath: string): void {
    const summaries = this.getFileSummaries();
    if (summaries.summaries?.[filePath]) {
      delete summaries.summaries[filePath];
      this.saveFileSummaries(summaries.summaries);
    }
  }

  saveIssuePattern(issueType: string, relevantFiles: string[]): void {
    const cacheFile = this.getCacheFile('issue-patterns');
    const existing = this.getIssuePatterns();

    const patterns = existing.patterns ?? {};
    patterns[issueType] = relevantFiles;

    const cacheData: RepositoryCacheData = {
      repository: this.repository,
      timestamp: Date.now(),
      patterns,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.log(`Patterns cache write error: ${(error as Error).message}`);
    }
  }
}
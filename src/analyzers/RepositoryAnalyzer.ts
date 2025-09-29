import * as fs from 'fs';
import { execSync } from 'child_process';
import { RepositoryStructure } from '../types';
import { RepositoryCache } from '../core/RepositoryCache';
import { FileRelevanceAnalyzer } from './FileRelevance';
import { Logger } from '../utils/logger';

export class RepositoryAnalyzer {
  private readonly cache: RepositoryCache;
  private readonly logger: Logger;

  constructor(repository: string) {
    this.cache = new RepositoryCache(repository);
    this.logger = new Logger();
  }

  getRepositoryContext(issueTitle?: string, issueBody?: string): RepositoryStructure {
    this.logger.info('Checking for cached repository structure...');

    // Try to get from cache first
    const cached = this.cache.getRepositoryStructure();
    if (cached?.structure) {
      this.logger.info('Using cached repository structure');
      return {
        ...cached.structure,
        relevantFiles: issueTitle && issueBody
          ? this.findRelevantFiles(issueTitle, issueBody)
          : cached.structure.relevantFiles,
        fromCache: true,
      };
    }

    // Build fresh context
    this.logger.info('Building fresh repository context...');
    const structure = this.buildFreshContext(issueTitle, issueBody);

    // Cache the structure (without relevantFiles as they're issue-specific)
    const cacheableStructure = {
      ...structure,
      relevantFiles: [],
      fromCache: false,
    };
    this.cache.saveRepositoryStructure(cacheableStructure);

    return structure;
  }

  private buildFreshContext(issueTitle?: string, issueBody?: string): RepositoryStructure {
    const type = this.detectRepositoryType();
    const mainLanguage = this.detectMainLanguage();
    const directories = this.getKeyDirectories();
    const configFiles = this.getConfigFiles();
    const relevantFiles = issueTitle && issueBody
      ? this.findRelevantFiles(issueTitle, issueBody)
      : [];

    return {
      type,
      mainLanguage,
      directories,
      configFiles,
      relevantFiles,
      fromCache: false,
    };
  }

  private detectRepositoryType(): string {
    // Check for common framework/project indicators
    if (fs.existsSync('package.json')) {
      try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) return 'React App';
        if (pkg.dependencies?.next || pkg.devDependencies?.next) return 'Next.js App';
        if (pkg.dependencies?.express) return 'Express Server';
        if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return 'Vue App';
        if (pkg.type === 'module') return 'ES Module Project';
        return 'Node.js Project';
      } catch (_error) {
        // Invalid package.json
      }
    }

    if (fs.existsSync('requirements.txt') || fs.existsSync('setup.py') || fs.existsSync('pyproject.toml')) {
      return 'Python Project';
    }

    if (fs.existsSync('go.mod')) return 'Go Project';
    if (fs.existsSync('Cargo.toml')) return 'Rust Project';
    if (fs.existsSync('pom.xml') || fs.existsSync('build.gradle')) return 'Java Project';
    if (fs.existsSync('Gemfile')) return 'Ruby Project';

    return 'Generic Project';
  }

  private detectMainLanguage(): string {
    const extensions: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.go': 'Go',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cpp': 'C++',
      '.c': 'C',
      '.rs': 'Rust',
    };

    try {
      const output = execSync('find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "*.cpp" -o -name "*.c" -o -name "*.rs" \\) | head -50', {
        encoding: 'utf8',
        timeout: 5000,
      });

      const files = output.trim().split('\n').filter(Boolean);
      const languageCounts: Record<string, number> = {};

      files.forEach(file => {
        const ext = '.' + file.split('.').pop();
        const language = extensions[ext];
        if (language) {
          languageCounts[language] = (languageCounts[language] || 0) + 1;
        }
      });

      // Return the most common language
      const sortedLanguages = Object.entries(languageCounts)
        .sort(([, a], [, b]) => b - a);

      return sortedLanguages[0]?.[0] || 'Unknown';
    } catch (_error) {
      return 'Unknown';
    }
  }

  private getKeyDirectories(): string[] {
    const commonDirs = ['src', 'lib', 'components', 'pages', 'api', 'routes', 'controllers', 'services'];
    return commonDirs.filter(dir => {
      try {
        return fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
  }

  private getConfigFiles(): string[] {
    const configFiles = [
      'package.json', 'tsconfig.json', 'next.config.js', 'webpack.config.js',
      'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'
    ];
    return configFiles.filter(file => fs.existsSync(file));
  }

  private findRelevantFiles(issueTitle: string, issueBody: string): string[] {
    const keywords = FileRelevanceAnalyzer.extractIssueKeywords(issueTitle, issueBody);
    return FileRelevanceAnalyzer.findRelevantFiles(keywords, issueBody);
  }
}
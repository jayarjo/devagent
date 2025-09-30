# DevAgent - AI-Powered GitHub Issue Resolver

## Overview
DevAgent is a **reusable GitHub Actions workflow** that automatically fixes GitHub issues labeled with `ai-fix` using Claude AI. It's designed as a containerized service that can be integrated into any GitHub repository.

## Core Purpose
- **Automated Issue Resolution**: Analyzes GitHub issues and implements code fixes
- **Intelligent Context Analysis**: Uses repository caching and file relevance scoring to minimize Claude API costs
- **CI/CD Integration**: Creates pull requests and integrates with existing testing workflows

## Architecture

### Main Components
1. **DevAgent Core** (`src/core/DevAgent.ts`)
   - Main orchestration class with two modes: `fix` and `cache-update`
   - Coordinates between all services and analyzers

2. **Repository Analysis** (`src/analyzers/`)
   - `RepositoryAnalyzer`: Detects repo type, main language, key directories
   - `FileRelevance`: Scores files based on issue keywords and relevance

3. **Services** (`src/services/`)
   - `ClaudeService`: Manages Claude CLI interactions with error handling
   - `GitService`: Handles git operations (branch, commit, push)
   - `GitHubService`: Creates pull requests via GitHub API

4. **Caching System** (`src/core/RepositoryCache.ts`)
   - Persistent cache that survives across workflow runs
   - Stores repository structure, file summaries, and issue patterns
   - Uses GitHub Actions cache for 10GB storage with 7-day retention

### Execution Modes
1. **Fix Mode** (default)
   - Triggered by issues with `ai-fix` label
   - Analyzes issue → finds relevant files → runs Claude → creates PR

2. **Cache Update Mode** (`--update-cache-mode`)
   - Triggered on PR merges
   - Incrementally updates cached file summaries
   - Only processes files that actually changed

## Key Features

### Cost Optimization
- **Multi-Provider Support**: Choose between Claude, Gemini, or OpenAI for best pricing
- **Smart Context Collection**: Only includes 20 most relevant files (not 50+)
- **Persistent Caching**: 95%+ cache hit rate with incremental updates
- **Provider-Specific Pricing**: Accurate cost tracking per AI provider
- **Issue Classification**: Different strategies for simple vs complex issues

### Reliability Features
- **Multi-Provider Fallback**: Automatic fallback between AI providers
- **Environment Validation**: Mode-aware validation (fix vs cache-update)
- **Error Handling**: Comprehensive error handling with retry logic
- **Rate Limit Detection**: Detects and handles API rate limiting across providers
- **Git Safety**: Proper branch naming, commit message formatting

## Configuration

### Required Environment Variables
**Fix Mode:**
- `GITHUB_TOKEN` - GitHub API access (auto-provided by Actions)
- At least one AI provider API key:
  - `ANTHROPIC_API_KEY` - Claude API access
  - `GOOGLE_API_KEY` - Gemini API access
  - `OPENAI_API_KEY` - OpenAI API access
- `ISSUE_NUMBER` - GitHub issue number to fix
- `REPOSITORY` - Repository name (owner/repo format)

**Cache Update Mode:**
- `GITHUB_TOKEN` - GitHub API access
- `REPOSITORY` - Repository name
- `CHANGED_FILES` - Path to file listing changed files

### AI Provider Configuration
- `AI_PROVIDER` - Specific provider to use: `claude`, `gemini`, or `openai` (optional, auto-detected)
- `AI_MODEL` - Provider-specific model selection (optional, uses defaults)

### Optional Configuration
- `BASE_BRANCH` - Target branch (default: 'main')
- `GIT_USER_NAME` - Commit author name (default: 'DevAgent')
- `GIT_USER_EMAIL` - Commit author email (default: 'devagent@github-actions.local')

## AI Provider Support

### Supported Providers
1. **Claude (Anthropic)**: $3/$15 per 1M tokens (input/output), best for reasoning
2. **Gemini (Google)**: $1.25/$5 per 1M tokens, fastest and cheapest
3. **OpenAI (ChatGPT)**: $30/$60 per 1M tokens, most expensive but versatile

### Provider Selection Logic
1. **Explicit Selection**: Set `AI_PROVIDER=gemini` to force a specific provider
2. **Auto-Detection**: Automatically detects available API keys in priority order (Claude > Gemini > OpenAI)
3. **Fallback Chain**: If primary provider fails, automatically tries alternatives in priority order
4. **Quality First**: Claude is prioritized by default for superior reasoning and code quality

### Multi-Provider Setup Examples

**Single Provider (Claude):**
```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Multi-Provider with Cost Preference:**
```yaml
env:
  AI_PROVIDER: gemini  # Override default priority for cost optimization
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}        # Forced primary
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # Fallback (priority 1)
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}        # Last resort (priority 2)
```

**Auto-Detection:**
```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # Priority 1 (selected)
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}        # Priority 2 (fallback)
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}        # Priority 3 (last resort)
  # Will auto-select Claude (highest priority available)
```

## Usage Patterns

### Repository Setup
1. Add at least one AI provider API key to repository secrets
2. Create `.github/workflows/devagent-trigger.yml`
3. Configure repository permissions for PR creation
4. Label issues with `ai-fix` to trigger

### Typical Workflow
```
Issue created with 'ai-fix' label
  ↓
DevAgent analyzes issue + repository context
  ↓
Claude generates fix with minimal context
  ↓
Git branch created → changes committed → PR opened
  ↓
CI runs on PR → feedback provided if tests fail
```

## Technical Details

### File Organization
- **TypeScript-first**: Full type safety with proper interfaces
- **Modular Design**: Single responsibility classes
- **Configuration-driven**: Constants file for easy tuning
- **Error Handling**: Comprehensive logging and error recovery

### Caching Strategy
- **Repository Structure**: Cached for 30 minutes (stable data)
- **File Summaries**: Cached for 7 days (updated incrementally)
- **Issue Patterns**: Cached for 1 day (learning patterns)

### Build & Deployment
- **Docker Container**: Self-contained with all dependencies
- **GitHub Container Registry**: Published as `ghcr.io/jayarjo/devagent:latest`
- **Multi-platform**: Supports linux/amd64 and linux/arm64

## Development Guidelines & Standards

### Code Quality Rules
- **No `any` types**: Use proper TypeScript interfaces (enforced by ESLint error)
  - Use `SpawnError` interface for spawn errors instead of `any`
  - Use `RepositoryContext` interface for context objects
  - Define specific interfaces for all data structures
- **No inline imports**: All imports must be at the top of the file
  - ❌ `const fs = require('fs')` inside functions
  - ❌ `const fs = await import('fs')` inline
  - ✅ `import * as fs from 'fs'` at top
- **Comprehensive logging**: Every operation logged with context
- **Error recovery**: Graceful degradation on failures
- **Cost awareness**: Every feature considers Claude API costs

### Type Safety
- All functions have explicit return types
- Error objects properly typed with `SpawnError` interface
- Environment variables validated with proper interfaces
- No unsafe type assertions without proper interfaces

### Code Organization
- Single responsibility per class/module
- Clear separation between services, analyzers, and core logic
- Configuration externalized to constants file
- Utilities kept generic and reusable

## Testing Guidelines & Standards

### Test Structure and Organization

```
tests/
├── providers/           # AI provider tests (ProviderFactory, Claude, Gemini, OpenAI)
├── core/               # Core functionality (DevAgent, RepositoryCache, CostTracker)
├── services/           # Service layer (GitService, GitHubService)
├── analyzers/          # Analysis logic (FileRelevance, RepositoryAnalyzer)
├── utils/              # Utility functions (validators, sanitizers, tokenEstimation)
├── integration/        # End-to-end integration tests
└── fixtures/           # Test data and mocks
```

### Test Writing Standards

#### File Naming
- **Test files**: `{ModuleName}.test.ts`
- **Test helpers**: `{functionality}Helpers.ts`
- **Mock data**: `mock{DataType}.ts`

#### Test Case Structure
```typescript
describe('ModuleName', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for clean tests
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('methodName', () => {
    it('should perform expected behavior when condition met', () => {
      // Arrange
      const input = 'test input';
      const expected = 'expected output';

      // Act
      const result = ModuleName.methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

#### Required Test Categories

1. **Provider Tests** - Test AI provider selection, priority order, and cost calculations
   ```typescript
   it('should prioritize Claude > Gemini > OpenAI in auto-detection', () => {
     process.env.ANTHROPIC_API_KEY = 'key1';
     process.env.GOOGLE_API_KEY = 'key2';
     expect(ProviderFactory.detectProvider()).toBe(AIProvider.CLAUDE);
   });
   ```

2. **Cost Calculation Tests** - Verify provider-specific pricing accuracy
   ```typescript
   it('should calculate Gemini costs 65%+ cheaper than Claude', () => {
     const usage = { inputTokens: 1000000, outputTokens: 1000000, cachedTokens: 0 };
     const claudeCost = CostTracker.calculateCost(usage, AIProvider.CLAUDE);
     const geminiCost = CostTracker.calculateCost(usage, AIProvider.GEMINI);
     const savings = ((claudeCost.totalCost - geminiCost.totalCost) / claudeCost.totalCost) * 100;
     expect(savings).toBeGreaterThan(65);
   });
   ```

3. **Environment Variable Tests** - Test configuration and provider detection
   ```typescript
   it('should fallback to Claude when no API keys present', () => {
     // All API keys deleted in beforeEach
     expect(ProviderFactory.detectProvider()).toBe(AIProvider.CLAUDE);
   });
   ```

4. **Error Handling Tests** - Test graceful failure scenarios
   ```typescript
   it('should throw meaningful error when all providers fail', async () => {
     await expect(ProviderFactory.createProviderWithFallback('/tmp'))
       .rejects.toThrow('All AI providers failed to initialize');
   });
   ```

#### Test Naming Conventions
- **Descriptive**: `should calculate cost correctly for Claude provider`
- **Behavioral**: `should prioritize Claude when all providers available`
- **Conditional**: `should fallback to Gemini when Claude fails`
- **Error cases**: `should throw error when no API key provided`

### Test Commands

```bash
# Development workflow
bun run test          # Watch mode for active development
bun run test:run      # Single run for CI/CD
bun run test:coverage # Coverage analysis (aim for >80% on new code)

# Targeted testing
bun run test:run tests/providers/ProviderFactory.test.ts
bun run test:run --grep "provider priority"
```

### Test Requirements

**Before submitting code:**
1. ✅ All tests pass: `bun run test:run`
2. ✅ Coverage >80% for new code: `bun run test:coverage`
3. ✅ Type checking: `bun run type-check`
4. ✅ Linting: `bun run lint`

**Test Coverage Standards:**
- **Critical paths**: 100% coverage (provider selection, cost calculation)
- **Business logic**: 90%+ coverage
- **Utility functions**: 85%+ coverage
- **Integration points**: Error scenarios must be tested

### Testing Best Practices

1. **Environment Isolation**: Always reset `process.env` in `beforeEach`/`afterEach`
2. **Test One Thing**: Each test should verify a single behavior
3. **Realistic Data**: Use meaningful test data that represents real scenarios
4. **Error Testing**: Test both success and failure paths
5. **Async Testing**: Properly handle promises and async operations
6. **Mock External Dependencies**: Don't make real API calls in tests

### Example Test Patterns

**Provider Priority Testing:**
```typescript
const priorityTests = [
  { keys: ['ANTHROPIC_API_KEY'], expected: AIProvider.CLAUDE },
  { keys: ['GOOGLE_API_KEY'], expected: AIProvider.GEMINI },
  { keys: ['OPENAI_API_KEY'], expected: AIProvider.OPENAI },
];

priorityTests.forEach(({ keys, expected }) => {
  it(`should select ${expected} when only ${keys[0]} available`, () => {
    process.env[keys[0]] = 'test-key';
    expect(ProviderFactory.detectProvider()).toBe(expected);
  });
});
```

**Cost Comparison Testing:**
```typescript
it('should demonstrate accurate cost savings between providers', () => {
  const usage = { inputTokens: 1000000, outputTokens: 1000000, cachedTokens: 0 };
  const costs = {
    claude: CostTracker.calculateCost(usage, AIProvider.CLAUDE),
    gemini: CostTracker.calculateCost(usage, AIProvider.GEMINI),
    openai: CostTracker.calculateCost(usage, AIProvider.OPENAI),
  };

  // Verify cost ordering: Gemini < Claude < OpenAI
  expect(costs.gemini.totalCost).toBeLessThan(costs.claude.totalCost);
  expect(costs.claude.totalCost).toBeLessThan(costs.openai.totalCost);

  // Verify specific savings (Gemini ~65% cheaper than Claude)
  const savings = ((costs.claude.totalCost - costs.gemini.totalCost) / costs.claude.totalCost) * 100;
  expect(savings).toBeCloseTo(65, 1);
});
```

This testing approach ensures DevAgent maintains high quality and reliability as new features are added.

## Common Issues & Solutions
- **Rate Limiting**: Automatic detection with helpful error messages
- **Permission Errors**: Clear documentation for repository setup
- **Large Repositories**: Smart context filtering and file relevance scoring
- **CI Integration**: Proper PR creation with status updates

This is a production-ready system designed for reliability, cost-efficiency, and maintainability.
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
2. **Auto-Detection**: Automatically detects available API keys and chooses the first available
3. **Fallback Chain**: If primary provider fails, automatically tries alternatives
4. **Cost Optimization**: Compare pricing across providers for cost-effective operations

### Multi-Provider Setup Examples

**Single Provider (Claude):**
```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Multi-Provider with Preference:**
```yaml
env:
  AI_PROVIDER: gemini  # Prefer Gemini for cost
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # Fallback
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}        # Last resort
```

**Auto-Detection:**
```yaml
env:
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  # Will auto-select Gemini (first detected)
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

## Common Issues & Solutions
- **Rate Limiting**: Automatic detection with helpful error messages
- **Permission Errors**: Clear documentation for repository setup
- **Large Repositories**: Smart context filtering and file relevance scoring
- **CI Integration**: Proper PR creation with status updates

This is a production-ready system designed for reliability, cost-efficiency, and maintainability.
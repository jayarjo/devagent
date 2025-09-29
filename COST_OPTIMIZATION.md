# DevAgent Cost Optimization Guide

## Overview

DevAgent can consume significant Claude API tokens, especially for large repositories. This guide outlines strategies to reduce costs by 50-70% while maintaining functionality.

## Current Cost Issues

### 1. **Excessive Context Loading**
- Sending entire file tree (50+ files) regardless of issue complexity
- Including irrelevant files in context
- No filtering based on issue keywords or file relevance

### 2. **Inefficient Prompt Structure**
- Large, generic prompts for every issue type
- Redundant instructions in every request
- No distinction between simple vs complex issues

### 3. **No Caching Strategy**
- Repository structure analyzed fresh every time
- No reuse of Claude's understanding across issues
- Missing GitHub Actions cache for persistence

## Cost Optimization Strategies

### 1. **Smart Context Collection** (50-60% cost reduction)

#### **File Filtering by Relevance**
```javascript
// Instead of: find all files
const fileTree = execSync('find . -type f -name "*.js" | head -50');

// Use: filter by issue keywords
const relevantFiles = this.findRelevantFiles(issueBody, issueTitle);
```

#### **Issue-Based File Selection**
- **Bug reports**: Focus on files mentioned in stack traces
- **Feature requests**: Look for related component files
- **UI issues**: Prioritize frontend files
- **API issues**: Focus on backend/route files

#### **Directory Filtering**
```javascript
// Exclude: tests, docs, configs unless relevant
const excludePatterns = [
  'node_modules', '.git', 'test', '__tests__',
  'docs', 'dist', 'build', '.cache'
];
```

### 2. **Two-Phase Execution** (40-50% cost reduction)

#### **Phase 1: Quick Analysis (Minimal Context)**
```javascript
const analysisPrompt = `Analyze this issue and identify which files need changes:
Issue: ${issueTitle}
Description: ${issueBody}
Available files: ${filteredFileList}

Return only: list of relevant files to examine.`;
```

#### **Phase 2: Targeted Implementation**
```javascript
const implementationPrompt = `Fix the issue in these specific files:
${relevantFiles.map(f => `File: ${f}\nContent: ${readFile(f)}`).join('\n')}

Issue: ${issueDescription}
Make minimal, targeted changes.`;
```

### 3. **Prompt Template Optimization** (20-30% cost reduction)

#### **Stable Prefix for Caching**
```javascript
// Cacheable system prompt (90% cost reduction for cached portion)
const SYSTEM_PROMPT = `You are DevAgent, an AI assistant that fixes GitHub issues.

RULES:
- Make minimal, targeted changes
- Follow existing code patterns
- Focus on the specific issue
- Avoid unnecessary modifications

REPOSITORY TYPE: ${repoType}
MAIN LANGUAGE: ${primaryLanguage}
`;

// Variable issue context (not cached)
const issueContext = `
CURRENT ISSUE:
#${issueNumber}: ${issueTitle}
${issueBody}
`;
```

### 4. **Issue Classification** (30-40% cost reduction)

#### **Simple Issues** (Minimal context)
- Typos, small bug fixes, documentation updates
- Context: 5-10 relevant files max
- Single-phase execution

#### **Medium Issues** (Standard context)
- Feature additions, refactoring, multi-file changes
- Context: 15-25 relevant files
- Two-phase execution

#### **Complex Issues** (Full context as needed)
- Architecture changes, large features, system-wide updates
- Context: Full repository as needed
- Multi-phase execution with incremental context

### 5. **Persistent Caching Strategy** (60-90% cost reduction for repeated work)

#### **Persistent Cache Implementation**
**Problem with Traditional Caching**: Using `hashFiles()` invalidates cache on every code change, defeating the purpose for repository insights that remain stable across commits.

**Solution**: Persistent cache that never expires + incremental updates on PR merge.

```yaml
# Main workflow - Always uses persistent cache
- name: Cache DevAgent Repository Insights
  uses: actions/cache@v3
  with:
    path: /tmp/devagent-cache
    key: devagent-${{ github.repository }}-persistent
    restore-keys: |
      devagent-${{ github.repository }}-persistent
```

#### **Cache Update Workflow** (Runs on PR merge)
```yaml
name: 'DevAgent Cache Update'
on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  update-cache:
    if: github.event.pull_request.merged == true
    steps:
    - name: Get changed files
      run: |
        gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/files \
          --jq '.[].filename' > /tmp/changed-files.txt

    - name: Update cache incrementally
      run: node /app/orchestrator.js --update-cache-mode
      env:
        CHANGED_FILES: /tmp/changed-files.txt

    - name: Save updated cache
      uses: actions/cache/save@v3
      with:
        path: /tmp/devagent-cache
        key: devagent-${{ github.repository }}-persistent
```

#### **Repository Structure Caching**
```javascript
{
  "structure": {
    "type": "react-app",
    "framework": "next.js",
    "mainFiles": ["src/app.js", "pages/index.js"],
    "testDir": "tests/",
    "configFiles": ["package.json", "next.config.js"]
  },
  "fileSummaries": {
    "src/auth.js": "Authentication logic, login/logout functions",
    "src/api/users.js": "User CRUD operations and validation"
  },
  "patterns": {
    "authIssues": ["src/auth.js", "middleware/auth.js"],
    "uiIssues": ["components/", "pages/", "styles/"]
  }
}
```

#### **Claude Context Caching**
- Use stable prompt prefixes for automatic API caching
- Reuse conversation context where possible
- Cache file analysis results

#### **Benefits of Persistent Caching**
- **Near 100% cache hit rate**: Cache never invalidated by code changes
- **Incremental updates**: Only processes files that actually changed
- **Event-driven updates**: Updates on meaningful events (PR merge), not every commit
- **Storage efficient**: One persistent entry vs hundreds of invalidated ones
- **Intelligence preservation**: Accumulated repository knowledge grows over time

## Implementation Guidelines

### 1. **File Relevance Scoring**
```javascript
function calculateFileRelevance(file, issue) {
  let score = 0;

  // File mentioned in issue
  if (issue.body.includes(file)) score += 100;

  // Keywords match
  const keywords = extractKeywords(issue);
  if (keywords.some(k => file.includes(k))) score += 50;

  // File extension relevance
  if (isRelevantExtension(file, issue)) score += 25;

  // Recently modified
  if (isRecentlyModified(file)) score += 10;

  return score;
}
```

### 2. **Context Size Budgeting**
```javascript
const CONTEXT_BUDGETS = {
  simple: { maxFiles: 10, maxTokens: 8000 },
  medium: { maxFiles: 20, maxTokens: 16000 },
  complex: { maxFiles: 50, maxTokens: 32000 }
};
```

### 3. **Token Estimation**
```javascript
function estimateTokens(text) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}
```

### 4. **Cost Tracking**
```javascript
class CostTracker {
  logTokenUsage(inputTokens, outputTokens, cached = false) {
    const inputCost = cached ? inputTokens * 0.0003 : inputTokens * 0.003;
    const outputCost = outputTokens * 0.015;
    this.log(`Cost: $${(inputCost + outputCost).toFixed(4)}`);
  }
}
```

## Configuration Options

Add these workflow inputs for cost control:

```yaml
inputs:
  context_mode:
    description: 'Context collection mode'
    type: choice
    options: ['minimal', 'standard', 'full']
    default: 'standard'

  max_files:
    description: 'Maximum files to include in context'
    type: number
    default: 20

  token_budget:
    description: 'Maximum tokens to use (0 = unlimited)'
    type: number
    default: 0

  issue_complexity:
    description: 'Estimated issue complexity'
    type: choice
    options: ['simple', 'medium', 'complex', 'auto']
    default: 'auto'
```

## Expected Results

### **Cost Reduction by Strategy:**
- Smart context collection: 50-60%
- Two-phase execution: 40-50%
- Prompt optimization: 20-30%
- Persistent caching (first run): 60-90%
- Persistent caching (subsequent runs): 95%+
- Issue classification: 30-40%

### **Combined Impact:**
- **Simple issues**: 70-80% cost reduction (first run), 95%+ (cached)
- **Medium issues**: 50-60% cost reduction (first run), 95%+ (cached)
- **Complex issues**: 30-40% cost reduction (first run), 90%+ (cached)
- **All subsequent issues**: 95%+ cost reduction due to persistent cache

### **Additional Benefits:**
- Faster execution due to focused context
- Higher success rate with targeted prompts
- Better debugging with cost tracking
- Scalable to larger repositories

## Monitoring and Tuning

### **Key Metrics to Track:**
1. Tokens per issue (input/output)
2. Cost per successful fix
3. Cache hit rate
4. Average files in context
5. Success rate by complexity

### **Optimization Indicators:**
- High token usage with simple issues → improve classification
- Low cache hit rate → review cache key strategy
- Poor success rate → increase context selectively
- High costs on repeated issues → improve caching

## Future Enhancements

### **Advanced Strategies:**
1. **Embedding-based file search** for semantic relevance
2. **Machine learning classification** for issue complexity
3. **Repository-specific patterns** learning
4. **Cross-repository knowledge sharing**
5. **Dynamic token budgeting** based on issue priority

### **Integration Opportunities:**
1. **GitHub Copilot integration** for code understanding
2. **Repository insights API** for better context
3. **Issue templates** for better classification
4. **Team preferences** for customization

## Conclusion

These optimization strategies can reduce DevAgent costs by 50-70% while maintaining or improving functionality. The key is intelligent context management combined with aggressive caching for repeated work.

Start with the highest-impact changes (smart context collection and caching) and gradually implement additional optimizations based on your specific usage patterns.
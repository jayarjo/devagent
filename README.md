# DevAgent 🤖

AI-powered GitHub agent that automatically fixes issues labeled with `ai-fix` using multiple AI providers (Claude, Gemini, OpenAI).

## Overview

DevAgent is a reusable GitHub Action that:
- Monitors issues labeled `ai-fix`
- Automatically analyzes the codebase and issue description
- Generates and applies fixes using **multiple AI providers** (Claude, Gemini, or OpenAI)
- **Smart provider fallback** with automatic cost optimization
- Creates pull requests with the proposed changes
- Provides CI feedback when tests fail

## Quick Start

### 1. Set up Repository Settings

#### Required GitHub Actions Settings

**For Organization Repositories:**
1. Go to `https://github.com/organizations/YOUR_ORG/settings/actions`
2. Enable "Allow GitHub Actions to create and approve pull requests"
3. Go to your repository Settings → Actions → General
4. Enable "Allow GitHub Actions to create and approve pull requests"

**For Personal Repositories:**
1. Go to your repository Settings → Actions → General
2. Under "Workflow permissions", select "Read and write permissions"
3. Enable "Allow GitHub Actions to create and approve pull requests"

#### Set up Secrets

In your repository, add at least one AI provider API key (Settings → Secrets and variables → Actions):

**Option 1: Single Provider (Claude)**
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude

**Option 2: Multiple Providers (Recommended for reliability and cost optimization)**
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude ($3/$15 per 1M tokens)
- `GOOGLE_API_KEY` - Your Google API key for Gemini ($1.25/$5 per 1M tokens - cheapest!)
- `OPENAI_API_KEY` - Your OpenAI API key for ChatGPT ($30/$60 per 1M tokens)

DevAgent will automatically use the cheapest available provider and fallback to others if needed.

### 2. Create Workflow Files

Create `.github/workflows/devagent-trigger.yml` in your repository:

**Basic setup (single provider):**
```yaml
name: DevAgent Trigger

on:
  issues:
    types: [opened, labeled]

jobs:
  check-ai-fix-label:
    if: contains(github.event.issue.labels.*.name, 'ai-fix')
    permissions:
      contents: write
      pull-requests: write
      issues: read
    uses: jayarjo/devagent/.github/workflows/devagent.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      repository: ${{ github.repository }}
      base_branch: main
      git_user_name: "DevAgent Bot"  # Optional: customize commit author
      git_user_email: "devagent@yourcompany.com"  # Optional: customize commit email
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Multi-provider setup (recommended):**
```yaml
name: DevAgent Trigger

on:
  issues:
    types: [opened, labeled]

jobs:
  check-ai-fix-label:
    if: contains(github.event.issue.labels.*.name, 'ai-fix')
    permissions:
      contents: write
      pull-requests: write
      issues: read
    uses: jayarjo/devagent/.github/workflows/devagent.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      repository: ${{ github.repository }}
      base_branch: main
      ai_provider: "gemini"  # Optional: force specific provider (gemini, claude, openai)
      git_user_name: "DevAgent Bot"
      git_user_email: "devagent@yourcompany.com"
    secrets:
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}        # Preferred (cheapest)
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # Fallback
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}        # Last resort
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Add Cache Update Trigger

To keep the DevAgent cache updated when PRs are merged, add this to your trigger file:

```yaml
name: DevAgent Trigger

on:
  issues:
    types: [opened, labeled]
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  check-ai-fix-label:
    if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'ai-fix')
    permissions:
      contents: write
      pull-requests: write
      issues: read
    uses: jayarjo/devagent/.github/workflows/devagent.yml@main
    with:
      mode: fix
      issue_number: ${{ github.event.issue.number }}
      repository: ${{ github.repository }}
      base_branch: main
      git_user_name: "DevAgent Bot"
      git_user_email: "devagent@yourcompany.com"
    secrets:
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

  update-cache:
    if: github.event_name == 'pull_request' && github.event.pull_request.merged == true
    permissions:
      contents: read
    uses: jayarjo/devagent/.github/workflows/devagent.yml@main
    with:
      mode: cache-update
      repository: ${{ github.repository }}
      pr_number: ${{ github.event.pull_request.number }}
```

### 4. Optional: Add CI Feedback

To get feedback when DevAgent PRs fail CI, create `.github/workflows/devagent-ci-feedback.yml`:

```yaml
name: 'DevAgent CI Feedback'
description: 'Posts feedback comments on DevAgent PRs when CI fails'

on:
  workflow_run:
    workflows: ["CI"]  # Replace with your CI workflow name
    types: [completed]

jobs:
  ci-feedback:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}

    steps:
    - name: Get PR number
      id: pr
      run: |
        # Get PR associated with the workflow run
        PR_NUMBER=$(gh api repos/${{ github.repository }}/pulls \
          --jq ".[] | select(.head.sha == \"${{ github.event.workflow_run.head_sha }}\") | .number")

        if [ -z "$PR_NUMBER" ]; then
          echo "No PR found for commit ${{ github.event.workflow_run.head_sha }}"
          exit 0
        fi

        echo "number=$PR_NUMBER" >> $GITHUB_OUTPUT
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Check if DevAgent PR
      id: check
      run: |
        if [ -n "${{ steps.pr.outputs.number }}" ]; then
          PR_DATA=$(gh api repos/${{ github.repository }}/pulls/${{ steps.pr.outputs.number }})
          BRANCH_NAME=$(echo "$PR_DATA" | jq -r '.head.ref')

          if [[ "$BRANCH_NAME" == ai/issue-* ]]; then
            echo "is_devagent=true" >> $GITHUB_OUTPUT
            echo "branch=$BRANCH_NAME" >> $GITHUB_OUTPUT
          else
            echo "is_devagent=false" >> $GITHUB_OUTPUT
          fi
        fi
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Get workflow run logs
      id: logs
      if: steps.check.outputs.is_devagent == 'true'
      run: |
        # Get failed job logs
        JOBS=$(gh api repos/${{ github.repository }}/actions/runs/${{ github.event.workflow_run.id }}/jobs \
          --jq '.jobs[] | select(.conclusion == "failure") | .id')

        SUMMARY=""
        for job_id in $JOBS; do
          JOB_NAME=$(gh api repos/${{ github.repository }}/actions/jobs/$job_id --jq '.name')
          LOGS=$(gh api repos/${{ github.repository }}/actions/jobs/$job_id/logs 2>/dev/null | tail -20 | head -10)

          SUMMARY+="## Failed Job: $JOB_NAME"$'\n\n'
          SUMMARY+='```'$'\n'
          SUMMARY+="$LOGS"$'\n'
          SUMMARY+='```'$'\n\n'
        done

        # Save to file to handle multiline content
        echo "$SUMMARY" > /tmp/ci_summary.md
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Post CI feedback comment
      if: steps.check.outputs.is_devagent == 'true'
      run: |
        # Build comment body with proper escaping
        cat > /tmp/comment.md << 'EOF'
        ## 🚨 CI Failure Detected

        The automated tests failed for this DevAgent PR. Here's a summary of the failures:

        EOF

        # Append CI summary
        cat /tmp/ci_summary.md >> /tmp/comment.md

        cat >> /tmp/comment.md << EOF

        ### Next Steps
        - The DevAgent may need manual intervention to fix these issues
        - Consider reviewing the test failures and updating the fix accordingly
        - You can trigger a retry by pushing new commits to the \`${{ steps.check.outputs.branch }}\` branch

        ---
        🤖 Posted by DevAgent CI Feedback
        EOF

        gh pr comment ${{ steps.pr.outputs.number }} --body-file /tmp/comment.md
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 5. Use DevAgent

1. Create an issue describing a bug or feature request
2. Add the `ai-fix` label to the issue
3. DevAgent will automatically:
   - Analyze the issue and codebase
   - Create a fix branch (`ai/issue-<number>`)
   - Generate and apply code changes
   - Open a pull request with the fix

## Configuration

### AI Provider Configuration

DevAgent supports multiple AI providers with automatic fallback and cost optimization:

| Provider | Cost (Input/Output per 1M tokens) | Best For | CLI Required |
|----------|-----------------------------------|----------|--------------|
| **Gemini** | $1.25 / $5.00 (cheapest) | Cost optimization, fast responses | `gemini` |
| **Claude** | $3.00 / $15.00 (balanced) | Complex reasoning, code quality | `claude` |
| **OpenAI** | $30.00 / $60.00 (premium) | Advanced capabilities | `codex` |

**Provider Selection Logic:**
1. **Explicit**: Set `ai_provider` workflow input to force a specific provider
2. **Auto-detect**: Automatically uses the first available provider (based on API keys)
3. **Fallback**: If primary provider fails, automatically tries alternatives
4. **Cost-aware**: Prefers cheaper providers when multiple are available

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | Force specific provider: `gemini`, `claude`, `openai` | Auto-detect |
| `AI_MODEL` | Provider-specific model selection | Provider default |
| `GIT_USER_NAME` | Git commit author name | `DevAgent` |
| `GIT_USER_EMAIL` | Git commit author email | `devagent@github-actions.local` |

### Workflow Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `issue_number` | Issue number to fix | Yes | - |
| `repository` | Repository name (owner/repo) | Yes | - |
| `ai_provider` | Force specific AI provider (`gemini`, `claude`, `openai`) | No | Auto-detect |
| `ai_model` | Provider-specific model name | No | Provider default |
| `base_branch` | Base branch for PR | No | `main` |
| `git_user_name` | Git commit author name | No | `DevAgent` |
| `git_user_email` | Git commit author email | No | `devagent@github-actions.local` |

## How It Works

1. **Trigger**: Issue labeled with `ai-fix` triggers the workflow
2. **Provider Selection**: DevAgent selects the best AI provider (Gemini → Claude → OpenAI)
3. **Analysis**: DevAgent analyzes the issue description and codebase structure
4. **Planning**: Selected AI provider creates a plan to fix the issue
5. **Fallback**: If provider fails, automatically tries the next available provider
6. **Implementation**: Changes are made to the codebase following existing patterns
7. **PR Creation**: A pull request is opened with:
   - Title: `[AI Fix] <issue title>`
   - Description linking to the original issue and provider used
   - All changes committed to branch `ai/issue-<number>`
8. **CI Integration**: Your existing CI/CD runs on the PR
9. **Feedback**: If CI fails, DevAgent posts a comment with error details

## Example Issue

```markdown
**Title**: Fix broken user authentication

**Description**:
Users are unable to log in with valid credentials. The login form
returns a 500 error. This appears to be related to the password
hashing function in the authentication service.

**Steps to reproduce**:
1. Go to /login
2. Enter valid username/password
3. Click submit
4. Observe 500 error

**Expected**: User should be logged in successfully
**Actual**: 500 Internal Server Error
```

Add the `ai-fix` label, and DevAgent will:
- Investigate the authentication code
- Identify the password hashing issue
- Fix the bug
- Create a PR with the solution

## Supported Languages

DevAgent works with any codebase but has enhanced support for:
- JavaScript/TypeScript
- Python
- Go
- Java
- C/C++

## Performance & Cost Optimization

DevAgent includes multiple layers of cost optimization:

### Multi-Provider Cost Savings
- **Provider Selection**: Automatically uses cheapest available provider (Gemini at ~84% cost savings vs OpenAI)
- **Smart Fallback**: Falls back to more expensive providers only when needed
- **Provider-Specific Pricing**: Accurate cost tracking per provider for optimization insights

### Intelligent Caching (50-90% cost reduction)
- **Persistent Cache**: Repository insights are cached and incrementally updated
- **Smart Context**: Only includes relevant files based on issue analysis
- **API Caching**: Uses stable prompt prefixes for 90% cost reduction on cached content
- **Incremental Updates**: Cache updates only when code actually changes (via PR merge)

### Cost Comparison Examples
| Provider | 1M Input + 1M Output Tokens | Typical Issue Cost |
|----------|------------------------------|-------------------|
| **Gemini** | $6.25 | $0.31 - $1.25 |
| **Claude** | $18.00 | $0.90 - $3.60 |
| **OpenAI** | $90.00 | $4.50 - $18.00 |

*Using Gemini can save 65-85% compared to Claude and 84-93% compared to OpenAI.*

## Limitations

- **Context Size**: Very large codebases may hit provider context limits (varies by provider)
- **Complex Issues**: Works best with well-defined, specific issues
- **Review Required**: Always review generated code before merging
- **API Costs**: Optimized but still consumes AI provider API credits
- **CLI Dependencies**: Requires provider CLI tools (claude, gemini, codex) in runtime environment

## Best Practices

### Writing Good AI-Fix Issues

1. **Be Specific**: Clearly describe the problem and expected behavior
2. **Provide Context**: Include error messages, stack traces, or relevant code snippets
3. **Include Reproduction Steps**: How to trigger the issue
4. **Scope Appropriately**: Single, focused issues work better than large features

### Example Good Issue:
```markdown
**Bug**: CSV export fails with special characters
- Error: `UnicodeEncodeError` when exporting user data containing émojis
- Location: `src/exports/csv_generator.py` line 45
- Expected: Export should handle all Unicode characters
- Reproduce: Export user "José 🚀" to CSV
```

### Example Poor Issue:
```markdown
**Feature**: Make the app better
- Add more features
- Fix performance
- Improve UI
```

## Security

- DevAgent only has access to repository contents and cannot access external systems
- All commits are clearly marked as AI-generated
- Review all changes before merging
- Use repository secrets for API keys

## Troubleshooting

### Issue: "GitHub Actions is not permitted to create or approve pull requests"
**Solution:** Enable the required repository settings (see setup section above)
- For organizations: Enable at organization level first, then repository level
- For personal repos: Enable in repository Settings → Actions → General
- If the option is grayed out, check higher-level permissions (organization/enterprise)

### Issue: DevAgent didn't trigger
- Check that the `ai-fix` label was added
- Verify workflow file syntax and permissions block
- Check Actions tab for errors

### Issue: No changes made
- Issue may be too vague or complex
- Check DevAgent logs in Actions artifacts
- Try breaking down the issue into smaller parts

### Issue: AI provider failures or timeouts
**Common causes:**
- **Rate limiting**: All providers have usage limits that may cause delays
- **Authentication**: Check your API keys are valid and have sufficient credits
- **Large prompts**: Complex codebases may hit processing limits (varies by provider)
- **Network issues**: Temporary connectivity problems
- **CLI missing**: Provider CLI tools not installed in runner environment

**Solutions:**
- **Multi-provider setup**: Configure multiple providers for automatic fallback
- **Check logs**: Look for provider-specific error messages in Actions logs
- **Verify API keys**: Ensure all configured API keys are valid and funded
- **Provider status**: Check individual provider status pages:
  - Anthropic: [status.anthropic.com](https://status.anthropic.com)
  - Google: [status.cloud.google.com](https://status.cloud.google.com)
  - OpenAI: [status.openai.com](https://status.openai.com)
- **Break down issues**: Split complex problems into smaller, focused issues

### Issue: No provider available
**Error:** "All AI providers failed to initialize"

**Solutions:**
- Ensure at least one API key is configured correctly
- Check API key permissions and credit balances
- Verify CLI tools are available in the runtime environment
- Try with a single provider first to isolate the issue

### Issue: CI failures
- DevAgent will comment on the PR with failure details
- Review the proposed changes manually
- Push additional commits to the AI branch to fix issues

## Contributing

To contribute to DevAgent itself:

1. Fork this repository
2. Make your changes
3. Test with a sample repository
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
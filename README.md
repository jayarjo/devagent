# DevAgent 🤖

AI-powered GitHub agent that automatically fixes issues labeled with `ai-fix` using Claude.

## Overview

DevAgent is a reusable GitHub Action that:
- Monitors issues labeled `ai-fix`
- Automatically analyzes the codebase and issue description
- Generates and applies fixes using Claude AI
- Creates pull requests with the proposed changes
- Provides CI feedback when tests fail

## Quick Start

### 1. Set up Secrets

In your repository, add these secrets (Settings → Secrets and variables → Actions):

- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude
- `GITHUB_TOKEN` - GitHub token with `contents:write` and `pull_requests:write` permissions

### 2. Create Workflow File

Create `.github/workflows/devagent-trigger.yml` in your repository:

```yaml
name: DevAgent Trigger

on:
  issues:
    types: [opened, labeled]

jobs:
  check-ai-fix-label:
    if: contains(github.event.issue.labels.*.name, 'ai-fix')
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

  # Optional: CI feedback workflow
  ci-feedback:
    uses: jayarjo/devagent/.github/workflows/ci-feedback.yml@main
    secrets:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Use DevAgent

1. Create an issue describing a bug or feature request
2. Add the `ai-fix` label to the issue
3. DevAgent will automatically:
   - Analyze the issue and codebase
   - Create a fix branch (`ai/issue-<number>`)
   - Generate and apply code changes
   - Open a pull request with the fix

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GIT_USER_NAME` | Git commit author name | `DevAgent` |
| `GIT_USER_EMAIL` | Git commit author email | `devagent@github-actions.local` |

### Workflow Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `issue_number` | Issue number to fix | Yes | - |
| `repository` | Repository name (owner/repo) | Yes | - |
| `base_branch` | Base branch for PR | No | `main` |
| `git_user_name` | Git commit author name | No | `DevAgent` |
| `git_user_email` | Git commit author email | No | `devagent@github-actions.local` |

## How It Works

1. **Trigger**: Issue labeled with `ai-fix` triggers the workflow
2. **Analysis**: DevAgent analyzes the issue description and codebase structure
3. **Planning**: Claude creates a plan to fix the issue
4. **Implementation**: Changes are made to the codebase following existing patterns
5. **PR Creation**: A pull request is opened with:
   - Title: `[AI Fix] <issue title>`
   - Description linking to the original issue
   - All changes committed to branch `ai/issue-<number>`
6. **CI Integration**: Your existing CI/CD runs on the PR
7. **Feedback**: If CI fails, DevAgent posts a comment with error details

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

## Limitations

- **Context Size**: Very large codebases may hit Claude's context limits
- **Complex Issues**: Works best with well-defined, specific issues
- **Review Required**: Always review generated code before merging
- **API Costs**: Each run consumes Anthropic API credits

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

### Issue: DevAgent didn't trigger
- Check that the `ai-fix` label was added
- Verify workflow file syntax
- Check Actions tab for errors

### Issue: No changes made
- Issue may be too vague or complex
- Check DevAgent logs in Actions artifacts
- Try breaking down the issue into smaller parts

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
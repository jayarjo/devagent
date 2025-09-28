# AI Agent MVP PRD

## Objective

Deliver a minimal viable product (MVP) of an AI-powered GitHub agent that automatically proposes fixes for issues labeled `ai-fix`, creates a PR, and integrates with the repo’s existing CI/CD to validate the changes.

---

## Scope

- **Trigger:** GitHub Actions workflow on new issue creation or label assignment.
- **Clone:** Always fresh checkout (no persistence yet).
- **Agent:** Claude (headless CLI) orchestrated by Node/Python script.
- **Tests:** Run repo’s existing test suite if available; otherwise skip.
- **PR Creation:** Open PR with description, issue reference, and summary.
- **Validation:** Delegate to repo CI/CD.
- **Feedback:** If CI fails, post PR comment with error summary.

---

## Workflow

1. **Issue Event**: New issue with label `ai-fix` triggers workflow.
2. **Checkout**: Action checks out the repo.
3. **Context Extraction**: Gather:
   - Issue body & labels
   - File structure overview
   - Lightweight static context (functions/classes via ripgrep/tree-sitter)

4. **Claude Session**:
   - Parse issue
   - Plan fix
   - Edit code and tests
   - Generate patch

5. **Commit & PR**:
   - Create branch `ai/issue-<num>`
   - Commit changes
   - Open PR with:
     - Title: `[AI Fix] <issue title>`
     - Body: Issue link, description, notes, and TODOs if needed

6. **Repo CI/CD**:
   - Runs on PR automatically
   - Agent does not re-run tests internally for MVP (optional quick lint/test allowed)

7. **CI Feedback Loop**:
   - A second workflow listens for CI results
   - On failure → add PR comment summarizing errors
   - Optional retry dispatch with CI logs as extra context

---

## Components

- **GitHub Action workflows**:
  - `issue-agent.yml`: entrypoint, runs agent container
  - `ci-feedback.yml`: listens for PR CI results, comments on failures

- **Agent Container**:
  - Base: Debian slim + Node LTS + Python + Git
  - Tools: ripgrep, jq, tree-sitter (optional), Claude CLI client
  - Orchestrator: Node/Python script handling payload → prompt → patch → PR

---

## Secrets

- `ANTHROPIC_API_KEY`: for Claude
- `GITHUB_TOKEN`: repo-scoped, permissions `contents:write`, `pull_requests:write`

---

## Deliverables

- Dockerfile for agent container
- `issue-agent.yml` workflow
- `ci-feedback.yml` workflow
- Node/Python orchestrator skeleton
- Prompt templates for planning, execution, and PR creation

---

## Acceptance Criteria

- **AC-1:** Creating/labelling an issue with `ai-fix` triggers PR creation.
- **AC-2:** PR references the original issue and has a structured description.
- **AC-3:** If repo has tests, agent attempts to run them locally before PR (optional).
- **AC-4:** Repo CI/CD runs on PR. If failed, PR gets a comment with error summary.

---

## Out of Scope (MVP)

- Persistent repo caching
- Vector database for memory
- Playwright/browser tests
- Cloud Run deployment
- Advanced retry/replanning

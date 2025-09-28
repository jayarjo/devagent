# AI Agent MVP — Developer Backlog

## Milestone 0 — Project Setup

- [ ] **Create repository** for agent (separate from target repos).
- [ ] **Initialize CI pipeline** for building and publishing Docker image (GitHub Container Registry).
- [ ] **Create base Dockerfile**
  - Debian slim
  - Node LTS + npm/pnpm
  - Python 3.x + pip
  - git, ripgrep, jq
  - Install Claude CLI client

- [ ] **Push initial `:dev` image** to GHCR.

---

## Milestone 1 — GitHub Actions Workflows

### 1. issue-agent.yml

- [ ] Trigger: `issues` (opened or labeled `ai-fix`).
- [ ] Job steps:
  - [ ] Checkout repo (`actions/checkout`).
  - [ ] Run agent container with JSON payload (issue + repo info).
  - [ ] Upload logs as workflow artifacts.

### 2. ci-feedback.yml

- [ ] Trigger: `workflow_run` or `check_suite` for PRs created by agent.
- [ ] Step: Summarize failures (first 5 lines per test) → post PR comment.
- [ ] Optional: dispatch retry event with CI logs.

---

## Milestone 2 — Orchestrator Skeleton

- [ ] **Entry script (Node or Python)**:
  - Parse input payload (issue body, repo info).
  - Build file tree context (using ripgrep/tree-sitter optional).
  - Construct prompts for Claude (planner + executor).
  - Apply patch (via `git apply`).
  - Commit changes, push branch.
  - Open PR with GitHub API.

- [ ] **Error handling**: if failure at any step, log + exit non-zero.
- [ ] **Configurable** via env vars (API keys, repo info).

---

## Milestone 3 — Prompt Templates

- [ ] **Planner prompt**: analyze issue, plan fix strategy.
- [ ] **Executor prompt**: propose code edits as unified diff.
- [ ] **Test prompt**: generate/modify unit test.
- [ ] **PR prompt**: draft PR title & body (include issue reference, notes).

---

## Milestone 4 — GitHub Integration

- [ ] **GitHub API client** in orchestrator.
- [ ] Function to create branch, commit patch, push branch.
- [ ] Function to open PR with structured body.
- [ ] Function to comment on PR (used by `ci-feedback.yml`).

---

## Milestone 5 — Acceptance Tests

- [ ] Seed demo repo with trivial bug + test suite.
- [ ] Label issue `ai-fix` → verify PR created.
- [ ] Ensure PR description includes issue link + change summary.
- [ ] Confirm repo CI runs automatically.
- [ ] Simulate failing CI → verify feedback workflow comments on PR.

---

## Stretch (Optional Post-MVP)

- [ ] Add retry loop using CI logs as context.
- [ ] Quick local test run before PR (optional optimization).
- [ ] Store artifacts (logs, diffs) as GitHub workflow artifacts.

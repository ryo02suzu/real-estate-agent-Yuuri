---
name: executing-plans
description: Execute an explicitly approved multi-step implementation plan within the current MICHILU repository, using existing GitHub branches, regression checks and PR review. Invoke manually when requested.
---

# Executing Plans — MICHILU-compatible edition

> Adapted for MICHILU from Jesse Vincent's Superpowers `executing-plans` Skill (MIT License).
> Source: https://github.com/obra/superpowers/tree/main/skills/executing-plans
> This is a curated adaptation; it does **not** provide or require uninstalled Superpowers subagent, worktree or workspace scripts.

## Authority and scope

1. Read `CLAUDE.md`, `AGENTS.md`, applicable `michilu-*` Skills, the approved plan and its underlying specification. Their current project-specific constraints take precedence over these general techniques, subject to higher-priority instructions.
2. Execute only the work explicitly listed in the plan. Never add the unimplemented globe-to-property animation, cloud services, paid APIs or unrelated features as a side effect.
3. If the user has not approved the plan, present it for review first. Stop before destructive operations, credential handling, new external data transfer, merging to main or publishing unless the request explicitly authorizes them.
4. Run on a dedicated feature branch; do not modify `main` directly. Do not create worktrees or erase existing files unless the user asked for them.

## Setup without missing dependencies

1. Confirm the current repository branch, worktree state and plan filename.
2. Break the plan into numbered small tasks with specific files, expected outputs and checks.
3. Track each task using ordinary Markdown checklist items in the plan, or a small `docs/` progress note if needed. Never run `../subagent-driven-development/scripts/*`, `../using-git-worktrees/*` or other uninstalled helper scripts.
4. Note any plan/spec conflicts and obtain approval if they materially change the requested feature.

## Execute one task at a time

1. Read the current code for the task, including its tests and dependent UI.
2. Implement the smallest change that satisfies the agreed behavior. Do not expand the work's scope.
3. Choose checks based on the change:
   - Logic or bug fix: add an appropriate regression test if feasible, then run the relevant Vitest tests.
   - Pure CSS, copy or spacing change: inspect the real UI at relevant mobile/desktop sizes when a browser is available; explain if real screen testing was unavailable.
   - Always run `npm run lint`, `npm run typecheck` and `npm test` as required by `CLAUDE.md`; run `npm run build` when appropriate.
4. **TDD is not mandatory by default.** Only when the user explicitly invokes `test-driven-development` should strict RED→GREEN and rewrite rules apply. Never delete working UI code just because a test was not written first.
5. Record the actual commands, outcomes and any outstanding risks. Do not mark unrun checks as passing.
6. Make small commits on the working branch as appropriate; do not publish or merge without authorization.

## Review and finish

- Compare the changes with the original plan and MICHILU's invariants: PC appearance, reliable data statuses, official sources, data privacy and license compliance.
- If available, invoke the installed `requesting-code-review` or `verification-before-completion` Skills. A separate reviewer is useful, but do not claim a reviewer ran when none was available.
- Correct verified important findings and rerun affected tests. Record deferred issues.
- Open a PR and report in Japanese: task summary, changed files, checks passed/failed/not run, review limitations and PR link.
- Use `finishing-a-development-branch` only if explicitly invoked; no external cleanup scripts or branch deletion are required here.

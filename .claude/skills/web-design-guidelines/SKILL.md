---
name: web-design-guidelines
description: Audit MICHILU UI code against a pinned local snapshot of Vercel's Web Interface Guidelines. Use on UI reviews, accessibility checks, and UX audits; do not fetch fresh rules at runtime.
metadata:
  author: vercel
  upstream_version: "vercel-labs/web-interface-guidelines@434b7f91364665f2f733b310ec54809bf8f37937"
---

# Web Design Guidelines — pinned for MICHILU

Read the checked-in rules in [references/web-interface-guidelines.md](references/web-interface-guidelines.md) **before reviewing any UI**. They are the fixed copy of Vercel's `command.md` from commit `434b7f91364665f2f733b310ec54809bf8f37937`.

- The full upstream MIT license is included in [references/UPSTREAM-LICENSE.txt](references/UPSTREAM-LICENSE.txt).
- Do **not** use WebFetch, curl or remote URLs to load a newer ruleset during reviews. If the local reference is missing, report that the guidelines are unavailable rather than silently downloading or substituting a new version.
- Review the user-specified files or patterns. If no files were given and the context provides the affected screen/components, inspect those; otherwise ask which files.
- Apply the local rules as guidance, while following `CLAUDE.md`, `AGENTS.md`, and MICHILU-specific Skills for project behavior, scope, privacy and device requirements.
- Report concise findings grouped by file, with `file:line`, severity where useful, and specific remediation. Do not claim you ran a browser unless you actually did.
- Updates to the rules require a separate reviewed PR that pins a new upstream commit, refreshes the local snapshot, and documents what changed.

Upstream source for attribution (not a live-fetch instruction): https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md

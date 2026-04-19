---
name: describe-pr
description: Generate PR descriptions and commit message suggestions based on staged/unstaged git changes. Use when the user invokes /describe-pr or asks to generate a PR description, commit message, or both.
---

# Describe PR

Generate a PR description and suggest a conventional commit message based on current git changes.

## When to Use

- User invokes `/describe-pr`
- User asks to generate a PR description or commit suggestion

## Instructions

Follow these steps in order:

### Step 1: Gather git context

Run these commands in parallel using Bash:

1. `git status` — see staged and unstaged files
2. `git diff --cached` — see staged changes (priority)
3. `git diff` — see unstaged changes (if nothing is staged, use these)
4. `git log --oneline -10` — recent commits for style reference
5. `git branch --show-current` — current branch name

### Step 2: Determine the change scope

- If there are **staged** changes (`git diff --cached`), use those as the source of truth.
- If **nothing is staged**, use unstaged changes (`git diff`) and untracked files from `git status`.
- Read the changed files if the diff alone is not enough to understand the intent.

### Step 3: Analyze the changes

Identify:

- **What** changed (new feature, bug fix, refactor, chore, etc.)
- **Why** (infer from code context, branch name, or commit history)
- **How** (approach taken — skip if obvious from the diff)
- **UI changes** (if any `.tsx` component rendering changed, note that screenshots may be needed)

### Step 4: Generate the PR description

Use this exact template format:

```markdown
## What

<!-- One-liner describing what this PR does -->

## Why

<!-- Context: why is this change needed? -->

## How

<!-- Brief description of the approach. "N/A" if obvious from the diff. -->

## Screenshots

<!-- "N/A — no UI changes" OR "TODO: add screenshots" if UI changed -->
```

Rules for the description:

- **What**: One clear sentence. Start with a verb (Add, Fix, Refactor, Update, Remove).
- **Why**: 1-2 sentences with context. Reference issue/ticket if branch name contains one.
- **How**: Skip or write "N/A" if the approach is obvious. Otherwise 1-3 bullet points.
- **Screenshots**: Write "N/A — no UI changes" if no visual changes. Write "TODO: add screenshots" if `.tsx` rendering logic changed.
- Write in English.
- Be concise — no filler.

### Step 5: Suggest a commit message

Based on the same analysis, suggest a conventional commit message:

- Format: `<type>: <description>` (lowercase, imperative mood, no period)
- Types: `feat`, `fix`, `chore`, `refactor`
- If the change spans multiple concerns, suggest separate commits

### Step 6: Present the output

Present the output clearly with two sections:

1. **PR Description** — the filled template in a markdown code block so the user can copy it
2. **Suggested commit message(s)** — the commit message(s) in a code block

If the user passes arguments (e.g., `/describe-pr --commit-only`), adapt:

- `--commit-only` — only suggest commit message, skip PR description
- `--pr-only` — only generate PR description, skip commit suggestion

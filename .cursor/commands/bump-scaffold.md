# Bump Scaffold

Roll the scaffold forward to the next monthly name, including the package name, GitHub repo, and local folder.

## Instructions for AI

This command is for scaffold maintainers only. It performs a real repository rename workflow, so always preview the exact plan before making changes.

## Prerequisites

- The current repo must be the scaffold, not a derived project
- `gh` CLI must be installed and authenticated (`gh auth status`)
- The user should already have the renamed folder added to Cursor or be ready to reopen it after the command finishes

## Steps

1. **Confirm this is the scaffold repo**
   - Read `package.json` and check that the `name` starts with `scaffold-`
   - Check that the current folder name also starts with `scaffold-`
   - If either check fails, stop and explain that `/bump-scaffold` only applies to the monthly scaffold repo

2. **Check branch and worktree state**
   - Run `git branch --show-current`
   - Run `git status --porcelain`
   - If the branch is not `main`, tell the user they need to start from `main`
   - If the worktree is dirty, tell the user to commit or stash changes before continuing

3. **Confirm GitHub access**
   - Run `gh auth status`
   - If it fails, stop and ask the user to run `gh auth login`

4. **Detect the current scaffold name and suggest the next one**
   - Read the current scaffold name from `package.json`
   - Use that value to suggest the next monthly name by incrementing the month portion
   - Let the user override the suggested target if they want a different scaffold name

5. **Ask how far the command should go**
   - Ask whether to stop after creating the PR or to wait for CI and merge automatically
   - Use the safe default of stopping after the PR unless the user explicitly wants auto-merge

6. **Run the mandatory dry-run first**
   - Run:
     ```bash
     pnpm run bump:scaffold -- --dry-run --new-name "<target-name>"
     ```
   - If the user chose auto-merge, include `--merge-after-ci`
   - Show the dry-run summary to the user
   - Do not proceed until the user confirms the exact target name, repo rename, branch name, and local path rename

7. **Run the real bump**
   - Run the same command again without `--dry-run`
   - Example:
     ```bash
     pnpm run bump:scaffold -- --new-name "<target-name>" --merge-after-ci
     ```
   - The helper script will:
     - create the branch
     - update known scaffold references
     - commit the rename
     - rename the GitHub repo
     - update `origin`
     - push and create the PR
     - optionally wait for CI and merge
     - rename the local folder last

8. **Close out clearly**
   - Tell the user the PR URL, the new GitHub repo URL, and the new local path
   - Remind them that Cursor tabs, terminals, and watchers may still point at the old path
   - Tell them to switch to the renamed folder in Cursor before doing any more work

## Important Reminders

- Never skip the dry-run
- Never run the real command until the user confirms the preview
- Treat the local folder rename as the final step
- If the script reports leftover references to the old scaffold name, stop and fix those before retrying

## Tone

Be careful and explicit. This command rewires git, GitHub, and the local path, so the user should always know what will happen before it happens.

# Update - Get Latest Scaffold Changes

Pull the latest updates from the main scaffold repository.

## Instructions for AI

This command helps users get the latest improvements and fixes from the scaffold template without having to remember git commands.

## Steps

1. **First, check if this is a scaffold project or a derived project**

   - If working in the original scaffold (folder name contains "scaffold"):
     - Pull latest from origin
   - If working in a derived project:
     - This command may not apply - explain this to the user

2. **Check for uncommitted changes first**:

   ```bash
   git status --porcelain
   ```

   If there are uncommitted changes, warn the user:

   ***

   ⚠️ **You have uncommitted changes!**

   Before updating, you should either:
   - Commit your changes: Type `/commit` to save your work
   - Or stash them temporarily (I can help with that)

   Would you like me to help you commit first, or proceed anyway?

   ***

3. **If clean (or user confirms), pull latest changes**:

   ```bash
   git pull origin main
   ```

4. **After pulling, check if dependencies need updating**:

   ```bash
   git diff HEAD@{1} --name-only | grep -E "(package.json|pnpm-lock.yaml)"
   ```

   If package files changed, suggest running setup:

   ***

   📦 **Dependencies may have changed!**

   Run `/setup` to install any new or updated packages.

   ***

5. **Display success message**:

   ***

   ## ✅ Updated successfully!

   Your scaffold is now up to date with the latest changes.

   **What's next?**
   - If dependencies changed, run `/setup`
   - Otherwise, you're good to go!

   ***

## Error Handling

### If not a git repository:

```
❌ This folder isn't connected to git.

If this is a new project you created with `/new-project`, it won't receive scaffold updates (which is normal - it's your own project now!)

If you want to update the original scaffold template, open that folder in Cursor first.
```

### If merge conflicts occur:

```
⚠️ There are merge conflicts that need to be resolved.

This happens when you've modified files that were also changed in the update.

Would you like me to help you resolve these conflicts?
```

### If no remote configured:

```
❌ No remote repository configured.

This project doesn't have a connection to the scaffold repository.
```

## Tone

Be helpful and reassuring. Updates can feel scary for non-technical users, so explain what's happening in simple terms. If something goes wrong, offer to help fix it.

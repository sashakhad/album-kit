# Create New Project

Create a fresh copy of this scaffold as a new project, with its own private GitHub repo under either the user's GitHub account or an accessible organization.

## Instructions for AI

**IMPORTANT: Always ask for the project name first before doing anything else!**

## Prerequisites

- `gh` CLI must be installed and authenticated (`gh auth status`)
- If not authenticated, instruct the user to run `gh auth login` first
- The authenticated GitHub account must have permission to create repositories in the selected destination account or organization
- If expected organizations or teams do not appear, the user may need to refresh `gh` permissions with `gh auth refresh -s read:org`

## Steps

1. **Ask for project name FIRST** - Display this prompt:

   ***

   ## Let's create your new project!

   **What would you like to name your project?**

   Some tips for a good name:
   - Use lowercase letters
   - Use dashes instead of spaces (e.g., `my-cool-app`)
   - Keep it short and memorable
   - Examples: `todo-app`, `my-portfolio`, `awesome-project`

   **Type your project name below:**

   ***

   **WAIT for the user to respond with a name before proceeding!**

2. **Validate the project name** when user provides it:
   - If name has spaces, convert to dashes and confirm: "I'll use `{converted-name}` - is that okay?"
   - If name has uppercase, convert to lowercase and confirm
   - If name has special characters (except dashes), ask them to choose a different name

3. **Ask where to create it locally** (optional):
   - Default: parent directory of current project
   - Ask: "I'll create this in `{parent-directory}`. Is that okay, or would you like a different location?"

4. **Ask where to create the GitHub repo**:
   - First verify GitHub authentication:
     ```bash
     gh auth status
     ```
   - Get the authenticated user's login:
     ```bash
     gh api user --jq .login
     ```
   - Get organizations available to the authenticated user:
     ```bash
     gh api user/orgs --paginate --jq '.[].login'
     ```
   - Present the options clearly:
     - Personal account: `<github-username>/<project-name>`
     - Each available organization: `<org-login>/<project-name>`
   - Ask: "Where should I create the private GitHub repo?"
   - If no organizations are returned, explain that the project can be created under the personal account unless they authenticate with an account that has org access or refresh `gh` permissions with `gh auth refresh -s read:org`.
   - Explain that the org list shows accessible organizations, but the final repo creation still depends on that org allowing the user to create repositories.
   - If the user selects an organization, optionally ask whether a GitHub team should get access:
     - List available teams with:
       ```bash
       gh api orgs/<org-login>/teams --paginate --jq '.[].slug'
       ```
     - If the team list command fails, continue without a team and mention that the org may require additional `gh` permissions such as `read:org`.
     - If the user selects a team, remember the team slug for the repo creation command.

5. **Copy the scaffold** - Run this command:

   ```bash
   cp -r "$(pwd)" "<destination>/<project-name>"
   ```

6. **Clean up the new project** (keep `pnpm-lock.yaml` for reproducible installs):

   ```bash
   cd "<destination>/<project-name>"
   rm -f .cursor/commands/new-project.md
   rm -f .cursor/commands/update.md
   rm -f .cursor/commands/bump-scaffold.md
   rm -f .cursor/rules/scaffold-protection.mdc
   rm -rf node_modules .git package-lock.json
   rm -f scripts/bump-scaffold.sh
   rmdir scripts 2>/dev/null || true
   ```

   **Do not delete `pnpm-lock.yaml`.** Derived projects should install from the same lockfile the scaffold ships.

7. **Update copied scaffold metadata**:
   - Change the `"name"` field in `package.json` to the new project name
   - Remove the `"bump:scaffold"` script from `package.json`
   - Update `.cursor/commands/help.md` to remove `/new-project`, `/update`, and `/bump-scaffold` sections plus any scaffold-maintainer workflow text
   - If the copied project keeps the starter `README.md`, remove scaffold-only command references there as well
   - Make sure the new project does not advertise scaffold-only maintenance commands or include scaffold-protection prompts

8. **Initialize fresh git repo**:

   ```bash
   git init
   git add .
   git commit -m "Initial commit from scaffold"
   ```

9. **Create a private GitHub repo and push**:
   - For a personal repo:
     ```bash
     gh repo create <github-username>/<project-name> --private --source . --push
     ```
   - For an organization repo:
     ```bash
     gh repo create <org-login>/<project-name> --private --source . --push
     ```
   - For an organization repo with team access:
     ```bash
     gh repo create <org-login>/<project-name> --private --team <team-slug> --source . --push
     ```
   - This creates a private repo, sets it as `origin`, and pushes the initial commit
   - If the repo name is already taken, append a suffix or ask the user for an alternative
   - Do **not** run `vercel deploy` or create a Vercel project as part of `/new-project`

10. **Display success message**:

For a personal repo, use:

```bash
https://github.com/<github-username>/<project-name>
```

For an organization repo, use:

```bash
https://github.com/<org-login>/<project-name>
```

---

## Your new project "{project-name}" is ready!

**Project location:** `<full-path-to-new-project>`
**GitHub repo:** `<github-repo-url>`

### Next Steps

1.  **Open your new project in Cursor:**
    - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
    - Type "Open Folder" and select it
    - Navigate to: `<full-path-to-new-project>`
    - Click "Open"
    - Important: keep working from this new folder, not the scaffold folder

2.  **Once you're in the new project, run `/setup`** to install dependencies

3.  **Then run `/start`** to launch your app!

**No Vercel deployment was created.** This only created a local project and private GitHub repo.

---

## Important Reminders

- **DO NOT proceed without getting a project name from the user first**
- Wait for user input at step 1 before running any commands
- Make sure to use the exact name the user provides (after validation/conversion)
- The GitHub repo is always created as **private** by default
- Always ask whether the repo should be created under the personal GitHub account or an accessible organization
- Always keep `pnpm-lock.yaml` when copying the scaffold
- Make it very clear that the user must open the new project folder in Cursor after creation
- Do not deploy to Vercel from this command

## Tone

Be helpful and encouraging! Creating a new project is exciting. Guide them through each step clearly and celebrate when it's done.

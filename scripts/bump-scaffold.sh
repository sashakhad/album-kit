#!/usr/bin/env bash

set -euo pipefail

function usage() {
  cat <<'EOF'
Usage: bump-scaffold.sh [options]

Safely bump the scaffold's monthly name across package metadata, GitHub, and the
local folder.

Options:
  --dry-run           Show the planned rename without changing anything
  --merge-after-ci    Wait for required PR checks and merge automatically
  --old-name NAME     Override the detected current scaffold name
  --new-name NAME     Set the target scaffold name (defaults to next month)
  -h, --help          Show this help text

Examples:
  pnpm run bump:scaffold -- --dry-run
  pnpm run bump:scaffold -- --new-name <next-scaffold-name>
  pnpm run bump:scaffold -- --new-name <next-scaffold-name> --merge-after-ci
EOF
}

function log() {
  printf '[bump-scaffold] %s\n' "$*"
}

function fail() {
  printf '[bump-scaffold] %s\n' "$*" >&2
  exit 1
}

function require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

function validate_scaffold_name() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^scaffold-[0-9]{4}\.[0-9]{2}$ ]]; then
    fail "$label must match scaffold-YYYY.MM, got: $value"
  fi
}

function next_month_name() {
  local current_name="$1"
  local version="${current_name#scaffold-}"
  local year="${version%%.*}"
  local month="${version##*.}"
  local next_year
  local next_month

  next_year=$((10#$year))
  next_month=$((10#$month + 1))

  if ((next_month > 12)); then
    next_month=1
    next_year=$((next_year + 1))
  fi

  printf 'scaffold-%04d.%02d' "$next_year" "$next_month"
}

function read_package_name() {
  local file_path="$1"

  node -e "
    const fs = require('node:fs');
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    process.stdout.write(String(pkg.name || ''));
  " "$file_path"
}

function update_package_name() {
  local file_path="$1"
  local target_name="$2"

  node -e "
    const fs = require('node:fs');
    const filePath = process.argv[1];
    const targetName = process.argv[2];
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    pkg.name = targetName;
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
  " "$file_path" "$target_name"
}

function replace_literal_in_file() {
  local file_path="$1"
  local from_value="$2"
  local to_value="$3"

  node -e "
    const fs = require('node:fs');
    const filePath = process.argv[1];
    const fromValue = process.argv[2];
    const toValue = process.argv[3];
    const contents = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, contents.split(fromValue).join(toValue));
  " "$file_path" "$from_value" "$to_value"
}

function print_summary() {
  local ready_for_run="$1"
  shift
  local reasons=("$@")

  cat <<EOF
Planned scaffold bump
- current_branch: $current_branch
- worktree_clean: $worktree_clean
- current_package_name: $package_name
- current_folder_name: $folder_name
- current_repo_name: $repo_name
- target_name: $new_name
- branch_name: $branch_name
- current_repo_url: $repo_url
- target_repo_url: $target_repo_web_url
- target_origin_url: $new_origin_url
- current_path: $repo_dir
- target_path: $new_repo_dir
- merge_after_ci: $merge_after_ci
- files_to_update:
  - package.json
  - .cursor/rules/scaffold-protection.mdc
- ready_for_run: $ready_for_run
EOF

  if ((${#reasons[@]} > 0)); then
    printf 'Blocking reasons:\n'
    local reason
    for reason in "${reasons[@]}"; do
      printf '  - %s\n' "$reason"
    done
  fi
}

function print_summary_with_blocking_reasons() {
  local ready_for_run="$1"

  if ((${#blocking_reasons[@]} > 0)); then
    print_summary "$ready_for_run" "${blocking_reasons[@]}"
    return
  fi

  print_summary "$ready_for_run"
}

function assert_no_leftover_references() {
  local source_name="$1"
  local matches

  matches="$(git grep -n --fixed-strings -- "$source_name" || true)"

  if [[ -n "$matches" ]]; then
    printf '%s\n' "$matches" >&2
    fail "Unexpected references to $source_name remain after the rewrite"
  fi
}

dry_run=false
merge_after_ci=false
old_name=""
new_name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --merge-after-ci)
      merge_after_ci=true
      shift
      ;;
    --old-name)
      [[ $# -ge 2 ]] || fail "Missing value for --old-name"
      old_name="$2"
      shift 2
      ;;
    --new-name)
      [[ $# -ge 2 ]] || fail "Missing value for --new-name"
      new_name="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_command git
require_command gh
require_command node
require_command pnpm

repo_dir="$(pwd -P)"
parent_dir="$(dirname "$repo_dir")"
folder_name="$(basename "$repo_dir")"
package_json="$repo_dir/package.json"
rule_file="$repo_dir/.cursor/rules/scaffold-protection.mdc"
status_porcelain="$(git status --porcelain)"
current_branch="$(git branch --show-current)"
worktree_clean="yes"

[[ -f "$package_json" ]] || fail "package.json not found at $package_json"

if [[ -n "$status_porcelain" ]]; then
  worktree_clean="no"
fi

gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated. Run gh auth login first."

package_name="$(read_package_name "$package_json")"
[[ -n "$package_name" ]] || fail "Unable to read the package name from package.json"

if [[ -z "$old_name" ]]; then
  old_name="$package_name"
fi

validate_scaffold_name "$old_name" "old-name"

if [[ -z "$new_name" ]]; then
  new_name="$(next_month_name "$old_name")"
fi

validate_scaffold_name "$new_name" "new-name"
[[ "$new_name" != "$old_name" ]] || fail "The new scaffold name must differ from the current name"

repo_name="$(gh repo view --json name --jq '.name')"
repo_owner="$(gh repo view --json owner --jq '.owner.login')"
repo_url="$(gh repo view --json url --jq '.url')"
repo_slug="$repo_owner/$repo_name"
version_label="${new_name#scaffold-}"
branch_name="chore/bump-scaffold-${version_label//./-}"
commit_subject="chore(scaffold): bump scaffold to ${version_label}"
pr_title="Bump scaffold to ${version_label}"
new_repo_dir="$parent_dir/$new_name"

target_repo_web_url="https://github.com/${repo_owner}/${new_name}"

if [[ "$(git remote get-url origin)" == git@github.com:* ]]; then
  new_origin_url="git@github.com:${repo_owner}/${new_name}.git"
else
  new_origin_url="https://github.com/${repo_owner}/${new_name}.git"
fi

ready_for_run="yes"
blocking_reasons=()

if [[ "$current_branch" != "main" ]]; then
  ready_for_run="no"
  blocking_reasons+=("Current branch must be main for the real run.")
fi

if [[ "$worktree_clean" != "yes" ]]; then
  ready_for_run="no"
  blocking_reasons+=("Worktree must be clean for the real run.")
fi

if [[ "$package_name" != "$old_name" ]]; then
  ready_for_run="no"
  blocking_reasons+=("package.json name ($package_name) does not match the expected current scaffold name ($old_name).")
fi

if [[ "$folder_name" != "$old_name" ]]; then
  ready_for_run="no"
  blocking_reasons+=("Current folder name ($folder_name) does not match the expected current scaffold name ($old_name).")
fi

if [[ "$repo_name" != "$old_name" ]]; then
  ready_for_run="no"
  blocking_reasons+=("GitHub repository name ($repo_name) does not match the expected current scaffold name ($old_name).")
fi

if [[ -e "$new_repo_dir" ]]; then
  ready_for_run="no"
  blocking_reasons+=("Target folder already exists: $new_repo_dir")
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  ready_for_run="no"
  blocking_reasons+=("Local branch already exists: $branch_name")
fi

if $dry_run; then
  print_summary_with_blocking_reasons "$ready_for_run"
  exit 0
fi

if [[ "$ready_for_run" != "yes" ]]; then
  print_summary_with_blocking_reasons "$ready_for_run"
  fail "Dry-run reported blocking issues. Fix them before running the real bump."
fi

log "Pulling the latest main branch."
git pull --ff-only origin main

log "Creating branch $branch_name."
git checkout -b "$branch_name"

log "Updating tracked scaffold references."
update_package_name "$package_json" "$new_name"

if [[ -f "$rule_file" ]]; then
  replace_literal_in_file "$rule_file" "$old_name" "$new_name"
fi

assert_no_leftover_references "$old_name"

git add -- "$package_json"

if [[ -f "$rule_file" ]]; then
  git add -- "$rule_file"
fi

git diff --cached --quiet && fail "No staged changes found after rewriting scaffold references."

log "Creating commit."
git commit -m "$commit_subject" -m "Align the scaffold package name, example scaffold path, GitHub repository, and local folder with the ${version_label} monthly version."

log "Renaming GitHub repository to $new_name."
gh api -X PATCH "repos/$repo_slug" -f "name=$new_name" >/dev/null

log "Updating origin to $new_origin_url."
git remote set-url origin "$new_origin_url"

log "Pushing branch."
git push -u origin HEAD

pr_body="$(cat <<EOF
## Summary
- bump the scaffold name from \`$old_name\` to \`$new_name\`
- update in-repo scaffold metadata before renaming the GitHub repo and local folder
- keep the monthly scaffold rename in its own PR

## Test plan
- [ ] GitHub CI
EOF
)"

log "Creating pull request."
pr_url="$(gh pr create --base main --title "$pr_title" --body "$pr_body")"
pr_number="$(gh pr view --json number --jq '.number')"

if $merge_after_ci; then
  log "Waiting for required PR checks to pass."
  gh pr checks "$pr_number" --watch --required --fail-fast

  log "Merging pull request #$pr_number."
  gh pr merge "$pr_number" --squash --delete-branch

  log "Syncing local main branch."
  git checkout main
  git pull --ff-only origin main
fi

log "Renaming local folder to $new_repo_dir."
cd "$parent_dir"
mv "$repo_dir" "$new_repo_dir"

cat <<EOF
Scaffold bump complete.
- pull_request: $pr_url
- repository_url: https://github.com/$repo_owner/$new_name
- local_path: $new_repo_dir
- merged_after_ci: $merge_after_ci

Open or focus the renamed folder in Cursor before continuing work.
EOF

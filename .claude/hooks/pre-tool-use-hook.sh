#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [ "$TOOL_NAME" != "Bash" ]; then exit 0; fi
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then exit 0; fi

DEFAULT_ALLOWED_COMMANDS=(
  # git
  "git status" "git add" "git commit" "git push" "git pull" "git fetch"
  "git checkout" "git switch" "git branch" "git diff" "git log"
  "git stash" "git merge" "git rebase"
  # gh
  "gh pr create" "gh pr view" "gh pr merge" "gh pr list" "gh api" "gh auth status"
  # TypeScript / JavaScript
  "tsc --noEmit" "tsc -p" "eslint" "prettier --check" "vitest" "jest"
  # file system
  "ls" "cat" "wc" "which" "command -v"
  "mkdir -p" "cp" "mv"
  # pnpm
  "pnpm test" "pnpm run lint" "pnpm run build" "pnpm run typecheck" "pnpm run format"
  # cargo
  "cargo build" "cargo check" "cargo test" "cargo clippy" "cargo fmt"
  "cargo run" "cargo doc"
)

DEFAULT_DENIED_COMMANDS=(
  "npx" "pnpm dlx" "pnpm install" "pnpm add" "pnpm remove"
  "npm install" "npm ci" "yarn add" "yarn install" "pip install"
  "rm" "rmdir"
  "cargo install"
)

PROJECT_ALLOWED_COMMANDS=()
PROJECT_DENIED_COMMANDS=()

ALLOWED_COMMANDS=("${DEFAULT_ALLOWED_COMMANDS[@]}" "${PROJECT_ALLOWED_COMMANDS[@]}")
DENIED_COMMANDS=("${DEFAULT_DENIED_COMMANDS[@]}" "${PROJECT_DENIED_COMMANDS[@]}")

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

CHAIN_PATTERN='[&][&]|[|][|]|[$][(]|[;]|[|]|[`]'
if [[ "$COMMAND" =~ $CHAIN_PATTERN ]]; then
  deny "コマンドチェーンは許可されていません。"
fi

for denied_cmd in "${DENIED_COMMANDS[@]}"; do
  if [[ "$COMMAND" == "$denied_cmd" || "$COMMAND" == "$denied_cmd "* ]]; then
    deny "禁止コマンドです: ${denied_cmd}"
  fi
done

for allowed_cmd in "${ALLOWED_COMMANDS[@]}"; do
  if [[ "$COMMAND" == "$allowed_cmd" || "$COMMAND" == "$allowed_cmd "* ]]; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "allowedCommands で許可済み"
      }
    }'
    exit 0
  fi
done

exit 0

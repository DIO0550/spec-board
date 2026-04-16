#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASKS_DIR="${TASKS_DIR:-tasks}"
CONFIG_FILE="${CONFIG_FILE:-task-loop-config.json}"
PR_NUMBER_FILE="${TASKS_DIR}/processing/.pr_number"
FIX_COUNT_FILE="${TASKS_DIR}/processing/.fix_count"
INSTRUCTIONS_FILE="${SCRIPT_DIR}/task-loop-instructions.md"
SESSION_LOGS_DIR="${SESSION_LOGS_DIR:-session-logs}"

if [ ! -f "$INSTRUCTIONS_FILE" ]; then
  echo "Error: 指示書が見つかりません: $INSTRUCTIONS_FILE" >&2
  exit 1
fi

# --- 設定読み込み (jq) ---
read_config() {
  local key="$1"
  local default="$2"
  if [ -f "$CONFIG_FILE" ]; then
    local val
    val=$(jq -r ".${key} // empty" "$CONFIG_FILE" 2>/dev/null)
    echo "${val:-$default}"
  else
    echo "$default"
  fi
}

REVIEW_POLL_INTERVAL=$(read_config "reviewPollIntervalSeconds" "30")
REVIEWER=$(read_config "reviewer" "copilot-pull-request-reviewer")
SESSION_LOGS_DIR=$(read_config "sessionLogsDir" "$SESSION_LOGS_DIR")

# --- セッションログ ---
mkdir -p "$SESSION_LOGS_DIR"

run_claude_session() {
  local mode="$1"
  local prompt="$2"
  local task_name="${3:-unknown}"
  local timestamp
  timestamp=$(date +"%Y-%m-%d_%H%M%S")
  local log_file="${SESSION_LOGS_DIR}/${timestamp}_${mode}_${task_name}.md"

  echo ""
  echo ">>> Claude Session Start: ${mode} / ${task_name}"
  echo "    Log: ${log_file}"
  echo ""

  {
    echo "---"
    echo "mode: \"${mode}\""
    echo "task: \"${task_name}\""
    echo "startedAt: \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\""
    echo "---"
    echo ""
    echo "# Session Output: ${mode} / ${task_name}"
    echo ""
    echo '```'
  } > "$log_file"

  # stream-json でストリーミング出力を取得し、ログには生JSON、ターミナルには jq で整形した要約を流す
  claude -p "$prompt" --allowedTools "$ALLOWED_TOOLS" \
      --output-format stream-json --verbose 2>&1 \
    | tee -a "$log_file" \
    | while IFS= read -r line; do
        echo "$line" | jq -r '
          if .type == "assistant" then
            (.message.content[]? |
              if .type == "text" then "  " + .text
              elif .type == "tool_use" then "  [tool] " + .name + " " + (.input | tostring | .[0:120])
              else empty end)
          elif .type == "user" then
            (.message.content[]? |
              if .type == "tool_result" then "  [result]"
              else empty end)
          elif .type == "result" then
            "  [done] " + (.subtype // "ok")
          else empty end' 2>/dev/null || true
      done
  local exit_code=${PIPESTATUS[0]}

  {
    echo '```'
    echo ""
    echo "endedAt: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "exitCode: ${exit_code}"
  } >> "$log_file"

  echo ""
  echo "<<< Claude Session End (exit: ${exit_code})"
  echo ""

  return $exit_code
}

# --- タスク残存チェック ---
has_remaining_tasks() {
  ls "$TASKS_DIR"/processing/*.md &>/dev/null && return 0
  ls "$TASKS_DIR"/todo/*.md &>/dev/null && return 0
  return 1
}

# --- 現在のタスク名を取得 ---
get_current_task_name() {
  local task_file
  task_file=$(ls "$TASKS_DIR"/processing/*.md 2>/dev/null | head -1)
  if [ -z "$task_file" ]; then
    task_file=$(ls "$TASKS_DIR"/todo/*.md 2>/dev/null | head -1)
  fi
  if [ -n "$task_file" ]; then
    basename "$task_file" .md
  else
    echo "unknown"
  fi
}

# --- processing中のタスクがあるかチェック ---
has_processing_task() {
  ls "$TASKS_DIR"/processing/*.md &>/dev/null
}

# --- PR番号の読み書き ---
save_pr_number() {
  echo "$1" > "$PR_NUMBER_FILE"
}

read_pr_number() {
  if [ -f "$PR_NUMBER_FILE" ]; then
    cat "$PR_NUMBER_FILE"
  else
    echo ""
  fi
}

clean_processing_state() {
  rm -f "$PR_NUMBER_FILE" "$FIX_COUNT_FILE"
}

# --- レビュー完了を無限ポーリング ---
# PR の HEAD コミット SHA に対して REVIEWER のレビューが届くまで無限に待つ。
# タイムアウトは設けない: 本当に返ってこない場合は人間が Ctrl+C で介入する想定。
#
# 引数:
#   $1 - PR番号
poll_review() {
  local pr_number="$1"

  if [ -z "$pr_number" ]; then
    echo "Error: PR番号が指定されていません" >&2
    return 1
  fi

  local head_sha
  head_sha=$(gh pr view "$pr_number" --json headRefOid --jq '.headRefOid' 2>/dev/null)

  if [ -z "$head_sha" ]; then
    echo "Error: HEAD SHA を取得できませんでした" >&2
    return 1
  fi

  echo "PR #${pr_number} のレビュー待ち開始（レビュアー: ${REVIEWER}、HEAD: ${head_sha:0:8}、間隔: ${REVIEW_POLL_INTERVAL}秒）" >&2

  while true; do
    # gh pr view (GraphQL) の author.login は "[bot]" サフィックスなしで REVIEWER 設定値と一致する
    # （REST API の user.login は "copilot-pull-request-reviewer[bot]" でサフィックスが付くので使えない）
    local review_state
    review_state=$(gh pr view "$pr_number" --json reviews \
      --jq "[.reviews[] | select(.author.login == \"${REVIEWER}\" and .commit.oid == \"${head_sha}\")] | last | .state // empty" 2>/dev/null || echo "")

    if [ -n "$review_state" ]; then
      echo "HEAD ${head_sha:0:8} 上のレビューを検出（${REVIEWER}: ${review_state}）" >&2
      return 0
    fi

    echo "  レビュー待機中... ${REVIEWER} が HEAD ${head_sha:0:8} をレビュー中" >&2
    sleep "$REVIEW_POLL_INTERVAL"
  done
}

PROMPT_BASE="$(cat "$INSTRUCTIONS_FILE")"

# --- デフォルト許可コマンド（pre-tool-use-hook.sh.template と同じ） ---
DEFAULT_ALLOWED_COMMANDS=(
  "git status" "git add" "git commit" "git push" "git pull" "git fetch"
  "git checkout" "git switch" "git branch" "git diff" "git log"
  "git stash" "git merge" "git rebase"
  "gh pr create" "gh pr edit" "gh pr view" "gh pr merge" "gh pr list" "gh api" "gh auth status"
  "ls" "cat" "wc" "which" "command -v"
  "mkdir -p" "cp" "mv"
  "tsc --noEmit" "tsc -p" "eslint" "prettier --check" "vitest" "jest"
  "pnpm test" "pnpm run lint" "pnpm run build" "pnpm run typecheck" "pnpm run format"
)

# --- allowedTools の構築 ---
build_allowed_tools() {
  local tools=""
  # デフォルト許可コマンド
  for cmd in "${DEFAULT_ALLOWED_COMMANDS[@]}"; do
    [ -n "$tools" ] && tools="${tools},"
    tools="${tools}Bash(${cmd})"
  done
  # プロジェクト固有の許可コマンド
  if [ -f "$CONFIG_FILE" ]; then
    local cmds
    cmds=$(jq -r '.allowedCommands // [] | .[]' "$CONFIG_FILE" 2>/dev/null)
    while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      tools="${tools},Bash(${cmd})"
    done <<< "$cmds"
  fi
  echo "${tools},Read,Write,Edit,Glob,Grep,TodoRead,TodoWrite"
}

ALLOWED_TOOLS="$(build_allowed_tools)"
echo "allowedTools: ${ALLOWED_TOOLS}"

# --- 許可コマンド一覧をプロンプトに注入 ---
build_allowed_commands_prompt() {
  echo ""
  echo "## 使用可能なコマンド"
  echo ""
  echo "以下のコマンドが実行許可されています:"
  echo ""
  for cmd in "${DEFAULT_ALLOWED_COMMANDS[@]}"; do
    echo "- \`${cmd}\`"
  done
  if [ -f "$CONFIG_FILE" ]; then
    local cmds
    cmds=$(jq -r '.allowedCommands // [] | .[]' "$CONFIG_FILE" 2>/dev/null)
    while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      echo "- \`${cmd}\`"
    done <<< "$cmds"
  fi
  echo ""
  echo "上記以外のBashコマンドは使用できません。"
}

PROMPT_BASE="${PROMPT_BASE}
$(build_allowed_commands_prompt)"

# --- AI を起動するヘルパー ---
# shell は状態・モードを一切渡さない。AI は task-loop-run スキルの指示に従い、
# `{tasksDir}/processing/` の現在の状態（タスクファイル・.pr_number・.fix_count）から
# 次にすべきことを自己判定する。
run_ai() {
  run_claude_session "task-loop" "$PROMPT_BASE" "$(get_current_task_name)"
}

while true; do
  if ! has_remaining_tasks; then
    echo "全タスクが処理済みです"
    break
  fi

  # --- Phase 1: 実装 + PR作成（必要な場合のみ） ---
  PR_NUMBER=""
  if has_processing_task; then
    PR_NUMBER=$(read_pr_number)
  fi

  if [ -n "$PR_NUMBER" ] && has_processing_task; then
    # PR作成済みのprocessingタスクがある → レビューフローへ
    echo "PR #${PR_NUMBER} が存在する処理中タスクを検出。レビューフローに入ります。"
  else
    # --- Phase 1: 実装 + PR作成 ---
    echo "=== Phase: implement ==="
    run_ai

    # PR番号を取得
    PR_NUMBER=$(read_pr_number)

    if [ -z "$PR_NUMBER" ]; then
      echo "Warning: PR番号が取得できませんでした。次のタスクに進みます。"
      continue
    fi
  fi

  # --- Phase 2: レビュー待ち → review-check のループ ---
  while true; do
    echo "=== Phase: poll ==="
    if ! poll_review "$PR_NUMBER"; then
      echo "Error: レビューポーリングに失敗しました。次のタスクに進みます。"
      clean_processing_state
      break
    fi

    echo "=== Phase: review-check ==="
    run_ai

    # タスクが processing/ から外れていればマージ完了 or failed に退避済み
    if ! has_processing_task; then
      echo "タスクが処理済みになりました。"
      clean_processing_state
      break
    fi

    # まだ processing に残っている = 修正後の再レビュー待ち、または AI が
    # 「レビュー進行中」と判定して終了した状態。tight loop を避けるため
    # backoff してから次の poll に進む
    echo "  processing に残存。${REVIEW_POLL_INTERVAL}秒待機してから再チェック..."
    sleep "$REVIEW_POLL_INTERVAL"
  done
done

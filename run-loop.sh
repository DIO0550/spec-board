#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASKS_DIR="${TASKS_DIR:-tasks}"
CONFIG_FILE="${CONFIG_FILE:-task-loop-config.json}"
PR_NUMBER_FILE="${TASKS_DIR}/processing/.pr_number"
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
REVIEW_MAX_WAIT=$(read_config "reviewMaxWaitMinutes" "30")
AUTO_MERGE_WITHOUT_REVIEW=$(read_config "autoMergeWithoutReview" "false")
MAX_FIX_ITERATIONS=$(read_config "maxFixIterations" "3")
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

  echo "--- Session log: ${log_file} ---"

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

  claude -p "$prompt" --allowedTools "$ALLOWED_TOOLS" 2>&1 | tee -a "$log_file"
  local exit_code=${PIPESTATUS[0]}

  {
    echo '```'
    echo ""
    echo "endedAt: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "exitCode: ${exit_code}"
  } >> "$log_file"

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

clean_pr_number() {
  rm -f "$PR_NUMBER_FILE"
}

# --- レビュー完了をポーリング ---
# reviewRequests にレビュアーがいる間 = まだレビュー中（待機）
# reviewRequests からいなくなり reviews に COMMENTED 等が入った = レビュー完了
#
# 戻り値（最終行）:
#   "REVIEWED"  - レビュアーがレビューを提出済み
#   "TIMEOUT"   - 制限時間超過
#   "NO_PR"     - PR番号が不明
poll_review() {
  local pr_number="$1"

  if [ -z "$pr_number" ]; then
    echo "NO_PR"
    return
  fi

  local max_wait_seconds=$((REVIEW_MAX_WAIT * 60))
  local elapsed=0

  echo "PR #${pr_number} のレビュー待ち開始（レビュアー: ${REVIEWER}、間隔: ${REVIEW_POLL_INTERVAL}秒、上限: ${REVIEW_MAX_WAIT}分）"

  while [ "$elapsed" -lt "$max_wait_seconds" ]; do
    # reviewRequests: レビュー依頼中（まだレビューしていない）
    local still_requested
    still_requested=$(gh pr view "$pr_number" --json reviewRequests \
      --jq "[.reviewRequests[].login] | map(select(. == \"${REVIEWER}\")) | length" 2>/dev/null || echo "1")

    if [ "$still_requested" -eq 0 ]; then
      # reviewRequests から消えた → reviews に入ったかチェック
      local review_state
      review_state=$(gh pr view "$pr_number" --json reviews \
        --jq "[.reviews[] | select(.author.login == \"${REVIEWER}\")] | last | .state // empty" 2>/dev/null || echo "")

      if [ -n "$review_state" ]; then
        echo "レビュー完了を検出（${REVIEWER}: ${review_state}）"
        echo "REVIEWED"
        return
      fi
    fi

    echo "  レビュー待機中... ${REVIEWER} がレビュー中 (${elapsed}/${max_wait_seconds}秒)"
    sleep "$REVIEW_POLL_INTERVAL"
    elapsed=$((elapsed + REVIEW_POLL_INTERVAL))
  done

  echo "レビュータイムアウト（${REVIEW_MAX_WAIT}分経過）"
  echo "TIMEOUT"
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

while true; do
  if ! has_remaining_tasks; then
    echo "全タスクが処理済みです"
    break
  fi

  # --- Phase 1: processing中のタスクがある場合、中断復帰チェック ---
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
    IMPLEMENT_PROMPT="${PROMPT_BASE}

## 実行モード: implement

Steps 1〜4（タスク初期化、実装、コミット、PR作成）までを実行してください。
PR作成後、レビュー待ちには入らず終了してください。
**重要**: PR作成後、PR番号を \`${PR_NUMBER_FILE}\` に書き出してください。"

    run_claude_session "implement" "$IMPLEMENT_PROMPT" "$(get_current_task_name)"

    # PR番号を取得
    PR_NUMBER=$(read_pr_number)

    if [ -z "$PR_NUMBER" ]; then
      echo "Warning: PR番号が取得できませんでした。次のタスクに進みます。"
      continue
    fi
  fi

  # --- Phase 2: レビューポーリング (shell側) ---
  FIX_COUNT=0

  while true; do
    echo "=== Phase: poll ==="
    RESULT=$(poll_review "$PR_NUMBER")
    # poll_review は複数行出力する（ログ + 最終行が結果）
    REVIEW_STATUS=$(echo "$RESULT" | tail -1)

    case "$REVIEW_STATUS" in
      REVIEWED)
        # レビューが提出された → AIにコメント内容を分析させる
        echo "=== Phase: review-check ==="
        REVIEW_CHECK_PROMPT="${PROMPT_BASE}

## 実行モード: review-check

PR #${PR_NUMBER} のレビューが完了しました。

以下の手順で処理してください:

1. PRのレビューコメントを取得する:
   \`\`\`bash
   gh api repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments
   gh api repos/{owner}/{repo}/pulls/${PR_NUMBER}/reviews
   \`\`\`
2. コメント内容を分析し、**修正が必要な指摘があるか**を判断する
3. 判断結果に応じて:
   - **指摘なし**（情報提供のみ、褒めるコメント、軽微な提案のみ等）:
     → Steps 7〜8（マージ、状態更新）を実行して終了
   - **指摘あり**（コード修正が必要な指摘、バグの指摘等）:
     → Step 6（レビュー指摘修正）を実行
     → 修正をコミット・プッシュしたら、レビュー待ちには入らず終了

修正回数: ${FIX_COUNT}/${MAX_FIX_ITERATIONS}"

        run_claude_session "review-check" "$REVIEW_CHECK_PROMPT" "$(get_current_task_name)"

        # AIの処理結果を確認: タスクが done/ に移動していればマージ完了
        if ! has_processing_task; then
          echo "タスクがマージされました。"
          clean_pr_number
          break
        fi

        # まだ processing にある = 修正して再レビュー待ち
        FIX_COUNT=$((FIX_COUNT + 1))

        if [ "$FIX_COUNT" -gt "$MAX_FIX_ITERATIONS" ]; then
          echo "修正上限（${MAX_FIX_ITERATIONS}回）に達しました。手動対応が必要です。"
          ERROR_PROMPT="${PROMPT_BASE}

## 実行モード: error

PR #${PR_NUMBER} のレビュー修正が上限（${MAX_FIX_ITERATIONS}回）に達しました。
タスクの状態を \`needs_manual_review\` に更新し、エラーリカバリーの手順に従って処理してください。"

          run_claude_session "error" "$ERROR_PROMPT" "$(get_current_task_name)"
          clean_pr_number
          break
        fi
        # ループの先頭に戻って再ポーリング
        ;;

      TIMEOUT)
        if [ "$AUTO_MERGE_WITHOUT_REVIEW" = "true" ]; then
          echo "タイムアウト: autoMergeWithoutReview=true のため自動マージします。"
          MERGE_PROMPT="${PROMPT_BASE}

## 実行モード: review-check

PR #${PR_NUMBER} のレビューがタイムアウトしました。autoMergeWithoutReview が有効なため、マージを実行します。
Steps 7〜8（マージ、状態更新）を実行してください。"

          run_claude_session "merge" "$MERGE_PROMPT" "$(get_current_task_name)"
        else
          echo "タイムアウト: レビューが得られませんでした。次のタスクに進みます。"
          TIMEOUT_PROMPT="${PROMPT_BASE}

## 実行モード: error

PR #${PR_NUMBER} のレビューがタイムアウトしました（${REVIEW_MAX_WAIT}分）。
autoMergeWithoutReview=false のため、ユーザーに通知して次のタスクへ進む処理を行ってください。
エラーリカバリーの手順に従ってタスクの状態を更新してください。"

          run_claude_session "timeout-error" "$TIMEOUT_PROMPT" "$(get_current_task_name)"
        fi
        clean_pr_number
        break
        ;;

      NO_PR)
        echo "Error: PR番号が取得できませんでした。"
        clean_pr_number
        break
        ;;
    esac
  done
done

#!/usr/bin/env bash
#
# リリース用のバージョンタグ (vX.Y.Z) を作成して push するスクリプト。
# push された v* タグは .github/workflows/release.yml を発火させ、
# macOS ビルドが GitHub Release に添付される。
#
# 使い方:
#   scripts/create-release-tag.sh [version] [options]
#
#   version      作成するバージョン。"v" 接頭辞は任意 (例: 0.2.0 / v0.2.0)。
#                省略時は package.json の version を使う。
#
# options:
#   --dry-run    タグの作成・push を行わず、実行内容だけ表示する。
#   --yes, -y    確認プロンプトをスキップする。
#   --remote <n> push 先リモート名 (デフォルト: origin)。
#   -h, --help   このヘルプを表示する。
#
# このスクリプトはバージョンファイルを書き換えない。package.json /
# src-tauri/tauri.conf.json / src-tauri/Cargo.toml の version を先に
# (通常は PR 経由で) 更新・マージしてから実行すること。
set -euo pipefail

# リポジトリルートへ移動 (どこから呼ばれても動くように)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOTE="origin"
DRY_RUN=false
ASSUME_YES=false
VERSION_ARG=""

err() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; }
info() { printf '\033[36m==>\033[0m %s\n' "$1"; }

usage() {
  sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --yes | -y) ASSUME_YES=true ;;
    --remote) shift; REMOTE="${1:?--remote にはリモート名が必要です}" ;;
    -h | --help) usage; exit 0 ;;
    -*) err "不明なオプション: $1"; usage; exit 1 ;;
    *)
      if [ -n "$VERSION_ARG" ]; then
        err "バージョン引数が複数指定されています: $VERSION_ARG, $1"
        exit 1
      fi
      VERSION_ARG="$1"
      ;;
  esac
  shift
done

# --- バージョンの解決 ----------------------------------------------------------

read_pkg_version() { node -p "require('./package.json').version"; }
read_tauri_version() { node -p "require('./src-tauri/tauri.conf.json').version"; }
# Cargo.toml の [package] 直下の version を読む
read_cargo_version() {
  awk '/^\[package\]/{p=1; next} /^\[/{p=0} p && /^version[[:space:]]*=/{gsub(/.*=[[:space:]]*"|".*/, ""); print; exit}' src-tauri/Cargo.toml
}

PKG_VERSION="$(read_pkg_version)"

# 引数があればそれを、なければ package.json の version を採用。"v" 接頭辞は除去。
VERSION="${VERSION_ARG:-$PKG_VERSION}"
VERSION="${VERSION#v}"

# semver (プレリリース/ビルドメタ付きも許可) の簡易バリデーション
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'; then
  err "バージョン '$VERSION' が semver (X.Y.Z) 形式ではありません"
  exit 1
fi

TAG="v$VERSION"

# --- バージョンファイルの整合チェック ------------------------------------------

TAURI_VERSION="$(read_tauri_version)"
CARGO_VERSION="$(read_cargo_version)"

MISMATCH=false
check_match() {
  local label="$1" actual="$2"
  if [ "$actual" != "$VERSION" ]; then
    err "$label の version ($actual) がタグ ($VERSION) と一致しません"
    MISMATCH=true
  fi
}
check_match "package.json" "$PKG_VERSION"
check_match "src-tauri/tauri.conf.json" "$TAURI_VERSION"
check_match "src-tauri/Cargo.toml" "$CARGO_VERSION"

if [ "$MISMATCH" = true ]; then
  err "先に各ファイルの version を $VERSION に揃えてから (PR 経由で) 実行してください"
  exit 1
fi

# --- リポジトリ状態のチェック --------------------------------------------------

if [ -n "$(git status --porcelain)" ]; then
  err "作業ツリーに未コミットの変更があります。コミット/退避してから実行してください"
  exit 1
fi

# 既存タグの重複チェック (ローカル + リモート)
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  err "タグ $TAG は既にローカルに存在します"
  exit 1
fi
if git ls-remote --exit-code --tags "$REMOTE" "$TAG" >/dev/null 2>&1; then
  err "タグ $TAG は既にリモート ($REMOTE) に存在します"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
CURRENT_SHA="$(git rev-parse --short HEAD)"

# --- 実行内容の提示 ------------------------------------------------------------

info "タグ           : $TAG"
info "対象コミット   : $CURRENT_SHA ($CURRENT_BRANCH)"
info "push 先リモート: $REMOTE"

if [ "$CURRENT_BRANCH" != "main" ]; then
  info "注意: 現在 main ブランチではありません ($CURRENT_BRANCH)。意図したコミットか確認してください"
fi

if [ "$DRY_RUN" = true ]; then
  info "--dry-run のため、ここで終了します (タグ作成・push は行いません)"
  exit 0
fi

if [ "$ASSUME_YES" != true ]; then
  printf 'このコミットに %s を作成して %s へ push します。よろしいですか? [y/N] ' "$TAG" "$REMOTE"
  read -r reply
  case "$reply" in
    [yY] | [yY][eE][sS]) ;;
    *) info "中止しました"; exit 0 ;;
  esac
fi

# --- タグ作成 + push -----------------------------------------------------------

git tag -a "$TAG" -m "Release $TAG"
info "注釈付きタグ $TAG を作成しました"

git push "$REMOTE" "$TAG"
info "タグ $TAG を $REMOTE へ push しました。release ワークフローが発火します"

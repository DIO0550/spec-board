# spec-board - ラベルレジストリ仕様（フロントエンド）

> **機能**: [spec-board](./index.md)
> **バージョン**: 1.0
> **作成日**: 2026-05-31
> **ステータス**: 下書き

## 概要

タスクのラベルを視覚的に区別するため、ラベル文字列を **prefix 基準でグループに分類**し、グループごとに固定の oklch カラートークン（`fg` / `bg` / `bd` / `dot`）を割り当てる純粋ドメイン `LabelRegistry` を定義する。色解決は同期・純粋・throw しない決定的関数であり、同一グループは常に同一の色になる（1 グループ = 1 色）。

実装は `src/domains/label-registry/index.ts`（companion API パターン）に置き、UI 側（`LabelTag`）はインライン `style` で `color` / `backgroundColor` / `borderColor` にバインドする。CSS 変数は生成しない。

## グループ体系

ラベルは以下のいずれかのグループに分類される。

| 区分 | グループ | 説明 |
|:-----|:--------|:-----|
| 固定枠 | `default` | prefix を持たないラベル（`bug` 等）、または異常入力のフォールバック |
| 固定枠 | `type` | `type:` prefix を持つラベル |
| 固定枠 | `priority` | `priority:` prefix を持つラベル |
| 固定枠 | `area` | `area:` prefix を持つラベル |
| 固定枠 | `status` | `status:` prefix を持つラベル |
| 動的枠 | その他 prefix | 上記 4 種以外の任意 prefix（`scope`・`kind` 等）。安定ハッシュで色を決定 |

### prefix 抽出ルール（`parseGroup`）

ラベル文字列からグループを導出する規則。すべての入力で throw せず、判定できない場合は `default` にフォールバックする。

1. ラベル全体を `trim()` し `toLowerCase()` で正規化する
2. 正規化後が空文字なら `default`
3. 最初の `:` の位置を探す。`:` が無い、または先頭（位置 0）にある場合は `default`
4. 先頭から最初の `:` までを prefix として取り出し、prefix 部も `trim()` する
5. prefix が空文字なら `default`、そうでなければその prefix をグループ名とする

| 入力 | グループ | 補足 |
|:-----|:--------|:-----|
| `""` | `default` | 空文字 |
| `"   "` | `default` | 空白のみ |
| `"bug"` | `default` | `:` 無し |
| `"type:feature"` | `type` | 標準 prefix |
| `"Type:Feature"` | `type` | `toLowerCase` で正規化 |
| `"priority:high"` / `"priority:low"` | `priority` | 同グループ（同色） |
| `"a:b:c"` | `a` | 最初の `:` まで |
| `"scope:fe"` | `scope` | その他 prefix |
| `":foo"` | `default` | 先頭 `:`（prefix が空） |
| `"type :feature"` | `type` | prefix 末尾の空白を trim |
| `"  type:feature"` | `type` | 全体 trim 後に prefix 抽出 |
| `"type:"` / `"type:   "` | `type` | value 側は判定に使わない |
| `"constructor:x"` / `"__proto__:x"` | その他 prefix（動的枠） | `Object.prototype` 継承名は固定枠と誤認せず、動的枠へフォールバック（throw しない） |

> **固定枠判定の安全性**: 固定割当は値が数値の**自前プロパティ**のみを採用する。`constructor` / `__proto__` 等の `Object.prototype` 継承メンバ名が prefix になっても固定枠（index 0..4）には決して一致せず、その他 prefix として動的枠（index 5..9）に決定的に割り当てられる。

## カラーパレット

10 色 × 4 トークンの light テーマパレット。各グループは固定の palette index に対応する。

- **固定枠（index 0..4）**: `default` + 標準 4 群を 1:1 で割り当てる
- **動的枠（index 5..9）**: その他 prefix を安定ハッシュ `5 + (hash % 5)` で決定的に割り当てる

固定枠と動的枠は**排他**であり、その他 prefix が `default` / 標準群と同色になることはない。動的枠は 5 色のため、異なるその他 prefix 同士は色が重複しうる（衝突は順送りせず決定的に固定。**同名 prefix は常に同色**）。

### 安定ハッシュ

その他 prefix の index は以下のアルゴリズムで決定する（実装非依存に固定。変更すると prefix → 色の対応が変わる）。

- `hash = 0` から開始
- グループ名の各文字の UTF-16 code unit（`charCodeAt(i)`）を `hash = (hash * 31 + code) | 0` で畳み込む
- `5 + (Math.abs(hash) % 5)` を palette index とする

既知 prefix の解決結果（回帰検知用の golden 値）:

| prefix | palette index |
|:-------|:-------------|
| `scope` | 8 |
| `kind` | 7 |

### oklch トークン値

`fg` / `bg` の組み合わせは light 背景での可読性を **設計目安として WCAG AA（コントラスト比 4.5:1）** に置いて選定した。自動コントラスト測定はゲートとせず手動確認とする。`dot` は将来の小丸インジケータ用に予約し、現行 UI では未使用。

| index | 枠 | 用途 | fg | bg | bd | dot |
|:------|:---|:-----|:---|:---|:---|:----|
| 0 | 固定 | default（slate） | `oklch(0.38 0.02 250)` | `oklch(0.96 0.005 250)` | `oklch(0.88 0.01 250)` | `oklch(0.62 0.03 250)` |
| 1 | 固定 | type（blue） | `oklch(0.42 0.13 250)` | `oklch(0.96 0.03 250)` | `oklch(0.86 0.07 250)` | `oklch(0.60 0.16 250)` |
| 2 | 固定 | priority（amber） | `oklch(0.45 0.12 75)` | `oklch(0.96 0.04 85)` | `oklch(0.87 0.09 85)` | `oklch(0.72 0.16 75)` |
| 3 | 固定 | area（green） | `oklch(0.42 0.11 150)` | `oklch(0.96 0.03 150)` | `oklch(0.86 0.08 150)` | `oklch(0.62 0.15 150)` |
| 4 | 固定 | status（violet） | `oklch(0.44 0.15 300)` | `oklch(0.96 0.03 300)` | `oklch(0.87 0.07 300)` | `oklch(0.58 0.18 300)` |
| 5 | 動的 | rose | `oklch(0.45 0.16 15)` | `oklch(0.96 0.03 15)` | `oklch(0.87 0.08 15)` | `oklch(0.62 0.20 15)` |
| 6 | 動的 | cyan | `oklch(0.42 0.10 220)` | `oklch(0.96 0.03 220)` | `oklch(0.86 0.07 220)` | `oklch(0.62 0.13 220)` |
| 7 | 動的 | orange | `oklch(0.46 0.14 50)` | `oklch(0.96 0.04 55)` | `oklch(0.87 0.09 55)` | `oklch(0.66 0.17 50)` |
| 8 | 動的 | teal | `oklch(0.42 0.09 185)` | `oklch(0.96 0.03 185)` | `oklch(0.86 0.06 185)` | `oklch(0.60 0.12 185)` |
| 9 | 動的 | fuchsia | `oklch(0.46 0.18 330)` | `oklch(0.96 0.04 330)` | `oklch(0.87 0.09 330)` | `oklch(0.60 0.22 330)` |

> **注記**: oklch は広くサポートされる CSS 色関数だが、彩度の高い値はブラウザの gamut mapping に依存して sRGB に丸められうる。再現性を重視する場合は sRGB 内に収める調整余地がある。

## 適用方式

`LabelTag` は `LabelRegistry.tokensForLabel(label)` で色を解決し、インライン `style` にバインドする。props は `label: string` のまま不変。

```tsx
const { fg, bg, bd } = LabelRegistry.tokensForLabel(label);
<span style={{ color: fg, backgroundColor: bg, borderColor: bd }}>{label}</span>
```

- CSS 変数は使わず TS 文字列トークンを直接バインドする
- Tailwind の色クラス（旧 `bg-gray-100`）は除去し、レイアウト系クラス（`inline-flex` 等）と `border` のみ残す

### 設定画面ラベルタブでの色解決（color → group → name）

設定画面のラベルタブ（[board-view-spec.md](./board-view-spec.md) 参照）は、ラベルマスタ定義 `LabelDefinition`（`name` / `group?` / `color?` 等）1 件ごとにスワッチ色を以下の優先順位で解決する。

1. **`color`（マスタ定義色・最優先）**: `#RRGGBB` 形式の単色が定義されていれば、その単色をスワッチに適用する。
2. **`group`（明示グループ）**: `color` が無く `group` が**定義されていれば**（空文字 `""` も「定義済み」として扱う）、`LabelRegistry.tokensForGroup(group)` の `ColorTokens` を適用する。`name` の prefix からグループを導出する `tokensForLabel` ではなく、明示された `group` を優先する。空文字は `tokensForGroup("")` が既定（default 群）色へ正規化するため、name 由来の色にはフォールバックしない。
3. **`name`（prefix 由来・フォールバック）**: `color` も `group` も無ければ `LabelRegistry.tokensForLabel(name)`（`name` の prefix からグループを導出）を適用する。

スワッチへの適用規則:

- **単色 `#RRGGBB`**: その単色を `backgroundColor` にバインドする。
- **`ColorTokens`（`group` / `name` 経路）**: `LabelTag` と同様に `color`（`fg`）/ `backgroundColor`（`bg`）/ `borderColor`（`bd`）にバインドする。`dot` は小丸インジケータ用の予約トークンで本タブでは未使用。

いずれも CSS 変数を作らずインライン `style` にバインドする。`color` の値が不正・欠落している場合は省略され、上記 2→3 の既定色解決にフォールバックする。

## 公開 API

| シンボル | 種別 | 説明 |
|:--------|:-----|:-----|
| `LabelGroup` | 型 | `"type" \| "priority" \| "area" \| "status" \| "default" \| (string & {})` |
| `ColorTokens` | 型 | `{ fg, bg, bd, dot }`（すべて oklch 文字列、readonly） |
| `LabelRegistry.PALETTE` | 定数 | 10 色パレット（index 0..9） |
| `LabelRegistry.parseGroup(label)` | 関数 | ラベル文字列 → `LabelGroup` |
| `LabelRegistry.tokensForGroup(group)` | 関数 | グループ → `ColorTokens`（未正規化入力も内部で正規化） |
| `LabelRegistry.tokensForLabel(label)` | 関数 | ラベル文字列 → `ColorTokens`（`parseGroup` → `tokensForGroup` の合成） |

すべての関数は純粋・同期で throw せず、同一入力に対して同一参照の `ColorTokens` を返す。

## 将来拡張

- **ダークテーマ**: 現状は light パレットのみ。将来は `LIGHT_PALETTE` と並べて `DARK_PALETTE` を追加し、`ColorTokens` を `{ light, dark }` に内包する想定。
- **小丸インジケータ**: `dot` トークンを使った小丸表示は予約済み（現行 UI では未使用）。

## 関連仕様

- [task-card-spec.md](./task-card-spec.md) — ラベルタグを含むタスクカードの表示仕様
- [task-format-spec.md](./task-format-spec.md) — ラベルを含む md フロントマター仕様
- [board-view-spec.md](./board-view-spec.md) — 設定画面ラベルタブ（読み取り表示）の挙動

## 変更履歴

| バージョン | 日付 | 変更内容 | 変更者 |
|:-----------|:-----|:---------|:-------|
| 1.0 | 2026-05-31 | 初版作成 | - |
| 1.1 | 2026-05-31 | 設定画面ラベルタブの色解決優先順位（color → group → name）とスワッチ適用規則を追記 | - |

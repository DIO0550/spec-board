# マイルストーン専用ビュー仕様

> **バージョン**: 1.0
> **作成日**: 2026-06-21
> **ステータス**: 下書き

## 概要

マイルストーン専用ビュー（画面区分 `milestone`）の UI 仕様を定義する。ヘッダーの「マイルストーン」ボタン (`onMilestoneClick`) 起点で開かれ、フィルタ・検索・ソート・一覧⇔ロードマップ切替・追加モーダルを提供する。design-source は `docs/design/spec-milestones-static-{list,roadmap,modal}.html`。

ボードビューおよびマイルストーン設定タブ（`MilestoneSettingsTab`）との関係:
- マイルストーン一覧の取得は唯一の取得点 `useMilestones` リソースに委譲する（ボードビュー / マイルストーン設定タブと共有）。
- 作成 mutation は `useMilestoneMutations`（設定タブと同フック）を共有し、どちらの画面から作成しても `reload` で同期する。

## 画面構成

1. **ヘッダー**: タイトル「マイルストーン」+ 統計（オープン / クローズ / 期限超過 / タスク完了数）+ 右端「+ マイルストーンを追加」ボタン。
2. **ツールバー**: 状態フィルタ pills + 検索 input + ソート + 一覧/ロードマップ切替。
3. **メインビュー**: 一覧 (`MilestoneList`) または ロードマップ (`MilestoneRoadmap`)。
4. **右サイドバー**: 選択中マイルストーンの詳細（メタ情報 + 所属タスク一覧）。`lg` 以上の幅でのみ表示。
5. **作成モーダル**: 「+ マイルストーンを追加」押下で開く中央モーダル。

`onCreateMilestone` props が渡されないとき（プレビュー / 閲覧専用モード）はヘッダーの追加ボタンを非表示にする。空状態（マイルストーン 0 件）でも `onCreateMilestone` 指定時はヘッダー + 「+ 最初のマイルストーンを作成」CTA を出して空からの作成導線を保つ。

## ツールバー

| 機能 | 値 | 挙動 |
|:--|:--|:--|
| 状態フィルタ pills | `all` / `open` / `overdue` / `closed` | 単一選択。`open` は overdue を含まず純粋 open のみ（overdue は専用 pill で分離） |
| 検索 | 任意文字列 | `title` / `name` に対する部分一致（大小文字無視）。前後空白は内部でトリム |
| ソート | `due` / `progress` / `name` | 単一選択。due 未設定や ratio 未定義は末尾送り |
| ビュー切替 | `list` / `roadmap` | 切替時に選択中マイルストーンは保持 |

フィルタ / 検索 / ソートの選択状態は画面内一時状態とし、ローカル永続化は行わない。

## 一覧ビュー（list）

カード (`MilestoneCard`) 縦並び。各カード:
- 状態バッジ（open=●緑 / closed=✓グレー / overdue=!赤）
- タイトル + name（title が name と異なる場合のみ）
- 説明（1 行 truncate）
- 期日 + カウントダウンバッジ
- 進捗バー（done / total の比率）

選択中カードは accent 色の枠 + halo を付与し、`aria-pressed={selected}` で a11y ツリーに公開する。

## ロードマップビュー（roadmap）

今月起点 **8 か月** のガントチャート風。月軸ヘッダ + 各マイルストーンの行。

- 各行に状態色のバー（open=緑 / closed=グレー / overdue=赤）。
- バーの長さは `DEFAULT_SPAN_MONTHS=2` か月前から `MIN_BAR_MONTHS=1` か月後までを想定スパンとし、表示範囲 0..8 か月でクランプする（はみ出し時は `clipped=true`）。
- 月境界がパーセント上も整数 N か月境界に整合するよう、`monthsBetween` は「年月インデックス + 月内割合」で算出する（平均日数近似を使わない）。
- 今日マーカー: 月軸ヘッダの直下、最初の行の上に「今日」ピル、そこから最下行まで赤い縦線を全行貫通させる。
- due 未設定のマイルストーンは描画対象外。

選択中のバーは `aria-pressed={selected}` + accent halo。

## 右サイドバー

選択中マイルストーンの:
- 状態バッジ + タイトル + name
- 状態（日本語ラベル: オープン / クローズ / 期限超過）
- 期日（`YYYY-MM-DD`）+ カウントダウンバッジ
- タスク完了数 (`done / total`) + 進捗率%
- 説明
- 所属タスク一覧（id + title、done タスクは打ち消し線）

未選択時は「マイルストーンを選択すると詳細を表示します」のプレースホルダ。

## 作成モーダル（`MilestoneCreateModal`）

design-source: `docs/design/spec-milestones-static-modal.html`。

入力フィールド（4 つ）:
| フィールド | 必須 | 正規化 |
|:--|:--|:--|
| 名前 (name) | ◯ | 送信値は無加工（config-spec の unnormalized 完全一致キー仕様に従う）。`form.name.trim()` が空のときのみ送信不可（バリデーションは trim 後判定だが送信値はトリムしない） |
| 表示名 (title) | - | 前後空白トリム、空文字は undefined |
| 期日 (due) | - | HTML `<input type="date">`。空文字は undefined |
| 説明 (description) | - | 前後空白トリム、空文字は undefined |

閉じる動線: 閉じる × ボタン / キャンセル / overlay クリック / Escape キー。

`isPending` 中（mutation 実行中）は送信・閉じる操作をすべて無効化する（overlay は onClick が外れる）。

overlay は ConfirmDialog と同じく `<div role="presentation">` で a11y ツリーに露出させない（キーボード経路は Escape / × ボタン）。

## 派生ステータスとカウントダウン

| 表示ステータス | 条件 |
|:--|:--|
| `closed` | `def.state === "closed"`（最優先） |
| `overdue` | open かつ `due < 今日 0 時` |
| `open` | それ以外 |

| カウントダウン種別 | 条件 | ラベル例 |
|:--|:--|:--|
| `done` | closed | 「完了」 |
| `none` | due 未設定 / パース不能 | 「期日未設定」 |
| `overdue` | days < 0 | 「N 日超過」 |
| `soon` | 0 <= days <= 7 | 「今日」「あと N 日」 |
| `future` | days > 7 | 「あと N 日」 |

日数差は **今日 0 時起点の UTC エポック差分を `Math.floor` した完全な日数**として算出する（DST / タイムゾーン非依存）。

## 日付処理（`parseDue`）

`milestones.yml` の `due` は信頼できないユーザー入力文字列として扱う:

- 受理する形式: 厳密 ISO 8601 のみ
  - `YYYY-MM-DD`（10 文字）→ ローカル 0 時として解釈
  - `YYYY-MM-DDTHH:MM:SS...`（ISO datetime）→ ネイティブパース
- それ以外（スラッシュ区切り `2026/02/31` / 先頭空白 `" 2026-02-31"` / 自由形式 `March 3 2026` 等）はすべて `undefined`。
- 受理形式でも年月日のフィールド検証で実在しない日付（`2026-02-31`、`2026-13-01`）は `undefined`。
- ISO datetime も先頭 `YYYY-MM-DD` 部分で同じ検証を行う。

## 日付変更の追従

`MilestoneViewScreen` は `todayKey`（YYYY-MM-DD）を `useState` で保持し、`useEffect` で **次のローカル midnight に `setTimeout` をスケジュール** してコールバックで `setTodayKey` を呼ぶ。これにより画面を開きっぱなしで他に state 変更が無い場合でも、日付がまたぐと自動的に再 render され、overdue 判定 / カウントダウン / 統計が更新される。

派生値（`visible` / `stats` / `selectedStatus` / `MilestoneList.statusOf`）はすべて同じ `now`（todayKey 由来）を引数に取り、画面内で基準時刻を統一する。

## 関連仕様

- [board-view-spec.md](./board-view-spec.md) — 画面区分 `milestone` への切替（ヘッダー「マイルストーン」ボタン）
- [config-spec.md](./config-spec.md) — `.spec-board/milestones.yml` のスキーマ、`name` が unnormalized 完全一致キーである旨
- [task-format-spec.md](./task-format-spec.md) — タスク frontmatter の `milestone` フィールド

## 変更履歴

| バージョン | 日付 | 変更内容 | 変更者 |
|:-----------|:-----|:---------|:-------|
| 1.0 | 2026-06-21 | 初版作成（PR #408 にて画面挙動を仕様化） | - |

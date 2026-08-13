# マイルストーン専用ビュー仕様

> **バージョン**: 1.1
> **作成日**: 2026-06-21
> **ステータス**: 下書き

## 概要

マイルストーン専用ビュー（画面区分 `milestone`）の UI 仕様を定義する。ヘッダーの「マイルストーン」ボタン (`onMilestoneClick`) 起点で開かれ、フィルタ・検索・ソート・一覧⇔ロードマップ切替・追加モーダルを提供する。

ボードビューおよびマイルストーン設定タブ（`MilestoneSettingsTab`）との関係:
- マイルストーン一覧の取得は唯一の取得点 `useMilestones` リソースに委譲する（ボードビュー / マイルストーン設定タブと共有）。
- 作成 mutation は `useMilestoneMutations`（設定タブと同フック）を共有し、どちらの画面から作成しても `reload` で同期する。
- live な進捗・所属順・完了判定は、`open_project` / `get_tasks` が同一 task snapshot から返す Rust projection を唯一の source of truth とする。definition metadata 用の `useMilestones` と live projection は別データとして受け渡す。

## Projection と表示の source of truth

`ProjectData` は次の 2 map を常駐保持し、open、mutation 後の再同期、watcher gap/full resync のいずれでも同じ `get_tasks` 応答から atomic に更新する。

| Map | キー | 用途 |
|:--|:--|:--|
| `milestoneProjections` | raw milestone name | `done` / `total` / board-order `taskFilePaths` |
| task `projections` | raw task filePath | サイドバーの `TaskProjection.isDone` |

- milestone name と filePath は正規化せず `Map` で参照する。`__proto__` / `constructor` などの特殊名も通常のキーとして扱う。
- definition に存在するが projection に無い milestone は共有 zero projection（`done=0`、`total=0`、空 path）で表示する。
- definition に無い raw milestone 参照も projection には残る。カード行は作らないが、ヘッダーの全体タスク完了数には合計する。
- `milestoneProjections` の `taskFilePaths` は board order であり、選択時の所属タスク一覧もこの順序を維持する。FE の task lookup に存在しない path はその場で省略し、milestone 文字列を使った task 全走査へ fallback しない。
- done column が解決できない場合、Rust は `done=0` を返す。UI は `done / total` を表示したまま進捗率とバーだけを隠す。

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
| ソート | `order` / `due` / `progress` / `name` | 単一選択。初期値は `order`（milestones.yml の `order` 設定を尊重した既定順序を保持）。`due` 未設定や projection の `total=0` は末尾送り。done column 未解決時は全 ratio を比較不能として入力順を保つ |
| ビュー切替 | `list` / `roadmap` | 切替時に選択中マイルストーンは保持 |

フィルタ / 検索 / ソートの選択状態は画面内一時状態とし、ローカル永続化は行わない。

「エクスポート」は現在のフィルタ / 検索 / ソート後のマイルストーンを `milestones.csv` として出力する。全セルを RFC 4180 の引用符形式にし、セル先頭の空白を除いた最初の文字が `=` / `+` / `-` / `@` の場合は apostrophe を付与して表計算ソフトの式としての評価を防ぐ。download 成否にかかわらず生成した Object URL は解放する。

## 一覧ビュー（list）

カード (`MilestoneCard`) 縦並び。各カード:
- 状態バッジ（open=●緑 / closed=✓グレー / overdue=!赤）
- タイトル + name（title が name と異なる場合のみ）
- 説明（1 行 truncate）
- 期日 + カウントダウンバッジ
- Rust milestone projection の `done / total` と進捗バー。未使用行も `0 / 0` で表示する

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
- milestone projection のタスク完了数 (`done / total`) + 進捗率%
- 説明
- `taskFilePaths` 順の所属タスク一覧（id + title）
- done 表示は task の status 文字列を再解釈せず、同一 snapshot の `TaskProjection.isDone` が true のとき打ち消し線にする

未選択時は「マイルストーンを選択すると詳細を表示します」のプレースホルダ。

## Settings の live 使用数

`MilestoneSettingsTab` の「使用 N」表示と削除確認メッセージは、どちらも `MilestoneProjection.findByName(...).total` を使う。`get_milestones.usageCounts` は IPC 互換および backend の削除 guard のため維持するが、live 表示の source にはしない。これにより task mutation 後も画面 reload なしで一覧・サイドバー・Settings の件数が同じ resident snapshot に揃う。

## 作成モーダル（`MilestoneCreateModal`）

入力フィールド（6 つ）:
| フィールド | 必須 | 正規化 |
|:--|:--|:--|
| 名前 (name) | ◯ | 送信値は無加工（config-spec の unnormalized 完全一致キー仕様に従う）。`form.name.trim()` が空のときのみ送信不可（バリデーションは trim 後判定だが送信値はトリムしない） |
| 表示名 (title) | - | 前後空白トリム、空文字は undefined |
| 期日 (due) | - | HTML `<input type="date">`。空文字は undefined |
| ラベル (labels) | - | カンマ区切りを trim し、空要素を除外して optional `onLabelsChange` へ通知（`CreateMilestoneArgs` には含めない） |
| 担当者 (assignee) | - | optional `onAssigneeChange` へ選択値を通知（`CreateMilestoneArgs` には含めない） |
| 説明 (description) | - | 前後空白トリム、空文字は undefined |

名前欄の下には入力値を小文字 kebab-case にした `milestones.yml → {slug}` preview を追従表示する。preview は保存キーの正規化ではなく、送信する `name` は従来どおり無加工とする。ラベル候補・担当者候補および変更 callback はすべて optional で、既存呼び出しとの後方互換を維持する。

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
  - `YYYY-MM-DD`（10 文字）
  - `YYYY-MM-DDTHH:MM(:SS(.sss)?)?(±HH:MM|±HHMM|±HH|Z)?`（ISO datetime）
  - 正規表現: `^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$`
- それ以外（スラッシュ区切り `2026/02/31` / 先頭空白 `" 2026-02-31"` / 末尾余り `"2026-06-21 foo"` / 不正 ISO time `"2026-06-21Tnot-a-date"` / 自由形式 `March 3 2026` 等）はすべて `undefined`。
- 受理形式でも年月日のフィールド検証で実在しない日付（`2026-02-31`、`2026-13-01`）は `undefined`。時刻部分があれば HH/MM/SS の範囲（0..23/0..59/0..59）も検証し、範囲外（`2026-06-21T25:99`）は `undefined`。
- **due は calendar date として扱う**: ISO datetime であっても先頭 `YYYY-MM-DD` 部分のみを採用して**ローカル 0 時として返す**（時刻部分・タイムゾーンオフセットは破棄）。これにより `"2026-06-21T00:00:00Z"` を西側 TZ で開いてもローカル日付が前日にシフトせず、calendar date ベースの daysUntil / overdue / ロードマップ位置が安定する。

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
| 1.3 | 2026-08-12 | CSVセルの式注入対策とObject URL解放要件を明記 | - |
| 1.2 | 2026-08-12 | 表示中マイルストーンの CSV Export と、所属タスクから詳細へ遷移する taskId callback 境界を追加 | - |
| 1.1 | 2026-07-29 | Rust resident projection を進捗・所属順・done・Settings usage の source of truth として規定 | - |
| 1.0 | 2026-06-21 | 初版作成（PR #408 にて画面挙動を仕様化） | - |

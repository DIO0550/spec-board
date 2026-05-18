# spec-board - タスクフォーマット仕様（バックエンド）

> **機能**: [spec-board](./index.md)
> **ステータス**: 下書き

## 概要

spec-board で管理するタスクのmdファイルフォーマットを定義する。YAMLフロントマターにタスクのメタデータを記述し、本文にタスクの詳細説明をMarkdown形式で記述する。

## ファイルフォーマット

### 全体構造

```markdown
---
title: タスクのタイトル
status: Todo
priority: Medium
labels:
  - bug
  - frontend
parent: tasks/parent-task.md
links:
  - tasks/related-task.md
---

タスクの詳細説明をMarkdownで記述する。

## 補足情報

- 箇条書きなども自由に記述可能
```

### フロントマター定義

| フィールド | 型 | 必須 | デフォルト | 説明 |
|:----------|:---|:-----|:----------|:-----|
| title | `string` | 推奨 | ファイル名から生成 | タスクのタイトル。省略時はファイル名をフォールバック |
| status | `string` | 推奨 | 最初のカラム名 | タスクのステータス。ボードのカラムに対応。省略時は最初のカラムをデフォルト設定 |
| priority | `string` | いいえ | なし（バッジ非表示） | 優先度。`High` / `Medium` / `Low` のいずれか。省略時はバッジを表示しない |
| labels | `string[]` | いいえ | `[]` | ラベルの配列。カテゴリやタグとして使用 |
| parent | `string` | いいえ | なし | 親タスクのファイルパス（プロジェクトルートからの相対パス） |
| links | `string[]` | いいえ | `[]` | 関連タスクのファイルパスの配列 |

### フィールド詳細

#### title

- タスクを識別するためのタイトル
- 推奨フィールド。省略時はファイル名（拡張子除去、ハイフンをスペースに変換）をフォールバックとして使用
- 空文字は不可（空文字の場合もファイル名フォールバックを適用）
- ファイル名の生成元としても使用される（kebab-case変換）
- **タイトル変更時にファイル名はリネームしない**（ファイルパスが `parent` や `links` で参照されるため、リネームすると参照が壊れる）

#### status

- ボードのカラムに対応するステータス文字列
- 推奨フィールド。省略時は最初のカラム（`config.json` の `columns[0].name`）をデフォルトとして設定
- ユーザーが定義したカラム名と一致する必要がある
- 一致するカラムが存在しない場合、自動的に新規カラムとして追加
- 有効なステータス値は `.spec-board/GUIDE.md` で確認可能（[config-spec.md](./config-spec.md) 参照）

#### priority

- 省略可能。省略時はボード上で優先度バッジを表示しない
- 大文字・小文字は区別しない（パース時に正規化）
- 定義外の値が設定された場合は無視（バッジ非表示）
- UIの作成フォームでは「なし」を選択可能。「なし」選択時はフロントマターに `priority` フィールドを出力しない（`None` という文字列は使用しない）

#### labels

- 省略可能。省略時は空配列として扱う
- 各ラベルは任意の文字列
- 重複するラベルはパース時に除去

#### parent

- 親タスクのmdファイルへの相対パス（プロジェクトルート起点）
- 省略時はルートレベルのタスクとして扱う
- 多階層のネストが可能（親→子→孫→...）。ただしネストの深さは最大20階層まで（超過時はパースエラー）
- 指定されたファイルが存在しない場合、警告を表示しフィールドは保持
- 循環参照（A→B→A）が検出された場合、パースエラーとして通知

#### links

- 関連タスクのmdファイルパスの配列（プロジェクトルート起点）
- 省略可能。省略時は空配列として扱う
- リンクは**双方向**として扱う。片方のタスクに `links` を設定すると、リンク先タスクからも関連タスクとして表示される（リンク先のフロントマターには書き込まない。表示時に逆引きする）
- 指定されたファイルが存在しない場合、リンク切れとして警告アイコンを表示
- Tauri command `add_link({ sourceFilePath, targetFilePath })` で `links` への追加が可能。同じ target がすでに含まれる場合は noop（書き込みもキャッシュ更新も行わない）。リンク先（target）のフロントマターは書き換えない（双方向リンクは表示時の逆引きで実現する）

### 本文

- フロントマターの `---` 閉じタグ以降がMarkdown本文
- 本文は省略可能（フロントマターのみのファイルも有効）
- spec-board は本文の内容を解釈せず、そのまま保持・表示する

## パース仕様

### パース処理フロー

```mermaid
flowchart TD
    A[mdファイルを読み込み] --> B{フロントマターあり?}
    B -->|No| C[タスクとして認識しない]
    B -->|Yes| D[YAMLフロントマターをパース]
    D --> E{パース成功?}
    E -->|No| F[パースエラーとして通知]
    E -->|Yes| G{title/status あり?}
    G -->|No| H[フォールバック値で補完]
    G -->|Yes| I[Taskオブジェクトを生成]
    H --> I
```

### パースルール

| ID | ルール | 説明 |
|:---|:-------|:-----|
| PL-001 | フロントマター検出 | ファイル先頭が `---` で始まり、2つ目の `---` で閉じられている部分をフロントマターとして認識 |
| PL-002 | YAML パース | フロントマター部分を YAML としてパース。パース失敗時はエラーとして通知 |
| PL-003 | title フォールバック | `title` フィールドが未定義の場合、ファイル名（拡張子除去、ハイフンをスペースに変換）をタイトルとして使用 |
| PL-004 | status フォールバック | `status` フィールドが未定義の場合、最初のカラムのステータスをデフォルトとして設定 |
| PL-005 | priority 正規化 | `high` → `High`、`MEDIUM` → `Medium` のように先頭大文字に正規化 |
| PL-006 | labels 正規化 | 文字列が渡された場合は単一要素の配列に変換。重複を除去 |
| PL-007 | parent 解決 | `parent` フィールドのパスを解決し、親タスクの存在を検証。存在しない場合は `parentNotFound` warning を記録し、Task 自体は読み込み成功として扱う |
| PL-008 | parent 循環参照検出 | 親子関係のツリーを辿り、循環参照がないか検証。循環検出時、または parent 参照（edge）を21回以上辿る場合は `CycleOrTooDeep` パースエラー。20 edge までは許容する |
| PL-009 | links 正規化 | 文字列が渡された場合は単一要素の配列に変換。重複を除去。存在しないパスは警告付きで保持 |
| PL-010 | links 逆引きインデックス | 全タスク読み込み後、links の逆引きインデックスを構築。双方向リンクの表示に使用 |
| PL-011 | 子タスク収集 | 全タスク読み込み後、各タスクの `parent` を元に子タスク一覧を構築 |
| PL-012 | 未知フィールド | フロントマターに定義外のフィールドが存在する場合、`Task.extras` に JSON 互換値として保持する |
| PL-013 | 非致命警告 | `title` / `status` の fallback や `parent` / `extras` の型不一致は `Task.warnings` に保持し、Task 生成自体は継続する |

### Task 変換時の補足

- Rust / Tauri IPC の task payload は `parent` / `children` / `links` / `reverseLinks` を top-level に持つ flat な JSON とする
- フロントエンド domain の `Task` は IPC payload を `TaskPayload` として受け取った後、`hierarchy.parentFilePath` / `hierarchy.childFilePaths` と `links.linkedFilePaths` / `links.reverseLinkedFilePaths` に変換して保持する
- `title` が未定義の場合はファイル名（拡張子除去、ハイフンをスペースに変換）を fallback とし、`missingTitleUsedFileName` warning を付与する
- `title` が空文字または文字列以外の場合はファイル名 fallback とし、`invalidTitleUsedFileName` warning を付与する
- `status` が未定義の場合は既定ステータスを fallback とし、`missingStatusUsedDefault` warning を付与する
- `status` が文字列以外の場合は既定ステータスを fallback とし、`invalidStatusUsedDefault` warning を付与する
- `parent` が文字列以外の場合は値を無視し、`invalidParentIgnored` warning を付与する
- `parent` が文字列だが読み込み済み Task の `file_path` に存在しない場合は、値を保持したまま `parentNotFound` warning を付与する
- `parent` の存在検証では比較時のみ `\` と `./` を軽量正規化する。先頭 `/` または Windows drive prefix 付きの値は相対パス仕様外として `parentNotFound` warning を付与する
- 自己参照 `parent` は存在する Task として扱い、循環検出は PL-008 で扱う
- `extras` の非文字列 key は除外し、`nonStringExtraKeyIgnored` warning を付与する
- `extras` の JSON 非互換 value は除外し、`extraValueNotJsonCompatible` warning を付与する

### Task 変換時 warning code

| code | field | 条件 | 挙動 |
|:--|:--|:--|:--|
| `parentNotFound` | `parent` | `parent` が文字列だが、読み込み済み Task の `file_path` に存在しない | `parent` 値は保持し、Task の `warnings` に追加する |

## シリアライズ仕様

タスクの変更をmdファイルに書き戻す際のルール:

| ID | ルール | 説明 |
|:---|:-------|:-----|
| SL-001 | フロントマター再構成 | 変更されたフィールドのみを更新し、未知フィールドは保持 |
| SL-002 | フィールド順序 | `title` → `status` → `priority` → `labels` → `parent` → `links` → その他の順序で出力 |
| SL-003 | 本文保持 | 本文部分は変更せずにそのまま保持 |
| SL-004 | 改行コード | LF（`\n`）で統一 |
| SL-005 | 末尾改行 | ファイル末尾に改行を付与 |

## ディレクトリ構造

```
project-root/
├── .spec-board/
│   └── config.json          # カラム設定・アプリ設定
├── tasks/                   # タスク用ディレクトリ（推奨だが必須ではない）
│   ├── fix-login-bug.md
│   ├── add-search-feature.md
│   └── update-readme.md
└── other-dir/               # サブディレクトリ内のmdも対象
    └── design-review.md
```

- タスクのmdファイルはプロジェクトルート以下の任意の場所に配置可能
- `.spec-board/` ディレクトリはアプリの設定ファイル専用
- `node_modules`、`.git`、ドットディレクトリは除外

## サンプルファイル

### 最小構成

```markdown
---
title: ログイン画面のバグ修正
status: Todo
---
```

### フル構成

```markdown
---
title: 検索機能の追加
status: In Progress
priority: High
labels:
  - feature
  - frontend
  - backend
links:
  - tasks/product-list-redesign.md
---

## 概要

商品一覧ページにキーワード検索機能を追加する。

## 受け入れ基準

- キーワード入力で商品名を部分一致検索できる
- 検索結果が0件の場合、適切なメッセージを表示する
- 入力中はデバウンス（300ms）を適用する
```

### 親子関係の例

親タスク（`tasks/search-feature.md`）:
```markdown
---
title: 検索機能の追加
status: In Progress
priority: High
---

検索機能全体のEpicタスク。
```

子タスク（`tasks/search-ui.md`）:
```markdown
---
title: 検索UIの実装
status: Todo
priority: Medium
parent: tasks/search-feature.md
---

検索バーとオートコンプリートの実装。
```

孫タスク（`tasks/search-autocomplete.md`）:
```markdown
---
title: オートコンプリート実装
status: Todo
parent: tasks/search-ui.md
---

検索バーのオートコンプリート機能。
```

## update_task（部分マージ更新）

既存タスクの frontmatter / body を部分的に上書きする IPC コマンド。

入力: `{ filePath, title?, status?, priority?, labels?, parent?, body? }`

### マージ規則

- `Some` で渡されたフィールドだけが反映され、未指定フィールドは保持される
- raw frontmatter の未知 key・`links`・YAML 値型・出現順は **そのまま保持** される
  （内部実装は `Parsed { frontmatter, body }` の mut copy に patch を当て、`frontmatter::serialize` で書き戻す）
- `parent: ""` で親解除（frontmatter から `parent` キーを除去）
- `labels: []` で全ラベル削除
- `priority: None` は不変。**priority 自体を「なし」にする操作は本コマンドではサポートしない**
- **title 変更時もファイル名は不変**（rename はしない）
- 空 title 指定は許可される。書き戻し後の Task 再 parse で `invalidTitleUsedFileName` warning が乗る
- `children` は派生計算のため update_task では更新できない

### ファイル位置

update_task は `filePath` で識別し、**ファイル移動は一切行わない**。
`parent` を変更しても物理配置は元のディレクトリのまま。

### エラー（Display 文字列パターン）

- `file not found: <abs path>` — 対象ファイルが存在しない / cache に無い
- `invalid path: <input>` — `..` を含む、`.md` 以外、project_root 外、空、ディレクトリ指定
- `parse failed: <reason>` — 既存ファイルの frontmatter が壊れている / delimiter 不在
- `parent not found: <path>` — 指定 parent が cache に無い
- `parent validation: <file_path> (<reason>)` — 親チェーン循環 / 深度超過
- `content not scanner eligible: <reason>` — 更新後 body が 1 MiB 超 / NUL 含む

### parent 変更時の cache 再構築

`parent` フィールドが変化した場合のみ TaskIndex 全体を再構築し、
`validate_parent_hierarchy` + `build_children` + `build_reverse_links` を実行する。
title / status / priority / labels / body 単独の更新では再構築しない。

`parent` フィールドの「変化」は `intent.parent` の値に応じて以下のように判定する:

- `None`: parent は変更されない（`parent_changed=false`）。hierarchy 検証はスキップする（全タスク走査の O(N) コストを回避）。
- `Some("")`: parent を解除する。既存 parent が存在する、または frontmatter から `parent` キーが除去された場合に `parent_changed=true` となり hierarchy 検証を実行する（親解除なので構造的に循環は発生しないが、不正データの早期検出のため検証は走る）。
- `Some(path)`（非空）: 検証は以下の順序で実行する:
  1. **parent 存在チェック** — `parent_changed` の真偽に関わらず、最初に cache から該当 task を引き当てる。存在しなければ `parent not found: <path>` を返す。
  2. **正規化等価判定** — 正規化済みパス（`./tasks/p.md` / `tasks\p.md` などの表記揺れを吸収する lookup key）が既存 parent と等価なら `parent_changed=false` として hierarchy 検証はスキップする。
  3. **hierarchy 検証** — 正規化等価でない場合のみ `parent_changed=true` となり、対象 task を patch した暫定状態で全タスクの parent チェーンを `validate_parent_hierarchy` により再検証する。

検証に失敗した場合は `parent validation: <file_path> (<reason>)` を返し、ファイル書き込みおよび cache 更新は行わない。`reason` は循環検出 (`Cycle`) または 20 段超過 (`TooDeep`) のいずれか。

## 制限事項

- ファイルエンコーディングは **UTF-8（BOMなし）** のみサポート。BOM付きUTF-8はBOMを除去して読み込む。その他のエンコーディング（Shift-JIS等）はパースエラー
- フロントマターのYAML構文エラーがある場合、該当ファイルはタスクとして認識されない
- バイナリファイルや極端に大きいファイル（1MB超）はスキップ
- ネストされたYAML構造（オブジェクト型フィールド）は未知フィールドとして保持するが、spec-board UIでは編集不可
- 日本語など非ASCII文字を含むタイトルのファイル名生成: ASCII文字のみkebab-case変換し、非ASCII文字はそのまま保持する（例: 「ログイン修正」→ `ログイン修正.md`）。全てASCII変換不可の場合もタイトルをそのままファイル名に使用する
- 親子ネストの深さは最大20階層。超過した場合はパースエラーとして通知

## 関連仕様

- [config-spec.md](./config-spec.md) - 設定ファイルのスキーマ・AIエージェント向けGUIDE.md仕様
- [file-system-spec.md](./file-system-spec.md) - ファイルの読み書き・監視の実装仕様
- [task-card-spec.md](./task-card-spec.md) - パースされたデータの表示仕様
- [board-view-spec.md](./board-view-spec.md) - ステータスとカラムの対応関係

# spec-board - 設定仕様（バックエンド）

> **機能**: [spec-board](./index.md)
> **ステータス**: 下書き

## 概要

spec-board のプロジェクト単位の設定を `.spec-board/config.json` で管理する仕様を定義する。カラム定義、カード並び順、AIエージェント向けフォーマットガイドの自動生成もこの仕様の範囲とする。

> **UI 設定はここに含めない**: テーマ / 表示密度 / アクセント、サイドバーの折りたたみ、ボードの表示形態（ビュー切替）、最近開いたプロジェクトといった**クライアントローカルな UI 設定**は `config.json` ではなくブラウザの `localStorage`（`spec-board:*` キー）に保存する。プロジェクトを跨いで共有される端末固有の設定であり、プロジェクトフォルダ（リポジトリ）には持ち込まない。詳細は [board-view-spec.md](./board-view-spec.md) の「IDEシェル」節を参照。

## ディレクトリ構造

```
project-root/
├── .spec-board/
│   ├── config.json                          # プロジェクト設定（カラム・カード順序など）
│   ├── config.json.bak                      # 古い version の config を読み込んだ際のマイグレーション前バックアップ（後述「マイグレーション」節）
│   ├── config.json.bak.tmp.{pid}.{nanos}.{counter}  # backup 書き出し中の一時ファイル（rename で `.bak` に昇格／load 冒頭に閾値超過の orphan は cleanup）
│   ├── labels.yml                           # ラベルマスタ定義（説明・グループ・色などのメタ情報。後述「labels.yml スキーマ」節）
│   ├── milestones.yml                       # マイルストーンマスタ定義（表示名・期日・並び順・状態などのメタ情報。後述「milestones.yml スキーマ」節）
│   └── GUIDE.md                             # AIエージェント向けフォーマットガイド（自動生成）
└── tasks/
    └── ...
```

- `.spec-board/` はプロジェクト初回オープン時に自動作成
- `.spec-board/` は **gitに含めることを推奨**（カラム定義をチームで共有可能にするため）。ただし強制はしない
- `config.json.bak` / `config.json.bak.tmp.*` はマイグレーション処理由来のため `.gitignore` に含めることを推奨

## config.json スキーマ

```json
{
  "version": 1,
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "In Progress", "order": 1 },
    { "name": "Done", "order": 2 }
  ],
  "cardOrder": {
    "Todo": ["tasks/task-a.md", "tasks/task-b.md"],
    "In Progress": ["tasks/task-c.md"],
    "Done": []
  },
  "doneColumn": "Done"
}
```

### フィールド定義

| フィールド | 型 | 必須 | デフォルト | 説明 |
|:----------|:---|:-----|:----------|:-----|
| version | `number` | はい | `1` | 設定ファイルのスキーマバージョン。将来のマイグレーションに使用 |
| columns | `Column[]` | はい | `[Todo, In Progress, Done]`（`Config::default` baseline） | カラム（ステータス）定義の配列。**最低 1 つのカラムが必須**であり、`columns: []` は load 時に `EmptyColumns` エラーで拒否される（[エラーハンドリング](#エラーハンドリング) 参照） |
| columns[].name | `string` | はい | - | カラム名。タスクのフロントマター `status` と対応 |
| columns[].order | `number` | はい | - | カラムの表示順序（0始まり、昇順） |
| cardOrder | `Record<string, string[]>` | はい | `{}` | カラム名をキー、そのカラム内のタスクファイルパスの配列を値とする。配列順がカード表示順 |
| doneColumn | `string` | いいえ | 最後のカラム名 | 「完了」として扱うカラム名。サブIssue進捗バーの完了判定に使用 |

### columns

- 最低1つのカラムが必要
- カラム名の重複は不可
- `order` は連番である必要はないが、昇順でソートして表示に使用

### cardOrder

- `config.json` に記載されていないタスクは、カラム内の末尾に追加
- 存在しないファイルパスのエントリは自動的に除去（クリーンアップ）
- `columns` のいずれの `name` にも一致しないキーは、そのキーごと除去される
- `columns` に存在するキーについては、パス除去の結果として値が空配列 `[]` になってもキー自体は保持される（カラムの初期状態を表すため。`columns` に無いキーの除去ルールとは独立）
- 値配列内の重複パス除去は現行スコープ外（将来別 Issue で検討）
- ドラッグ&ドロップによるカラム内並び替え時に更新

### doneColumn

- サブIssue進捗バーにおける「完了」の判定基準となるカラム
- 未設定の場合は `columns` の最後のカラムをデフォルトとして使用

## labels.yml スキーマ

タスク frontmatter の `labels`（自由文字列の配列）に対し、説明・グループ・色などのメタ情報を一元管理する「ラベルマスタ定義ファイル」を `.spec-board/labels.yml` に置く。`config.json` とは別ファイルで管理し、トップレベルの `labels:` キー配下に定義の配列を並べる。

```yaml
# .spec-board/labels.yml
labels:
  - name: bug
    description: バグ報告
    group: type
    color: "#D73A4A"        # 必ずクォートする（unquoted な #... は YAML コメント扱いになる）
    updated: "2026-05-30T12:00:00Z"
  - name: enhancement       # name のみ（他フィールドは任意・省略可）
```

### フィールド定義

| フィールド | 型 | 必須 | デフォルト | 説明 |
|:----------|:---|:-----|:----------|:-----|
| labels | `LabelDefinition[]` | いいえ | `[]` | ラベル定義の配列。トップレベルキー欠落 / `null` / 空配列はいずれも空レジストリ（= 全ラベル暗黙扱い）に正規化される |
| labels[].name | `string` | はい | - | ラベル識別子。完全一致・未正規化（trim / 大文字小文字統一なし）。空文字 `""` は不可 |
| labels[].description | `string` | いいえ | なし | ラベルの説明文 |
| labels[].group | `string` | いいえ | なし | UI 上のグルーピングに使うグループ名（グルーピングの表示は表示層の責務）。空文字 `""` は未指定として扱い `None` に正規化する（trim / 大文字小文字統一はしない） |
| labels[].color | `string` | いいえ | なし（既定色） | `#RRGGBB` 形式の色。不正形式は lenient に「色なし（既定色）」へ倒す（後述） |
| labels[].updated | `string` | いいえ | なし | 最終更新日時。ISO 8601 を推奨するが形式は検証せず文字列のまま保持する |

### 配置・読み込み

- `.spec-board/labels.yml` に配置する。ファイル不在時は空レジストリ（`labels: []`）として扱い、プロジェクトは正常に開ける（後方互換）。
- プロジェクトオープン時（`open_project`）に読み込み、`AppState` に保持する。取得は独立した `get_labels` コマンドで行う（`open_project` の payload には同梱しない）。
- 空ファイル / コメントのみ / `---`（null ドキュメント）/ `labels:` キー欠落 / `labels: null` はいずれも空レジストリに正規化する。

### color の lenient 解釈

- `color` は `#RRGGBB`（`#` + 16 進 6 桁）のみ妥当とみなす。妥当な場合のみ色として保持する。
- 不正形式（`"red"` / `"#GGG"` 等）・型不一致（数値 `123` / マッピング `{}`）・欠落・`null` はエラーにせず「色なし」へ倒す。payload では `color` を省略し、既定色の適用は FE 表示層の責務とする。
- **`color` はクォート必須**: YAML では `#` 以降がコメント扱いになるため、`color: #1A2B3C`（クォートなし）は値が `null` と解釈され、silently 既定色へ倒れる。必ず `color: "#1A2B3C"` とクォートする。

### name 一意性の検証

- `name` はマスタ内で完全一致・一意。重複が見つかれば load 時に拒否し、`open_project` は `labels load failed (parse)` として失敗する。
- `name` が空文字 `""` の定義も load 時に拒否する（`labels load failed (parse)`）。空白のみ `"   "` は trim しない方針のため許容する（未正規化）。
- ここでの「一意性 / 空拒否」はマスタ定義 `labels.yml` 自身に対する制約であり、**frontmatter の未定義ラベル**（labels.yml に存在しないラベル名）は警告なく暗黙許容する点と区別する。

### スキーマの前方互換

- 未知のトップレベルキー / 定義内キーは無視する（`deny_unknown_fields` は付けない）。将来のフィールド追加に対する前方互換のため。
- lenient なのは `color` のみ。`name` / `description` / `group` / `updated` は文字列型を strict に検証し、文字列以外（数値 `123` / bool / mapping / sequence 等）が来た場合は `labels load failed (parse)` として扱う（`description: "123"` のようにクォートすれば文字列として受理される）。
- `get_labels` payload は labels.yml の定義順をそのまま保持する（並べ替えない）。`group` での UI グルーピングは表示層の責務。

### get_labels の使用数集計

`get_labels` の payload は定義（labels.yml 由来）と派生値（使用数）を別フィールドで返す（1 オブジェクトに混ぜない）。

```ts
type GetLabelsPayload = {
  labels: LabelDefinition[];          // 定義順を保持
  usageCounts: { [name: string]: number }; // ラベル名 → 使用タスク件数
};
```

- `usageCounts` は「そのラベルを使っているタスクの件数」。1 タスク内で同じラベルが重複していても 1 件（タスク単位で重複排除）。照合は完全一致・未正規化。
- `usageCounts` はタスク側（frontmatter）由来のため、labels.yml に未定義の暗黙ラベルのキーも含み得る。FE は `labels[].name` で引くため余分なキーは無害（暗黙ラベルは `labels` に現れない）。
- 集計は表示用のため eventual consistency を許容する（labels と tasks を厳密に同一トランザクションでは観測しない）。
- **FE 型ドリフト注意**: FE の TS 型は手書きのため、Rust 側の `usageCounts` 追加だけでは TS ビルドは壊れない。`GetLabelsPayload` の TS 型に `usageCounts` を追加して追従する必要がある（FE 実装は別 Issue）。

### ラベル CRUD コマンド

ラベルマスタの書き込みは 3 コマンドで行う。いずれも成功時に `.spec-board/labels.yml` を atomic に上書きし、in-memory state にも反映する。

| コマンド | 引数 | 戻り値 | 説明 |
|:---------|:-----|:-------|:-----|
| `create_label` | `{ name, description?, group?, color? }` | `Unit` | 新規ラベルを追記する。`name` 重複・空文字 `""` は拒否。`group` 空文字 / `color` 不正 hex は未指定に倒す（lenient）。`updated` はサーバが現在時刻を自動セット |
| `update_label` | `{ name, description?, group?, color? }` | `Unit` | 既存ラベルの metadata を更新する。`name` は同一性キーで **rename しない**。不在 `name` は拒否。`updated` をサーバが自動更新 |
| `delete_label` | `{ name }` | `{ usageCount }` | 指定ラベルを削除する。不在 `name` は拒否。削除前の使用タスク件数を返す |

- **`update_label` は PUT セマンティクス**: FE は全フィールドを送る契約。`description` / `group` / `color` を未指定（または `null`）で送ると、その既存値は**クリアされる**（部分更新ではない）。`color` の不正 hex も既定色（未指定）へ倒れる。
- **`updated` の自動セット**: `create_label` / `update_label` 時にサーバが現在時刻を ISO 8601 / RFC 3339（UTC・`Z` 終端）でセットする。FE / 引数からは指定できない。
- **`delete_label` の usageCount**: 削除前に算出した使用タスク件数（`get_labels` の `usageCounts` と同じ意味）。`usageCount > 0`（使用中）でも削除は実行し、タスク frontmatter の `labels` は一切変更しない（タスク側は暗黙ラベルとして残る）。delete の usageCount は labels と tasks を整合スナップショットで観測した値。
- **エラー文字列契約**（FE のパターンマッチ整合のため `get_labels` と完全一致）:
  - プロジェクト未オープン → `"プロジェクトが開かれていません"`
  - 内部状態の lock 破損 → `"内部状態のロックが破損しました"`

> **スコープ境界**: 本仕様は labels.yml のスキーマ確定・読み込み・`get_labels`（使用数集計含む）・`create_label` / `update_label` / `delete_label`・invoke ラッパまでを対象とする（Rust バックエンド）。FE 連携（`usageCounts` の TS 型追従・ラベル編集 UI）と実際のラベル色の UI 反映（既定色の具体値 / design token 定義）は別 Issue で扱う。

## milestones.yml スキーマ

タスク frontmatter の `milestone`（単数の自由文字列・参照キー）に対し、表示名・期日・並び順・状態などのメタ情報を一元管理する「マイルストーンマスタ定義ファイル」を `.spec-board/milestones.yml` に置く。`config.json` とは別ファイルで管理し、トップレベルの `milestones:` キー配下に定義の配列を並べる。labels.yml と同じハイブリッド構成（frontmatter 自由文字列 + yml マスタ・非破壊・暗黙許容）を踏襲する。

```yaml
# .spec-board/milestones.yml
milestones:
  - name: v0.3
    title: v0.3 リリース
    description: ラベル/マイルストーン基盤の整備
    due: "2026-07-31"          # 期日。ISO 8601（日付 / 日時）を推奨。クォート推奨
    order: 0                    # 並び順（昇順。0 始まり）
    state: open                 # open / closed 等。task の status とは別概念
    updated: "2026-06-03T12:00:00Z"
  - name: v0.4                  # name のみ（他フィールドは任意・省略可）
```

### フィールド定義

| フィールド | 型 | 必須 | デフォルト | 説明 |
|:----------|:---|:-----|:----------|:-----|
| milestones | `MilestoneDefinition[]` | いいえ | `[]` | マイルストーン定義の配列。トップレベルキー欠落 / `null` / 空配列はいずれも空レジストリ（= 全マイルストーン暗黙扱い）に正規化される |
| milestones[].name | `string` | はい | - | マイルストーン識別子。frontmatter `milestone` から参照される値。完全一致・未正規化（trim / 大文字小文字統一なし）。空文字 `""` は不可 |
| milestones[].title | `string` | いいえ | なし | 人間可読な表示名（例: `v0.3 リリース`）。未指定時は表示層が `name` をフォールバック表示する |
| milestones[].description | `string` | いいえ | なし | マイルストーンの説明文 |
| milestones[].due | `string` | いいえ | なし | 期日（リリース予定日 / 締切）。ISO 8601 を推奨するが形式は検証せず文字列のまま保持する。並び替え・進捗表示に利用 |
| milestones[].order | `number` | いいえ | なし | 表示順序（昇順）。**有限の非負整数のみ有効**。小数 / 負数 / `null` / 型不一致は未指定（並び順なし）に倒す。並び規則: 有効な `order` を持つ要素を `order` 昇順で先に並べ、同一 `order` は定義順を保持する。`order` 未指定の要素は有効 `order` 付き要素の後ろに定義順で並べる |
| milestones[].state | `string` | いいえ | `open`（表示層フォールバック） | マイルストーンの開閉状態。`open` / `closed` 等。**task frontmatter の `status` とは別概念**。未知値は表示層が `open` 相当にフォールバックする |
| milestones[].updated | `string` | いいえ | なし | 最終更新日時。ISO 8601 を推奨するが形式は検証せず文字列のまま保持する |

### 配置・読み込み

- `.spec-board/milestones.yml` に配置する。ファイル不在時は空レジストリ（`milestones: []`）として扱い、プロジェクトは正常に開ける（後方互換）。
- 空ファイル / コメントのみ / `---`（null ドキュメント）/ `milestones:` キー欠落 / `milestones: null` はいずれも空レジストリに正規化する。
- **YAML ルート型**: YAML ドキュメントのルートは mapping を要求する。ルートが sequence（`[]` / `[...]`）/ scalar（`foo` など）の場合は load エラーとする（ファイル全体が配列 / スカラのケースは「キー欠落（空レジストリ）」ではなく構造不正として扱う。null ドキュメント `---` のみは空レジストリ正規化の対象）。
- **構造の strict 検証**: ルート mapping 配下の `milestones` が**配列以外**（mapping `{}` / スカラ `foo` など）、または**配列要素が mapping 以外**（`[null]` / `["v0.3"]` など）の場合は load エラーとして拒否する（labels.yml の strict 解釈に合わせる）。
- プロジェクトオープン時（`open_project`）に読み込み in-memory state に保持し、独立コマンド `get_milestones` で取得する（labels.yml の `open_project` / `get_labels` の振り分けに倣う）。

### lenient 解釈

lenient には **2 つの軸**がある（labels.yml が「lenient なのは color のみ」と単軸で語るのに対し、milestones は型と値で層が分かれる点に注意）。

- **型レベルの lenient（`order` のみ）**: `order` が型不一致（文字列など）・小数・負数・`null` の場合はエラーにせず未指定（並び順なし）に倒す。有効値は有限の非負整数のみ。文字列フィールドはこの型 lenient の対象外で文字列型を strict に検証する。
- **値レベルの lenient（`state`）**: `state` は文字列型としては strict に検証するが、**未知の文字列値**（`open` / `closed` 以外）もエラーにせず保持する。表示層が既定（`open` 相当）にフォールバックする。文字列以外の型（数値 / bool / mapping 等）が来た場合は load エラー。
- `due` / `updated` は形式（ISO 8601 等）を検証せず文字列のまま保持する（型は strict に文字列を要求）。
- 任意文字列フィールド（`title` / `description`）の空文字 `""` は未指定として `None` に正規化する（trim はしない。labels.yml の `group` 空文字正規化に倣う。`name` の空文字のみ拒否対象）。
- frontmatter `milestone` 値がマスタ未定義の場合は警告を出さず素通しする（暗黙許容・非破壊。「name 一意性の検証」節と区別）。

### name 一意性の検証

- `name` はマスタ内で完全一致・一意。重複が見つかれば load 時に拒否する（labels.yml の `labels load failed (parse)` に倣い、`milestones load failed (parse)` とする）。
- `name` が空文字 `""` の定義も load 時に拒否する。空白のみ `"   "` は trim しない方針のため許容する（未正規化）。
- ここでの「一意性 / 空拒否」はマスタ定義 `milestones.yml` 自身に対する制約であり、**frontmatter の未定義マイルストーン値**は警告なく暗黙許容する点と区別する。

### スキーマの前方互換

- 未知のトップレベルキー / 定義内キーは無視する（`deny_unknown_fields` は付けない）。将来のフィールド追加に対する前方互換のため。
- `name` / `title` / `description` / `state` / `due` / `updated` は文字列型を strict に検証する（型不一致は load エラー）。`order` のみ数値型 + lenient フォールバック。
- マスタの定義順は payload でそのまま保持する（並べ替えない）。`order` による並びは表示層の責務とする。

## 設定の初期化

### 初回オープン時の振る舞い

```mermaid
flowchart TD
    A[プロジェクトを開く] --> B{.spec-board/ 存在?}
    B -->|No| C[.spec-board/ を作成]
    B -->|Yes| D{config.json 存在?}
    C --> D
    D -->|No| E[mdファイルをスキャン]
    D -->|Yes| F{version チェック}
    E --> G{タスクあり?}
    G -->|Yes| H[status フィールドからカラムを自動生成]
    G -->|No| I[デフォルトカラム Todo / In Progress / Done を作成]
    H --> J[config.json を書き出し]
    I --> J
    J --> K[GUIDE.md を生成]
    F -->|最新| L[設定を読み込み]
    F -->|古い| M[マイグレーション実行]
    F -->|未来| X[UnknownFutureVersion エラー]
    X --> Y[呼び出し層がデフォルト + トースト通知]
    M --> L
    L --> K
    K --> N[完了]
    Y --> N

    style X fill:#fdd
    style Y fill:#fdd
```

### 既存タスクからのカラム自動生成（純粋関数 `build_config_from_statuses`）

上記フローチャートの `H[status フィールドからカラムを自動生成]` ノードは、バックエンドの純粋関数 `build_config_from_statuses` が担当する。本関数の責務と入出力規約を以下に明文化する。

#### 責務 / 入出力

- **入力**: `(file_path, status)` の列（既存タスクの md フロントマター由来）。
- **出力**: `Config` 値。**保存は行わない**（保存・走査・パースは別レイヤの責務）。
- **入力 0 件のときの戻り値**: `columns: []` の `Config`。これは**内部純粋関数の戻り値**であり、保存対象 `config.json` ではない。
- 「タスクなし時はデフォルト 3 カラム（Todo / In Progress / Done）を保存する」分岐は**上位フロー側**の責務であり、その層で `Config::default()` を採用する。
- 「`columns` は最低 1 つ必要」のルール（上記「columns」節）は**保存される `config.json`** に対する制約であり、純粋関数の戻り値とは独立。

#### カラム順序と `doneColumn` の採用規則

- カラム名は `(path, status)` 列を **path 昇順**でソートしてから、各 status の **first-occurrence wins**（初出順、重複は除去）で並ぶ。
- ソートは `PathBuf::Ord`（OS の `OsStr` 表現順序）に従い、project-root からの相対パスでの比較が前提。
- `status` フィールドが欠落しているタスク（`None`）は、先頭デフォルトカラム名（`"Todo"`）にフォールバックする。
- `doneColumn` は生成された columns の**末尾カラム名**を採用する（`columns` が空なら `None`）。

#### 入力 status の正規化責務

- 入力の status 文字列はそのまま採用される。空文字 `""`、空白のみ `" "`、前後空白を含む `"  Todo  "` も**未正規化のまま**カラム名となる。
- `trim` / 大文字小文字統一などの正規化は**呼び出し層**（フロントマター `extras["status"]` を `Value -> Option<String>` に変換する層）の責務。
- 結果として、未正規化の `"  Todo  "` と trim 後の `"Todo"` は**別カラム**として扱われる点に注意。

### マイグレーション

- `version` フィールドでスキーマバージョンを管理
- バージョンが古い場合、自動的にマイグレーションを実行
- マイグレーション前にバックアップ（`config.json.bak`）を作成

#### バージョン判定の挙動

これらは **`load_or_default` の戻り値**としての契約を述べる。アプリ起動時のユーザー体験（デフォルト + トースト）はこれを受け取った**呼び出し層（Tauri コマンド / アプリシェル）の責務**であり、後述「[エラーハンドリング](#エラーハンドリング)」のテーブルにフォールバック挙動を集約する。

- 読み込んだ `version` が現行サポート範囲（`DEFAULT_VERSION = 1`）を超える場合は `UnknownFutureVersion` エラーを `Err` として返す。
- `load_or_default` は冒頭で `<root>/.spec-board/config.json.bak.tmp.*` の orphan を best-effort で削除する（クラッシュ等で `open(tmp)` と `rename(tmp, dst)` の間で中断された残骸を後続 load で清掃する）。安全条件として: (1) `.spec-board/` 自体が symlink の場合は走査自体を skip して外部ディレクトリの巻き込み削除を防ぐ、(2) tmp 名末尾の `{nanos}` を読み、現在時刻との差が **1 時間以上** の orphan のみを削除対象とし、同一 / 別プロセスで進行中の concurrent load が作った直近の live tmp は温存する。
- 古い `version` を読み込んだ場合は `<root>/.spec-board/config.json.bak` をマイグレーション**前**の生コンテンツで作成（既存 `.bak` は警告なく上書き、履歴は残さない）した上でマイグレーションを実行する。**書き出し戦略**: ① 呼び出しごとに unique な tmp パス（`config.json.bak.tmp.{pid}.{nanos}.{counter}`、`counter` は process-local AtomicU64）を組み立て（同一プロセス内・粗い時計分解能環境でも collision を防ぎつつ並行 load 干渉を回避）、② その tmp パスを `unlink`（symlink / hard link のリンク先や inode は破壊せずディレクトリエントリだけ除去）してから `O_CREAT | O_EXCL` 相当（`OpenOptions::create_new(true)`）で完全に新しい inode を atomic に作成し、③ その fresh inode に raw コンテンツを書き込み、④ atomic `rename(<tmp>, config.json.bak)` でディレクトリエントリだけを差し替える。これにより tmp が事前に外部ファイルへ **symlink / hard link** されていても、`.bak` が外部ファイルへ hard link されていても、いずれの inode も truncate されずプロジェクト外のファイル上書きを防げる。書き出し前に追加で `<root>/.spec-board/` ディレクトリと `config.json.bak` の leaf の双方が symlink でないことを確認し、いずれかが symlink の場合は `BackupFailed` を返して書き出しを拒否する（多重防御）。いずれもベストエフォート防御であり、`<root>` 自身およびそれ以上の ancestor の symlink / hard link、本チェックと write / rename の間に発生する TOCTOU race、ロックレスでの並行 load 完全制御は **本Issue 範囲外**（lockfile / project-root 内制限の導入は別Issue で扱う）。
- マイグレーション結果は呼び出し側に返る `Config.version` が常に `DEFAULT_VERSION` に正規化される。本Issue（骨格段階）では `config.json` への永続化は行わないため、古い `version` のファイルが残っている限り、毎回の load で backup + migrate 経路を通る。
- `version` フィールドの欠落 / 型不一致（文字列など）/ `u32` 範囲外は通常の JSON パースエラー（`Parse`）として扱う。

#### カラム名重複の検証

- `columns` 内のカラム名は load 時に完全一致で重複検査される。重複が見つかれば `DuplicateColumnName` を `Err` として返す（呼び出し層のフォールバック挙動は[エラーハンドリング](#エラーハンドリング)を参照）。
- 大文字小文字違い（例: `"Todo"` vs `"todo"`）は別カラム扱い（`build_config_from_statuses` と同規約）。
- カラム名は値そのものを完全一致比較する。空文字 `""` / 空白のみ `" "` / 前後空白付き `"  Todo  "` も**未正規化のまま**受理し、distinct であれば許容する（`trim` 等の正規化責務は呼び出し層）。空文字 / 空白を別エラーとして拒否する仕様は本Issue 範囲外。

## AIエージェント向けガイド（GUIDE.md）

プロジェクトオープン時およびカラム設定変更時に `.spec-board/GUIDE.md` を自動生成する。AIエージェントがこのファイルを参照することで、有効なステータス値やフォーマットを把握できる。
バックエンドの `Config::guide_markdown` / `generate_guide_markdown` / `generate_guide_markdown_for_columns` は、GUIDE.md の Markdown 本文を組み立てる純粋関数である。`.spec-board/GUIDE.md` への書き込み、更新タイミング制御、Tauri コマンド公開は別レイヤの責務とする。

### 生成内容

```markdown
# spec-board タスクフォーマットガイド

このプロジェクトは spec-board で管理されています。
タスクは以下のフォーマットの Markdown ファイルで管理します。

## テンプレート

````
---
title: タスクのタイトル（推奨・省略時はファイル名からフォールバック）
status: Todo（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）
priority: Medium（任意・High / Medium / Low）
labels:（任意）
  - ラベル名
milestone: v0.3（任意・マイルストーン名。.spec-board/milestones.yml の name と対応）
parent: tasks/parent-task.md（任意・親タスクのパス）
links:（任意）
  - tasks/related-task.md
---

タスクの詳細説明
````

## 有効なステータス値

- Todo
- In Progress
- Done

## ルール

- ファイルは `.md` 拡張子で作成してください
- `.spec-board/` ディレクトリ内のファイルは編集しないでください
- `parent` に指定するパスはプロジェクトルートからの相対パスです
```

上記は default config の生成例である。実際の GUIDE.md 生成では、テンプレート内の `status:` 例は `columns[].order` 昇順で最初の `columns[].name` を raw 出力する。

「有効なステータス値」セクションは、`columns[].name` を `columns[].order` 昇順で bullet 出力する。同一 `order` のカラムがある場合は入力配列順を保持する。カラム名は Markdown escape / trim / normalization を行わず、値そのものを出力する。

保存対象の `config.json` では `columns: []` は load 時に拒否されるが、Markdown 文字列生成用の純粋関数は `columns: []` 入力でも panic せず文字列を返す。この場合、テンプレート内の `status:` 例は `Todo` にフォールバックし、「有効なステータス値」見出し直下には bullet を出力せず空行を 1 つ置く。

生成される Markdown 文字列は、タイトル、テンプレート、有効なステータス値、ルールの順序で決定論的に構成され、末尾改行を含む。

### 更新タイミング

| トリガー | 動作 |
|:--------|:-----|
| プロジェクト初回オープン | GUIDE.md を新規生成 |
| カラム追加・削除・名前変更 | 有効なステータス値セクションを再生成 |
| 外部エディタで config.json を直接編集後、アプリ再起動 | GUIDE.md を再生成して反映 |

## Tauriコマンド

### `get_columns`

**説明**: 現在のカラム設定を取得する。

**引数**: なし

**戻り値**:
```json
{
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "In Progress", "order": 1 },
    { "name": "Done", "order": 2 }
  ],
  "doneColumn": "Done"
}
```

---

### `update_columns`

**説明**: カラム設定を更新する。カラムの追加・削除・名前変更・並び替え・完了カラム変更を 1 コマンドで処理する。すべての引数は任意で、指定されたフィールドのみが更新される（`renames` → `columns` → `doneColumn` の順に適用）。

**引数**:

| パラメータ | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| columns | `Vec<Column>` | いいえ | 新しいカラム設定の配列。指定時はカラム集合を上書き（追加・削除・並び替え）。**rename 適用後の名前空間**で指定する。未指定時はカラム集合を変更しない |
| renames | `Vec<Rename>` | いいえ | カラム名変更の配列 `[{ "from": "旧名", "to": "新名" }]`。空配列または未指定で rename 処理スキップ |
| doneColumn | `String` | いいえ | 完了カラム名。**rename 適用後の名前空間**で指定する。未指定時は変更しない |

**振る舞い**:
1. すべての引数が未指定（`columns`/`doneColumn`/`renames` のいずれも `None`）の場合は no-op として `Ok(())` を返し、ファイルや state を一切変更しない
2. `renames` 内で `from == to` の項目は冪等にスキップ
3. `renames` が指定され、かつ空でない場合、該当するタスクの md ファイルの `status` を一括更新（空配列または未指定の場合はこのステップをスキップ）。`from == to` の項目は冪等にスキップされ、md への書き込みも `WriteIgnoreRegistry` の登録/解除も行わない（preflight 時の `write_ignore` 健全性 probe は通常通り走る）。一括更新はトランザクション的に処理され、以下の段階で進行する:
   - **(a) pre-read**: 対象 md 全件の原本 bytes をメモリに読み込む。1 件でも読み込み失敗した場合は `RenameReadFailed` を返し、disk を一切変更せず終了する。
   - **(b) write_ignore 登録**: watcher 起動中 (`is_watcher_installed() == true`) のみ、対象 md のパスを `WriteIgnoreRegistry` に bulk 登録する。watcher 未起動時は登録をスキップ。
   - **(c) 順次 write**: 各 md の frontmatter `status` を新カラム名に書き換えて atomic write。途中で 1 件でも失敗した場合、書き込み完了済み md を原本 bytes で書き戻し、**rollback が成功した場合に限り** 登録済み write_ignore エントリを解除してから失敗エラーを返す。rollback 自体が失敗した場合は `RenameRollbackFailed` を返し、その時点で early return するため write_ignore の解除は行われない（現状仕様）。
4. `columns` が指定されている場合、カラム集合を上書きして `config.json` に保存
5. `doneColumn` が指定されている場合、完了カラム名を更新して `config.json` に保存
6. `GUIDE.md` を再生成（**best-effort**。書き込み失敗時はログ (WARN + stderr fallback) のみ出力し、`update_columns` 自体は成功扱いとする）
7. 戻り値なし（更新後の設定が必要な場合は呼び出し側が `get_columns` で取得する）

**エラー**:

| ケース | 条件 | エラーメッセージ |
|:-------|:-----|:---------------|
| プロジェクト未オープン | `AppState` に project_path / config が無い | プロジェクトが開かれていません |
| 内部 lock 破損 | `AppState` または `WriteIgnoreRegistry` の Mutex が poison | 内部状態のロックが破損しました |
| watcher 補助スレッド起動失敗 | `WriteIgnoreRegistry` の cleanup worker 起動失敗 | watcher の補助スレッド起動に失敗しました |
| カラム全削除 | `columns: []`（空配列）が指定された | カラムを 0 件にすることはできません |
| カラム名重複 | 同名のカラムが存在する | カラム名が重複しています: {name} |
| 不在 rename from | `rename.from` が現在の columns に無い | 存在しないカラム名のリネームが指定されました: {name} |
| 重複 rename from | 同じ `from` を複数 rename で指定 | 同じカラム名のリネームが複数指定されました: {name} |
| 空 rename to | `rename.to` が空文字列 | リネーム後のカラム名が空です |
| 不在 doneColumn | `doneColumn` が新 columns に無い | 指定された完了カラムが存在しません: {name} |
| rename.to が新 columns に欠落 | `args.columns` と `renames` を同時指定したが `rename.to` が新 columns に含まれない | リネーム後のカラム名が新しい columns に含まれていません: {name} |
| md frontmatter パース失敗 | rename 対象 md の YAML パースに失敗 | カラム名の変更中にフロントマターのパースに失敗しました |
| md frontmatter 不在 | rename 対象 md に frontmatter が無い | カラム名の変更対象 md にフロントマターがありません: {path} |
| 原本読み込み失敗 | rename 対象 md の読み込みに失敗（書き換え開始前） | カラム名の変更対象 md の読み込みに失敗しました: {path} |
| 一括更新失敗 | リネーム中のファイル書き込み失敗 | カラム名の変更中にエラーが発生しました。変更を元に戻しました |
| ロールバック失敗 | rollback 中の書き戻しに失敗（二重失敗） | カラム名の変更失敗後のロールバックに失敗しました: {path} |
| config.json シリアライズ失敗 | `serde_json::to_string_pretty` 失敗 | config.json のシリアライズに失敗しました |
| config.json 書き込み失敗 | atomic write 失敗（権限・ディスク容量等） | config.json の書き込みに失敗しました: {path} |

**rollback 時の副作用**: 失敗時のロールバックは原本 bytes による書き戻しを行い、**rollback が成功した場合のみ** `WriteIgnoreRegistry` への登録解除も併せて実施する。これにより通常の rename 途中失敗パスでは watcher 由来の自己 write イベント抑止状態が残らず、後続の `update_columns` 呼び出しに副作用を残さない。rollback 自体が失敗した場合 (`RenameRollbackFailed`) は early return するため write_ignore の解除は行われない（実装の現状仕様。改修は本 PR スコープ外として別 Issue 化候補）。

---

### `update_card_order`

**説明**: カラム内のカード並び順を更新する。

**引数**:

| パラメータ | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| columnName | `String` | はい | 対象カラム名 |
| filePaths | `Vec<String>` | はい | 新しい並び順のファイルパス配列 |

**振る舞い**:
1. `columnName` が `columns[]` に存在しない場合は更新を拒否し、`config.json` を変更しない（エラー文字列: `カラムが見つかりません: {columnName}`）
2. `filePaths` は FE が正規化済みの project-relative path であることを前提とし、BE 側では `canonicalize` や `project_root` 配下に収まっているかの containment 検証は行わない。各パスを `project_root.join(path)` で解決した結果に対し `std::fs::metadata` を呼び、`Err` が `ErrorKind::NotFound` の場合のみ除外する。`permission denied` 等の `NotFound` 以外の I/O エラーはユーザーのカード並びを誤って消さないために保守的にパスを保持する。クリーンアップ後の配列を `cardOrder[columnName]` に上書き保存する。順序は入力 `filePaths` を保持し、削除対象のみ抜く
3. 既存キーがあれば**上書き**、無ければ**新規追加**として `cardOrder` に書き込む
4. 書き込みは tmp → rename ベース（Unix では `rename(2)` の atomic 置換、Windows では既存ファイル上書き時に backup 経由の 2 段 rename にフォールバック）で行い、`config.json` 自体が中途半端な内容になる部分書き込みを防止する
5. `.spec-board/` ディレクトリは watcher の拡張子フィルタで除外されるため、本書き込みによって FE への変更通知（emit）は走らない
6. disk への書き込みが成功した場合、`project_path` が処理開始時の snapshot と一致するときに限り AppState の `Config` を更新する。disk 失敗時は in-memory の `Config` を変更しない（次回呼び出しで再試行可能）

**並行性**:

- **逐次**呼び出し（前の呼び出しが完了してから次が始まる場合）は、最後の呼び出しの結果が最終的に保存される（後勝ち）。
- **`open_project` との並行**: 処理開始時に `project_path` と `config` を**両 lock 同時保持下で atomic に snapshot** し、disk write 後の in-memory 更新も**両 lock 同時保持下で `project_path` の一致確認 + `config` 更新の atomic check-and-set** として行う。これにより `open_project` の commit と interleave しても「新 path + 旧 config」を観測する race や、旧プロジェクトの config を新プロジェクトの in-memory state に注入する race は発生しない。snapshot 取得後に project が swap された場合、disk write は旧プロジェクトの `.spec-board/config.json` に対して整合的に完了し、新プロジェクトの in-memory 更新は no-op となる。
- **同一プロジェクト内での `update_card_order` 並行**呼び出し時の厳密な整合性は本機能では保証しない。`snapshot_project_and_config` から `replace_config_if_project_matches` までは 2 回の lock 取得に分かれているため、間に別の `update_card_order` 呼び出しが完了すると、後勝ちの disk 書き込みより前に取得した snapshot で disk が上書きされる race window が残る。本ケースは現状の DnD UX 上の問題が観測されていないため受容しており、将来 `AppState::with_config_mut` のような atomic update helper を導入した時点で改善する。

## エラーハンドリング

### load_or_default が返す `LoadConfigError` バリアント

`load_or_default` が返す各 `Err` バリアントに対して、**呼び出し層（Tauri コマンド / アプリシェル）が決定する**フォールバック挙動を以下にまとめる。バックエンド層自体はデフォルトへのフォールバックを行わず、エラーを caller に返す。

| エラーケース | 発生条件 | バックエンド戻り値 | 呼び出し層の振る舞い | ログレベル |
|:------------|:---------|:------------------|:-------------------|:----------|
| JSON パース失敗 | JSON 構文エラー、必須フィールド欠落、`version` の型不一致 / `u32` 範囲外 | `LoadConfigError::Parse` | デフォルト設定で起動し、トースト通知 | ERROR |
| 未来 version 検出 | `version > DEFAULT_VERSION` | `LoadConfigError::UnknownFutureVersion` | デフォルト設定で起動し、トースト通知（アプリの更新案内を含む） | ERROR |
| カラム名重複 | `columns` 内に同一名のカラムが存在 | `LoadConfigError::DuplicateColumnName` | デフォルト設定で起動し、トースト通知 | ERROR |
| 空カラム | `columns: []` (spec の「最低1つのカラムが必要」違反) | `LoadConfigError::EmptyColumns` | デフォルト設定で起動し、トースト通知 | ERROR |
| マイグレーション失敗（**本Issue 時点では到達不能**: 詳細は表下注を参照） | `migrate_config` が `MigrationError` を返す | `LoadConfigError::MigrationFailed` | デフォルト設定で起動し、トースト通知 | ERROR |
| バックアップ失敗 | `.bak` の書き出しに失敗（権限不足 / symlink 宛先 / ディレクトリ衝突など） | `LoadConfigError::BackupFailed` | デフォルト設定で起動し、トースト通知（バックアップ作成失敗の旨を明示） | ERROR |
| I/O 失敗 | `.spec-board/` の作成 / `config.json` の読み取りに失敗 | `LoadConfigError::Io` | デフォルト設定で起動し、トースト通知 | ERROR |

> **`MigrationFailed` の到達可能性について**
>
> 本Issue（骨格段階）時点では `load_or_default` 経由で `LoadConfigError::MigrationFailed` は実際には返らない。`from_version > DEFAULT_VERSION` は `UnknownFutureVersion` で先に弾かれ、`from_version <= DEFAULT_VERSION` の経路では現行 `migrate_config` は常に `Ok` を返すため。
> バリアントは `MigrationError` の variant 追加に向けた forward compatibility のために存在し、将来 `DEFAULT_VERSION` を引き上げて実マイグレーションを実装したタイミングで実際に発生し得るようになる。本Issue 時点の caller は `MigrationFailed` 経路を実装しなくてよい（match の網羅性のためにダミーアームを書く程度で十分）。

### load_or_default 以外のフロー

| エラーケース | 発生条件 | 振る舞い | ログレベル | 仕様参照 |
|:------------|:---------|:---------|:----------|:--------|
| config.json 書き込み失敗 | ディスク容量不足、権限不足 | エラーをフロントエンドに通知 | ERROR | save 経路（別Issue） |
| GUIDE.md 生成失敗 | 書き込み権限不足 | 警告ログ出力。アプリの動作には影響しない | WARN | GUIDE.md 自動生成（別Issue） |

## 制限事項

- `config.json` を外部エディタで直接編集した場合、アプリ再起動まで反映されない
- `cardOrder` に数千件のエントリがある場合、config.json のサイズが肥大化する可能性がある

## 関連仕様

- [file-system-spec.md](./file-system-spec.md) - プロジェクトオープン時の設定初期化フロー
- [board-view-spec.md](./board-view-spec.md) - カラムの表示・操作仕様
- [task-format-spec.md](./task-format-spec.md) - フロントマターの `status` とカラムの対応

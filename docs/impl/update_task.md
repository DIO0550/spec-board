# update_task 実装メモ

`update_task` Tauri command（既存タスクの部分マージ更新）の設計判断を記録する。
仕様は [task-format-spec.md](../spec-board/task-format-spec.md) を参照。

## 全体方針

副作用は effect 層（`task::update::command::update_task_impl`）に集約し、純粋計算は
aggregate（`task::task_index::TaskIndex::plan_update`）に閉じ込める。effect 層は
`TaskIo` port 経由でのみファイルにアクセスし、`std::fs::*` の直接呼び出しは行わない。

### なぜ Parsed を渡すのか

`Task` 構造体は raw frontmatter を保持しない（typed フィールドの抽出と warning
生成だけで成立する）。一方で update_task では「ファイル書き戻し時に未知 key /
`links` / YAML 値型 / 出現順を保持する」必要があるため、effect 層は
`io.read` → `frontmatter::parse_bytes` で `Parsed { frontmatter, body }` を取り、
それをそのまま `plan_update` に渡す。`plan_update` は `Parsed` の mut copy に対して
patch を当て、`frontmatter::serialize(&Parsed)` で書き戻すので raw 情報が損なわれない。

### なぜ `UpdateTaskError::Serialize` を持たないのか

`frontmatter::serialize(&Parsed) -> String` は YAML 構文として常に成功する純粋関数
（内部で `serde_yaml_ng::to_string` が失敗するケースは `Parsed` を `parse_bytes` 由来
で構築している限り発生しない）。このため effect 層と error 型に Serialize variant を
持たせる必要がない。

### parent 変更時の cache 再構築フロー

`needs_full_rebuild=true` の場合のみ、effect 層は以下を行う:

1. cache の values をすべて `Vec<Task>` に集める
2. 対象 task を `outcome.updated_task` に置換
3. `TaskIndex::new(values).validate_parent_hierarchy().build_children().build_reverse_links()`
4. cache を clear して再構築結果で再挿入
5. 再構築後の対象 Task を取り直して返す

scalar / labels / body / title / status / priority の単独更新では再構築しない。
これらの変更は他タスクの `children` / `reverse_links` に影響しないため。

### `validate_with_new_task` ではなく `validate_parent_hierarchy` を使う理由

`validate_with_new_task` は新規追加用 API。既存 task を `push` する前提なので、
update では対象 task が 2 件混ざってしまう（自分と「新規追加版」）。代わりに
「対象 task を `preliminary_task` に置換した `Vec<Task>` を作って
`TaskIndex::new(values).validate_parent_hierarchy()`」を呼ぶ。

### parent 存在チェックを別途行う理由

`validate_parent_hierarchy` は parent が cache に無いとき warning を追加するだけで
エラーにしない。これは scan 時 / 編集時の "parent が後から追加される" ユースケースを
壊さないため。一方 update_task は「指定された parent が見つからないなら明示エラー」が
spec 上望ましい。そこで plan_update 内で `resolve_parent_for_new_task` を使い、
`./` プレフィックスや `\` 含み path も create と同じ基準で正規化して一致検索を行う。
見つからなければ `ParentNotFound { path }` を返す。

### `TaskContent::try_new(String)` を使う理由

`TaskContent::try_new` は `String` を受け取る（`&[u8]` ではない）。serialize の
結果 `String` をそのまま渡せるため、追加のアロケーションも as_bytes 変換も不要。

### `From<TaskParseError>` / `From<TaskContentError>` を入れた理由

`validate_parent_hierarchy` の戻り値は `Result<TaskIndex, TaskParseError>` であり、
`TaskContent::try_new` の戻り値は `Result<_, TaskContentError>`。それぞれ
`UpdateTaskError` への変換を `From` で書いておくことで、`plan_update` 内の
`?` 演算子と `.map_err(UpdateTaskError::from)` だけでエラー経路を畳み込める。

### filePath を canonicalize しない理由

canonicalize は symlink 解決 / OS 依存の正規化など副作用が大きく、project_root 外
の検出と引き換えにテストの安定性が著しく下がる。spec-board は POSIX 主体で
symlink を含むレイアウトはまれであり、lexical 正規化（`..` 検出 / `strip_prefix(root)`）
だけで十分実用的。trade-off として、symlink を悪用した root 外書き込みは検出できない。

### 空 title を許可する理由

frontmatter parser は `extras.title` が空文字のとき
`invalidTitleUsedFileName` warning を吐き、ファイル名を fallback title として使う。
update_task で空 title を弾くと「既存ファイルに空 title が書かれていた場合」と
仕様が乖離する。本コマンドは空 title 自体を許可し、`task_from_parsed` を再走させて
warning を再生成する。warning の source of truth は parser 側に集約する。

### `task_from_parsed` 再走の意図

`build_patched_task` で得た中間 Task は parent 変更時の hierarchy 検証用に使うのみ。
最終的に返却する `updated_task` は `Parsed { frontmatter, body }` を
`task_from_parsed` に通し直して構築する。これにより:

- 空 title → `invalidTitleUsedFileName` warning が再生成される
- typed フィールド（priority / labels / links 等）が parser の最新ロジックで再抽出される
- 既存 Task の warnings は破棄され、新しい warnings 群に置き換わる

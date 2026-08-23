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

### 更新後の canonical cache 再構築フロー

effect 層は更新フィールドにかかわらず以下を行う:

1. resident cache の全 Task を、disk由来のraw parentを含む`ParsedTask` candidateへ戻す
2. 対象candidateを`UpdateTaskOutcome.updated_task`で置換する
3. candidate全件をcanonical resolverへ通し、parent warning、effective parent、`children`、`reverse_links`をfile path昇順で再計算する
4. 書き込み成功後、resolver通過証明である`ResolvedTaskSet`でcacheを一括置換する
5. 再構築後の対象Taskを取り直して返す

parent変更時のstrict hierarchy検証はI/O前のvalidationとして残すが、cacheの派生値再構築は
scalar / labels / body / title / status / priorityだけの更新でも省略しない。これによりコマンド直後と
同じdisk状態で再openした結果を一致させる。

### `validate_with_new_task` ではなく `validate_parent_hierarchy` を使う理由

`validate_with_new_task` は新規追加用 API。既存 task を `push` する前提なので、
update では対象 task が 2 件混ざってしまう（自分と「新規追加版」）。代わりに
resident taskをraw parentを含む`Vec<ParsedTask>`へ戻し、対象candidateを
`preliminary_task`へ置換して`ResolvedTaskSet::validate_strict(values)`を呼ぶ。
これによりresolver前のcandidateをresident `Task`として組み立てずにstrict検証できる。

### parent 存在チェックを別途行う理由

`ResolvedTaskSet::validate_strict` が内部で使うhierarchy検証は、parent が cache に無いときwarningを追加するだけで
エラーにしない。これはcanonical resolverで "parent が後から追加される" ユースケースを
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

`build_patched_task` で得た中間 `ParsedTask` は parent 変更時の hierarchy 検証用に使う。
`UpdateTaskOutcome.updated_task` も `Parsed { frontmatter, body }` を
`task_from_parsed` に通し直したcandidateであり、effect層が全件resolverへ渡して最終Taskを得る。これにより:

- 空 title → `invalidTitleUsedFileName` warning が再生成される
- typed フィールド（priority / labels / links 等）が parser の最新ロジックで再抽出される
- 既存 Task の warnings は破棄され、新しい warnings 群に置き換わる

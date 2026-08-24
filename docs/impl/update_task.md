# update_task 実装メモ

`update_task` Tauri command（既存タスクの部分マージ更新）の設計判断を記録する。
仕様は [task-format-spec.md](../spec-board/task-format-spec.md) を参照。

## 全体方針

副作用は effect 層（`task::update::command::update_task_impl`）に集約し、純粋計算は
aggregate（`task::task_index::TaskIndex::plan_update`）に閉じ込める。effect 層は
`TaskIo` port 経由でのみファイルにアクセスし、`std::fs::*` の直接呼び出しは行わない。

### wire sentinelをArgs adapterだけで分類する理由

`UpdateTaskArgs`は既存wire互換のため、`parent` / `milestone`を`Option<String>`、
`draft`を`Option<bool>`として受け取る。これらをそのままdomainへ渡すと、aggregateが
空文字や`false`をclear sentinelとして再解釈する必要がある。そこで`into_intent`だけが
次の分類を行い、`UpdateTaskIntent`以降は`Patch`として扱う。

| wire入力 | parent / milestone | draft |
|:---------|:-------------------|:------|
| 未指定 / `null` | `Patch::Unchanged` | `Patch::Unchanged` |
| exact `""` | `Patch::Clear` | - |
| その他の文字列（空白のみを含む） | `Patch::Set(raw)` | - |
| `true` | - | `Patch::Set(true)` |
| `false` | - | `Patch::Clear` |

commandのI/O前parent存在確認、`plan_update`の変更判定・strict検証、
`TaskDocument`への適用はこの分類済みpatchだけを参照する。これによりwire/disk形状、
既存エラー文字列、validationとI/Oの順序を変えずにsentinel解釈をadapterへ閉じ込める。

### なぜ Parsed を渡すのか

`Task` 構造体は raw frontmatter を保持しない（typed フィールドの抽出と warning
生成だけで成立する）。一方で update_task では「ファイル書き戻し時に未知 key /
`links` / YAML 値型 / 出現順を保持する」必要があるため、effect 層は
`io.read` → `TaskDocument::parse` → `into_parsed` でcodec内部の
`Parsed { frontmatter, body }` を取り、それを`plan_update`に渡す。`plan_update`は
`TaskDocument::from_parsed`でdocumentへ戻し、`TaskPatch`を適用して`render`するため、
raw情報を損なわずに書き戻せる。

### なぜ `UpdateTaskError::Serialize` を持たないのか

serializeは`TaskDocument::render`のcodec境界に閉じ、失敗は既存の
`UpdateTaskError::DocumentRender`へ写像する。このためeffect層とerror型に
frontmatter固有のSerialize variantを持たせる必要がない。

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

### `validate_with_new_task` ではなく `ResolvedTaskSet::validate_strict` を使う理由

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

`TaskContent::try_new`は`String`の所有権を受け取る一方、同じrender結果を
`UpdateTaskOutcome.file_content`にも保持する必要がある。このため現実装は
`serialized.clone()`をvalidation VOへ渡し、元の`String`を書き込み計画に残す。
scanner eligibilityと実際の書き込み内容が同一文字列であることを優先した意図的なcloneである。

### `From<TaskParseError>` / `From<TaskContentError>` を入れた理由

`ResolvedTaskSet::validate_strict` の戻り値は `Result<(), TaskParseError>` であり、
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
仕様が乖離する。本コマンドは空 title 自体を許可し、
`TaskDocument::to_parsed_task`を通してwarningを再生成する。warningのsource of truthは
parser側に集約する。

### `TaskDocument::to_parsed_task` 再走の意図

`build_patched_task` で得た中間 `ParsedTask` は parent 変更時の hierarchy 検証用に使う。
`UpdateTaskOutcome.updated_task`もdocumentを`to_parsed_task`へ通したcandidateであり、
effect層が全件resolverへ渡して最終Taskを得る。これにより:

- 空 title → `invalidTitleUsedFileName` warning が再生成される
- typed フィールド（priority / labels / links 等）が parser の最新ロジックで再抽出される
- 既存 Task の warnings は破棄され、新しい warnings 群に置き換わる

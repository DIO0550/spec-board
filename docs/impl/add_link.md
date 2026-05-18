# add_link 実装メモ

`add_link({ sourceFilePath, targetFilePath })` は、source タスクの frontmatter `links` 配列に
target タスクのパスを 1 件追加する Tauri command。仕様は
`docs/spec-board/task-format-spec.md` の links 章を参照する。ここではコードを書く
うえで判断に迷いやすかった点だけを散文で残す。Rust の所有権や `Option` に
不慣れな読み手を想定して、文脈を厚めに書く。

## なぜ `TaskIndex::plan_add_link` という aggregate method 内に重複検出を閉じ込めたか

重複検出には `normalize_link_path_for_lookup` を使う。これは `./tasks/b.md` と
`tasks\b.md` のように表記揺れがある path を共通形に倒すための関数で、
`src-tauri/src/task/path_lookup.rs` に置いてある。可視性は意図的に
`pub(super)` に絞ってあり、`task` ドメインの外（effect 層も含めて
application 層から見ると外側に近い場所）からは直接呼べないようにしてある。

もし effect 関数 `add_link_impl` 側で重複判定をやろうとすると、結局 effect
からも同じ正規化関数を呼びたくなる。そうすると path_lookup の可視性を緩める
ことになり、ドメイン内に閉じ込めるという既存の設計意図が壊れる。だから
重複検出と target 存在検証はすべて `plan_add_link` の中に集約してある。

このやり方は `plan_update` / `plan_create` で既に踏襲されているスタイルで、
別途 user feedback memory `spec-board-aggregate-method` でも矯正されている
方針なので、合わせる形で書いた。

## なぜ Outcome を `Write` / `NoOp` の 2 値にしたか

「同じ target がすでに `links` に含まれていれば noop」という仕様がある。
このとき effect 層は、ファイルへの write も `tasks_cache` の書き換えも一切
やらず、ただ既存の source タスクを返したい。

effect 層が「書くべきかどうか」を毎回判断するロジックを持つと、aggregate
側でせっかく decide した重複判定を effect が再評価することになりやすい。
だから aggregate が返す `AddLinkOutcome` を「書く（`Write`）」か「書かない
（`NoOp`）」かの 2 値に切ってある。effect 層は `match` で分岐するだけで済む。

`NoOp` には `existing_task: Task` を載せてある。aggregate に渡した
`source_existing` を clone して詰めただけだが、effect 層が「noop なので
IPC 戻り値に何を返せばよいか」を考えなくて済むようにする目的。再度
snapshot を引き直さずに済む。

## なぜ target 側 frontmatter には書き戻さないか

`task-format-spec.md` で「リンクは双方向として扱うが、リンク先のフロント
マターには書き込まない。表示時に逆引きする」と明示されている。よって
`plan_add_link` の入力に target の Parsed は渡さず、target は task index 上で
存在するかどうかだけを照会する。

実装としても、target 側を書き換える設計にすると watcher event の自己書き
込み抑止 (`write_ignore`) を source / target の 2 ファイル分手配する必要が
出てきて、失敗時の unregister 含めた race 設計がぐっと複雑になる。
spec が「逆引きで済ませる」と決めているので、無理に双方向 write する理由は
ない。

## `links` を typed field 経由で push し、`extras` 経由は使わない

`Frontmatter` には `priority` / `labels` / `links` の 3 つだけ typed フィールド
があり、残りの YAML key は `extras` (`serde_yaml_ng::Mapping`) に出現順で
ぶら下がっている。`build_mapping`（`frontmatter::serialize` の中で呼ばれる）は
`title → status → priority → labels → parent → links → 残り extras` という
固定順で出力するため、`links` キーを `extras` 経由で扱うと型と順序の両方が
壊れる。だから `frontmatter.links.push(...)` だけで足りる。

push する値は `normalize_relative_path_for_input` を通した正規化形にしてある。
入力が `tasks\\b.md` のようなバックスラッシュ表記でも、ディスクには必ず
forward-slash の `tasks/b.md` 形で書き戻したいため。

## lock 取得順 + write_ignore register → write → unregister の理由

`AppState` のロック順は `project_path → config → tasks_cache → watcher_handle
→ write_ignore` で固定されている（`src-tauri/src/state.rs` のモジュール
コメント参照）。`add_link_impl` も同じ順番で各 accessor を呼ぶ。

watcher が install されているとき、`io.write_existing` で source ファイルを
書き換えると、自前 write が watcher event として戻ってきて FE に通知される
おそれがある。それを抑止するために、書き込み前に `write_ignore.register`
で source path を予約し、write が成功したらそのまま entry を残す
（watcher event の handler 側で consume される）。write が失敗した場合は
即 `unregister` で entry を回収して、放置しないようにする。これは
`update_task_impl` と同型で、既存パターンを踏襲している。

## cache commit の "検証 → mutate" 2 段構成

snapshot を取り出してから `with_tasks_cache_mut` の closure 内で実際に
mutate するまでの間に、別コマンドが cache を書き換える可能性がある
（snapshot は clone 後すぐ lock を解放する）。closure に入った時点で
source / target が cache 上に残っているとは限らない。

愚直にやると「source は cache にあるので書き換えたが、target が消えて
いた」みたいに source だけ部分更新される事態が起こり得る。これを防ぐため、
closure の冒頭で

1. source の cache key 存在確認
2. target を `find_task_by_normalized`（immutable 借用）で確認

の 2 段の存在確認を先にやり、両方そろっていることを確認してから初めて
mutate に入る。`HashMap` から 2 つの `&mut` を同時には取れないので、
（1）（2）はあくまで読み取り、その後 `cache.get_mut` で source を、
`find_task_mut_by_normalized` で target を取り直して書き換える。

source 側に書き戻す `Task` は `task_from_parsed` 由来で `children` と
`reverse_links` が空になっている。これらは cache の派生フィールドであって
parser の責務ではないため、cache 既存値で覆い直す。`std::mem::take` で
旧エントリから抜き取って、struct update syntax で再構築している。

target 側は `reverse_links` に source の `TaskFilePath` を append するだけ。
万が一すでに含まれていた場合に 2 重 push しないよう、`any(|p| p == ...)`
で先にチェックしてから push する。

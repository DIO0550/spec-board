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

## `links` をTaskDocumentのtyped patchで更新し、`extras`経由は使わない

`TaskDocument`はtitle / status / priority / milestone / labels / parent / links / draft /
due / bodyをtyped `TaskPatch`として扱い、codecが既知keyを固定順、未知keyをextrasの
順序でrenderする。`links`をraw extrasとして直接操作すると、このtyped更新契約と
出力順の両方を壊す。そこで`TaskDocument::links()`から現在値を`Vec<String>`として取り出し、
正規化済みtargetを追加したうえで`TaskPatch { links: Patch::Set(..) }`を適用する。

追加する値は `normalize_relative_path_for_input` を通した正規化形にしてある。
入力が `tasks\\b.md` のようなバックスラッシュ表記でも、ディスクには必ず
forward-slash の `tasks/b.md` 形で書き戻したいため。

## writer lease + write_ignore register → write → commit の理由

`add_link_impl` は exact project root のwriter lease内でimmutable session snapshotを取り、
`preflight_session_write`でidentityとactive resourcesを確認してからread/planへ進む。
これにより同じprojectへのmutationを直列化し、snapshotとcommitの境界を揃える。

`io.write_existing` で source ファイルを書き換える前に、watcherのinstall状態に
かかわらず`write_ignore.register`でsource pathを予約する。writeが成功したらentryを残し
（watcher event の handler 側が `unregister` で取り除いて消費する）。write が失敗した場合は
即 `unregister` で entry を回収して、放置しないようにする。これは
`update_task_impl` と同型で、既存パターンを踏襲している。

## cache commit はcanonical full resolverの結果だけを受け取る

planが返す`updated_task`はparse-onlyな`ParsedTask`であり、そのままresident cacheや
IPCへ出さない。effect層はsnapshotの全resolved Taskをraw parent付きcandidateへ戻し、
sourceを`updated_task`へ置換してcanonical full resolverへ渡す。resolverは
parent warning / effective parent / `children` / `reverse_links`を全件、file path昇順で
再導出し、通過証明の`ResolvedTaskSet`と返却用source TaskをI/O前に確定する。

resolver前にはsnapshot上のsource / target存在を両方確認する。これにより
sourceだけを書き換える部分更新を防ぎつつ、targetの`reverse_links`を手動appendせず、
sourceの`links`をsource of truthとして全件再計算できる。disk write成功後は
`commit_or_resync_under_lease`がidentityを再検証し、`ResolvedTaskSet`でsession cacheを
一括置換する。競合時は同じdiskからresyncし、局所field保持やin-place mutateは行わない。

# remove_link 実装メモ

`remove_link({ sourceFilePath, targetFilePath })` は、source タスクの frontmatter
`links` 配列から target タスクへのエントリを取り除く Tauri command。`add_link` と
対称な BE 機能で、仕様は `docs/spec-board/task-format-spec.md` の links 章を
参照する。ここではコードを書くうえで判断に迷いやすかった点を散文で残す。Rust の
所有権や `Option` に不慣れな読み手を想定して、文脈を厚めに書く。

## なぜ `TaskIndex::plan_remove_link` という aggregate method に閉じ込めたか

`add_link.md` と同じ理由で、表記揺れを吸収する `normalize_link_path_for_lookup`
は `pub(super)` 可視性で task ドメインに閉じている。effect 層から重複検出を
やりたくなると path_lookup の可視性を緩めることになり、設計意図が壊れる。
だから`TaskDocument::links()`をfilterし、`TaskPatch`で除去する判定はaggregate method内に
集約してある。

`plan_create` / `plan_update` / `plan_add_link` で既に踏襲されているスタイルで、
user feedback memory `spec-board-aggregate-method` でも矯正されている方針なので、
合わせる形で書いた。free function 3 段分離（pure select / read effect /
write effect）の設計は取っていない。

## なぜ Outcome を `Write` / `NoOp` の 2 値にしたか（含まれていなければ NoOp の逆転）

`add_link` では「同じ target がすでに含まれていれば NoOp」だったが、`remove_link`
では逆に「target が含まれていなければ NoOp」となる。意味は逆転しているが、
effect 層から見れば「ファイル書き込みと cache mutate をやるかどうかの 2 値」と
いう構造は同じ。だから `RemoveLinkOutcome` も `Write` / `NoOp` の 2 値に切って
いる。

`NoOp` には `existing_task: Task` を載せている。aggregate に渡した
`source_existing` を clone して詰めただけだが、effect 層が「noop なので
IPC 戻り値に何を返せばよいか」を考えなくて済むようにする目的。`add_link` と同じ。

## なぜTaskDocumentのtyped patchで重複を全削除するか

`add_link` 側は「すでに含まれていれば NoOp」なので、本来は同じ target が複数
登録される状況は起こらないはずだが、外部の手書き編集や過去仕様時代のファイル
など、現実には重複が混入している可能性がある。`remove_link`は`TaskDocument::links()`を
走査し、normalize結果がtargetと異なる要素だけを新しい`Vec<String>`へ集め、
`TaskPatch { links: Patch::Set(..) }`として適用する。完全一致するエントリをすべて除去するため、Set 化してから 1 件除く設計に
すると、表記揺れの正規化形は集約されても元の表記が失われるため、テキストとして
読みやすい状態を保ちたい場合に表記情報を残せない。filter + cloneなら、削除
対象以外の要素は原文表記のまま保持される。重複登録の掃除も同時に行えるので、
副次的なメンテナンス効果も得られる。

## なぜ target 側 frontmatter には書き戻さないか

`add_link.md` と同じ。spec で「リンクは双方向として扱うが、リンク先のフロント
マターには書き込まない。表示時に逆引きする」と明示されている。`plan_remove_link`
の入力に target の Parsed は渡さず、target の存在も照会しない（次節）。

target 側を書き換える設計にすると watcher event の自己書き込み抑止
(`write_ignore`) を source / target の 2 ファイル分手配する必要が出てきて、
失敗時の unregister 含めた race 設計がぐっと複雑になる。spec が「逆引きで
済ませる」と決めているので、無理に双方向 write する理由はない。

## なぜ target が cache に居なくても fail にしないか（dangling link 掃除ユースケース）

`add_link` では target の存在を aggregate と cache の両方で検証し、存在しなければ
`TargetNotFound` / `TargetVanished` で fail させていた。`remove_link` ではこれを
**意図的に外している**。

理由は dangling link の掃除を許容したいから。target ファイルがすでに削除されて
いる、あるいは scan のタイミングで cache に乗っていない、といった状況でも、
「source の links から target エントリを消す」操作自体は実行できないと困る。
逆に「target が存在しないと remove できない」設計にすると、削除済み task への
orphan link を消す手段が IPC 経由で失われてしまう。

aggregate `plan_remove_link` は target が aggregate に存在するかを照会しない。
effect層もtarget不在を失敗にせず、sourceの更新candidateを含む全件をcanonical resolverへ
渡す。targetが存在すればsourceの削除後`links`から`reverse_links`が再導出され、存在しなければ
該当する派生値が作られないだけである。

## writer lease + write_ignore register → write → commit の理由

`add_link.md` と同じく、exact project rootのwriter lease内でimmutable snapshotを取り、
`preflight_session_write`でidentityとactive resourcesを確認してからread/planへ進む。

書き込み前はwatcherのinstall状態にかかわらず`write_ignore.register`でsource pathを
予約し、write成功後はentryを残す（watcher event handlerが`unregister`で消費する）。
`io.write_existing`失敗時は即座にentryを回収する。commit競合時は
`commit_or_resync_under_lease`がdiskからresyncし、失敗時のmarker cleanupも担う。

## cache commit はcanonical full resolverの結果だけを受け取る

planの`updated_task`はparse-onlyな`ParsedTask`である。effect層はsourceの存在だけを
snapshot上で確認し、全resident Taskをraw parent付きcandidateへ戻してsourceを置換する。
canonical full resolverがparent warning / effective parent / `children` / `reverse_links`を
file path昇順で全件再導出し、I/O前に`ResolvedTaskSet`と返却用source Taskを確定する。

disk write成功後は`commit_or_resync_under_lease`がidentityを再検証し、resolver通過済み集合で
session cacheを一括置換する。既存の`children` / `reverse_links` / warningを局所的にretainしたり、
targetをin-place mutateしたりしないため、command直後のstateは同じdiskを再openした結果と一致する。

## NoOp 経路の特徴

`RemoveLinkOutcome::NoOp` の場合、effect 層は

- `write_ignore.register` もしない
- `io.write_existing` もしない
- canonical resolver / session commit もしない

ので、cache / disk / watcher の状態は完全に不変。テスト
`noop_when_link_not_present` で「write_ignore に slot が増えていない」ことを
明示的に検証している。

## aggregate と effect 層を別 enum にしている理由（AddLinkError と共有しない）

`RemoveLinkError` は `AddLinkError` と縮小集合だが別 enum にしている。具体的には

- `TargetNotFound` を持たない（cache での target 存在検証をしないため）
- `SelfLink` を持たない（self-link でも links に登録されていれば普通に除去されるだけ）
- `TargetVanished` を持たない（commit 時に target 不在でも fail しない）
- 代わりに `InvalidTargetPath` を持つ（args 段階の target 不正は意味的に
  `SourceNotFound` でも `ParseFailed` でもないため、専用バリアントを追加）

無理に enum を共有すると、`remove_link` で本来到達しないバリアントを持ち続ける
ことになり、`match` の網羅性で「ありえないパス」を扱う羽目になる。意味の混同を
避けるため別型にした。`RemoveLinkIntent` を `AddLinkIntent` の type alias にせず
別 struct にしているのも同じ理由（aggregate method の引数型から `add_link` への
依存を切る目的）。

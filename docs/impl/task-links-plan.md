# task-links plan API（planAddLink / planRemoveLink）の実装ガイド

`src/domains/task-links/` の plan 系 API と、それを消費する
`src/providers/ProjectProvider/actions/{addLink,removeLink,linkOperations}.ts` の設計判断をまとめる。

## 背景 — なぜ action 散在の optimistic/rollback を aggregate に集約するか

旧実装では `addLinkAction` / `removeLinkAction` がそれぞれ楽観更新の組み立て
（source の `links` append/remove、target の `reverseLinks` append/remove）と
失敗時の条件付き snapshot 復元を個別に持っていた。同じ「リンクの双方向整合」を
2 箇所で別実装しているため、片方だけ修正して非対称になる危険が常にあった
（実際に remove 側だけ self-link の特殊分岐と手動 merge を抱えていた）。

新実装では計算をすべて `TaskLinks.planAddLink` / `planRemoveLink`（純粋関数）に集約し、
action は「plan を呼ぶ → operations を dispatch する → IPC → 成功なら canonical 確定 /
失敗なら rollback operations を dispatch する」という orchestration だけを持つ。
add と remove が完全に対称な骨格になり、双方向整合の知識は domain 1 箇所に閉じる。

## plan の 3 分岐（apply / noop / rejected）と BE の対応

plan は判別 union を返す:

| FE plan | add（`AddLinkOutcome`） | remove（`RemoveLinkOutcome`） | BE 側の対応物 |
|:--|:--|:--|:--|
| `kind: "apply"` | optimistic / rollback operations を適用して IPC する | 同左 | `AddLinkOutcome::Write` / remove の書き込みあり経路 |
| `kind: "noop"` | 既リンク済み（正規化同値） | forward link 不在（正規化同値でマッチする raw なし） | `AddLinkOutcome::NoOp` / remove の冪等 no-op |
| `kind: "rejected"` | `source-not-found` / `self-link` / `target-not-found` | `source-not-found` のみ（self-link 削除・target 不在の削除は正当な操作として apply） | `SelfLink` / `SourceNotFound` / `TargetNotFound` の reject |

従来 noop / reject は BE まで往復して決着していたが、FE cache に同じ判定材料が
あるため IPC 前に決着させる。BE 側の判定は最終防衛線としてそのまま残る。

なぜ判別 union か: 「apply のときだけ operations がある」「noop のときだけ task がある」
という関係を型で表現でき、呼出側の分岐漏れがコンパイルエラーで検出されるため
（boolean フラグ + optional field の組では不正な組み合わせを型で排除できない）。

## LinkOperation（単一型）と inverse rollback

`LinkOperation` は「どの task（filePath）の、どの field に、どの値を、append / remove するか」
を表す 1 レコード。optimistic も rollback も同じ型の配列で表現する。

- **単一型にした判断**: `at` / `requiresValueTask` は append のみ有効な field だが、
  operation の生成者は plan 内部に閉じており、外部から自由に組み立てる API ではない。
  union（append 型 / remove 型）による構造的制約より単純さを優先し、
  append 専用 field であることは TSDoc に明記して apply 実装は remove では無視する
- **inverse rollback**: rollback は optimistic を逆順にして op を反転（append⇄remove）した
  operations。適用先は「rollback 時点の現在 state」であり、snapshot への全置換ではない。
  自分が触れた path だけを戻すため、IPC 中に別経路（watcher・別操作）で入った
  外部更新（別 path の追加、title 等の他 field 変更）を巻き戻さない
- 旧方式（条件付き snapshot 復元）は「current == optimistic の field 全体一致」のときしか
  復元できず、外部更新が併存すると rollback 自体を skip して楽観値が残留する
  all-or-nothing 問題があった。inverse 方式は外部更新保持と自変更の巻き戻しを両立する

### at による位置復元（best-effort）

remove の inverse（re-append）には、plan 時に snapshot 内での元位置を `at` として
記録する。UI は配列順で表示するため、先頭 / 中間のリンクを削除して失敗したとき
末尾に戻ると「並びが変わった」ように見える。これを防ぐための位置復元だが、
保証は **snapshot 時点の数値 index への best-effort 挿入**:

- `at` の基準は「該当値の最初の出現 index」から、自分より前にある
  **復元されない完全重複エントリ（除去対象 value の 2 個目以降の出現）の数だけ詰めた
  実効 index**（`effectiveRestoreIndex`）。rollback は各 value につき 1 件しか
  復元しないため、素の snapshot index のままだと完全重複と別表記が混在する
  snapshot（例: `["b", "b", "./b", "c"]`）で復元後の相対順が崩れる
- 適用時は `min(at, 現在長)` に clamp する（外部 remove で配列が縮んでいても安全）
- 外部変更が併存した場合、残存要素との相対順の完全復元までは保証しない

複数の正規化同値表記（`./tasks/b.md` と `tasks\b.md` の併存）を除去する forward remove
operations は **各 raw 値の最初の出現 index の降順**で生成する規約とした
（`at` と同じ「最初の出現」基準に揃えることで、完全重複が混在しても生成順と復元位置が
一貫する）。`invertLinkOperations` が配列を逆順にするため、rollback の append は
index **昇順**で適用される。昇順適用なら先に小さい index へ挿入してから大きい index へ
挿入する形になり、clamp 挿入でも全表記が元位置に揃う（round-trip テストで仕様固定済み）。

## 参照整合ガード（requiresValueTask）

rollback の re-append には「plan 後に外部で削除された task への参照を復活させてよいか」
という問題がある。forward と reverse で答えが異なる:

- **reverse append（`reverseLinkedFilePaths` への追加）にのみ `requiresValueTask: true` を付与**。
  reverse link は FE/BE cache のみが持つ導出情報で、disk 上のどのファイルにも書かれていない。
  value（相手 task）が適用時点の state に不在なら、その task は外部で削除されており、
  削除時のリンク掃除を巻き戻すことになるため skip する
- **forward append は常に flag なし = 無条件適用**。forward link は source ファイルの
  frontmatter が実際に保持している内容であり、remove が失敗した以上 disk には
  forward link が残っている。target が消えていても broken link として復元するのが
  disk との整合（broken link は既存 UI が表示対応済み）
- remove 系 operation はガード対象外（掃除を妨げない）

ガードの value 解決は `findLinkTaskByReference`（正規化同値）で行う。

## FE / BE の path 同値判定の保証範囲

add の noop 判定・候補除外（`buildAddLinkCandidates`）・remove の除去対象は
`@/domains/task-path` の `linkReferencesTaskPath` による正規化同値で判定し、
**実用上の表記揺れ（`./` 前置・バックスラッシュ区切り・重複区切り等）で BE と一致**させる。

colon を含む exotic path（`notes:/b.md` 等）は、FE の `normalizeTaskPathForLookup` が
`:` 終端セグメントを drive prefix として除去する規則と BE の drive 除去規則に差異があり、
同値判定が食い違い得る。これは既存 `task-path` 由来の既知の限界（クリック解決・
broken-link 表示と同じ挙動）であり本件スコープ外。`src/domains/task-path` は変更していない。

## inverse が安全な理由と限界ケース

- **同一 link の外部追加**: IPC 失敗中に外部経路（別ウィンドウ / watcher）が「同一の」link を
  正当に追加した場合、rollback の remove がその正当なエントリも巻き戻す
  （べき等 skip は「値が既に消えている」場合のみ有効）。旧 snapshot 方式でも同様に
  巻き戻るため回帰ではない
- **同一文字列の完全重複エントリ**: 除去は value 完全一致の filter による一括削除
  （1 operation）で、復元は 1 件のみ（元位置へ 1 件戻す）。BE は add 時に重複を防ぐため
  縮退ケース。正規化同値だが表記が異なるエントリは各 1 operation として個別に
  除去・復元されるため、この限界の対象外
- **post-write failure**: BE は disk 書き込み成功後の cache commit 失敗
  （`SourceVanished` / `TargetVanished` 等）も `Err` で返すが、FE は文字列エラー契約のため
  書き込み前後どちらの失敗かを判別できず、すべての `Err` に inverse rollback を適用する。
  この経路では FE と disk が一時乖離し（add: disk に追加済みの link が FE から消える /
  remove: disk で削除済みの link が FE に復活する）、watcher イベント / 次回 project open の
  canonical 再収束で解消される。「remove 失敗時は disk に forward link が残る」という
  参照整合ガードの前提は pre-write failure に限定した保証。構造化エラーによる判別は
  #400 のスコープ
- **stale 成功応答**: 成功時の source canonical 全体 dispatch は現行踏襲で、IPC 中の
  source 外部更新（title・別 link 等）との収束は #400（server ChangeSet 再収束）のスコープ。
  本件で保証するのは失敗 rollback 経路と project 切替 guard のみ

## self-link が 1 dispatch になる仕組み

self-link（source と target が同一 task）の削除は forward / reverse の 2 operations が
どちらも source の filePath を持つ。`dispatchLinkOperations` は
`linkOperationTargetFilePaths`（出現順 unique）で task 単位にグルーピングし、
`applyLinkOperationsToTask` が同一 filePath の全 operations をまとめて 1 つの Task に
適用するため、自然に 1 dispatch へ併合される（2 段 dispatch だと 2 回目が 1 回目を
上書きして片方の更新が失われる — 旧実装が `isSelfLink` 特殊分岐で回避していた問題を
グルーピングの一般則で解決している）。

## 設計上の割り切り

- **lookup の使い分け**: add の target は `buildAddLinkCandidates` が渡す canonical な
  `Task.filePath` なので完全一致 lookup（`findLinkTask`）で引き当てる。ただし noop 判定は
  正規化同値で行う（候補除外と同じ判定 — 候補算出後の state 変化で除外をすり抜けた add も
  IPC 前に noop で止まる二段目の防衛）。remove の target は frontmatter 由来の raw 値が
  UI からそのまま渡るため、参照解決 lookup（`findLinkTaskByReference`）で表記揺れを吸収する
- **ドリフト非修復**: 既リンク済み add（target reverse 欠落の片方向ドリフトを含む）と
  forward 不在 remove（stale な target reverse が残る状態を含む）は noop とし、
  ドリフトの修復は行わない。FE cache の reverse ドリフトは canonical 更新
  （watcher / 次回 open）で解消される前提の設計判断で、add / remove 両側で一貫させた
- **「変化を生む operation のみ出力」不変条件**: plan は snapshot に対して実際に変化を
  生む operation だけを出力する（例: target が既に reverse を持つ add では reverse operation を
  出さない）。これにより rollback が「自分が作っていない既存エントリ」を誤って
  消さないことが構造的に保証される

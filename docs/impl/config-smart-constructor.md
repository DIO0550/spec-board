# Config の smart constructor（columns 非空・一意を型で担保する）

> 読者: Rust 初心者。`Config::try_new` が何を守り、なぜ `load.rs` / `get_columns.rs` から
> 検証と `assert!` が消えたのかを理解するための実装ガイド。仕様（何ができるか）は
> `docs/spec-board/config-spec.md`、ドメイン全体の地図は
> [`ddd-domain-design.md`](./ddd-domain-design.md) を参照。本ドキュメントは
> 「なぜそう書いたか」に焦点を当てる（Issue #418、親 Epic #417）。

---

## 1. なぜ smart constructor か

`Config`（`src-tauri/src/config/core.rs`）はボードのカラム定義を持つ aggregate で、
「`columns` は 1 件以上」「カラム名は完全一致で一意」という不変条件がある。
以前はこの不変条件を**型が守っていなかった**。

```rust
// 変更前
pub struct Config {
    version: SchemaVersion,
    pub columns: Vec<Column>,   // pub なので外から自由に書き換えられる
    pub card_order: CardOrder,
    pub done_column: Option<ColumnName>,
}

impl Config {
    pub fn new(columns: Vec<Column>, ...) -> Self { /* 検証なし */ }
}
```

そのため、検証は「使う側」に散らばっていた。

| 場所 | やっていたこと |
|:--|:--|
| `load.rs::load_persisted` | deserialize 後に `columns.is_empty()` と `validate_unique_column_names` を呼ぶ |
| `core.rs::plan_update_columns` | 候補 columns に対して同じ 2 検査を呼ぶ |
| `get_columns.rs::get_columns_impl` | 「誰かが空 columns を注入したかもしれない」ので `assert!` で防御 |

散らばった検証は、新しい構築経路が増えたときに「呼び忘れ」が起きる。実際
`Config::new` / serde derive の `Deserialize` / 旧 `build_config_from_statuses(&[])` の
3 経路は空 `columns` の `Config` を作れてしまい、それを `get_columns` の `assert!` が
実行時に拾う構造になっていた。

**smart constructor** はこの問題への定番の答えで、「不変条件を満たす値しか作れない
コンストラクタを 1 つだけ用意し、それ以外の構築経路を塞ぐ」パターン。同じ crate の
`LabelRegistry` / `MilestoneRegistry` が既にこの形なので、`Config` も揃えた。

## 2. try_new / validate_columns / columns() と private フィールド

```rust
#[derive(Debug, Clone, PartialEq, Serialize)]   // Deserialize は derive しない（§3）
#[serde(rename_all = "camelCase")]
pub struct Config {
    version: SchemaVersion,
    columns: Vec<Column>,                        // private になった
    pub card_order: CardOrder,
    pub done_column: Option<ColumnName>,
}

pub enum ConfigInvariantError {
    EmptyColumns,
    DuplicateColumnName { name: String },
}

impl Config {
    pub fn try_new(columns, card_order, done_column) -> Result<Self, ConfigInvariantError> {
        Self::validate_columns(&columns)?;
        Ok(Self { version: SchemaVersion::CURRENT, columns, card_order, done_column })
    }

    pub(crate) fn validate_columns(columns: &[Column]) -> Result<(), ConfigInvariantError> {
        if columns.is_empty() { return Err(ConfigInvariantError::EmptyColumns); }
        validate_unique_column_names(columns)
            .map_err(|name| ConfigInvariantError::DuplicateColumnName { name })
    }

    pub fn columns(&self) -> &[Column] { &self.columns }
}
```

3 つの部品の役割:

- **`try_new`** — 唯一の構築境界。検証に通った場合だけ `Config` を返す。
  `Result` を返すので、呼び出し側は「失敗しうる」ことを型で知らされる。
- **`validate_columns`** — `try_new` の本体。`plan_update_columns` が「最終構築より前」に
  同じ規則で候補を弾くためにも使う（§5）。重複判定は既存の `validate_unique_column_names`
  を流用し、規則を 2 箇所に写経しない。
- **`columns()`** — 読み取り専用の accessor。`&[Column]`（スライス）を返すので、
  呼び出し側は中身を読めるが差し替えられない。

### private フィールドで「変更経路」も塞ぐ

`try_new` を用意しても、`columns` が `pub` のままでは `config.columns = vec![]` と
書けてしまい、構築後に不変条件を破れる。Rust では**フィールドを private にすると、
そのモジュール（`core.rs`）の外からは struct literal での構築も代入もコンパイルエラー**
になる。これが「型で担保する」の実体。

`Config` の doc コメントには、これを機械的に保証する `compile_fail` doctest を置いてある。

```rust
/// ```compile_fail,E0616
/// let mut config = Config::default();
/// config.columns = Vec::new();   // E0616: field `columns` is private
/// ```
```

`cargo test` はこのブロックが**コンパイルに失敗すること**を検査する。将来誰かが
`columns` を `pub` に戻すと、このテストが落ちて気づける。

### 初学者向け補足: なぜ `core.rs` の中では代入できるのか

private は「モジュール外から見えない」という意味で、同じモジュール内
（`core.rs` とその子）からは自由に触れる。`normalize_card_order` が
`Config { card_order: normalized, ..self.clone() }` と書けるのはそのため。
`core.rs` 内のコードは `try_new` と同じ「不変条件を知っている側」なので、
ここでは `columns` を変えない、という規律で運用する。

## 3. RawConfig と手動 Deserialize の 2 段階

`config.json` を読む経路は serde の `Deserialize` を通る。`#[derive(Deserialize)]`
のままだと serde が直接 `Config { .. }` を組み立ててしまい、`try_new` を迂回できる。
そこで `LabelRegistry` と同じ「raw 型で受けて `try_new` を通す」2 段階にした。

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RawConfig {           // 検証前の生の形。フィールド・serde 属性は Config と同一
    version: SchemaVersion,
    columns: Vec<Column>,
    card_order: CardOrder,
    #[serde(default)]
    done_column: Option<ColumnName>,
}

impl TryFrom<RawConfig> for Config {
    type Error = ConfigInvariantError;
    fn try_from(raw: RawConfig) -> Result<Self, Self::Error> {
        Self::try_new(raw.columns, raw.card_order, raw.done_column)
    }
}

impl<'de> Deserialize<'de> for Config {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = RawConfig::deserialize(deserializer)?;
        Self::try_from(raw).map_err(serde::de::Error::custom)
    }
}
```

これで `serde_json::from_str::<Config>(..)` は不正な JSON（空 columns / 重複名）に
対して `Err` を返す。JSON の形（`version` / `columns` / `cardOrder` / `doneColumn`）は
一切変わらない。

### なぜ `#[serde(try_from = "RawConfig")]` を使わないのか

serde には `#[serde(try_from = "RawConfig")]` という属性があり、上の手動 impl を
1 行で書ける。使わなかったのは**リポジトリ内の既存 VO がすべて手動 `impl Deserialize`
で統一されている**ため。1 箇所だけ別方式にすると、読み手が二系統を追うことになる。

### なぜ `load.rs` は `RawConfig` を直接読むのか

`load_persisted` は `serde_json::from_str::<RawConfig>` → `Config::try_from(raw)` と
**自分で 2 段階を踏む**。`from_str::<Config>` と書けば 1 行で済むのに、そうしない
理由はエラーの種類（variant）にある。

`Deserialize for Config` の中では、`ConfigInvariantError` を `serde::de::Error::custom`
で serde のエラー型に**包んで**いる。包まれた時点で「空 columns なのか重複名なのか」
は文字列メッセージにしか残らず、`load.rs` からは `serde_json::Error` としか見えない。
そのまま返すと `LoadConfigError::Parse` に分類され、既存の
`LoadConfigError::EmptyColumns` / `DuplicateColumnName` という variant（と、それに
依存するテスト・呼び出し層の分岐）が壊れる。

そこで `RawConfig` を `pub(crate)` にして `load.rs` から見えるようにし、
`Config::try_from(raw)` の `Err(ConfigInvariantError)` を自分で
`LoadConfigError` の専用 variant に詰め替える。

```rust
let raw: RawConfig = serde_json::from_str(&content).map_err(/* Parse */)?;
let config = Config::try_from(raw).map_err(|error| match error {
    ConfigInvariantError::EmptyColumns => LoadConfigError::EmptyColumns { path: path.clone() },
    ConfigInvariantError::DuplicateColumnName { name } => {
        LoadConfigError::DuplicateColumnName { path: path.clone(), name }
    }
})?;
```

`LabelRegistryStore::load` が `RawLabelRegistry` に対して同じことをしている
（`label_registry.rs`）。migration 経路（古い `version`）も `from_value::<RawConfig>`
で同じ 2 段階を通るので、どちらの経路でも variant は同じになる
（`load_persisted_returns_*_error_after_migration` テストで固定）。

### `RawConfig.version` が読み捨てなのはなぜか

`SchemaVersion` の `Deserialize` は現行値以外を拒否するため、`RawConfig` まで
到達した時点で `version` は必ず `CURRENT`。`try_new` が `CURRENT` を固定で設定
するので、`raw.version` を渡す必要がない。フィールド自体は「JSON に `version` が
必須」という契約を serde に伝えるために残し、未使用警告は
`#[expect(dead_code, reason = "...")]` で理由付きで抑制している。

## 4. expect を使ってよい経路の線引き

コーディング規約では本番コードでの `unwrap()` / `expect()` を禁止している。
それでも `Config` には `try_new(...).expect(...)` が 3 箇所ある。線引きは
**「入力の構造上、`Err` が返らないことを証明できるか」**。

| 経路 | なぜ `Err` にならないか |
|:--|:--|
| `Config::default()` | `DEFAULT_COLUMN_NAMES` は固定 3 件の相異なる名前 |
| `Config::from_statuses(非空)` | `distinct_statuses_in_path_order` が uniq 済みの名前を 1 件以上返す |
| `plan_reconcile_columns` | `self` は valid（1 件以上・一意）で、追加する名前は `has_column` で既存名を除外済み |

これらは `Result` を呼び出し側に伝播しても、呼び出し側は何も判断できない
（「起きないはずのこと」を扱うコードが増えるだけ）。代わりに **`expect` の
メッセージに「なぜ成立するか」を書く**ことで、万一 panic したときに
「どの前提が崩れたか」がログから分かるようにしている。

逆に `plan_update_columns` は FE から任意の `columns` を受け取るので `Err` が
本当に起きる。ここは `expect` ではなく `?` で `UpdateColumnsError` に伝播する（§5）。

### 初学者向け補足: `expect` と `unwrap` の違い

どちらも `Err` / `None` なら panic するが、`expect("msg")` は panic メッセージに
`msg` を含める。「起きないはず」の箇所では**理由を残す**ために必ず `expect` を使う。

## 5. plan_update_columns の二重検証

`plan_update_columns` は「renames → columns → doneColumn」の順に検証し、最初に
見つけた違反を返す。この順序は FE のエラー表示と結びついているので変えられない。

```rust
let candidate_columns = /* renames を適用した候補 */;

// 早期検証: columns の不変条件（順序 2 番目）
Self::validate_columns(&candidate_columns)?;      // ConfigInvariantError → UpdateColumnsError

// RenameToMissingFromColumns / UnknownDoneColumn の検証 …

Ok(UpdateColumnsPlan {
    // 最終構築: 早期検証済みなので Err にはならないが、unchecked 経路を持たないため ? で型を合わせる
    new_config: Config::try_new(candidate_columns, new_card_order, new_done)?
        .classify_column_names_after_validation(),
    ..
})
```

`validate_columns` と `try_new` で同じ O(n) 検証が 2 回走る。これを許容したのは:

- 最終構築だけに `try_new` を置くと、columns の検証が doneColumn の検証より**後**に
  なり、検証順序が変わる（`doneColumn` が不正で columns も空の入力に対し、
  以前は `EmptyColumns`、変更後は `UnknownDoneColumn` が返る）。
- columns は十数件以下で、2 回目の検証コストは無視できる。
- `Config::new`（unchecked）を残して最終構築に使えば 1 回で済むが、「唯一の構築境界」
  が崩れる。

### `?` が変換までしてくれる仕組み（初学者向け補足）

`validate_columns` は `ConfigInvariantError` を返すが、関数の戻り値は
`UpdateColumnsError`。`?` は `From<ConfigInvariantError> for UpdateColumnsError` が
実装されていると自動でその変換を呼ぶ。

```rust
impl From<ConfigInvariantError> for UpdateColumnsError {
    fn from(error: ConfigInvariantError) -> Self {
        match error {
            ConfigInvariantError::EmptyColumns => UpdateColumnsError::EmptyColumns,
            ConfigInvariantError::DuplicateColumnName { name } => {
                UpdateColumnsError::DuplicateColumnName { name }
            }
        }
    }
}
```

variant を 1:1 で対応させているので、`UpdateColumnsError` の Display 文字列
（FE が文字列マッチしている）は変わらない。

## 6. スコープ外にしたこと（doneColumn ∈ columns）

「`doneColumn` は `columns` のどれかを指す」も不変条件の候補だったが、今回は
**含めなかった**。`config-spec.md` に「`doneColumn` が `columns` に存在しない場合も
load 時には削除・拒否しない」「reconcile は修復しない」と明記されており、含めると
既存の `config.json` が開けなくなる（= 挙動変更）。本 Issue は純リファクタリング
（挙動変更なし）なので、別 Issue 候補として残している。

同様に、`plan_reconcile_columns` / `from_statuses` の入力
`&[(PathBuf, Option<String>)]` を VO 化する案も、bootstrap result type の設計
（#457）に委ねて今回は触っていない。

## 7. 初学者向け補足

### `TryFrom`

`From<A> for B` は「A から B へ必ず変換できる」、`TryFrom<A> for B` は
「失敗しうる（`Result<B, Error>` を返す）」変換。`RawConfig` → `Config` は
検証で落ちる可能性があるので `TryFrom`。実装すると `Config::try_from(raw)` と
`raw.try_into()` の両方が使える。

### `&[T]` を返す accessor

`columns()` は `&Vec<Column>` ではなく `&[Column]` を返す。スライス `&[T]` は
`Vec<T>` / 配列 / 別のスライスのどれからでも作れるので、呼び出し側が
「`Vec` である」ことに依存しなくなる。`&Vec<T>` は `Deref` で自動的に `&[T]` に
なるため、`&self.columns` と書くだけで済む。テストで `assert_eq!(c.columns(), &[..])`
と比較できるのもこのため。

### `pub(crate)`

`pub` は crate 外にも公開、`pub(crate)` は同じ crate 内だけに公開。`RawConfig` と
`validate_columns` は `load.rs` / `core.rs` の内部連携用なので `pub(crate)` にして、
crate 外（テストや将来の別 crate）からは見えないようにしている。

### 機械置換のやり方（`.columns` → `.columns()`）

フィールドを private 化すると、参照していた 66 箇所がコンパイルエラー（E0616）に
なる。テストには `payload.columns` や `case.columns` など `Config` 以外の `columns`
フィールドも多く、正規表現置換だと誤爆する。今回は `cargo build --tests` のエラー
位置（`file:line:col`）だけを書き換えるスクリプトで置換した。コンパイラを
「置換対象のリスト」として使う手法で、大規模な private 化で有効。

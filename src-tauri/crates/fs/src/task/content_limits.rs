//! Task markdownをscannerとdomain constructorで同じ条件に保つ共有上限。

/// Task markdownとして受理する最大ファイルサイズ（byte）。
///
/// scannerと`spec-board`本体の`TaskContent`が同じ値を使い、上限ちょうどを受理する。
pub const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// Task markdownのバイナリ判定で先頭から検査するbyte数。
///
/// scannerと`spec-board`本体の`TaskContent`が、この範囲内のNUL byteを拒否する。
pub const BINARY_PROBE_LEN: usize = 8 * 1024;

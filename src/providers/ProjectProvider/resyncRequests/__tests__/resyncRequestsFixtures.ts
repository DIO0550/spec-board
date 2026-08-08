import type { ResyncBegin, ResyncRequest } from "../index";

/**
 * 発行が許可された `begin` 結果から token を取り出す。
 *
 * `end` は token を参照同一性で照合するため、テストでも `begin` が返した
 * オブジェクトそのものを渡さないと所有権判定を検証したことにならない。
 * @param begun begin の戻り値
 * @returns 発行された token
 * @throws 畳み込まれていた場合
 */
export const startedRequest = (begun: ResyncBegin): ResyncRequest => {
  if (begun.kind !== "started") {
    throw new Error("発行されず畳み込まれた");
  }
  return begun.request;
};

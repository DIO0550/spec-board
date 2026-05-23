import type { Dispatch, FormEvent } from "react";
import { useCallback, useReducer } from "react";
import { ParentField } from "@/features/task-form/lib/fields/parent";
import { PriorityField } from "@/features/task-form/lib/fields/priority";
import {
  TitleField,
  type TitleValidationError,
} from "@/features/task-form/lib/fields/title";
import type { TaskFormValues } from "@/features/task-form/types";
import type { Task } from "@/types/task";

/** useTaskFormFields の引数 */
export type UseTaskFormFieldsArgs = {
  /** ステータスの初期値 */
  initialStatus: string;
  /** 親タスクの初期値（parentFieldVisible が true のときだけ使用） */
  initialParent?: string;
  /** 親タスクフィールドが表示されるか */
  parentFieldVisible: boolean;
  /** 送信中か（true の間は submit が無視される） */
  isSubmitting: boolean;
  /**
   * 既存タスク一覧。submit 時の重複判定スコープ構築に使う。
   * 未指定なら DUPLICATE 判定は走らない（空 Set 扱い）。
   */
  existingTasks?: readonly Task[];
  /**
   * バリデーション通過後に呼ばれる送信コールバック。
   * @param values - 正規化済みフォーム値
   */
  onSubmit: (values: TaskFormValues) => void;
  /**
   * 送信時に pending labelInput を取り込んだ最終 labels を同期取得する関数。
   * useLabelsInput から渡される想定。
   * @returns 最終ラベル配列
   */
  finalizeLabels: () => string[];
};

/** 各 field の現在値 */
export type FieldValues = {
  title: TitleField;
  status: string;
  priority: PriorityField;
  parent: ParentField;
  body: string;
};

/** 各 field のエラー（値が undefined ならエラーなし） */
export type FieldErrors = {
  title?: TitleValidationError;
};

/** useTaskFormFields の state */
export type FieldsState = {
  values: FieldValues;
  errors: FieldErrors;
};

/** state を変化させるアクション（discriminated union） */
export type FieldsAction =
  | { type: "title"; value: TitleField }
  | { type: "status"; value: string }
  | { type: "priority"; value: PriorityField }
  | { type: "parent"; value: ParentField }
  | { type: "body"; value: string }
  | { type: "validateAll"; error: TitleValidationError | undefined };

/** useTaskFormFields の返却値 */
export type UseTaskFormFieldsResult = {
  /** 現在 state */
  state: FieldsState;
  /** state 変更用 dispatch */
  dispatch: Dispatch<FieldsAction>;
  /**
   * form の onSubmit に渡すハンドラ。
   * @param e - FormEvent
   */
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

/**
 * BE 側 create_task が parent 未指定時に書き込む root dirname。
 * BE が `tasks/` 直下に固定で書き込む実装であることを前提に成立させている。
 * BE 側で root が動的になる変更が入った場合は、args に rootDir 相当を追加するか
 * existingTasks から推定する設計に切り替える必要がある。
 */
const DEFAULT_TARGET_DIR = "tasks";

/**
 * パス文字列を Windows / POSIX 両対応で分解する。
 * 空セグメントと "." を除去することで `./tasks/foo.md` や `tasks//foo.md` の表記揺れを吸収する。
 * @param p パス文字列
 * @returns 区切り文字でセグメント化した配列
 */
const pathSegments = (p: string): string[] =>
  p.split(/[\\/]/).filter((s) => s !== "" && s !== ".");

/**
 * パス文字列の末尾セグメント（basename）を返す。
 * @param p パス文字列
 * @returns 末尾セグメント。セグメントが取れない場合は入力をそのまま返す
 */
const pathBasename = (p: string): string => {
  const segments = pathSegments(p);
  return segments[segments.length - 1] ?? p;
};

/**
 * パス文字列のディレクトリ部分（dirname）を POSIX 区切りで返す。
 * セグメントが 1 個以下なら空文字を返す。
 * @param p パス文字列
 * @returns dirname 文字列（POSIX 区切り）
 */
const pathDirname = (p: string): string => {
  const segments = pathSegments(p);
  if (segments.length <= 1) {
    return "";
  }
  return segments.slice(0, -1).join("/");
};

/**
 * TaskForm の field 値・エラー遷移を計算する pure reducer。
 * title 入力時はエラーをクリアするだけにし、再 validate は handleSubmit 側で行う。
 * @param state - 現在の state
 * @param action - アクション
 * @returns 新しい state
 */
const reducer = (state: FieldsState, action: FieldsAction): FieldsState => {
  switch (action.type) {
    case "title": {
      if (
        Object.is(state.values.title, action.value) &&
        state.errors.title === undefined
      ) {
        return state;
      }
      return {
        values: { ...state.values, title: action.value },
        errors: { ...state.errors, title: undefined },
      };
    }
    case "status":
      return Object.is(state.values.status, action.value)
        ? state
        : { ...state, values: { ...state.values, status: action.value } };
    case "priority":
      return Object.is(state.values.priority, action.value)
        ? state
        : { ...state, values: { ...state.values, priority: action.value } };
    case "parent":
      return Object.is(state.values.parent, action.value)
        ? state
        : { ...state, values: { ...state.values, parent: action.value } };
    case "body":
      return Object.is(state.values.body, action.value)
        ? state
        : { ...state, values: { ...state.values, body: action.value } };
    case "validateAll":
      return {
        ...state,
        errors: { title: action.error },
      };
    default: {
      action satisfies never;
      return state;
    }
  }
};

/**
 * TaskForm の全 field 値・エラー・送信処理をまとめて管理するカスタムフック。
 * バリデーション / 初期値 / 正規化は各 Field モジュール（TitleField / PriorityField / ParentField）に委譲し、
 * ここでは reducer の配線と handleSubmit のみを担う。
 *
 * **前提**: `parentFieldVisible` / `initialParent` は mount 後に変化しないこと。これらの値は
 * useReducer の初期化関数でのみ参照され、mount 後の変化に追従する useEffect は持たない。
 * 現行の呼び出し元（`TaskCreateModal` 経由で `App.tsx` が条件レンダーする）では、
 * モーダルを開くたびに新 hook インスタンスが mount されるためこの前提で問題ない。
 * 長寿命な親コンポーネントから props を動的に変える用途で再利用する場合は、
 * 呼び出し側で `key` を切り替えて remount するか、本 hook に sync ロジックを再追加すること。
 * @param args - フックの引数
 * @returns state / dispatch / handleSubmit
 */
export const useTaskFormFields = (
  args: UseTaskFormFieldsArgs,
): UseTaskFormFieldsResult => {
  const [state, dispatch] = useReducer(
    reducer,
    args,
    (a): FieldsState => ({
      values: {
        title: TitleField.initial(),
        status: a.initialStatus,
        priority: PriorityField.initial(),
        parent: ParentField.initial(a.parentFieldVisible, a.initialParent),
        body: "",
      },
      errors: {},
    }),
  );

  const { isSubmitting, onSubmit, finalizeLabels, existingTasks } = args;
  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) {
        return;
      }
      const parentFilePath = state.values.parent;
      const targetDir =
        parentFilePath !== undefined
          ? pathDirname(parentFilePath)
          : DEFAULT_TARGET_DIR;

      const existingFileNames = new Set<string>();
      if (existingTasks !== undefined) {
        for (const t of existingTasks) {
          if (pathDirname(t.filePath) === targetDir) {
            existingFileNames.add(pathBasename(t.filePath));
          }
        }
      }

      const result = TitleField.validate(state.values.title, {
        existingFileNames,
      });
      if (!result.ok) {
        dispatch({ type: "validateAll", error: result.error });
        return;
      }
      // 前回 submit で残った DUPLICATE 等の古いエラー表示を消す。
      // parent / existingTasks が変わって今回 Ok になったケースが該当する。
      if (state.errors.title !== undefined) {
        dispatch({ type: "validateAll", error: undefined });
      }
      const labels = finalizeLabels();
      onSubmit({
        title: TitleField.normalize(state.values.title),
        status: state.values.status,
        priority: PriorityField.normalize(state.values.priority),
        parent: state.values.parent,
        body: state.values.body,
        labels: [...labels],
      });
    },
    [
      isSubmitting,
      onSubmit,
      finalizeLabels,
      existingTasks,
      state.values,
      state.errors.title,
    ],
  );

  return { state, dispatch, handleSubmit };
};

import type { Dispatch, FormEvent } from "react";
import { useCallback, useReducer } from "react";
import { ParentField } from "@/features/task-form/lib/fields/parent";
import { PriorityField } from "@/features/task-form/lib/fields/priority";
import { TitleField } from "@/features/task-form/lib/fields/title";
import type { TaskFormValues } from "@/features/task-form/types";

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
   * バリデーション通過後に呼ばれる送信コールバック。
   * @param values - 正規化済みフォーム値
   */
  onSubmit: (values: TaskFormValues) => void;
  /**
   * 送信時に未コミットラベルを取り込み、最終 labels を同期取得する関数。
   * useLabelsInput から渡される想定。
   * @returns 最終ラベル配列
   */
  commitPendingAndGetLabels: () => string[];
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
  title?: string;
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
  | { type: "validateAll" };

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
 * TaskForm の field 値・エラー遷移を計算する pure reducer。
 * バリデーション判断は TitleField.validate に委譲し、ここでは配線のみ。
 * @param state - 現在の state
 * @param action - アクション
 * @returns 新しい state
 */
const reducer = (state: FieldsState, action: FieldsAction): FieldsState => {
  switch (action.type) {
    case "title": {
      const error = TitleField.validate(action.value);
      return {
        values: { ...state.values, title: action.value },
        errors: { ...state.errors, title: error },
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
        errors: { title: TitleField.validate(state.values.title) },
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
  const [state, dispatch] = useReducer(reducer, args, (a) => ({
    values: {
      title: TitleField.initial(),
      status: a.initialStatus,
      priority: PriorityField.initial(),
      parent: ParentField.initial(a.parentFieldVisible, a.initialParent),
      body: "",
    },
    errors: {},
  }));

  const { isSubmitting, onSubmit, commitPendingAndGetLabels } = args;
  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) {
        return;
      }
      const titleError = TitleField.validate(state.values.title);
      if (titleError !== undefined) {
        dispatch({ type: "validateAll" });
        return;
      }
      const labels = commitPendingAndGetLabels();
      onSubmit({
        title: TitleField.normalize(state.values.title),
        status: state.values.status,
        priority: PriorityField.normalize(state.values.priority),
        parent: state.values.parent,
        body: state.values.body,
        labels,
      });
    },
    [isSubmitting, onSubmit, commitPendingAndGetLabels, state.values],
  );

  return { state, dispatch, handleSubmit };
};

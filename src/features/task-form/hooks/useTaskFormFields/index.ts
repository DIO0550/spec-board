import type { Dispatch, FormEvent } from "react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ParentField,
  type ParentValue,
} from "@/features/task-form/lib/fields/parent";
import {
  PriorityField,
  type PriorityValue,
} from "@/features/task-form/lib/fields/priority";
import {
  TitleField,
  type TitleValue,
} from "@/features/task-form/lib/fields/title";
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
  title: TitleValue;
  status: string;
  priority: PriorityValue;
  parent: ParentValue;
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
  | { type: "title"; value: TitleValue }
  | { type: "status"; value: string }
  | { type: "priority"; value: PriorityValue }
  | { type: "parent"; value: ParentValue }
  | { type: "body"; value: string }
  | { type: "syncParent"; value: ParentValue }
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
      return { ...state, values: { ...state.values, status: action.value } };
    case "priority":
      return { ...state, values: { ...state.values, priority: action.value } };
    case "parent":
      return { ...state, values: { ...state.values, parent: action.value } };
    case "body":
      return { ...state, values: { ...state.values, body: action.value } };
    case "syncParent":
      return { ...state, values: { ...state.values, parent: action.value } };
    case "validateAll":
      return {
        ...state,
        errors: { title: TitleField.validate(state.values.title) },
      };
  }
};

/**
 * TaskForm の全 field 値・エラー・送信処理をまとめて管理するカスタムフック。
 * バリデーション / 初期値 / 正規化は各 Field モジュール（TitleField / PriorityField / ParentField）に委譲し、
 * ここでは reducer の配線と useEffect（parent リセット）/ handleSubmit のみを担う。
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

  const { parentFieldVisible, initialParent } = args;
  // 初期マウント時は useReducer の init 関数で parent を正しい値に初期化済みなので
  // dispatch は不要。props 変化時のみ syncParent する（ユーザーが parent action で
  // 選択した値を上書きしないよう、deps には state を含めない）。
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    dispatch({
      type: "syncParent",
      value: ParentField.reset(parentFieldVisible, initialParent),
    });
  }, [parentFieldVisible, initialParent]);

  const { isSubmitting, onSubmit, commitPendingAndGetLabels } = args;
  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) return;
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

import type { Dispatch, FormEvent } from "react";
import { useCallback, useReducer } from "react";
import { DueField } from "@/features/task-form/lib/fields/due";
import {
  FileNameField,
  type FileNameValidationError,
} from "@/features/task-form/lib/fields/fileName";
import { ParentField } from "@/features/task-form/lib/fields/parent";
import { PriorityField } from "@/features/task-form/lib/fields/priority";
import {
  SubIssuesField,
  type SubIssuesValidationError,
} from "@/features/task-form/lib/fields/subIssues";
import {
  TitleField,
  type TitleValidationError,
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
   * 送信時に pending labelInput を取り込んだ最終 labels を同期取得する関数。
   * useLabelsInput から渡される想定。
   * @returns 最終ラベル配列
   */
  finalizeLabels: () => string[];
  /**
   * 送信時に最終 links を同期取得する関数。useLinksInput から渡される想定。
   * @returns 最終 links 配列
   */
  finalizeLinks: () => string[];
};

/** 各 field の現在値 */
export type FieldValues = {
  title: TitleField;
  fileName: FileNameField;
  status: string;
  priority: PriorityField;
  parent: ParentField;
  body: string;
  due: DueField;
  subIssues: SubIssuesField;
};

/** 各 field のエラー（値が undefined ならエラーなし） */
export type FieldErrors = {
  title?: TitleValidationError;
  fileName?: FileNameValidationError;
  subIssues?: SubIssuesValidationError;
};

/** useTaskFormFields の state */
export type FieldsState = {
  values: FieldValues;
  errors: FieldErrors;
  /**
   * ファイル名欄が手動編集されたか。false の間は title 入力に kebab-case で追従し、
   * submit 時も fileName キーを送らない（BE のタイトル由来生成に委ねる）。
   */
  fileNameDirty: boolean;
};

/** state を変化させるアクション（discriminated union） */
export type FieldsAction =
  | { type: "title"; value: TitleField }
  | { type: "fileName"; value: string }
  | { type: "status"; value: string }
  | { type: "priority"; value: PriorityField }
  | { type: "parent"; value: ParentField }
  | { type: "body"; value: string }
  | { type: "due"; value: string }
  | { type: "subIssues"; value: string }
  | {
      type: "validateAll";
      titleError: TitleValidationError | undefined;
      fileNameError: FileNameValidationError | undefined;
      subIssuesError: SubIssuesValidationError | undefined;
    };

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
 * title / fileName 入力時はエラーをクリアするだけにし、再 validate は handleSubmit 側で行う。
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
      // 手動編集前はタイトルから kebab-case でファイル名を自動追従する。
      const fileName = state.fileNameDirty
        ? state.values.fileName
        : FileNameField.fromTitle(action.value);
      return {
        ...state,
        values: { ...state.values, title: action.value, fileName },
        errors: { ...state.errors, title: undefined },
      };
    }
    case "fileName": {
      const normalized = FileNameField.normalizeInput(action.value);
      // 空に戻したらタイトル追従を再開する。
      if (normalized === "") {
        return {
          ...state,
          fileNameDirty: false,
          values: {
            ...state.values,
            fileName: FileNameField.fromTitle(state.values.title),
          },
          errors: { ...state.errors, fileName: undefined },
        };
      }
      return {
        ...state,
        fileNameDirty: true,
        values: { ...state.values, fileName: normalized },
        errors: { ...state.errors, fileName: undefined },
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
    case "due":
      return Object.is(state.values.due, action.value)
        ? state
        : { ...state, values: { ...state.values, due: action.value } };
    case "subIssues": {
      if (
        Object.is(state.values.subIssues, action.value) &&
        state.errors.subIssues === undefined
      ) {
        return state;
      }
      return {
        ...state,
        values: { ...state.values, subIssues: action.value },
        errors: { ...state.errors, subIssues: undefined },
      };
    }
    case "validateAll":
      return {
        ...state,
        errors: {
          ...state.errors,
          title: action.titleError,
          fileName: action.fileNameError,
          subIssues: action.subIssuesError,
        },
      };
    default: {
      action satisfies never;
      return state;
    }
  }
};

/**
 * TaskForm の全 field 値・エラー・送信処理をまとめて管理するカスタムフック。
 * バリデーション / 初期値 / 正規化は各 Field モジュール（TitleField / FileNameField /
 * PriorityField / ParentField）に委譲し、ここでは reducer の配線と handleSubmit のみを担う。
 *
 * **前提**: `parentFieldVisible` / `initialParent` は mount 後に変化しないこと。これらの値は
 * useReducer の初期化関数でのみ参照され、mount 後の変化に追従する useEffect は持たない。
 * 現行の呼び出し元（`TaskCreateScreen` 経由で `App.tsx` が `view === "create"` で
 * 条件レンダーする）では、作成画面を開くたびに新 hook インスタンスが mount されるため
 * この前提で問題ない。
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
        fileName: FileNameField.initial(),
        status: a.initialStatus,
        priority: PriorityField.initial(),
        parent: ParentField.initial(a.parentFieldVisible, a.initialParent),
        body: "",
        due: DueField.initial(),
        subIssues: SubIssuesField.initial(),
      },
      errors: {},
      fileNameDirty: false,
    }),
  );

  const { isSubmitting, onSubmit, finalizeLabels, finalizeLinks } = args;
  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) {
        return;
      }
      const titleResult = TitleField.validate(state.values.title);
      const fileNameResult = FileNameField.validate(state.values.fileName);
      const subIssuesResult = SubIssuesField.validate(state.values.subIssues);
      if (!titleResult.ok || !fileNameResult.ok || !subIssuesResult.ok) {
        dispatch({
          type: "validateAll",
          titleError: titleResult.ok ? undefined : titleResult.error,
          fileNameError: fileNameResult.ok ? undefined : fileNameResult.error,
          subIssuesError: subIssuesResult.ok
            ? undefined
            : subIssuesResult.error,
        });
        return;
      }
      // 前回 submit で残った古いエラー表示を消す。
      if (
        state.errors.title !== undefined ||
        state.errors.fileName !== undefined ||
        state.errors.subIssues !== undefined
      ) {
        dispatch({
          type: "validateAll",
          titleError: undefined,
          fileNameError: undefined,
          subIssuesError: undefined,
        });
      }
      const labels = finalizeLabels();
      const links = finalizeLinks();
      // 自動追従中（手動未編集）は fileName キーを省略し、BE のタイトル由来生成に
      // 委ねる（FE/BE の kebab-case 挙動一致が保証されているため表示と保存名は一致する）。
      const fileName = state.fileNameDirty
        ? FileNameField.toParam(state.values.fileName)
        : undefined;
      const due = DueField.toParam(state.values.due);
      onSubmit({
        title: TitleField.normalize(state.values.title),
        status: state.values.status,
        priority: PriorityField.normalize(state.values.priority),
        parent: state.values.parent,
        body: state.values.body,
        labels: [...labels],
        links: [...links],
        subIssueTitles: SubIssuesField.finalize(state.values.subIssues),
        ...(fileName !== undefined && { fileName }),
        ...(due !== undefined && { due }),
      });
    },
    [
      isSubmitting,
      onSubmit,
      finalizeLabels,
      finalizeLinks,
      state.values,
      state.errors.title,
      state.errors.fileName,
      state.errors.subIssues,
      state.fileNameDirty,
    ],
  );

  return { state, dispatch, handleSubmit };
};

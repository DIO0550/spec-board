import { useCallback, useState } from "react";

/** 折りたたみ状態を保存する localStorage キー。 */
const STORAGE_KEY = "spec-board:sidebarCollapsed";

/**
 * localStorage から折りたたみ状態を読み込む（既定は展開 = false）。
 * @returns 折りたたみ中なら true
 */
const loadCollapsed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

/** useSidebar の返り値。 */
export type UseSidebarResult = {
  /** サイドバーが折りたたまれているか */
  collapsed: boolean;
  /** 折りたたみ状態をトグルする（localStorage へ永続化）。 */
  toggle: () => void;
};

/**
 * サイドバーの折りたたみ状態を保持し localStorage に永続化するフック。
 * @returns 折りたたみ state とトグルハンドラ
 */
export const useSidebar = (): UseSidebarResult => {
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // 永続化失敗は UI 設定が揮発するだけなので黙殺する
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
};

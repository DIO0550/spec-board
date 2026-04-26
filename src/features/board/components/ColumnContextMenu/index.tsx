import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** ColumnContextMenu の Props */
type ColumnContextMenuProps = {
  /** 表示位置 X 座標（clientX） */
  x: number;
  /** 表示位置 Y 座標（clientY） */
  y: number;
  /** 削除メニュー項目を有効化するか（false の場合はクリック不可） */
  canDelete: boolean;
  /** 「削除」項目クリック時のコールバック */
  onDelete: () => void;
  /** メニューを閉じるコールバック（外側クリック・Esc・項目選択後） */
  onClose: () => void;
};

/**
 * メニュー内のフォーカス可能な menuitem 要素を取得する。
 * @param menu - メニューのルート要素。`null` の場合は空配列を返す
 * @returns disabled でない menuitem の配列（DOM 順）
 */
const getFocusableMenuItems = (menu: HTMLDivElement | null): HTMLElement[] => {
  if (!menu) {
    return [];
  }
  return Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
  );
};

/**
 * カラムヘッダーの右クリック時に表示されるコンテキストメニュー。
 * 現時点では「削除」項目のみを提供する。
 * @param props - {@link ColumnContextMenuProps}
 * @returns コンテキストメニュー要素
 */
export const ColumnContextMenu = ({
  x,
  y,
  canDelete,
  onDelete,
  onClose,
}: ColumnContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const [firstItem] = getFocusableMenuItems(menuRef.current);
    firstItem?.focus();
  }, []);

  // メニューの実寸を測ってビューポート外にはみ出す場合は折り返す。
  // useLayoutEffect で paint 前に補正するため表示直後のちらつきは出ない。
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    setPos({ x: Math.min(x, maxX), y: Math.min(y, maxY) });
  }, [x, y]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    const items = getFocusableMenuItems(menuRef.current);
    if (items.length === 0) {
      return;
    }
    e.preventDefault();
    const active = document.activeElement;
    const currentIndex =
      active instanceof HTMLElement ? items.indexOf(active) : -1;
    const nextIndex =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (currentIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[nextIndex]?.focus();
  };

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismisses menu on click; Escape handled separately */}
      <div
        role="presentation"
        className="fixed inset-0 z-40"
        data-testid="column-context-menu-overlay"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="カラム操作"
        style={{ top: pos.y, left: pos.x }}
        className="fixed z-50 min-w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        data-testid="column-context-menu"
        onKeyDown={handleMenuKeyDown}
      >
        <button
          type="button"
          role="menuitem"
          disabled={!canDelete}
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
          data-testid="column-context-menu-delete"
        >
          削除
        </button>
      </div>
    </>
  );
};

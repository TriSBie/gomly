"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";
import { fetchUnreadCount, getAccessToken } from "./api";

interface InboxContextValue {
  /** Số thông báo chưa đọc (huy hiệu trên Sidebar). */
  unreadCount: number;
  /** Nạp lại số chưa đọc từ API. */
  refreshUnread: () => Promise<void>;
  /** Gán thẳng số chưa đọc (dùng sau "đánh dấu tất cả đã đọc"). */
  setUnreadCount: (n: number) => void;
  /** Trừ lạc quan khi người dùng đọc 1 thông báo trong trang Inbox. */
  decrementUnread: (by?: number) => void;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox(): InboxContextValue {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox phải được dùng bên trong <InboxProvider>");
  return ctx;
}

/**
 * Giữ số thông báo chưa đọc dùng chung cho Sidebar (huy hiệu) và trang Inbox
 * (cập nhật lạc quan khi đọc). Cách làm đơn giản + chắc chắn:
 * - nạp khi provider mount, khi đổi route (quay lại trang nào cũng làm mới),
 *   và khi cửa sổ được focus lại;
 * - trang Inbox tự trừ/gán lại ngay khi thao tác đọc thành công phía UI,
 *   không chờ request làm mới tiếp theo.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadState] = useState(0);
  const pathname = usePathname();
  const runRef = useRef(0);

  const refreshUnread = useCallback(async (): Promise<void> => {
    if (!getAccessToken()) {
      setUnreadState(0);
      return;
    }
    const run = ++runRef.current;
    try {
      const count = await fetchUnreadCount();
      if (runRef.current === run) setUnreadState(count);
    } catch {
      // Lỗi mạng/401 thoáng qua: giữ nguyên số cũ thay vì nhảy về 0.
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, pathname]);

  useEffect(() => {
    const onFocus = () => void refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUnread]);

  const setUnreadCount = useCallback((n: number) => {
    runRef.current++;
    setUnreadState(Math.max(0, n));
  }, []);

  const decrementUnread = useCallback((by = 1) => {
    setUnreadState((prev) => Math.max(0, prev - by));
  }, []);

  const value = useMemo<InboxContextValue>(
    () => ({ unreadCount, refreshUnread, setUnreadCount, decrementUnread }),
    [unreadCount, refreshUnread, setUnreadCount, decrementUnread],
  );

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { fetchIssues, type Issue } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export const OPEN_PALETTE_EVENT = "gomly:open-palette";
export const NEW_ISSUE_EVENT = "gomly:new-issue";

interface PaletteItem {
  id: string;
  section: string;
  label: string;
  hint?: string;
  run: () => void;
}

const KNOWN_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELED",
];

/**
 * Bảng lệnh kiểu Linear: Cmd+K / Ctrl+K (hoặc nút Tìm kiếm ở Sidebar).
 * - Chưa nhập: "Đi tới" (trang chính) + "Hành động" (tạo issue, đổi ngôn ngữ, đăng xuất).
 * - Đã nhập: lọc lệnh theo chữ + tìm issue theo q ở workspace hiện tại (debounce 250ms).
 * - Phím lên/xuống + Enter để chọn, Esc để đóng.
 */
export default function CommandPalette() {
  const tp = useTranslations("Palette");
  const tn = useTranslations("Nav");
  const tc = useTranslations("Common");
  const ti = useTranslations("Issues");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { currentWorkspace, logout } = useAuth();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Mở bằng Cmd+K / Ctrl+K ở bất cứ đâu; Sidebar bắn event để mở.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  // Mỗi lần mở: xóa truy vấn cũ + autofocus vào ô nhập.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIssues([]);
      setActive(0);
      const h = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(h);
    }
  }, [open ]);

  // Tìm issue theo từ khóa (debounce 250ms) trong workspace hiện tại.
  useEffect(() => {
    const q = query.trim();
    if (!open || !q || !currentWorkspace) {
      setIssues([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const h = setTimeout(() => {
      fetchIssues(currentWorkspace.id, { q })
        .then((list) => {
          if (!cancelled) {
            setIssues(list.slice(0, 8));
            setActive(0);
          }
        })
        .catch(() => {
          if (!cancelled) setIssues([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [open, query, currentWorkspace]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (label: string) =>
      !q || label.toLowerCase().includes(q);

    const nav: PaletteItem[] = [
      { href: "/triage", label: tn("triage") },
      { href: "/issues", label: tn("issues") },
      { href: "/cycles", label: tn("cycles") },
      { href: "/projects", label: tn("projects") },
      { href: "/inbox", label: tn("inbox") },
      { href: "/my-issues", label: tn("myIssues") },
      { href: "/members", label: tn("members") },
    ]
      .filter((n) => matches(n.label))
      .map((n) => ({
        id: `nav:${n.href}`,
        section: tp("goTo"),
        label: n.label,
        run: () => {
          close();
          router.push(n.href);
        },
      }));

    const otherLocale = locale === "vi" ? "en" : "vi";
    const actions: PaletteItem[] = [
      {
        id: "action:create-issue",
        section: tp("actions"),
        label: tp("createIssue"),
        run: () => {
          close();
          // Nếu đang ở sẵn /issues: mở form qua event; nếu chưa: điều hướng
          // kèm ?new=1 để trang tự mở form khi mount.
          window.dispatchEvent(new CustomEvent(NEW_ISSUE_EVENT));
          router.push("/issues?new=1");
        },
      },
      {
        id: "action:switch-language",
        section: tp("actions"),
        label: locale === "vi" ? tp("switchToEn") : tp("switchToVi"),
        run: () => {
          close();
          router.replace(pathname ?? "/", {
            locale: otherLocale as "vi" | "en",
          });
        },
      },
      {
        id: "action:logout",
        section: tp("actions"),
        label: tc("logout"),
        run: () => {
          close();
          logout();
          router.replace("/login");
        },
      },
    ].filter((a) => matches(a.label));

    const issueItems: PaletteItem[] = issues.map((issue) => ({
      id: `issue:${issue.id}`,
      section: tp("results"),
      label: issue.title,
      hint: `${issue.key} · ${
        KNOWN_STATUSES.includes(String(issue.status))
          ? ti(`status.${issue.status}`)
          : String(issue.status)
      }`,
      run: () => {
        close();
        router.push(`/issues/${issue.id}`);
      },
    }));

    return [...nav, ...actions, ...issueItems];
  }, [query, issues, locale, pathname, router, logout, close, tn, tp, tc, ti]);

  // Giữ active trong biên khi danh sách rút ngắn.
  useEffect(() => {
    setActive((a) => (items.length === 0 ? 0 : Math.min(a, items.length - 1)));
  }, [items.length]);

  // Cuộn item đang chọn vào tầm nhìn.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        items.length ? (a - 1 + items.length) % items.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!open) return null;

  let flatIdx = -1;
  const sections: { title: string; items: PaletteItem[] }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.title === item.section) last.items.push(item);
    else sections.push({ title: item.section, items: [item] });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tp("placeholder")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5, 6, 8, 0.6)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#0f1011",
          border: "1px solid #26282e",
          borderRadius: 12,
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={tp("placeholder")}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid #1e2025",
            outline: "none",
            color: "#f2f3f5",
            fontSize: 15,
            padding: "14px 16px",
            boxSizing: "border-box",
          }}
        />
        <div
          ref={listRef}
          style={{ maxHeight: 380, overflowY: "auto", padding: "6px" }}
        >
          {items.length === 0 && (
            <div
              style={{
                padding: "18px 12px",
                color: "#9ba0aa",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {searching ? tp("searching") : tp("noResults")}
            </div>
          )}
          {sections.map((section) => (
            <div key={section.title}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#6f747e",
                  padding: "8px 10px 4px",
                }}
              >
                {section.title}
              </div>
              {section.items.map((item) => {
                flatIdx++;
                const idx = flatIdx;
                const isActive = idx === active;
                return (
                  <button
                    key={item.id}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => item.run()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      background: isActive ? "#1c1e26" : "transparent",
                      border: "none",
                      borderRadius: 8,
                      color: "#e6e7e9",
                      padding: "9px 10px",
                      fontSize: 14,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>
                    {item.hint && (
                      <span
                        style={{
                          color: "#6f747e",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {item.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            borderTop: "1px solid #1e2025",
            padding: "8px 14px",
            color: "#6f747e",
            fontSize: 12,
          }}
        >
          {tp("hint")}
        </div>
      </div>
    </div>
  );
}

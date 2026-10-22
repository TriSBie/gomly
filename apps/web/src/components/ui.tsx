"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ApiError, type Issue } from "@/lib/api";

/** Kiểu dùng chung cho các màn Wave 1 (khớp tông với TriageClient Wave 0). */
export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0c0d0f",
  border: "1px solid #26282e",
  borderRadius: 8,
  color: "#e6e7e9",
  padding: "9px 11px",
  fontSize: 14,
  boxSizing: "border-box",
};

export const selectStyle: React.CSSProperties = {
  background: "#141519",
  border: "1px solid #26282e",
  borderRadius: 6,
  color: "#e6e7e9",
  padding: "6px 8px",
  fontSize: 13,
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#9ba0aa",
  marginBottom: 6,
};

export const primaryBtn: React.CSSProperties = {
  background: "#5e6ad2",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #26282e",
  borderRadius: 8,
  color: "#c6c9cf",
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export const smallGhostBtn: React.CSSProperties = {
  ...ghostBtn,
  borderRadius: 7,
  padding: "6px 11px",
};

export const cardStyle: React.CSSProperties = {
  border: "1px solid #1e2025",
  borderRadius: 10,
  padding: 16,
  background: "#0f1011",
};

export const dangerBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(224, 82, 82, 0.5)",
  borderRadius: 8,
  color: "#ff9d9d",
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export function NoticeBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        background: "rgba(63, 185, 109, 0.12)",
        border: "1px solid rgba(63, 185, 109, 0.4)",
        color: "#8fe3ae",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(224, 82, 82, 0.12)",
        border: "1px solid rgba(224, 82, 82, 0.4)",
        color: "#ff9d9d",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

/** Chuyển lỗi API thành thông điệp thân thiện (lỗi mạng / message server / mặc định). */
export function useFriendlyError() {
  const tc = useTranslations("Common");
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError && err.kind === "network") {
        return tc("serverError");
      }
      if (err instanceof ApiError && err.message) return err.message;
      return tc("genericError");
    },
    [tc],
  );
}

/** Thứ tự cột board + trạng thái đại diện khi kéo-thả vào cột. */
export const STATUS_GROUPS = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELED",
] as const;

export const ALL_STATUSES = STATUS_GROUPS;

export const PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export function issueGroup(issue: Issue): string {
  if (issue.statusGroup) return issue.statusGroup;
  if (issue.status) return issue.status;
  return "BACKLOG";
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  BACKLOG: { bg: "rgba(155, 160, 170, 0.14)", fg: "#9ba0aa" },
  TODO: { bg: "rgba(94, 106, 210, 0.16)", fg: "#93a0f5" },
  IN_PROGRESS: { bg: "rgba(224, 172, 52, 0.14)", fg: "#eac35c" },
  IN_REVIEW: { bg: "rgba(155, 63, 151, 0.16)", fg: "#e08adb" },
  DONE: { bg: "rgba(63, 185, 109, 0.14)", fg: "#8fe3ae" },
  CANCELED: { bg: "rgba(224, 82, 82, 0.12)", fg: "#ff9d9d" },
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("Issues");
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.BACKLOG;
  const known = (STATUS_GROUPS as readonly string[]).includes(status);
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        borderRadius: 5,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {known ? t(`status.${status}`) : status}
    </span>
  );
}

const PRIORITY_STYLE: Record<string, { fg: string }> = {
  NONE: { fg: "#6f747e" },
  LOW: { fg: "#9ba0aa" },
  MEDIUM: { fg: "#eac35c" },
  HIGH: { fg: "#f08c4a" },
  URGENT: { fg: "#ff9d9d" },
};

export function PriorityLabel({ priority }: { priority?: string | null }) {
  const t = useTranslations("Issues");
  if (!priority) return <span style={{ color: "#6f747e" }}>—</span>;
  const s = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.NONE;
  const known = (PRIORITIES as readonly string[]).includes(priority);
  return (
    <span style={{ color: s.fg, fontSize: 13, whiteSpace: "nowrap" }}>
      {known ? t(`priority.${priority}`) : priority}
    </span>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: "#1e2025",
        overflow: "hidden",
        minWidth: 90,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${p}%`,
          background: p === 100 ? "#3fb96d" : "#5e6ad2",
          borderRadius: 3,
        }}
      />
    </div>
  );
}

/** Rút gọn id dài (uuid) để hiển thị khi API chỉ trả id người dùng. */
export function shortId(id?: string | null): string {
  if (!id) return "—";
  if (id.includes("@")) return id;
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}

/** Giá trị cho <input type="date"> từ ISO datetime. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

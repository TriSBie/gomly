"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/api";
import { useInbox } from "@/lib/inbox-context";
import {
  ErrorBox,
  primaryBtn,
  smallGhostBtn,
  useFriendlyError,
} from "./ui";

const TYPE_META: Record<string, { labelKey: string; color: string }> = {
  ASSIGNED: { labelKey: "assigned", color: "#93a0f5" },
  COMMENTED: { labelKey: "comment", color: "#8fe3ae" },
  COMMENT: { labelKey: "comment", color: "#8fe3ae" },
  MENTIONED: { labelKey: "mention", color: "#e08adb" },
  MENTION: { labelKey: "mention", color: "#e08adb" },
  STATUS_CHANGED: { labelKey: "statusChanged", color: "#eac35c" },
};

type Filter = "all" | "unread";

export default function InboxClient() {
  const t = useTranslations("Inbox");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const friendly = useFriendlyError();
  const { unreadCount, refreshUnread, setUnreadCount, decrementUnread } =
    useInbox();

  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(
        await fetchNotifications({
          unreadOnly: filter === "unread",
          limit: 50,
        }),
      );
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [filter, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  };

  async function onItemClick(n: Notification) {
    if (!n.readAt) {
      const nowIso = new Date().toISOString();
      // Lạc quan: cập nhật UI + huy hiệu ngay, request chạy nền.
      setItems((prev) =>
        filter === "unread"
          ? prev.filter((x) => x.id !== n.id)
          : prev.map((x) => (x.id === n.id ? { ...x, readAt: nowIso } : x)),
      );
      decrementUnread(1);
      try {
        await markNotificationRead(n.id);
      } catch {
        void refreshUnread();
      }
    }
    if (n.issueId) {
      router.push(`/issues/${n.issueId}`);
    }
  }

  async function onMarkAllRead() {
    setBusyAll(true);
    setActionError(null);
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      filter === "unread"
        ? []
        : prev.map((x) => (x.readAt ? x : { ...x, readAt: nowIso })),
    );
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setActionError(friendly(err));
      void load();
      void refreshUnread();
    } finally {
      setBusyAll(false);
    }
  }

  const hasUnread = items.some((n) => !n.readAt) || unreadCount > 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 650, margin: 0 }}>
          {t("title")}
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: 10,
                background: "#e05252",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                padding: "2px 8px",
                verticalAlign: "middle",
              }}
            >
              {unreadCount}
            </span>
          )}
        </h1>
        {hasUnread && (
          <button
            style={smallGhostBtn}
            disabled={busyAll}
            onClick={() => void onMarkAllRead()}
          >
            {busyAll ? tc("processing") : t("markAllRead")}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(
          [
            { key: "all", label: t("filterAll") },
            { key: "unread", label: t("filterUnread") },
          ] as { key: Filter; label: string }[]
        ).map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            style={{
              ...(filter === chip.key ? primaryBtn : smallGhostBtn),
              borderRadius: 999,
              padding: "6px 13px",
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loadError && (
        <ErrorBox>
          {loadError}{" "}
          <button
            onClick={() => void load()}
            style={{
              background: "transparent",
              border: "none",
              color: "#c6c9cf",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
            }}
          >
            {tc("retry")}
          </button>
        </ErrorBox>
      )}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : items.length === 0 && !loadError ? (
        <div
          style={{
            border: "1px dashed #26282e",
            borderRadius: 10,
            padding: "36px 20px",
            textAlign: "center",
            color: "#9ba0aa",
            fontSize: 14,
          }}
        >
          {filter === "unread" ? t("emptyUnread") : t("emptyAll")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? {
              labelKey: "other",
              color: "#9ba0aa",
            };
            const unread = !n.readAt;
            const headline =
              n.title ??
              `${t(`types.${meta.labelKey}`)}${
                n.issueKey ? ` · ${n.issueKey}` : ""
              }`;
            const actorLabel = n.actor?.name ?? n.actor?.email ?? null;
            return (
              <button
                key={n.id}
                onClick={() => void onItemClick(n)}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  textAlign: "left",
                  width: "100%",
                  background: unread ? "#12131a" : "#0f1011",
                  border: "1px solid #1e2025",
                  borderRadius: 10,
                  padding: "12px 14px",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    marginTop: 6,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: unread ? "#e05252" : "transparent",
                    border: unread ? "none" : "1px solid #26282e",
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        color: meta.color,
                        border: `1px solid ${meta.color}55`,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        borderRadius: 5,
                        padding: "1px 6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t(`types.${meta.labelKey}`)}
                    </span>
                    <span
                      style={{
                        color: unread ? "#f2f3f5" : "#c6c9cf",
                        fontWeight: unread ? 650 : 500,
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {headline}
                    </span>
                  </span>
                  {(n.body || n.issueTitle) && (
                    <span
                      style={{
                        display: "block",
                        color: "#9ba0aa",
                        fontSize: 13,
                        lineHeight: 1.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.body ?? n.issueTitle}
                    </span>
                  )}
                  <span
                    style={{
                      display: "block",
                      color: "#6f747e",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {actorLabel ? `${actorLabel} · ` : ""}
                    {formatTime(n.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fetchMyIssues, type Issue } from "@/lib/api";
import {
  ErrorBox,
  PriorityLabel,
  StatusBadge,
  formatDate,
  issueGroup,
  primaryBtn,
  smallGhostBtn,
  useFriendlyError,
} from "./ui";

/** Thứ tự nhóm: việc đang làm/chưa xong trước, đã xong/hủy sau cùng. */
const GROUP_ORDER = [
  "IN_PROGRESS",
  "IN_REVIEW",
  "TODO",
  "BACKLOG",
  "DONE",
  "CANCELED",
] as const;

export default function MyIssuesClient() {
  const t = useTranslations("MyIssues");
  const ti = useTranslations("Issues");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chip, setChip] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setIssues(await fetchMyIssues());
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      const g = issueGroup(issue);
      const list = map.get(g) ?? [];
      list.push(issue);
      map.set(g, list);
    }
    return GROUP_ORDER.filter((g) => (map.get(g) ?? []).length > 0).map(
      (g) => ({ group: g as string, items: map.get(g) ?? [] }),
    );
  }, [issues]);

  const visibleGroups =
    chip === "ALL" ? grouped : grouped.filter((g) => g.group === chip);

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 650, margin: "0 0 16px" }}>
        {t("title")}
      </h1>

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

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : issues.length === 0 && !loadError ? (
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
          {t("empty")}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setChip("ALL")}
              style={{
                ...(chip === "ALL" ? primaryBtn : smallGhostBtn),
                borderRadius: 999,
                padding: "6px 13px",
              }}
            >
              {t("all")} · {issues.length}
            </button>
            {grouped.map(({ group, items }) => (
              <button
                key={group}
                onClick={() => setChip(group)}
                style={{
                  ...(chip === group ? primaryBtn : smallGhostBtn),
                  borderRadius: 999,
                  padding: "6px 13px",
                }}
              >
                {ti(`status.${group}`)} · {items.length}
              </button>
            ))}
          </div>

          {visibleGroups.map(({ group, items }) => (
            <section key={group} style={{ marginBottom: 26 }}>
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#9ba0aa",
                  margin: "0 0 10px",
                }}
              >
                {ti(`status.${group}`)} · {items.length}
              </h2>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {items.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: "#0f1011",
                      border: "1px solid #1e2025",
                      borderRadius: 10,
                      padding: "10px 14px",
                      textDecoration: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        color: "#93a0f5",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {issue.key}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: "#e6e7e9",
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {issue.title}
                    </span>
                    {(issue.workspace?.name || issue.team?.name) && (
                      <span
                        style={{
                          color: "#6f747e",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {issue.workspace?.name ?? issue.team?.name}
                      </span>
                    )}
                    <PriorityLabel priority={issue.priority} />
                    <StatusBadge status={String(issue.status)} />
                    <span
                      style={{
                        color: "#6f747e",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        minWidth: 86,
                        textAlign: "right",
                      }}
                    >
                      {formatDate(issue.dueDate, locale)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

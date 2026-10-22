"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  addIssueToCycle,
  closeCycle,
  fetchCycle,
  fetchIssues,
  removeIssueFromCycle,
  type Cycle,
  type Issue,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  ErrorBox,
  NoticeBox,
  PriorityLabel,
  ProgressBar,
  StatusBadge,
  formatDate,
  inputStyle,
  labelStyle,
  primaryBtn,
  smallGhostBtn,
  useFriendlyError,
} from "./ui";

export default function CycleDetailClient({ cycleId }: { cycleId: string }) {
  const t = useTranslations("Cycles");
  const ti = useTranslations("Issues");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [candidates, setCandidates] = useState<Issue[]>([]);
  const [addId, setAddId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCycle(await fetchCycle(cycleId));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [cycleId, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  // Issue ứng viên: cùng team, chưa thuộc cycle nào.
  useEffect(() => {
    if (!workspaceId || !cycle) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchIssues(workspaceId, { teamId: cycle.teamId });
        if (!cancelled) {
          setCandidates(all.filter((i) => !i.cycleId && i.id));
        }
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, cycle]);

  const progress = useMemo(() => {
    if (!cycle) return null;
    if (cycle.progress) return cycle.progress;
    const list = cycle.issues ?? [];
    const done = list.filter(
      (i) => i.status === "DONE" || i.statusGroup === "DONE",
    ).length;
    return {
      totalIssues: list.length,
      doneIssues: done,
      progressPercent: list.length ? (done / list.length) * 100 : 0,
    };
  }, [cycle]);

  async function onAdd() {
    if (!addId) return;
    setBusy(true);
    setActionError(null);
    try {
      await addIssueToCycle(cycleId, addId);
      setAddId("");
      setNotice(t("issueAdded"));
      await load();
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(issue: Issue) {
    setBusy(true);
    setActionError(null);
    try {
      await removeIssueFromCycle(cycleId, issue.id);
      setNotice(t("issueRemoved", { key: issue.key }));
      await load();
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    if (!window.confirm(t("closeConfirm"))) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await closeCycle(cycleId);
      const rolled = res.rolledIssueIds?.length ?? 0;
      setNotice(
        res.nextCycleId
          ? t("closedWithNext", { count: rolled })
          : t("closedNoNext", { count: rolled }),
      );
      await load();
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>;
  if (loadError || !cycle) {
    return (
      <div>
        <ErrorBox>{loadError ?? tc("genericError")}</ErrorBox>
        <Link href="/cycles" style={{ color: "#93a0f5", fontSize: 14 }}>
          ← {t("backToList")}
        </Link>
      </div>
    );
  }

  const issues = cycle.issues ?? [];

  return (
    <div>
      <Link
        href="/cycles"
        style={{
          color: "#9ba0aa",
          fontSize: 13,
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 14,
        }}
      >
        ← {t("backToList")}
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 650, margin: "0 0 6px" }}>
        {cycle.name ?? ti("cycleUnnamed")}
        {cycle.closedAt && (
          <span
            style={{
              color: "#ff9d9d",
              fontSize: 13,
              fontWeight: 700,
              marginLeft: 10,
            }}
          >
            {t("closedBadge")}
          </span>
        )}
      </h1>
      <p style={{ color: "#9ba0aa", margin: "0 0 18px", fontSize: 14 }}>
        {formatDate(cycle.startsAt, locale)} →{" "}
        {formatDate(cycle.endsAt, locale)}
      </p>

      {progress && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
            maxWidth: 520,
          }}
        >
          <div style={{ flex: 1 }}>
            <ProgressBar percent={progress.progressPercent} />
          </div>
          <span style={{ color: "#9ba0aa", fontSize: 12 }}>
            {t("progressText", {
              done: progress.doneIssues,
              total: progress.totalIssues,
              percent: Math.round(progress.progressPercent),
            })}
          </span>
        </div>
      )}

      {notice && <NoticeBox>{notice}</NoticeBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      <h2 style={{ fontSize: 17, fontWeight: 650, margin: "0 0 12px" }}>
        {t("issuesInCycle")} ({issues.length})
      </h2>
      {issues.length === 0 ? (
        <p style={{ color: "#6f747e", fontSize: 13 }}>{t("noIssues")}</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {issues.map((issue) => (
            <div
              key={issue.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid #1e2025",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#0f1011",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/issues/${issue.id}`}
                style={{
                  color: "#93a0f5",
                  fontWeight: 600,
                  fontSize: 13,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {issue.key}
              </Link>
              <span style={{ fontSize: 14, color: "#e6e7e9" }}>
                {issue.title}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                <PriorityLabel priority={issue.priority} />
                <StatusBadge status={issue.status} />
                <button
                  style={{ ...smallGhostBtn, padding: "4px 9px", fontSize: 12 }}
                  disabled={busy}
                  onClick={() => void onRemove(issue)}
                >
                  {t("removeIssue")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!cycle.closedAt && (
        <div
          style={{
            border: "1px solid #1e2025",
            borderRadius: 10,
            padding: 16,
            background: "#0f1011",
            marginBottom: 20,
          }}
        >
          <label style={labelStyle} htmlFor="cy-add-issue">
            {t("addIssueLabel")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              id="cy-add-issue"
              style={{ ...inputStyle, flex: 1 }}
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
            >
              <option value="">{t("addIssuePlaceholder")}</option>
              {candidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.key} — {i.title}
                </option>
              ))}
            </select>
            <button
              style={primaryBtn}
              disabled={busy || !addId}
              onClick={() => void onAdd()}
            >
              {t("addIssue")}
            </button>
          </div>
        </div>
      )}

      {!cycle.closedAt && (
        <button
          style={{
            background: "transparent",
            border: "1px solid rgba(224, 172, 52, 0.5)",
            borderRadius: 8,
            color: "#eac35c",
            padding: "9px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
          disabled={busy}
          onClick={() => void onClose()}
        >
          {t("closeButton")}
        </button>
      )}
    </div>
  );
}

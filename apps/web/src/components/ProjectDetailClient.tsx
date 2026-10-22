"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  addIssueToProject,
  fetchIssues,
  fetchProject,
  removeIssueFromProject,
  updateProject,
  type Issue,
  type Project,
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
  toDateInput,
  useFriendlyError,
} from "./ui";

export default function ProjectDetailClient({
  projectId,
}: {
  projectId: string;
}) {
  const t = useTranslations("Projects");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const [candidates, setCandidates] = useState<Issue[]>([]);
  const [addId, setAddId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await fetchProject(projectId);
      setProject(p);
      setName(p.name);
      setDescription(p.description ?? "");
      setTargetDate(toDateInput(p.targetDate));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchIssues(workspaceId, {});
        if (!cancelled) {
          setCandidates(
            all.filter((i) => i.projectId !== projectId),
          );
        }
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId, project]);

  const progress = useMemo(() => {
    if (!project) return null;
    if (project.progress) return project.progress;
    const list = project.issues ?? [];
    const done = list.filter(
      (i) => i.status === "DONE" || i.statusGroup === "DONE",
    ).length;
    return {
      totalIssues: list.length,
      doneIssues: done,
      progressPercent: list.length ? (done / list.length) * 100 : 0,
    };
  }, [project]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      const updated = await updateProject(projectId, {
        name: name.trim(),
        description: description.trim(),
        targetDate: targetDate
          ? new Date(`${targetDate}T00:00:00`).toISOString()
          : null,
      });
      setProject((prev) => (prev ? { ...prev, ...updated } : updated));
      setNotice(t("saved"));
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAdd() {
    if (!addId) return;
    setBusy(true);
    setActionError(null);
    try {
      await addIssueToProject(projectId, addId);
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
      await removeIssueFromProject(projectId, issue.id);
      setNotice(t("issueRemoved", { key: issue.key }));
      await load();
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>;
  if (loadError || !project) {
    return (
      <div>
        <ErrorBox>{loadError ?? tc("genericError")}</ErrorBox>
        <Link href="/projects" style={{ color: "#93a0f5", fontSize: 14 }}>
          ← {t("backToList")}
        </Link>
      </div>
    );
  }

  const issues = project.issues ?? [];

  return (
    <div>
      <Link
        href="/projects"
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

      <h1 style={{ fontSize: 24, fontWeight: 650, margin: "0 0 14px" }}>
        {project.name}
      </h1>

      {notice && <NoticeBox>{notice}</NoticeBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

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

      <form
        onSubmit={onSave}
        style={{
          border: "1px solid #1e2025",
          borderRadius: 10,
          padding: 16,
          background: "#0f1011",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t("editTitle")}</div>
        <div>
          <label style={labelStyle} htmlFor="pj-name">
            {t("fieldName")}
          </label>
          <input
            id="pj-name"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="pj-desc">
            {t("fieldDescription")}
          </label>
          <textarea
            id="pj-desc"
            style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="pj-target">
            {t("fieldTargetDate")}
          </label>
          <input
            id="pj-target"
            type="date"
            style={inputStyle}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div>
          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? tc("processing") : t("save")}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: 17, fontWeight: 650, margin: "0 0 12px" }}>
        {t("issuesInProject")} ({issues.length})
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
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
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

      <div
        style={{
          border: "1px solid #1e2025",
          borderRadius: 10,
          padding: 16,
          background: "#0f1011",
        }}
      >
        <label style={labelStyle} htmlFor="pj-add-issue">
          {t("addIssueLabel")}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            id="pj-add-issue"
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
        <p style={{ color: "#6f747e", fontSize: 12, marginTop: 14 }}>
          {t("targetDateHint", {
            date: project.targetDate
              ? formatDate(project.targetDate, locale)
              : "—",
          })}
        </p>
      </div>
    </div>
  );
}

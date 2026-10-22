"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  addComment,
  deleteIssue,
  fetchComments,
  fetchCycles,
  fetchIssue,
  fetchProjects,
  updateIssue,
  type Cycle,
  type Issue,
  type IssueComment,
  type Project,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  ALL_STATUSES,
  ErrorBox,
  NoticeBox,
  PRIORITIES,
  StatusBadge,
  dangerBtn,
  formatDate,
  ghostBtn,
  inputStyle,
  labelStyle,
  primaryBtn,
  shortId,
  smallGhostBtn,
  toDateInput,
  useFriendlyError,
} from "./ui";

export default function IssueDetailClient({ issueId }: { issueId: string }) {
  const t = useTranslations("IssueDetail");
  const ti = useTranslations("Issues");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const friendly = useFriendlyError();
  const { currentWorkspace, user } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [labelsText, setLabelsText] = useState("");
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const syncForm = useCallback((iss: Issue) => {
    setTitle(iss.title);
    setDescription(iss.description ?? "");
    setAssigneeId(iss.assigneeId ?? "");
    setLabelsText((iss.labels ?? []).join(", "));
    setEstimate(
      iss.estimate === null || iss.estimate === undefined
        ? ""
        : String(iss.estimate),
    );
    setDueDate(toDateInput(iss.dueDate));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const iss = await fetchIssue(issueId);
      setIssue(iss);
      syncForm(iss);
      try {
        setComments(await fetchComments(issueId));
      } catch {
        setComments([]);
      }
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [issueId, friendly, syncForm]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchCycles(
          workspaceId,
          issue?.teamId || undefined,
        );
        if (!cancelled) setCycles(list);
      } catch {
        /* select cycle sẽ trống */
      }
      try {
        const list = await fetchProjects(workspaceId);
        if (!cancelled) setProjects(list);
      } catch {
        /* bỏ qua */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, issue?.teamId]);

  async function patch(patchBody: Parameters<typeof updateIssue>[1]) {
    if (!issue) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateIssue(issue.id, patchBody);
      setIssue(updated);
      syncForm(updated);
      setNotice(t("saved"));
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveMain(e: FormEvent) {
    e.preventDefault();
    const est = estimate.trim();
    await patch({
      title: title.trim(),
      description: description.trim(),
      assigneeId: assigneeId.trim() ? assigneeId.trim() : null,
      labels: labelsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      estimate: est === "" ? null : Number(est),
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
    });
  }

  async function onDelete() {
    if (!issue) return;
    if (!window.confirm(t("deleteConfirm", { key: issue.key }))) return;
    setSaving(true);
    try {
      await deleteIssue(issue.id);
      router.push("/issues");
    } catch (err) {
      setActionError(friendly(err));
      setSaving(false);
    }
  }

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const c = await addComment(issueId, commentText.trim());
      setComments((prev) => [...prev, c]);
      setCommentText("");
    } catch (err) {
      setCommentError(friendly(err));
    } finally {
      setCommentBusy(false);
    }
  }

  function formatDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  }

  if (loading) {
    return <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>;
  }
  if (loadError || !issue) {
    return (
      <div>
        <ErrorBox>{loadError ?? tc("genericError")}</ErrorBox>
        <Link href="/issues" style={{ color: "#93a0f5", fontSize: 14 }}>
          ← {t("backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/issues"
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <span style={{ color: "#93a0f5", fontWeight: 700, fontSize: 18 }}>
          {issue.key}
        </span>
        <StatusBadge status={issue.status} />
        <span style={{ color: "#6f747e", fontSize: 12, marginLeft: "auto" }}>
          {t("updatedAt", { time: formatDateTime(issue.updatedAt ?? "") })}
        </span>
      </div>

      {notice && <NoticeBox>{notice}</NoticeBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 260px",
          gap: 24,
          alignItems: "start",
          marginTop: 12,
        }}
      >
        <div>
          <form
            onSubmit={onSaveMain}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div>
              <label style={labelStyle} htmlFor="iss-title">
                {ti("fieldTitle")}
              </label>
              <input
                id="iss-title"
                style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="iss-desc">
                {ti("fieldDescription")}
              </label>
              <textarea
                id="iss-desc"
                style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle} htmlFor="iss-assignee">
                  {t("fieldAssignee")}
                </label>
                <input
                  id="iss-assignee"
                  style={inputStyle}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  placeholder={t("assigneePlaceholder")}
                />
                {user && assigneeId !== user.id && (
                  <button
                    type="button"
                    style={{
                      ...smallGhostBtn,
                      marginTop: 6,
                      padding: "4px 9px",
                      fontSize: 12,
                    }}
                    onClick={() => setAssigneeId(user.id)}
                  >
                    {t("assignToMe")}
                  </button>
                )}
              </div>
              <div>
                <label style={labelStyle} htmlFor="iss-labels">
                  {t("fieldLabels")}
                </label>
                <input
                  id="iss-labels"
                  style={inputStyle}
                  value={labelsText}
                  onChange={(e) => setLabelsText(e.target.value)}
                  placeholder={t("labelsPlaceholder")}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="iss-estimate">
                  {t("fieldEstimate")}
                </label>
                <input
                  id="iss-estimate"
                  type="number"
                  min={0}
                  step="0.5"
                  style={inputStyle}
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="iss-due">
                  {t("fieldDueDate")}
                </label>
                <input
                  id="iss-due"
                  type="date"
                  style={inputStyle}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <button type="submit" disabled={saving} style={primaryBtn}>
                {saving ? tc("processing") : t("save")}
              </button>
            </div>
          </form>

          {/* Bình luận */}
          <div style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 17, fontWeight: 650, margin: "0 0 14px" }}>
              {t("commentsTitle")} ({comments.length})
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {comments.length === 0 ? (
                <p style={{ color: "#6f747e", fontSize: 13, margin: 0 }}>
                  {t("commentsEmpty")}
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #1e2025",
                      borderRadius: 10,
                      padding: "12px 14px",
                      background: "#0f1011",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        fontSize: 12,
                        color: "#6f747e",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: "#c6c9cf", fontWeight: 600 }}>
                        {c.authorName ?? c.authorEmail ?? shortId(c.authorId)}
                      </span>
                      <span>{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: "#e6e7e9",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {c.content}
                    </p>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={onComment}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {commentError && (
                <div role="alert" style={{ color: "#ff9d9d", fontSize: 13 }}>
                  {commentError}
                </div>
              )}
              <textarea
                style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t("commentPlaceholder")}
                required
              />
              <div>
                <button
                  type="submit"
                  disabled={commentBusy}
                  style={primaryBtn}
                >
                  {commentBusy ? tc("processing") : t("commentSubmit")}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Cột thuộc tính */}
        <div
          style={{
            border: "1px solid #1e2025",
            borderRadius: 10,
            padding: 16,
            background: "#0f1011",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <label style={labelStyle} htmlFor="iss-status">
              {t("fieldStatus")}
            </label>
            <select
              id="iss-status"
              style={{ ...inputStyle }}
              value={issue.status}
              disabled={saving}
              onChange={(e) => void patch({ status: e.target.value })}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ti(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="iss-priority">
              {t("fieldPriority")}
            </label>
            <select
              id="iss-priority"
              style={{ ...inputStyle }}
              value={issue.priority ?? "NONE"}
              disabled={saving}
              onChange={(e) => void patch({ priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ti(`priority.${p}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="iss-cycle">
              {t("fieldCycle")}
            </label>
            <select
              id="iss-cycle"
              style={{ ...inputStyle }}
              value={issue.cycleId ?? ""}
              disabled={saving}
              onChange={(e) =>
                void patch({ cycleId: e.target.value || null })
              }
            >
              <option value="">{ti("none")}</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? ti("cycleUnnamed")} ·{" "}
                  {formatDate(c.startsAt, locale)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="iss-project">
              {t("fieldProject")}
            </label>
            <select
              id="iss-project"
              style={{ ...inputStyle }}
              value={issue.projectId ?? ""}
              disabled={saving}
              onChange={(e) =>
                void patch({ projectId: e.target.value || null })
              }
            >
              <option value="">{ti("none")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              borderTop: "1px solid #1e2025",
              paddingTop: 14,
              fontSize: 12,
              color: "#6f747e",
              lineHeight: 1.7,
            }}
          >
            <div>
              {t("createdAt")}: {formatDate(issue.createdAt, locale)}
            </div>
            <div>
              {t("creator")}: {shortId(issue.creatorId)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={saving}
            style={dangerBtn}
          >
            {t("delete")}
          </button>
          <button
            type="button"
            onClick={() => router.push("/issues")}
            style={ghostBtn}
          >
            {t("backToList")}
          </button>
        </div>
      </div>
    </div>
  );
}


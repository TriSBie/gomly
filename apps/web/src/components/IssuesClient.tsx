"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  createIssue,
  fetchCycles,
  fetchIssues,
  fetchProjects,
  updateIssue,
  type Cycle,
  type Issue,
  type Project,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  ALL_STATUSES,
  ErrorBox,
  NoticeBox,
  PRIORITIES,
  PriorityLabel,
  STATUS_GROUPS,
  StatusBadge,
  formatDate,
  ghostBtn,
  inputStyle,
  issueGroup,
  labelStyle,
  primaryBtn,
  selectStyle,
  shortId,
  smallGhostBtn,
  useFriendlyError,
} from "./ui";

type ViewMode = "list" | "board";

export default function IssuesClient() {
  const t = useTranslations("Issues");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const friendly = useFriendlyError();
  const { currentWorkspace, teams } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  // Bộ lọc
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  // Dữ liệu phụ cho form tạo issue
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Form tạo issue
  const [showCreate, setShowCreate] = useState(false);
  const [cTeam, setCTeam] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cPriority, setCPriority] = useState("NONE");
  const [cCycle, setCCycle] = useState("");
  const [cProject, setCProject] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  // Kéo-thả board
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  useEffect(() => {
    if (teams.length > 0 && !teams.some((tm) => tm.id === cTeam)) {
      setCTeam(teams[0].id);
    }
  }, [teams, cTeam]);

  // Command Palette (Cmd+K → "Tạo issue mới"): mở form khi điều hướng tới
  // /issues?new=1, hoặc khi event được bắn trong lúc đang ở sẵn trang này.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("new") === "1"
    ) {
      setShowCreate(true);
    }
    const openCreate = () => setShowCreate(true);
    window.addEventListener("gomly:new-issue", openCreate);
    return () => window.removeEventListener("gomly:new-issue", openCreate);
  }, []);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setIssues(
        await fetchIssues(workspaceId, {
          teamId: teamFilter || undefined,
          status: statusFilter || undefined,
          q: query || undefined,
        }),
      );
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, teamFilter, statusFilter, query, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  // Nạp cycles/projects cho select trong form tạo (không chặn danh sách nếu lỗi).
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchCycles(workspaceId);
        if (!cancelled) setCycles(list);
      } catch {
        /* bỏ qua — form vẫn tạo issue không cần cycle */
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
  }, [workspaceId]);

  const cyclesForCreateTeam = useMemo(
    () => cycles.filter((c) => !cTeam || c.teamId === cTeam),
    [cycles, cTeam],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    const teamId = cTeam || teams[0]?.id;
    if (!teamId) {
      setCError(t("noTeam"));
      return;
    }
    setCBusy(true);
    setCError(null);
    try {
      const issue = await createIssue(workspaceId, {
        teamId,
        title: cTitle.trim(),
        description: cDesc.trim() || undefined,
        priority: cPriority,
        cycleId: cCycle || undefined,
        projectId: cProject || undefined,
      });
      setCTitle("");
      setCDesc("");
      setShowCreate(false);
      setNotice(t("created", { key: issue.key, title: issue.title }));
      await load();
    } catch (err) {
      setCError(friendly(err));
    } finally {
      setCBusy(false);
    }
  }

  async function changeStatus(issue: Issue, status: string) {
    if (issue.status === status) return;
    setPatchingId(issue.id);
    setActionError(null);
    try {
      const updated = await updateIssue(issue.id, { status });
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? { ...i, ...updated } : i)),
      );
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setPatchingId(null);
    }
  }

  function onDrop(e: DragEvent, group: string) {
    e.preventDefault();
    setDropGroup(null);
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    const issue = issues.find((i) => i.id === id);
    if (issue) void changeStatus(issue, group);
  }

  const boardGroups = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const g of STATUS_GROUPS) map.set(g, []);
    for (const issue of issues) {
      const g = issueGroup(issue);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(issue);
    }
    return map;
  }, [issues]);

  const viewBtn = (active: boolean): React.CSSProperties => ({
    ...smallGhostBtn,
    background: active ? "#1b1d24" : "transparent",
    color: active ? "#f2f3f5" : "#c6c9cf",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 650, margin: "0 0 6px" }}>
            {t("title")}
          </h1>
          <p style={{ color: "#9ba0aa", margin: "0 0 24px" }}>
            {t("subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              display: "flex",
              border: "1px solid #26282e",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <button style={viewBtn(view === "list")} onClick={() => setView("list")}>
              {t("viewList")}
            </button>
            <button
              style={viewBtn(view === "board")}
              onClick={() => setView("board")}
            >
              {t("viewBoard")}
            </button>
          </div>
          <button style={primaryBtn} onClick={() => setShowCreate((v) => !v)}>
            {t("createButton")}
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={onCreate}
          style={{
            border: "1px solid #1e2025",
            borderRadius: 10,
            padding: 18,
            background: "#0f1011",
            marginBottom: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t("createTitle")}</div>
          {cError && (
            <div role="alert" style={{ color: "#ff9d9d", fontSize: 13 }}>
              {cError}
            </div>
          )}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <label style={labelStyle} htmlFor="ci-team">
                {t("fieldTeam")}
              </label>
              <select
                id="ci-team"
                style={{ ...inputStyle }}
                value={cTeam}
                onChange={(e) => setCTeam(e.target.value)}
              >
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name} ({tm.key})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="ci-priority">
                {t("fieldPriority")}
              </label>
              <select
                id="ci-priority"
                style={{ ...inputStyle }}
                value={cPriority}
                onChange={(e) => setCPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle} htmlFor="ci-title">
              {t("fieldTitle")}
            </label>
            <input
              id="ci-title"
              style={inputStyle}
              value={cTitle}
              onChange={(e) => setCTitle(e.target.value)}
              placeholder={t("fieldTitlePlaceholder")}
              required
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="ci-desc">
              {t("fieldDescription")}
            </label>
            <textarea
              id="ci-desc"
              style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
            />
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <label style={labelStyle} htmlFor="ci-cycle">
                {t("fieldCycle")}
              </label>
              <select
                id="ci-cycle"
                style={{ ...inputStyle }}
                value={cCycle}
                onChange={(e) => setCCycle(e.target.value)}
              >
                <option value="">{t("none")}</option>
                {cyclesForCreateTeam.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? t("cycleUnnamed")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="ci-project">
                {t("fieldProject")}
              </label>
              <select
                id="ci-project"
                style={{ ...inputStyle }}
                value={cProject}
                onChange={(e) => setCProject(e.target.value)}
              >
                <option value="">{t("none")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={cBusy} style={primaryBtn}>
              {cBusy ? tc("processing") : t("createSubmit")}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              style={ghostBtn}
            >
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Bộ lọc */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="search"
          aria-label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, width: 240 }}
        />
        <select
          aria-label={t("filterTeam")}
          style={selectStyle}
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">{t("allTeams")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name} ({tm.key})
            </option>
          ))}
        </select>
        <select
          aria-label={t("filterStatus")}
          style={selectStyle}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t("allStatuses")}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {notice && <NoticeBox>{notice}</NoticeBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : loadError ? (
        <div
          style={{
            border: "1px solid rgba(224, 82, 82, 0.4)",
            borderRadius: 10,
            padding: 20,
            background: "#0c0d0f",
          }}
        >
          <p style={{ margin: "0 0 12px", color: "#ff9d9d" }}>{loadError}</p>
          <button onClick={() => void load()} style={smallGhostBtn}>
            {tc("retry")}
          </button>
        </div>
      ) : issues.length === 0 ? (
        <div
          style={{
            border: "1px dashed #2a2d33",
            borderRadius: 10,
            padding: 28,
            color: "#9ba0aa",
            background: "#0c0d0f",
            lineHeight: 1.6,
          }}
        >
          {t("empty")}
        </div>
      ) : view === "list" ? (
        <div
          style={{
            border: "1px solid #1e2025",
            borderRadius: 10,
            overflow: "hidden",
            background: "#0f1011",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "#6f747e",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "10px 14px" }}>{t("colKey")}</th>
                <th style={{ padding: "10px 14px" }}>{t("colTitle")}</th>
                <th style={{ padding: "10px 14px" }}>{t("colStatus")}</th>
                <th style={{ padding: "10px 14px" }}>{t("colPriority")}</th>
                <th style={{ padding: "10px 14px" }}>{t("colAssignee")}</th>
                <th style={{ padding: "10px 14px" }}>{t("colDue")}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.id}
                  onClick={() => router.push(`/issues/${issue.id}`)}
                  style={{
                    borderTop: "1px solid #1e2025",
                    cursor: "pointer",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      color: "#93a0f5",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {issue.key}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#e6e7e9" }}>
                    {issue.title}
                    {(issue.labels ?? []).length > 0 && (
                      <span style={{ color: "#6f747e", fontSize: 12 }}>
                        {" "}
                        · {(issue.labels ?? []).join(", ")}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <StatusBadge status={issue.status} />
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <PriorityLabel priority={issue.priority} />
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      color: "#9ba0aa",
                      fontSize: 13,
                    }}
                  >
                    {shortId(issue.assigneeId)}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      color: "#9ba0aa",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(issue.dueDate, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(180px, 1fr))",
            gap: 12,
            overflowX: "auto",
            alignItems: "start",
            paddingBottom: 8,
          }}
        >
          {STATUS_GROUPS.map((group) => (
            <div
              key={group}
              onDragOver={(e) => {
                e.preventDefault();
                setDropGroup(group);
              }}
              onDragLeave={() => setDropGroup((g) => (g === group ? null : g))}
              onDrop={(e) => onDrop(e, group)}
              style={{
                background: dropGroup === group ? "#12131a" : "#0c0d0f",
                border: `1px solid ${dropGroup === group ? "#5e6ad2" : "#1e2025"}`,
                borderRadius: 10,
                padding: 10,
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 2,
                }}
              >
                <StatusBadge status={group} />
                <span style={{ color: "#6f747e", fontSize: 12 }}>
                  {boardGroups.get(group)?.length ?? 0}
                </span>
              </div>
              {(boardGroups.get(group) ?? []).map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(issue.id);
                    e.dataTransfer.setData("text/plain", issue.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragId(null)}
                  style={{
                    border: "1px solid #26282e",
                    borderRadius: 8,
                    background: "#101114",
                    padding: "9px 10px",
                    cursor: "grab",
                    opacity: patchingId === issue.id ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Link
                      href={`/issues/${issue.id}`}
                      style={{
                        color: "#93a0f5",
                        fontWeight: 600,
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      {issue.key}
                    </Link>
                    <PriorityLabel priority={issue.priority} />
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#e6e7e9",
                      lineHeight: 1.45,
                      marginBottom: 8,
                    }}
                  >
                    {issue.title}
                  </div>
                  <select
                    aria-label={t("moveTo")}
                    value={issue.status}
                    disabled={patchingId === issue.id}
                    onChange={(e) =>
                      void changeStatus(issue, e.target.value)
                    }
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      ...selectStyle,
                      width: "100%",
                      fontSize: 12,
                      padding: "4px 6px",
                    }}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

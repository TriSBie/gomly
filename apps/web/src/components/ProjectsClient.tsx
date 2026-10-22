"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createProject, fetchProjects, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  ErrorBox,
  NoticeBox,
  ProgressBar,
  formatDate,
  ghostBtn,
  inputStyle,
  labelStyle,
  primaryBtn,
  useFriendlyError,
} from "./ui";

export default function ProjectsClient() {
  const t = useTranslations("Projects");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cTarget, setCTarget] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setProjects(await fetchProjects(workspaceId));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setCBusy(true);
    setCError(null);
    try {
      await createProject(workspaceId, {
        name: cName.trim(),
        description: cDesc.trim() || undefined,
        targetDate: cTarget
          ? new Date(`${cTarget}T00:00:00`).toISOString()
          : undefined,
      });
      setCName("");
      setCDesc("");
      setCTarget("");
      setShowCreate(false);
      setNotice(t("created"));
      await load();
    } catch (err) {
      setCError(friendly(err));
    } finally {
      setCBusy(false);
    }
  }

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
        <button style={primaryBtn} onClick={() => setShowCreate((v) => !v)}>
          {t("createButton")}
        </button>
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
          <div>
            <label style={labelStyle} htmlFor="pj-name">
              {t("fieldName")}
            </label>
            <input
              id="pj-name"
              style={inputStyle}
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder={t("fieldNamePlaceholder")}
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
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
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
              value={cTarget}
              onChange={(e) => setCTarget(e.target.value)}
            />
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

      {notice && <NoticeBox>{notice}</NoticeBox>}

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : loadError ? (
        <ErrorBox>{loadError}</ErrorBox>
      ) : projects.length === 0 ? (
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
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {projects.map((project) => {
            const p = project.progress;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  border: "1px solid #1e2025",
                  borderRadius: 10,
                  padding: 16,
                  background: "#0f1011",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: "#e6e7e9",
                    marginBottom: 6,
                  }}
                >
                  {project.name}
                </div>
                {project.description && (
                  <p
                    style={{
                      color: "#9ba0aa",
                      fontSize: 13,
                      lineHeight: 1.55,
                      margin: "0 0 10px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {project.description}
                  </p>
                )}
                {project.targetDate && (
                  <div
                    style={{ color: "#6f747e", fontSize: 12, marginBottom: 10 }}
                  >
                    {t("targetDate", {
                      date: formatDate(project.targetDate, locale),
                    })}
                  </div>
                )}
                {p ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ flex: 1 }}>
                      <ProgressBar percent={p.progressPercent} />
                    </div>
                    <span style={{ color: "#9ba0aa", fontSize: 12 }}>
                      {Math.round(p.progressPercent)}% · {p.doneIssues}/
                      {p.totalIssues}
                    </span>
                  </div>
                ) : (
                  <span style={{ color: "#6f747e", fontSize: 12 }}>
                    {t("noProgress")}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

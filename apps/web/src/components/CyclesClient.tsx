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
import { createCycle, fetchCycles, type Cycle } from "@/lib/api";
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
  selectStyle,
  useFriendlyError,
} from "./ui";

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  const fmt = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };
  return { start: fmt(start), end: fmt(end) };
}

export default function CyclesClient() {
  const t = useTranslations("Cycles");
  const ti = useTranslations("Issues");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();
  const { currentWorkspace, teams } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [teamFilter, setTeamFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [cTeam, setCTeam] = useState("");
  const [cName, setCName] = useState("");
  const [range, setRange] = useState(defaultRange);
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  useEffect(() => {
    if (teams.length > 0 && !teams.some((tm) => tm.id === cTeam)) {
      setCTeam(teams[0].id);
    }
  }, [teams, cTeam]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setCycles(await fetchCycles(workspaceId, teamFilter || undefined));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, teamFilter, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamName = useCallback(
    (teamId: string): string => {
      const tm = teams.find((x) => x.id === teamId);
      return tm ? `${tm.name} (${tm.key})` : teamId.slice(0, 8);
    },
    [teams],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    const teamId = cTeam || teams[0]?.id;
    if (!teamId) {
      setCError(ti("noTeam"));
      return;
    }
    setCBusy(true);
    setCError(null);
    try {
      await createCycle(workspaceId, {
        teamId,
        name: cName.trim() || undefined,
        startsAt: new Date(`${range.start}T00:00:00`).toISOString(),
        endsAt: new Date(`${range.end}T23:59:59`).toISOString(),
      });
      setCName("");
      setShowCreate(false);
      setNotice(t("created"));
      await load();
    } catch (err) {
      setCError(friendly(err));
    } finally {
      setCBusy(false);
    }
  }

  const sorted = useMemo(
    () =>
      [...cycles].sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      ),
    [cycles],
  );

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
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <label style={labelStyle} htmlFor="cy-team">
                {ti("fieldTeam")}
              </label>
              <select
                id="cy-team"
                style={inputStyle}
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
              <label style={labelStyle} htmlFor="cy-name">
                {t("fieldName")}
              </label>
              <input
                id="cy-name"
                style={inputStyle}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder={t("fieldNamePlaceholder")}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="cy-start">
                {t("fieldStartsAt")}
              </label>
              <input
                id="cy-start"
                type="date"
                style={inputStyle}
                value={range.start}
                onChange={(e) =>
                  setRange((r) => ({ ...r, start: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="cy-end">
                {t("fieldEndsAt")}
              </label>
              <input
                id="cy-end"
                type="date"
                style={inputStyle}
                value={range.end}
                onChange={(e) =>
                  setRange((r) => ({ ...r, end: e.target.value }))
                }
                required
              />
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

      <div style={{ marginBottom: 16 }}>
        <select
          aria-label={ti("filterTeam")}
          style={selectStyle}
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">{ti("allTeams")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name} ({tm.key})
            </option>
          ))}
        </select>
      </div>

      {notice && <NoticeBox>{notice}</NoticeBox>}

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : loadError ? (
        <ErrorBox>{loadError}</ErrorBox>
      ) : sorted.length === 0 ? (
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
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map((cycle) => {
            const p = cycle.progress;
            return (
              <Link
                key={cycle.id}
                href={`/cycles/${cycle.id}`}
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
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{ fontWeight: 600, fontSize: 15, color: "#e6e7e9" }}
                  >
                    {cycle.name ?? ti("cycleUnnamed")}
                  </span>
                  <span style={{ color: "#6f747e", fontSize: 12 }}>
                    {teamName(cycle.teamId)}
                  </span>
                  {cycle.closedAt && (
                    <span
                      style={{
                        color: "#ff9d9d",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {t("closedBadge")}
                    </span>
                  )}
                  <span
                    style={{
                      color: "#6f747e",
                      fontSize: 12,
                      marginLeft: "auto",
                    }}
                  >
                    {formatDate(cycle.startsAt, locale)} →{" "}
                    {formatDate(cycle.endsAt, locale)}
                  </span>
                </div>
                {p ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <ProgressBar percent={p.progressPercent} />
                    </div>
                    <span style={{ color: "#9ba0aa", fontSize: 12 }}>
                      {t("progressText", {
                        done: p.doneIssues,
                        total: p.totalIssues,
                        percent: Math.round(p.progressPercent),
                      })}
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

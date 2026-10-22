"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ApiError,
  acceptIntake,
  createCaptureLink,
  dismissIntake,
  fetchCaptureLinks,
  fetchIntakeEmail,
  fetchTriage,
  simulateIntake,
  type CaptureLink,
  type Channel,
  type IntakeItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const CHANNELS: Channel[] = ["ZALO", "SLACK", "EMAIL", "GITHUB"];

const CHANNEL_STYLE: Record<string, { bg: string; fg: string }> = {
  ZALO: { bg: "rgba(0, 104, 255, 0.16)", fg: "#6cb2ff" },
  SLACK: { bg: "rgba(155, 63, 151, 0.18)", fg: "#e08adb" },
  EMAIL: { bg: "rgba(224, 172, 52, 0.14)", fg: "#eac35c" },
  GITHUB: { bg: "rgba(230, 231, 233, 0.12)", fg: "#d7d9dd" },
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0c0d0f",
  border: "1px solid #26282e",
  borderRadius: 8,
  color: "#e6e7e9",
  padding: "9px 11px",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#9ba0aa",
  marginBottom: 6,
};

function ChannelBadge({ channel }: { channel: string }) {
  const t = useTranslations("Triage");
  const s = CHANNEL_STYLE[channel] ?? CHANNEL_STYLE.GITHUB;
  const known = (CHANNELS as readonly string[]).includes(channel);
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        borderRadius: 5,
        padding: "2px 7px",
      }}
    >
      {known ? t(`channel.${channel}`) : channel}
    </span>
  );
}

export default function TriageClient() {
  const t = useTranslations("Triage");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const { currentWorkspace, teams } = useAuth();

  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string>("");

  // Form "Tạo yêu cầu mẫu" (demo khi chưa có kênh thật)
  const [showSimulate, setShowSimulate] = useState(false);
  const [simChannel, setSimChannel] = useState<Channel>("ZALO");
  const [simSender, setSimSender] = useState("");
  const [simTitle, setSimTitle] = useState("");
  const [simContent, setSimContent] = useState("");
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const workspaceId = currentWorkspace?.id;

  // Địa chỉ email nhận việc của workspace (intake qua email — Agent F)
  const [intakeEmail, setIntakeEmail] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  // Link gửi việc nhanh công khai (Wave 3 — ghim vào nhóm Zalo)
  const [captureLinks, setCaptureLinks] = useState<CaptureLink[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (teams.length > 0 && !teams.some((tm) => tm.id === teamId)) {
      setTeamId(teams[0].id);
    }
  }, [teams, teamId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchIntakeEmail(workspaceId);
        if (!cancelled && res.address) setIntakeEmail(res.address);
      } catch {
        /* Không có địa chỉ thì ẩn dòng thông tin */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function onCopyEmail() {
    if (!intakeEmail) return;
    try {
      await navigator.clipboard.writeText(intakeEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      /* clipboard bị chặn — người dùng vẫn copy tay được */
    }
  }

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const links = await fetchCaptureLinks(workspaceId);
        if (!cancelled) setCaptureLinks(links);
      } catch {
        /* Chưa có link thì hiện nút tạo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const activeLink = captureLinks[0] ?? null;
  const captureUrl =
    activeLink && typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/capture/${activeLink.token}`
      : null;

  async function onCreateLink() {
    if (!workspaceId) return;
    setCreatingLink(true);
    setLinkError(null);
    try {
      const link = await createCaptureLink(workspaceId, {
        teamId: teams[0]?.id,
      });
      setCaptureLinks((prev) => [link, ...prev]);
    } catch (err) {
      setLinkError(friendly(err));
    } finally {
      setCreatingLink(false);
    }
  }

  async function onCopyLink() {
    if (!captureUrl) return;
    try {
      await navigator.clipboard.writeText(captureUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard bị chặn — người dùng vẫn copy tay được */
    }
  }

  const friendly = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError && err.kind === "network") {
        return tc("serverError");
      }
      if (err instanceof ApiError && err.message) return err.message;
      return tc("genericError");
    },
    [tc],
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await fetchTriage(workspaceId, "NEW"));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAccept(item: IntakeItem) {
    const targetTeam = teamId || teams[0]?.id;
    if (!targetTeam) {
      setActionError(t("noTeam"));
      return;
    }
    setBusyId(item.id);
    setActionError(null);
    setNotice(null);
    try {
      const issue = await acceptIntake(item.id, targetTeam);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setNotice(t("accepted", { key: issue.key, title: issue.title }));
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDismiss(item: IntakeItem) {
    setBusyId(item.id);
    setActionError(null);
    setNotice(null);
    try {
      await dismissIntake(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setNotice(t("dismissed"));
    } catch (err) {
      setActionError(friendly(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSimulate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setSimBusy(true);
    setSimError(null);
    try {
      await simulateIntake({
        workspaceId,
        channel: simChannel,
        senderName: simSender.trim(),
        title: simTitle.trim(),
        content: simContent.trim(),
      });
      setSimTitle("");
      setSimContent("");
      setShowSimulate(false);
      await load();
    } catch (err) {
      setSimError(friendly(err));
    } finally {
      setSimBusy(false);
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
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
      </div>

      {intakeEmail && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            border: "1px solid #1e2025",
            borderRadius: 10,
            padding: "10px 14px",
            background: "#0c0d0f",
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          <span style={{ color: "#9ba0aa" }}>{t("emailLabel")}</span>
          <code
            style={{
              color: "#eac35c",
              background: "rgba(224, 172, 52, 0.1)",
              borderRadius: 5,
              padding: "2px 8px",
              fontSize: 13,
            }}
          >
            {intakeEmail}
          </code>
          <button
            onClick={() => void onCopyEmail()}
            style={{
              background: "transparent",
              border: "1px solid #26282e",
              borderRadius: 6,
              color: "#c6c9cf",
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {emailCopied ? t("copied") : t("copy")}
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          border: "1px solid #1e2025",
          borderRadius: 10,
          padding: "10px 14px",
          background: "#0c0d0f",
          marginBottom: 20,
          fontSize: 13,
        }}
      >
        <span style={{ color: "#9ba0aa" }}>{t("captureLabel")}</span>
        {captureUrl ? (
          <>
            <code
              style={{
                color: "#8fe3ae",
                background: "rgba(63, 185, 109, 0.1)",
                borderRadius: 5,
                padding: "2px 8px",
                fontSize: 13,
                wordBreak: "break-all",
              }}
            >
              {captureUrl}
            </code>
            <button
              onClick={() => void onCopyLink()}
              style={{
                background: "transparent",
                border: "1px solid #26282e",
                borderRadius: 6,
                color: "#c6c9cf",
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              {linkCopied ? t("copied") : t("copy")}
            </button>
          </>
        ) : (
          <button
            onClick={() => void onCreateLink()}
            disabled={creatingLink}
            style={{
              background: "transparent",
              border: "1px solid #26282e",
              borderRadius: 6,
              color: "#c6c9cf",
              padding: "4px 10px",
              fontSize: 12,
              cursor: creatingLink ? "wait" : "pointer",
              marginLeft: "auto",
              opacity: creatingLink ? 0.7 : 1,
            }}
          >
            {creatingLink ? tc("processing") : t("captureCreate")}
          </button>
        )}
        {linkError && (
          <span role="alert" style={{ color: "#ff9d9d", fontSize: 12 }}>
            {linkError}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: showSimulate ? 0 : 20,
        }}
      >
        <button
          onClick={() => setShowSimulate((v) => !v)}
          style={{
            background: "#141519",
            border: "1px solid #26282e",
            borderRadius: 8,
            color: "#e6e7e9",
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("createSample")}
        </button>
      </div>

      {showSimulate && (
        <form
          onSubmit={onSimulate}
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {t("simulateTitle")}
          </div>
          {simError && (
            <div role="alert" style={{ color: "#ff9d9d", fontSize: 13 }}>
              {simError}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle} htmlFor="sim-channel">
                {t("fieldChannel")}
              </label>
              <select
                id="sim-channel"
                style={inputStyle}
                value={simChannel}
                onChange={(e) => setSimChannel(e.target.value as Channel)}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="sim-sender">
                {t("fieldSender")}
              </label>
              <input
                id="sim-sender"
                style={inputStyle}
                value={simSender}
                onChange={(e) => setSimSender(e.target.value)}
                placeholder={t("fieldSenderPlaceholder")}
                required
              />
            </div>
          </div>
          <div>
            <label style={labelStyle} htmlFor="sim-title">
              {t("fieldTitle")}
            </label>
            <input
              id="sim-title"
              style={inputStyle}
              value={simTitle}
              onChange={(e) => setSimTitle(e.target.value)}
              placeholder={t("fieldTitlePlaceholder")}
              required
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sim-content">
              {t("fieldContent")}
            </label>
            <textarea
              id="sim-content"
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              value={simContent}
              onChange={(e) => setSimContent(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={simBusy}
              style={{
                background: "#5e6ad2",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: simBusy ? "wait" : "pointer",
                opacity: simBusy ? 0.7 : 1,
              }}
            >
              {simBusy ? tc("processing") : t("submitSample")}
            </button>
            <button
              type="button"
              onClick={() => setShowSimulate(false)}
              style={{
                background: "transparent",
                border: "1px solid #26282e",
                borderRadius: 8,
                color: "#c6c9cf",
                padding: "9px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {teams.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 13, color: "#9ba0aa" }} htmlFor="triage-team">
            {t("teamLabel")}
          </label>
          <select
            id="triage-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            style={{
              background: "#141519",
              border: "1px solid #26282e",
              borderRadius: 6,
              color: "#e6e7e9",
              padding: "6px 8px",
              fontSize: 13,
            }}
          >
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name} ({tm.key})
              </option>
            ))}
          </select>
        </div>
      )}

      {notice && (
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
          {notice}
        </div>
      )}
      {actionError && (
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
          {actionError}
        </div>
      )}

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
          <button
            onClick={() => void load()}
            style={{
              background: "transparent",
              border: "1px solid #26282e",
              borderRadius: 6,
              color: "#c6c9cf",
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {tc("retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
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
          {items.map((item) => (
            <article
              key={item.id}
              style={{
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
                <ChannelBadge channel={item.channel} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {item.title}
                </span>
                <span
                  style={{ color: "#6f747e", fontSize: 12, marginLeft: "auto" }}
                >
                  {formatTime(item.createdAt)}
                </span>
              </div>
              <div style={{ color: "#9ba0aa", fontSize: 13, marginBottom: 6 }}>
                {t("from", { sender: item.senderName ?? "—" })}
              </div>
              {item.content && (
                <p
                  style={{
                    margin: "0 0 14px",
                    color: "#c6c9cf",
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.content}
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => void onAccept(item)}
                  disabled={busyId === item.id}
                  style={{
                    background: "#5e6ad2",
                    color: "#fff",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 13px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: busyId === item.id ? "wait" : "pointer",
                    opacity: busyId === item.id ? 0.7 : 1,
                  }}
                >
                  {t("accept")}
                </button>
                <button
                  onClick={() => void onDismiss(item)}
                  disabled={busyId === item.id}
                  style={{
                    background: "transparent",
                    border: "1px solid #26282e",
                    borderRadius: 7,
                    color: "#c6c9cf",
                    padding: "7px 13px",
                    fontSize: 13,
                    cursor: busyId === item.id ? "wait" : "pointer",
                  }}
                >
                  {t("dismiss")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

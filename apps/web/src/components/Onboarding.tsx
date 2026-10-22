"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ApiError, createTeam, createWorkspace } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0c0d0f",
  border: "1px solid #26282e",
  borderRadius: 8,
  color: "#e6e7e9",
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#9ba0aa",
  marginBottom: 6,
};

const primaryButton: React.CSSProperties = {
  background: "#5e6ad2",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};

/** Gợi ý mã team từ tên: bỏ dấu tiếng Việt, viết hoa, tối đa 5 ký tự. */
function suggestKey(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9 ]/g, "");
  const initials = ascii
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
  const base = (initials.length >= 2 ? initials : ascii.replace(/\s+/g, "")).toUpperCase();
  return base.slice(0, 5) || "TEAM";
}

export default function Onboarding() {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const { user, reload, logout } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"workspace" | "team">("workspace");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamKey, setTeamKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toFriendlyError(err: unknown): string {
    if (err instanceof ApiError && err.kind === "network") {
      return tc("serverError");
    }
    if (err instanceof ApiError && err.message) return err.message;
    return tc("genericError");
  }

  async function submitWorkspace(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ws = await createWorkspace(workspaceName.trim());
      setWorkspaceId(ws.id);
      setStep("team");
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitTeam(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await createTeam(workspaceId, {
        name: teamName.trim(),
        key: teamKey.trim().toUpperCase(),
      });
      await reload();
      router.replace("/triage");
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Gomly
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 650, margin: "0 0 6px" }}>
          {t("title")}
        </h1>
        <p style={{ color: "#9ba0aa", margin: "0 0 24px", fontSize: 14 }}>
          {user ? t("subtitle", { name: user.name }) : t("subtitleGeneric")}
        </p>

        {error && (
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
            {error}
          </div>
        )}

        {step === "workspace" ? (
          <form
            onSubmit={submitWorkspace}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div>
              <label style={labelStyle} htmlFor="ob-ws-name">
                {t("workspaceName")}
              </label>
              <input
                id="ob-ws-name"
                style={inputStyle}
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={t("workspaceNamePlaceholder")}
                required
                autoFocus
              />
            </div>
            <button type="submit" style={primaryButton} disabled={busy}>
              {busy ? tc("processing") : t("createWorkspace")}
            </button>
          </form>
        ) : (
          <form
            onSubmit={submitTeam}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div>
              <label style={labelStyle} htmlFor="ob-team-name">
                {t("teamName")}
              </label>
              <input
                id="ob-team-name"
                style={inputStyle}
                value={teamName}
                onChange={(e) => {
                  setTeamName(e.target.value);
                  if (!keyTouched) setTeamKey(suggestKey(e.target.value));
                }}
                placeholder={t("teamNamePlaceholder")}
                required
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="ob-team-key">
                {t("teamKey")}
              </label>
              <input
                id="ob-team-key"
                style={{ ...inputStyle, textTransform: "uppercase" }}
                value={teamKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setTeamKey(e.target.value.toUpperCase());
                }}
                placeholder="DEV"
                required
                maxLength={10}
              />
              <p style={{ color: "#6f747e", fontSize: 12, margin: "6px 0 0" }}>
                {t("teamKeyHint")}
              </p>
            </div>
            <button type="submit" style={primaryButton} disabled={busy}>
              {busy ? tc("processing") : t("createTeam")}
            </button>
          </form>
        )}

        <button
          onClick={logout}
          style={{
            background: "transparent",
            border: "none",
            color: "#9ba0aa",
            cursor: "pointer",
            fontSize: 13,
            marginTop: 20,
            padding: 0,
          }}
        >
          {tc("logout")}
        </button>
      </div>
    </div>
  );
}

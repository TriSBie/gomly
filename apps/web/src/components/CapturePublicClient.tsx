"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ApiError,
  fetchCaptureInfo,
  submitCapture,
  type CaptureInfo,
} from "@/lib/api";
import LanguageSwitcher from "./LanguageSwitcher";
import { ErrorBox, inputStyle, labelStyle, primaryBtn } from "./ui";

type Phase = "loading" | "ready" | "invalid" | "loadError" | "submitted";

/**
 * Trang gửi việc CÔNG KHAI qua link capture (Wave 3 — phương án B cho Zalo:
 * ghim link này vào nhóm Zalo, khách/người ngoài gửi yêu cầu thẳng vào Triage
 * mà không cần tài khoản Gomly). Không nằm trong AppShell đăng nhập.
 * Trường "website" là honeypot chống bot: ẩn khỏi người dùng thật, chỉ bot
 * tự điền mới lộ — giá trị được gửi kèm để backend lọc.
 */
export default function CapturePublicClient({ token }: { token: string }) {
  const t = useTranslations("Capture");
  const tc = useTranslations("Common");
  const tagline = useTranslations()("Tagline");
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

  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<CaptureInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [senderName, setSenderName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      const res = await fetchCaptureInfo(token);
      setInfo(res);
      setPhase("ready");
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.kind === "http" &&
        (err.status === 404 || err.status === 410)
      ) {
        setPhase("invalid");
      } else if (err instanceof ApiError && err.kind === "network") {
        setLoadError(friendly(err));
        setPhase("loadError");
      } else {
        // Lỗi HTTP khác khi tra link → coi như link không còn hiệu lực.
        setPhase("invalid");
      }
    }
  }, [token, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSubmitError(null);
    try {
      await submitCapture(token, {
        senderName: senderName.trim(),
        title: title.trim(),
        content: content.trim(),
        website,
      });
      setPhase("submitted");
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.kind === "http" &&
        (err.status === 404 || err.status === 410)
      ) {
        setPhase("invalid");
      } else {
        setSubmitError(friendly(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function onSendAnother() {
    setSenderName("");
    setTitle("");
    setContent("");
    setWebsite("");
    setSubmitError(null);
    setPhase(info ? "ready" : "loading");
    if (!info) void load();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px 56px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#f2f3f5",
              }}
            >
              Gomly
            </div>
            <div style={{ color: "#9ba0aa", fontSize: 13, marginTop: 2 }}>
              {tagline}
            </div>
          </div>
          <LanguageSwitcher />
        </header>

        <main
          style={{
            border: "1px solid #1e2025",
            borderRadius: 14,
            background: "#0f1011",
            padding: "26px 26px 30px",
          }}
        >
          {phase === "loading" && (
            <p style={{ color: "#9ba0aa", margin: 0 }}>{tc("loading")}</p>
          )}

          {phase === "loadError" && (
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

          {phase === "invalid" && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden>
                🔗
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 650, margin: "0 0 8px" }}>
                {t("invalidTitle")}
              </h1>
              <p
                style={{
                  color: "#9ba0aa",
                  margin: 0,
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {t("invalidBody")}
              </p>
            </div>
          )}

          {phase === "submitted" && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden>
                ✅
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 650, margin: "0 0 8px" }}>
                {t("thanksTitle")}
              </h1>
              <p
                style={{
                  color: "#9ba0aa",
                  margin: "0 0 20px",
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {t("thanksBody", { workspace: info?.workspaceName ?? "" })}
              </p>
              <button
                onClick={onSendAnother}
                style={{
                  background: "transparent",
                  border: "1px solid #26282e",
                  borderRadius: 8,
                  color: "#c6c9cf",
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t("sendAnother")}
              </button>
            </div>
          )}

          {phase === "ready" && info && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 6px" }}>
                {t("title")}
              </h1>
              <p
                style={{
                  color: "#9ba0aa",
                  margin: "0 0 4px",
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {t("subtitle", { workspace: info.workspaceName })}
              </p>
              {info.teamName && (
                <p
                  style={{
                    color: "#6f747e",
                    margin: "0 0 20px",
                    fontSize: 13,
                  }}
                >
                  {t("teamLine", { team: info.teamName })}
                </p>
              )}

              <form
                onSubmit={onSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  marginTop: 16,
                }}
              >
                {submitError && <ErrorBox>{submitError}</ErrorBox>}
                <div>
                  <label style={labelStyle} htmlFor="cap-sender">
                    {t("fieldSender")}
                  </label>
                  <input
                    id="cap-sender"
                    style={inputStyle}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={t("fieldSenderPlaceholder")}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="cap-title">
                    {t("fieldTitle")}
                  </label>
                  <input
                    id="cap-title"
                    style={inputStyle}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("fieldTitlePlaceholder")}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="cap-content">
                    {t("fieldContent")}
                  </label>
                  <textarea
                    id="cap-content"
                    style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t("fieldContentPlaceholder")}
                    required
                  />
                </div>
                {/* Honeypot chống bot: ẩn hoàn toàn khỏi người dùng thật. */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                  }}
                >
                  <label>
                    Website
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    ...primaryBtn,
                    padding: "11px 14px",
                    fontSize: 14,
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? tc("processing") : t("submit")}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

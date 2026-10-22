"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, login, register, saveTokens } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import LanguageSwitcher from "./LanguageSwitcher";

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

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");
  const tagline = useTranslations()("Tagline");
  const router = useRouter();
  const { status, reload } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Đã đăng nhập rồi mà vào /login|/register thì về trang chính
  // (AppShell sẽ tự rẽ tiếp sang onboarding hoặc /triage).
  useEffect(() => {
    if (status === "ready" || status === "needsOnboarding") {
      router.replace("/");
    }
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "register"
          ? await register({ email: email.trim(), password, name: name.trim() })
          : await login({ email: email.trim(), password });
      saveTokens(res);
      await reload();
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.kind === "network") {
        setError(tc("serverError"));
      } else if (
        err instanceof ApiError &&
        mode === "login" &&
        (err.status === 401 || err.status === 403)
      ) {
        setError(t("invalidCredentials"));
      } else if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError(tc("genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div style={{ width: "100%", maxWidth: 380 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <span
          style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" }}
        >
          Gomly
        </span>
        <LanguageSwitcher />
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 6px" }}>
        {isRegister ? t("registerTitle") : t("loginTitle")}
      </h1>
      <p style={{ color: "#9ba0aa", margin: "0 0 24px", fontSize: 14 }}>
        {tagline}
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

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        {isRegister && (
          <div>
            <label style={labelStyle} htmlFor="auth-name">
              {t("name")}
            </label>
            <input
              id="auth-name"
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoComplete="name"
              required
            />
          </div>
        )}
        <div>
          <label style={labelStyle} htmlFor="auth-email">
            {t("email")}
          </label>
          <input
            id="auth-email"
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="auth-password">
            {t("password")}
          </label>
          <input
            id="auth-password"
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          style={{
            background: "#5e6ad2",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy
            ? tc("processing")
            : isRegister
              ? t("registerButton")
              : t("loginButton")}
        </button>
      </form>

      <p style={{ color: "#9ba0aa", fontSize: 13, marginTop: 20 }}>
        {isRegister ? t("haveAccount") : t("noAccount")}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          style={{ color: "#8b93e8", textDecoration: "none" }}
        >
          {isRegister ? t("loginLink") : t("registerLink")}
        </Link>
      </p>
    </div>
  );
}

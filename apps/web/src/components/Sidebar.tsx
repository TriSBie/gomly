"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { useInbox } from "@/lib/inbox-context";
import { OPEN_PALETTE_EVENT } from "./CommandPalette";
import LanguageSwitcher from "./LanguageSwitcher";

const NAV_ITEMS = [
  { href: "/inbox", key: "inbox" },
  { href: "/my-issues", key: "myIssues" },
  { href: "/triage", key: "triage" },
  { href: "/issues", key: "issues" },
  { href: "/cycles", key: "cycles" },
  { href: "/projects", key: "projects" },
  { href: "/members", key: "members" },
] as const;

export default function Sidebar() {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const router = useRouter();
  const { user, workspaces, currentWorkspace, selectWorkspace, logout } =
    useAuth();
  const { unreadCount } = useInbox();

  function onLogout() {
    logout();
    router.replace("/login");
  }

  function openPalette() {
    window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
  }

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: "1px solid #1e2025",
        background: "#0c0d0f",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/"
          style={{
            color: "#f2f3f5",
            fontWeight: 700,
            fontSize: 18,
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          Gomly
        </Link>
        <LanguageSwitcher />
      </div>

      {currentWorkspace && (
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#6f747e",
              marginBottom: 6,
              padding: "0 2px",
            }}
          >
            {tc("workspace")}
          </div>
          {workspaces.length > 1 ? (
            <select
              aria-label={tc("workspace")}
              value={currentWorkspace.id}
              onChange={(e) => selectWorkspace(e.target.value)}
              style={{
                width: "100%",
                background: "#141519",
                border: "1px solid #26282e",
                borderRadius: 6,
                color: "#e6e7e9",
                padding: "6px 8px",
                fontSize: 13,
              }}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#e6e7e9",
                padding: "0 2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={currentWorkspace.name}
            >
              {currentWorkspace.name}
            </div>
          )}
        </div>
      )}

      <button
        onClick={openPalette}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#141519",
          border: "1px solid #26282e",
          borderRadius: 8,
          color: "#9ba0aa",
          padding: "7px 10px",
          fontSize: 13,
          cursor: "pointer",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <span>{t("search")}</span>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#6f747e",
            border: "1px solid #26282e",
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          ⌘K
        </span>
      </button>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            style={{
              color: "#c6c9cf",
              textDecoration: "none",
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{t(item.key)}</span>
            {item.key === "inbox" && unreadCount > 0 && (
              <span
                style={{
                  background: "#e05252",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: "1px 7px",
                  lineHeight: 1.5,
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: "auto" }}>
        {user && (
          <div
            style={{
              fontSize: 12,
              color: "#6f747e",
              padding: "0 2px",
              marginBottom: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={user.email}
          >
            {user.name} · {user.email}
          </div>
        )}
        <button
          onClick={onLogout}
          style={{
            background: "transparent",
            border: "1px solid #26282e",
            borderRadius: 6,
            color: "#c6c9cf",
            padding: "6px 10px",
            fontSize: 13,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
        >
          {tc("logout")}
        </button>
      </div>
    </aside>
  );
}

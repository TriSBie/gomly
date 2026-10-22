"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { InboxProvider } from "@/lib/inbox-context";
import Sidebar from "./Sidebar";
import Onboarding from "./Onboarding";
import CommandPalette from "./CommandPalette";

const AUTH_ROUTES = ["/login", "/register"];

/** Route công khai (Wave 3): trang gửi việc qua link capture — không cần đăng nhập. */
function isPublicRoute(pathname: string): boolean {
  return pathname === "/capture" || pathname.startsWith("/capture/");
}

/**
 * Vỏ ứng dụng phía client:
 * - /login, /register: hiển thị toàn màn hình, không sidebar.
 * - /capture/[token]: trang công khai — không sidebar, không chuyển về /login.
 * - Chưa đăng nhập → chuyển về /login.
 * - Đã đăng nhập nhưng chưa có workspace → màn onboarding.
 * - Có workspace → layout sidebar + nội dung; ở "/" thì chuyển thẳng vào /triage.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("Common");
  const { status, bootError, reload } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    if (isAuthRoute || isPublic) return;
    if (status === "anonymous" && !bootError) {
      router.replace("/login");
    } else if (status === "ready" && pathname === "/") {
      router.replace("/triage");
    }
  }, [status, pathname, isAuthRoute, isPublic, bootError, router]);

  if (isPublic) {
    return <div style={{ minHeight: "100vh" }}>{children}</div>;
  }

  if (isAuthRoute) {
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
        {children}
      </div>
    );
  }

  if (status === "loading" || status === "anonymous") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
          justifyContent: "center",
          color: "#9ba0aa",
          fontSize: 14,
          padding: 24,
          textAlign: "center",
        }}
      >
        <span>{bootError ? t("serverError") : t("loading")}</span>
        {bootError && (
          <button
            onClick={() => void reload()}
            style={{
              background: "transparent",
              border: "1px solid #26282e",
              borderRadius: 6,
              color: "#c6c9cf",
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("retry")}
          </button>
        )}
      </div>
    );
  }

  if (status === "needsOnboarding") {
    return <Onboarding />;
  }

  return (
    <InboxProvider>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            padding: "32px 40px",
            maxWidth: 960,
            boxSizing: "border-box",
          }}
        >
          {children}
        </main>
      </div>
      <CommandPalette />
    </InboxProvider>
  );
}

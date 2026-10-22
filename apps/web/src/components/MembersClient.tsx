"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ApiError,
  addMember,
  fetchMembers,
  removeMember,
  type Member,
  type MemberRole,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  ErrorBox,
  NoticeBox,
  formatDate,
  inputStyle,
  labelStyle,
  primaryBtn,
  selectStyle,
  useFriendlyError,
} from "./ui";

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  OWNER: { bg: "rgba(224, 172, 52, 0.14)", fg: "#eac35c" },
  ADMIN: { bg: "rgba(94, 106, 210, 0.16)", fg: "#93a0f5" },
  MEMBER: { bg: "rgba(155, 160, 170, 0.14)", fg: "#9ba0aa" },
  GUEST: { bg: "rgba(155, 63, 151, 0.16)", fg: "#e08adb" },
};

const ADDABLE_ROLES: MemberRole[] = ["MEMBER", "ADMIN", "GUEST"];
const KNOWN_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"];

/**
 * Quản lý thành viên workspace (Wave 3).
 * Lựa chọn đã ghi rõ: API workspace hiện tại KHÔNG trả vai trò của chính tôi,
 * nên form thêm luôn hiển thị — nếu không có quyền (không phải OWNER/ADMIN),
 * API trả 403 và UI hiển thị đúng thông điệp không có quyền.
 */
export default function MembersClient() {
  const t = useTranslations("Members");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const friendly = useFriendlyError();
  const { user, currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("MEMBER");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setMembers(await fetchMembers(workspaceId));
    } catch (err) {
      setLoadError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, friendly]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Map lỗi API thêm thành viên sang thông điệp đúng nghĩa theo mã trạng thái. */
  const addErrorMessage = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError && err.kind === "http") {
        if (err.status === 404) return t("errAccountNotFound");
        if (err.status === 409) return t("errAlreadyMember");
        if (err.status === 403) return t("errNoPermission");
      }
      return friendly(err);
    },
    [t, friendly],
  );

  const actionErrorMessage = useCallback(
    (err: unknown): string => {
      if (
        err instanceof ApiError &&
        err.kind === "http" &&
        err.status === 403
      ) {
        return t("errNoPermission");
      }
      return friendly(err);
    },
    [t, friendly],
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setAdding(true);
    setAddError(null);
    setNotice(null);
    setActionError(null);
    try {
      const member = await addMember(workspaceId, {
        email: email.trim(),
        role,
      });
      setMembers((prev) => [...prev, member]);
      setNotice(t("added", { name: member.name || member.email }));
      setEmail("");
      setRole("MEMBER");
    } catch (err) {
      setAddError(addErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(member: Member) {
    if (!workspaceId) return;
    if (!window.confirm(t("removeConfirm", { name: member.name || member.email })))
      return;
    setBusyId(member.userId);
    setActionError(null);
    setNotice(null);
    try {
      await removeMember(workspaceId, member.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      setNotice(t("removed", { name: member.name || member.email }));
    } catch (err) {
      // VD bị chặn vì là OWNER cuối — hiển thị lỗi từ API/ngữ nghĩa 403.
      setActionError(actionErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 650, margin: "0 0 6px" }}>
        {t("title")}
      </h1>
      <p style={{ color: "#9ba0aa", margin: "0 0 24px", lineHeight: 1.6 }}>
        {t("subtitle", { workspace: currentWorkspace?.name ?? "" })}
      </p>

      {notice && <NoticeBox>{notice}</NoticeBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      <form
        onSubmit={onAdd}
        style={{
          border: "1px solid #1e2025",
          borderRadius: 10,
          padding: 18,
          background: "#0f1011",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
          {t("addTitle")}
        </div>
        {addError && <ErrorBox>{addError}</ErrorBox>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle} htmlFor="member-email">
              {t("fieldEmail")}
            </label>
            <input
              id="member-email"
              type="email"
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("fieldEmailPlaceholder")}
              required
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="member-role">
              {t("fieldRole")}
            </label>
            <select
              id="member-role"
              style={{ ...selectStyle, padding: "9px 8px" }}
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
            >
              {ADDABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            style={{
              ...primaryBtn,
              cursor: adding ? "wait" : "pointer",
              opacity: adding ? 0.7 : 1,
            }}
          >
            {adding ? tc("processing") : t("addButton")}
          </button>
        </div>
      </form>

      {loading ? (
        <p style={{ color: "#9ba0aa" }}>{tc("loading")}</p>
      ) : loadError ? (
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
      ) : members.length === 0 ? (
        <div
          style={{
            border: "1px dashed #26282e",
            borderRadius: 10,
            padding: "36px 20px",
            textAlign: "center",
            color: "#9ba0aa",
            fontSize: 14,
          }}
        >
          {t("empty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => {
            const s = ROLE_STYLE[m.role] ?? ROLE_STYLE.MEMBER;
            const isMe = user && m.userId === user.id;
            return (
              <div
                key={m.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#0f1011",
                  border: "1px solid #1e2025",
                  borderRadius: 10,
                  padding: "12px 14px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#1c1e26",
                    color: "#c6c9cf",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    (m.name || m.email || "?").slice(0, 1).toUpperCase()
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 180 }}>
                  <span
                    style={{
                      display: "block",
                      color: "#e6e7e9",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {m.name || m.email}
                    {isMe && (
                      <span
                        style={{
                          color: "#6f747e",
                          fontWeight: 400,
                          fontSize: 12,
                          marginLeft: 6,
                        }}
                      >
                        ({t("you")})
                      </span>
                    )}
                  </span>
                  <span
                    style={{ display: "block", color: "#6f747e", fontSize: 12 }}
                  >
                    {m.email} · {t("joinedAt", { date: formatDate(m.joinedAt, locale) })}
                  </span>
                </span>
                <span
                  style={{
                    background: s.bg,
                    color: s.fg,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    borderRadius: 5,
                    padding: "2px 7px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {KNOWN_ROLES.includes(m.role) ? t(`roles.${m.role}`) : m.role}
                </span>
                <button
                  onClick={() => void onRemove(m)}
                  disabled={busyId === m.userId}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(224, 82, 82, 0.5)",
                    borderRadius: 7,
                    color: "#ff9d9d",
                    padding: "6px 11px",
                    fontSize: 13,
                    cursor: busyId === m.userId ? "wait" : "pointer",
                  }}
                >
                  {t("remove")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

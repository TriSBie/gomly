"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearTokens,
  fetchMe,
  fetchTeams,
  fetchWorkspaces,
  getAccessToken,
  getStoredWorkspaceId,
  storeWorkspaceId,
  type Team,
  type User,
  type Workspace,
} from "./api";

export type AuthStatus = "loading" | "anonymous" | "needsOnboarding" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  /** true khi lần tải đầu thất bại vì không kết nối được API (khác với chưa đăng nhập). */
  bootError: boolean;
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  teams: Team[];
  selectWorkspace: (id: string) => void;
  /** Nạp lại user + workspaces + teams (dùng sau onboarding / tạo mới). */
  reload: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [bootError, setBootError] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null,
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const bootRun = useRef(0);

  const loadForWorkspace = useCallback(
    async (ws: Workspace | null): Promise<void> => {
      if (!ws) {
        setTeams([]);
        return;
      }
      try {
        setTeams(await fetchTeams(ws.id));
      } catch {
        setTeams([]);
      }
    },
    [],
  );

  const reload = useCallback(async (): Promise<void> => {
    const run = ++bootRun.current;
    if (!getAccessToken()) {
      setUser(null);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setTeams([]);
      setStatus("anonymous");
      return;
    }
    try {
      const [me, list] = await Promise.all([fetchMe(), fetchWorkspaces()]);
      if (bootRun.current !== run) return;
      setUser(me);
      setWorkspaces(list);
      setBootError(false);
      if (list.length === 0) {
        setCurrentWorkspace(null);
        setTeams([]);
        setStatus("needsOnboarding");
        return;
      }
      const stored = getStoredWorkspaceId();
      const ws = list.find((w) => w.id === stored) ?? list[0];
      setCurrentWorkspace(ws);
      storeWorkspaceId(ws.id);
      await loadForWorkspace(ws);
      if (bootRun.current !== run) return;
      setStatus("ready");
    } catch (err) {
      if (bootRun.current !== run) return;
      // 401/403 = token hết hạn/không hợp lệ → về trạng thái chưa đăng nhập.
      // Lỗi mạng = giữ token, báo bootError để UI hiển thị "không kết nối được máy chủ".
      const statusCode = (err as { status?: number })?.status;
      if (statusCode === 401 || statusCode === 403) {
        clearTokens();
        setUser(null);
        setStatus("anonymous");
      } else {
        setBootError(true);
        setStatus("anonymous");
      }
    }
  }, [loadForWorkspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectWorkspace = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id) ?? null;
      setCurrentWorkspace(ws);
      if (ws) {
        storeWorkspaceId(ws.id);
        void loadForWorkspace(ws);
      }
    },
    [workspaces, loadForWorkspace],
  );

  const logout = useCallback(() => {
    bootRun.current++;
    clearTokens();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setTeams([]);
    setBootError(false);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      bootError,
      user,
      workspaces,
      currentWorkspace,
      teams,
      selectWorkspace,
      reload,
      logout,
    }),
    [
      status,
      bootError,
      user,
      workspaces,
      currentWorkspace,
      teams,
      selectWorkspace,
      reload,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

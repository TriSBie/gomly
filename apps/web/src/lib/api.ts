/**
 * API client cho Gomly web — nói chuyện với apps/api (NestJS) theo hợp đồng REST.
 *
 * LƯU Ý BẢO MẬT (lát cắt Wave 0): accessToken được lưu ở localStorage để flow
 * demo chạy đơn giản. Đây KHÔNG phải phương án production — wave sau sẽ chuyển
 * sang httpOnly cookie + refresh-token rotation (xem README, mục bảo mật).
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ACCESS_TOKEN_KEY = "gomly.accessToken";
const REFRESH_TOKEN_KEY = "gomly.refreshToken";
const WORKSPACE_KEY = "gomly.workspaceId";

export type Channel = "ZALO" | "SLACK" | "EMAIL" | "GITHUB";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  key: string;
  workspaceId?: string;
}

export interface IntakeItem {
  id: string;
  channel: Channel | string;
  senderName: string | null;
  title: string;
  content: string | null;
  status: string;
  createdAt: string;
}

export type IssueStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELED";

export type StatusGroup =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELED";

export type Priority = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Issue {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  status: IssueStatus | string;
  statusGroup?: StatusGroup | string;
  priority?: Priority | string;
  labels?: string[];
  assigneeId?: string | null;
  creatorId?: string | null;
  estimate?: number | null;
  dueDate?: string | null;
  teamId?: string;
  workspaceId?: string;
  cycleId?: string | null;
  projectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Quan hệ rút gọn nếu backend trả kèm (VD /me/issues, chi tiết issue). */
  team?: { id: string; name: string; key?: string } | null;
  workspace?: { id: string; name: string } | null;
}

export interface IssueComment {
  id: string;
  issueId: string;
  authorId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  content: string;
  createdAt: string;
}

export interface Progress {
  totalIssues: number;
  doneIssues: number;
  progressPercent: number;
}

export interface Cycle {
  id: string;
  teamId: string;
  workspaceId?: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
  closedAt?: string | null;
  progress?: Progress;
  issues?: Issue[];
}

export interface Project {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string | null;
  targetDate?: string | null;
  progress?: Progress;
  issues?: Issue[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

/** Lỗi API: kind="network" khi không kết nối được máy chủ, kind="http" khi server trả lỗi. */
export class ApiError extends Error {
  kind: "network" | "http";
  status?: number;

  constructor(kind: "network" | "http", message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function saveTokens(res: AuthResponse): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
  if (res.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
  }
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(WORKSPACE_KEY);
}

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export function storeWorkspaceId(id: string): void {
  window.localStorage.setItem(WORKSPACE_KEY, id);
}

/** NestJS thường trả { message: string | string[] }; gom về 1 chuỗi dễ đọc. */
function extractServerMessage(body: unknown): string | null {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg)) return msg.filter(Boolean).join(", ");
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string") return err;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("network", "Network error");
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      "http",
      extractServerMessage(data) ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  return data as T;
}

/** Các endpoint list có thể trả mảng trực tiếp hoặc bọc { data | items: [...] }. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const v = value as { data?: unknown; items?: unknown };
    if (Array.isArray(v.data)) return v.data as T[];
    if (Array.isArray(v.items)) return v.items as T[];
  }
  return [];
}

// ---------- Auth ----------
export function register(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export function fetchMe(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

// ---------- Workspaces & Teams ----------
export async function fetchWorkspaces(): Promise<Workspace[]> {
  return asArray<Workspace>(await apiFetch<unknown>("/workspaces"));
}

export function createWorkspace(name: string): Promise<Workspace> {
  return apiFetch<Workspace>("/workspaces", { method: "POST", body: { name } });
}

export async function fetchTeams(workspaceId: string): Promise<Team[]> {
  return asArray<Team>(
    await apiFetch<unknown>(`/workspaces/${workspaceId}/teams`),
  );
}

export function createTeam(
  workspaceId: string,
  input: { name: string; key: string },
): Promise<Team> {
  return apiFetch<Team>(`/workspaces/${workspaceId}/teams`, {
    method: "POST",
    body: input,
  });
}

// ---------- Triage / Intake ----------
export async function fetchTriage(
  workspaceId: string,
  status = "NEW",
): Promise<IntakeItem[]> {
  return asArray<IntakeItem>(
    await apiFetch<unknown>(
      `/workspaces/${workspaceId}/triage?status=${encodeURIComponent(status)}`,
    ),
  );
}

export function acceptIntake(itemId: string, teamId: string): Promise<Issue> {
  return apiFetch<Issue>(`/triage/${itemId}/accept`, {
    method: "POST",
    body: { teamId },
  });
}

export function dismissIntake(
  itemId: string,
  reason?: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/triage/${itemId}/dismiss`, {
    method: "POST",
    body: reason ? { reason } : {},
  });
}

export function simulateIntake(input: {
  workspaceId: string;
  channel: Channel;
  senderName: string;
  title: string;
  content: string;
}): Promise<IntakeItem> {
  return apiFetch<IntakeItem>("/intake/simulate", {
    method: "POST",
    body: input,
  });
}

export async function fetchIntakeEmail(
  workspaceId: string,
): Promise<{ address: string }> {
  const res = await apiFetch<{ address?: string } | string>(
    `/workspaces/${workspaceId}/intake-email`,
  );
  if (typeof res === "string") return { address: res };
  return { address: res.address ?? "" };
}

// ---------- Issues ----------
export interface IssueFilters {
  teamId?: string;
  status?: string;
  statusGroup?: string;
  assigneeId?: string;
  projectId?: string;
  cycleId?: string;
  q?: string;
}

function queryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchIssues(
  workspaceId: string,
  filters: IssueFilters = {},
): Promise<Issue[]> {
  return asArray<Issue>(
    await apiFetch<unknown>(
      `/workspaces/${workspaceId}/issues${queryString({
        teamId: filters.teamId,
        status: filters.status,
        statusGroup: filters.statusGroup,
        assigneeId: filters.assigneeId,
        projectId: filters.projectId,
        cycleId: filters.cycleId,
        q: filters.q,
      })}`,
    ),
  );
}

export interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  labels?: string[];
  dueDate?: string;
  projectId?: string;
  cycleId?: string;
}

export function createIssue(
  workspaceId: string,
  input: CreateIssueInput,
): Promise<Issue> {
  return apiFetch<Issue>(`/workspaces/${workspaceId}/issues`, {
    method: "POST",
    body: input,
  });
}

export function fetchIssue(issueId: string): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${issueId}`);
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  labels?: string[];
  estimate?: number | null;
  dueDate?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
}

export function updateIssue(
  issueId: string,
  patch: UpdateIssueInput,
): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${issueId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteIssue(issueId: string): Promise<unknown> {
  return apiFetch<unknown>(`/issues/${issueId}`, { method: "DELETE" });
}

export async function fetchComments(issueId: string): Promise<IssueComment[]> {
  return asArray<IssueComment>(
    await apiFetch<unknown>(`/issues/${issueId}/comments`),
  );
}

export function addComment(
  issueId: string,
  content: string,
): Promise<IssueComment> {
  return apiFetch<IssueComment>(`/issues/${issueId}/comments`, {
    method: "POST",
    body: { content },
  });
}

// ---------- Cycles ----------
export async function fetchCycles(
  workspaceId: string,
  teamId?: string,
): Promise<Cycle[]> {
  return asArray<Cycle>(
    await apiFetch<unknown>(
      `/workspaces/${workspaceId}/cycles${queryString({ teamId })}`,
    ),
  );
}

export function createCycle(
  workspaceId: string,
  input: { teamId: string; name?: string; startsAt: string; endsAt: string },
): Promise<Cycle> {
  return apiFetch<Cycle>(`/workspaces/${workspaceId}/cycles`, {
    method: "POST",
    body: input,
  });
}

export function fetchCycle(cycleId: string): Promise<Cycle> {
  return apiFetch<Cycle>(`/cycles/${cycleId}`);
}

export function addIssueToCycle(
  cycleId: string,
  issueId: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/cycles/${cycleId}/issues`, {
    method: "POST",
    body: { issueId },
  });
}

export function removeIssueFromCycle(
  cycleId: string,
  issueId: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/cycles/${cycleId}/issues/${issueId}`, {
    method: "DELETE",
  });
}

export interface CloseCycleResult {
  nextCycleId?: string | null;
  rolledIssueIds?: string[];
}

export function closeCycle(cycleId: string): Promise<CloseCycleResult> {
  return apiFetch<CloseCycleResult>(`/cycles/${cycleId}/close`, {
    method: "POST",
    body: { createNext: true },
  });
}

// ---------- Projects ----------
export async function fetchProjects(workspaceId: string): Promise<Project[]> {
  return asArray<Project>(
    await apiFetch<unknown>(`/workspaces/${workspaceId}/projects`),
  );
}

export function createProject(
  workspaceId: string,
  input: { name: string; description?: string; targetDate?: string },
): Promise<Project> {
  return apiFetch<Project>(`/workspaces/${workspaceId}/projects`, {
    method: "POST",
    body: input,
  });
}

export function fetchProject(projectId: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`);
}

export function updateProject(
  projectId: string,
  patch: { name?: string; description?: string; targetDate?: string | null },
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function addIssueToProject(
  projectId: string,
  issueId: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/projects/${projectId}/issues`, {
    method: "POST",
    body: { issueId },
  });
}

export function removeIssueFromProject(
  projectId: string,
  issueId: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/projects/${projectId}/issues/${issueId}`, {
    method: "DELETE",
  });
}

// ---------- Notifications / Inbox (Wave 2) ----------
export type NotificationType =
  | "ASSIGNED"
  | "COMMENTED"
  | "COMMENT"
  | "MENTIONED"
  | "MENTION"
  | "STATUS_CHANGED"
  | (string & {});

export interface NotificationActor {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface Notification {
  id: string;
  type: NotificationType;
  workspaceId?: string;
  issueId?: string | null;
  issueKey?: string | null;
  issueTitle?: string | null;
  actor?: NotificationActor | null;
  title?: string | null;
  body?: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  limit?: number;
}

export async function fetchNotifications(
  filters: NotificationFilters = {},
): Promise<Notification[]> {
  return asArray<Notification>(
    await apiFetch<unknown>(
      `/notifications${queryString({
        unreadOnly:
          filters.unreadOnly === undefined
            ? undefined
            : String(filters.unreadOnly),
        limit:
          filters.limit === undefined ? undefined : String(filters.limit),
      })}`,
    ),
  );
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count?: number } | number>(
    "/notifications/unread-count",
  );
  if (typeof res === "number") return res;
  return res?.count ?? 0;
}

export function markNotificationRead(
  notificationId: string,
): Promise<Notification> {
  return apiFetch<Notification>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead(): Promise<unknown> {
  return apiFetch<unknown>("/notifications/read-all", { method: "POST" });
}

// ---------- Capture links + gửi việc công khai (Wave 3) ----------
export interface CaptureLink {
  id: string;
  token: string;
  /** Đường dẫn tương đối phía API trả về (VD /capture/<token>) nếu có. */
  path?: string;
  teamId?: string | null;
  label?: string | null;
  createdAt?: string;
}

export function createCaptureLink(
  workspaceId: string,
  input: { teamId?: string; label?: string } = {},
): Promise<CaptureLink> {
  return apiFetch<CaptureLink>(`/workspaces/${workspaceId}/capture-links`, {
    method: "POST",
    body: input,
  });
}

export async function fetchCaptureLinks(
  workspaceId: string,
): Promise<CaptureLink[]> {
  return asArray<CaptureLink>(
    await apiFetch<unknown>(`/workspaces/${workspaceId}/capture-links`),
  );
}

export function deleteCaptureLink(
  workspaceId: string,
  linkId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/workspaces/${workspaceId}/capture-links/${linkId}`,
    { method: "DELETE" },
  );
}

export interface CaptureInfo {
  workspaceName: string;
  teamName?: string | null;
}

/** Thông tin công khai của link capture (không cần đăng nhập). */
export function fetchCaptureInfo(token: string): Promise<CaptureInfo> {
  return apiFetch<CaptureInfo>(
    `/capture/${encodeURIComponent(token)}/info`,
    { auth: false },
  );
}

export interface SubmitCaptureInput {
  senderName: string;
  title: string;
  content: string;
  /** Honeypot chống bot — người dùng thật luôn để trống. */
  website?: string;
}

/** Gửi yêu cầu qua link capture công khai (không cần đăng nhập). */
export function submitCapture(
  token: string,
  input: SubmitCaptureInput,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/capture/${encodeURIComponent(token)}`, {
    method: "POST",
    body: input,
    auth: false,
  });
}

// ---------- Thành viên workspace (Wave 3) ----------
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface Member {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: MemberRole | string;
  joinedAt: string;
}

export async function fetchMembers(workspaceId: string): Promise<Member[]> {
  return asArray<Member>(
    await apiFetch<unknown>(`/workspaces/${workspaceId}/members`),
  );
}

export function addMember(
  workspaceId: string,
  input: { email: string; role?: MemberRole },
): Promise<Member> {
  return apiFetch<Member>(`/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: input,
  });
}

export function removeMember(
  workspaceId: string,
  userId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/workspaces/${workspaceId}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

// ---------- Cấu hình tích hợp (Wave 3) ----------
export function updateIntegrationConfig(
  workspaceId: string,
  connectionId: string,
  config: { captureChannelMessages: boolean },
): Promise<unknown> {
  return apiFetch<unknown>(
    `/workspaces/${workspaceId}/integrations/${connectionId}/config`,
    { method: "PATCH", body: config },
  );
}

// ---------- My Issues (Wave 2) ----------
export interface MyIssueFilters {
  statusGroup?: string;
  workspaceId?: string;
}

export async function fetchMyIssues(
  filters: MyIssueFilters = {},
): Promise<Issue[]> {
  return asArray<Issue>(
    await apiFetch<unknown>(
      `/me/issues${queryString({
        statusGroup: filters.statusGroup,
        workspaceId: filters.workspaceId,
      })}`,
    ),
  );
}

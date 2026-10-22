/**
 * Mock API cho Gomly — cài đúng hợp đồng REST Wave 1 để kiểm chứng client
 * (src/lib/api.ts) khi backend thật chưa chạy đồng thời.
 * Chạy: node scripts/mock-api.mjs  (cổng từ MOCK_PORT, mặc định 4100)
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4100);

const TEAM_KEYS = { "team-1": "DEV", "team-2": "OPS" };
const keyCounters = new Map();
const issues = new Map();
const comments = new Map();
const cycles = new Map();
const projects = new Map();
let seq = 0;
const nid = (p) => `${p}-${++seq}`;

function groupOf(status) {
  return status; // mock: statusGroup trùng tên status theo hợp đồng
}

function progressOf(list) {
  const total = list.length;
  const done = list.filter((i) => groupOf(i.status) === "DONE").length;
  return {
    totalIssues: total,
    doneIssues: done,
    progressPercent: total ? (done / total) * 100 : 0,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body ?? null));
}

// Notifications mẫu cho /me = user-1 (Wave 2): 3 chưa đọc + 1 đã đọc,
// createdAt giảm dần để kiểm tra sắp xếp mới nhất trước.
const ntfNow = Date.now();
const notifications = [
  {
    id: "ntf-1",
    type: "ASSIGNED",
    workspaceId: "ws-1",
    issueId: null,
    issueKey: "DEV-1",
    issueTitle: "Sửa lỗi đăng nhập",
    actor: { id: "user-2", name: "Lan", email: "lan@gomly.dev" },
    title: null,
    body: "Lan đã gán DEV-1 cho bạn",
    readAt: null,
    createdAt: new Date(ntfNow - 1000).toISOString(),
  },
  {
    id: "ntf-2",
    type: "COMMENT",
    workspaceId: "ws-1",
    issueId: null,
    issueKey: "DEV-1",
    issueTitle: "Sửa lỗi đăng nhập",
    actor: { id: "user-2", name: "Lan", email: "lan@gomly.dev" },
    title: null,
    body: "Đã tái hiện được lỗi trên staging.",
    readAt: null,
    createdAt: new Date(ntfNow - 2000).toISOString(),
  },
  {
    id: "ntf-3",
    type: "MENTION",
    workspaceId: "ws-1",
    issueId: null,
    issueKey: null,
    issueTitle: null,
    actor: { id: "user-3", name: "Minh", email: "minh@gomly.dev" },
    title: "Minh nhắc bạn trong một bình luận",
    body: null,
    readAt: null,
    createdAt: new Date(ntfNow - 3000).toISOString(),
  },
  {
    id: "ntf-4",
    type: "STATUS_CHANGED",
    workspaceId: "ws-1",
    issueId: null,
    issueKey: "DEV-2",
    issueTitle: "Viết test cho API",
    actor: null,
    title: null,
    body: null,
    readAt: new Date(ntfNow - 500).toISOString(),
    createdAt: new Date(ntfNow - 4000).toISOString(),
  },
];

// ---- Wave 3: capture links + members + capture công khai ----
const captureLinks = [];
const captureSubmissions = [];
const USER_DIRECTORY = {
  "dev@gomly.dev": { id: "user-1", name: "Dev Gomly" },
  "lan@gomly.dev": { id: "user-2", name: "Lan" },
  "new@gomly.dev": { id: "user-9", name: "New Member" },
};
const membersByWs = new Map();
function seedMembers(wsId) {
  if (!membersByWs.has(wsId)) {
    membersByWs.set(wsId, [
      {
        userId: "user-1",
        email: "dev@gomly.dev",
        name: "Dev Gomly",
        avatarUrl: null,
        role: "OWNER",
        joinedAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        userId: "user-2",
        email: "lan@gomly.dev",
        name: "Lan",
        avatarUrl: null,
        role: "MEMBER",
        joinedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ]);
  }
  return membersByWs.get(wsId);
}
const WS_NAMES = { "ws-1": "Gomly Demo" };
const TEAM_NAMES = { "team-1": "Engineering", "team-2": "Operations" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const body = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);

  // GET /workspaces/:ws/intake-email
  if (req.method === "GET" && parts[0] === "workspaces" && parts[2] === "intake-email") {
    return send(res, 200, { address: `intake+${parts[1]}@in.gomly.dev` });
  }

  // Issues collection
  if (parts[0] === "workspaces" && parts[2] === "issues") {
    const wsId = parts[1];
    if (req.method === "POST") {
      const teamId = body.teamId ?? "team-1";
      const n = (keyCounters.get(teamId) ?? 0) + 1;
      keyCounters.set(teamId, n);
      const issue = {
        id: nid("iss"),
        workspaceId: wsId,
        teamId,
        key: `${TEAM_KEYS[teamId] ?? "DEV"}-${n}`,
        title: body.title,
        description: body.description ?? null,
        status: "TODO",
        statusGroup: "TODO",
        priority: body.priority ?? "NONE",
        labels: body.labels ?? [],
        assigneeId: body.assigneeId ?? null,
        estimate: null,
        dueDate: body.dueDate ?? null,
        cycleId: body.cycleId ?? null,
        projectId: body.projectId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      issues.set(issue.id, issue);
      return send(res, 201, issue);
    }
    if (req.method === "GET") {
      let list = [...issues.values()].filter((i) => i.workspaceId === wsId);
      const f = Object.fromEntries(url.searchParams);
      if (f.teamId) list = list.filter((i) => i.teamId === f.teamId);
      if (f.status) list = list.filter((i) => i.status === f.status);
      if (f.statusGroup) list = list.filter((i) => i.statusGroup === f.statusGroup);
      if (f.assigneeId) list = list.filter((i) => i.assigneeId === f.assigneeId);
      if (f.projectId) list = list.filter((i) => i.projectId === f.projectId);
      if (f.cycleId) list = list.filter((i) => i.cycleId === f.cycleId);
      if (f.q) {
        const q = f.q.toLowerCase();
        list = list.filter(
          (i) => i.title.toLowerCase().includes(q) || i.key.toLowerCase() === q,
        );
      }
      return send(res, 200, list);
    }
  }

  // Issue detail / comments
  if (parts[0] === "issues") {
    const issue = issues.get(parts[1]);
    if (parts[2] === "comments") {
      if (!issue) return send(res, 404, { message: "Issue not found" });
      if (req.method === "GET") return send(res, 200, comments.get(issue.id) ?? []);
      if (req.method === "POST") {
        const c = {
          id: nid("cmt"),
          issueId: issue.id,
          authorId: "user-1",
          content: body.content,
          createdAt: new Date().toISOString(),
        };
        const list = comments.get(issue.id) ?? [];
        list.push(c);
        comments.set(issue.id, list);
        return send(res, 201, c);
      }
    }
    if (!issue) return send(res, 404, { message: "Issue not found" });
    if (req.method === "GET") return send(res, 200, issue);
    if (req.method === "PATCH") {
      Object.assign(issue, body);
      if (body.status) issue.statusGroup = groupOf(body.status);
      issue.updatedAt = new Date().toISOString();
      return send(res, 200, issue);
    }
    if (req.method === "DELETE") {
      issues.delete(issue.id);
      return send(res, 200, { deleted: true });
    }
  }

  // Cycles collection
  if (parts[0] === "workspaces" && parts[2] === "cycles") {
    const wsId = parts[1];
    if (req.method === "POST") {
      const cycle = {
        id: nid("cyc"),
        workspaceId: wsId,
        teamId: body.teamId,
        name: body.name ?? null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        closedAt: null,
      };
      cycles.set(cycle.id, cycle);
      return send(res, 201, cycle);
    }
    if (req.method === "GET") {
      let list = [...cycles.values()].filter((c) => c.workspaceId === wsId);
      const teamId = url.searchParams.get("teamId");
      if (teamId) list = list.filter((c) => c.teamId === teamId);
      return send(
        res,
        200,
        list.map((c) => ({
          ...c,
          progress: progressOf([...issues.values()].filter((i) => i.cycleId === c.id)),
        })),
      );
    }
  }

  // Cycle detail / issues / close
  if (parts[0] === "cycles") {
    const cycle = cycles.get(parts[1]);
    if (!cycle) return send(res, 404, { message: "Cycle not found" });
    if (parts[2] === "close" && req.method === "POST") {
      cycle.closedAt = new Date().toISOString();
      const inCycle = [...issues.values()].filter((i) => i.cycleId === cycle.id);
      const rolled = inCycle.filter((i) => groupOf(i.status) !== "DONE" && groupOf(i.status) !== "CANCELED");
      let nextCycleId = null;
      if (body.createNext) {
        const start = new Date(cycle.endsAt);
        const end = new Date(start);
        end.setDate(end.getDate() + 14);
        const next = {
          id: nid("cyc"),
          workspaceId: cycle.workspaceId,
          teamId: cycle.teamId,
          name: cycle.name,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          closedAt: null,
        };
        cycles.set(next.id, next);
        nextCycleId = next.id;
        for (const i of rolled) i.cycleId = next.id;
      }
      return send(res, 200, { nextCycleId, rolledIssueIds: rolled.map((i) => i.id) });
    }
    if (parts[2] === "issues") {
      if (req.method === "POST") {
        const issue = issues.get(body.issueId);
        if (!issue) return send(res, 404, { message: "Issue not found" });
        issue.cycleId = cycle.id;
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        const issue = issues.get(parts[3]);
        if (issue && issue.cycleId === cycle.id) issue.cycleId = null;
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === "GET") {
      const list = [...issues.values()].filter((i) => i.cycleId === cycle.id);
      return send(res, 200, { ...cycle, issues: list, progress: progressOf(list) });
    }
  }

  // Projects collection
  if (parts[0] === "workspaces" && parts[2] === "projects") {
    const wsId = parts[1];
    if (req.method === "POST") {
      const project = {
        id: nid("prj"),
        workspaceId: wsId,
        name: body.name,
        description: body.description ?? null,
        targetDate: body.targetDate ?? null,
      };
      projects.set(project.id, project);
      return send(res, 201, project);
    }
    if (req.method === "GET") {
      const list = [...projects.values()].filter((p) => p.workspaceId === wsId);
      return send(
        res,
        200,
        list.map((p) => ({
          ...p,
          progress: progressOf([...issues.values()].filter((i) => i.projectId === p.id)),
        })),
      );
    }
  }

  // Project detail / issues
  if (parts[0] === "projects") {
    const project = projects.get(parts[1]);
    if (!project) return send(res, 404, { message: "Project not found" });
    if (parts[2] === "issues") {
      if (req.method === "POST") {
        const issue = issues.get(body.issueId);
        if (!issue) return send(res, 404, { message: "Issue not found" });
        issue.projectId = project.id;
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        const issue = issues.get(parts[3]);
        if (issue && issue.projectId === project.id) issue.projectId = null;
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === "GET") {
      const list = [...issues.values()].filter((i) => i.projectId === project.id);
      return send(res, 200, { ...project, issues: list, progress: progressOf(list) });
    }
    if (req.method === "PATCH") {
      Object.assign(project, body);
      return send(res, 200, project);
    }
  }

  // Notifications (Wave 2)
  if (parts[0] === "notifications") {
    if (req.method === "GET" && parts[1] === "unread-count") {
      const count = notifications.filter((n) => !n.readAt).length;
      return send(res, 200, { count });
    }
    if (req.method === "POST" && parts[1] === "read-all") {
      let updated = 0;
      for (const n of notifications) {
        if (!n.readAt) {
          n.readAt = new Date().toISOString();
          updated++;
        }
      }
      return send(res, 200, { updated });
    }
    if (req.method === "PATCH" && parts[2] === "read") {
      const n = notifications.find((x) => x.id === parts[1]);
      if (!n) return send(res, 404, { message: "Notification not found" });
      if (!n.readAt) n.readAt = new Date().toISOString();
      return send(res, 200, n);
    }
    if (req.method === "GET" && parts.length === 1) {
      let list = [...notifications].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      if (url.searchParams.get("unreadOnly") === "true") {
        list = list.filter((n) => !n.readAt);
      }
      const limit = Number(url.searchParams.get("limit"));
      if (limit > 0) list = list.slice(0, limit);
      return send(res, 200, list);
    }
  }

  // My Issues (Wave 2): issue được gán cho user của token mẫu = user-1
  if (parts[0] === "me" && parts[1] === "issues" && req.method === "GET") {
    let list = [...issues.values()].filter((i) => i.assigneeId === "user-1");
    const sg = url.searchParams.get("statusGroup");
    if (sg) list = list.filter((i) => i.statusGroup === sg);
    const ws = url.searchParams.get("workspaceId");
    if (ws) list = list.filter((i) => i.workspaceId === ws);
    return send(res, 200, list);
  }

  // ---- Wave 3 routes ----
  // Capture links của workspace
  if (parts[0] === "workspaces" && parts[2] === "capture-links") {
    const wsId = parts[1];
    if (req.method === "POST" && parts.length === 3) {
      const link = {
        id: nid("cap"),
        token: `tok-${Math.random().toString(36).slice(2, 10)}${seq}`,
        teamId: body.teamId ?? null,
        label: body.label ?? null,
        workspaceId: wsId,
        createdAt: new Date().toISOString(),
      };
      link.path = `/capture/${link.token}`;
      captureLinks.push(link);
      return send(res, 201, link);
    }
    if (req.method === "GET" && parts.length === 3) {
      return send(
        res,
        200,
        captureLinks.filter((l) => l.workspaceId === wsId),
      );
    }
    if (req.method === "DELETE" && parts.length === 4) {
      const idx = captureLinks.findIndex(
        (l) => l.id === parts[3] && l.workspaceId === wsId,
      );
      if (idx === -1) return send(res, 404, { message: "Capture link not found" });
      captureLinks.splice(idx, 1);
      return send(res, 200, { ok: true });
    }
  }

  // Capture công khai theo token (không cần auth)
  if (parts[0] === "capture" && parts[1]) {
    const link = captureLinks.find((l) => l.token === parts[1]);
    if (req.method === "GET" && parts[2] === "info") {
      if (!link) return send(res, 404, { message: "Capture link not found" });
      return send(res, 200, {
        workspaceName: WS_NAMES[link.workspaceId] ?? "Workspace",
        teamName: link.teamId ? (TEAM_NAMES[link.teamId] ?? null) : null,
      });
    }
    if (req.method === "POST" && parts.length === 2) {
      if (!link) return send(res, 404, { message: "Capture link not found" });
      captureSubmissions.push({
        token: link.token,
        senderName: body.senderName,
        title: body.title,
        content: body.content,
        website: body.website ?? "",
        at: new Date().toISOString(),
      });
      return send(res, 201, { ok: true });
    }
  }

  // Thành viên workspace
  if (parts[0] === "workspaces" && parts[2] === "members") {
    const wsId = parts[1];
    const list = seedMembers(wsId);
    if (req.method === "GET" && parts.length === 3) {
      return send(res, 200, list);
    }
    if (req.method === "POST" && parts.length === 3) {
      const known = USER_DIRECTORY[String(body.email ?? "").toLowerCase()];
      if (!known) return send(res, 404, { message: "User not found" });
      if (list.some((m) => m.userId === known.id)) {
        return send(res, 409, { message: "Already a member" });
      }
      const member = {
        userId: known.id,
        email: String(body.email).toLowerCase(),
        name: known.name,
        avatarUrl: null,
        role: body.role ?? "MEMBER",
        joinedAt: new Date().toISOString(),
      };
      list.push(member);
      return send(res, 201, member);
    }
    if (req.method === "DELETE" && parts.length === 4) {
      const idx = list.findIndex((m) => m.userId === parts[3]);
      if (idx === -1) return send(res, 404, { message: "Member not found" });
      list.splice(idx, 1);
      return send(res, 200, { ok: true });
    }
  }

  // Cấu hình tích hợp (Wave 3 — công tắc bắt tin nhắn kênh Slack)
  if (
    parts[0] === "workspaces" &&
    parts[2] === "integrations" &&
    parts[4] === "config" &&
    req.method === "PATCH"
  ) {
    return send(res, 200, { ok: true, config: body });
  }

  return send(res, 404, { message: `No mock route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`mock-api listening on :${PORT}`);
});

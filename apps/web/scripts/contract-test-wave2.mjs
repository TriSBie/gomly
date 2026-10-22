/**
 * Contract test Wave 2: chạy mock API (scripts/mock-api.mjs, đã có route
 * notifications + /me/issues) rồi dùng CHÍNH src/lib/api.ts (transpile tại
 * chỗ) để đi các flow: notifications (list → unread-count → read → read-all),
 * my issues (gán cho tôi → lọc statusGroup/workspaceId), và tìm kiếm issue
 * phục vụ Command Palette (q theo tiêu đề + theo key).
 * Chạy: node scripts/contract-test-wave2.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const ts = require(path.resolve(webRoot, "../../node_modules/typescript"));

const PORT = 4101;
process.env.NEXT_PUBLIC_API_URL = `http://localhost:${PORT}`;

// Shim localStorage cho api.ts (vốn chạy ở browser)
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

// Transpile src/lib/api.ts → CJS rồi require
const src = fs.readFileSync(path.join(webRoot, "src/lib/api.ts"), "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const tmpDir = path.join(here, ".tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpFile = path.join(tmpDir, "api.cjs");
fs.writeFileSync(tmpFile, outputText);
const api = require(tmpFile);
api.saveTokens({
  accessToken: "test-token",
  user: { id: "user-1", email: "dev@gomly.dev", name: "Dev" },
});

// Khởi động mock
const mock = spawn("node", [path.join(here, "mock-api.mjs")], {
  env: { ...process.env, MOCK_PORT: String(PORT) },
  stdio: "pipe",
});

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

async function waitForMock() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/notifications/unread-count`);
      if (r.ok) return;
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("mock không khởi động được");
}

const WS = "ws-1";
const TEAM = "team-1";

try {
  await waitForMock();

  console.log("— Notifications —");
  check("unread-count ban đầu = 3", (await api.fetchUnreadCount()) === 3);
  const all = await api.fetchNotifications();
  check("list notifications = 4", all.length === 4);
  check(
    "mới nhất trước (ntf-1 đầu tiên)",
    all[0]?.id === "ntf-1" && all[3]?.id === "ntf-4",
  );
  check(
    "notification có type + actor + readAt",
    all[0]?.type === "ASSIGNED" &&
      all[0]?.actor?.name === "Lan" &&
      all[0]?.readAt === null,
  );
  const unread = await api.fetchNotifications({ unreadOnly: true });
  check("unreadOnly → 3", unread.length === 3);
  const limited = await api.fetchNotifications({ limit: 2 });
  check("limit=2 → 2", limited.length === 2);
  const marked = await api.markNotificationRead("ntf-1");
  check("mark read → readAt khác null", Boolean(marked.readAt));
  check("unread-count sau read = 2", (await api.fetchUnreadCount()) === 2);
  await api.markAllNotificationsRead();
  check("sau read-all: unread-count = 0", (await api.fetchUnreadCount()) === 0);
  check(
    "sau read-all: unreadOnly → 0",
    (await api.fetchNotifications({ unreadOnly: true })).length === 0,
  );
  check(
    "sau read-all: list vẫn đủ 4",
    (await api.fetchNotifications()).length === 4,
  );

  console.log("— My Issues —");
  const mine = await api.createIssue(WS, {
    teamId: TEAM,
    title: "Việc được gán cho tôi",
    assigneeId: "user-1",
  });
  await api.createIssue(WS, { teamId: TEAM, title: "Việc không gán ai" });
  await api.createIssue(WS, {
    teamId: TEAM,
    title: "Việc của người khác",
    assigneeId: "user-9",
  });
  let my = await api.fetchMyIssues();
  check(
    "my issues chỉ có việc gán cho user-1",
    my.length === 1 && my[0].id === mine.id,
  );
  await api.updateIssue(mine.id, { status: "DONE" });
  my = await api.fetchMyIssues({ statusGroup: "DONE" });
  check(
    "lọc statusGroup=DONE → có việc của tôi",
    my.length === 1 && my[0].id === mine.id,
  );
  my = await api.fetchMyIssues({ statusGroup: "TODO" });
  check("lọc statusGroup=TODO → 0", my.length === 0);
  my = await api.fetchMyIssues({ workspaceId: WS });
  check("lọc workspaceId đúng → 1", my.length === 1);
  my = await api.fetchMyIssues({ workspaceId: "ws-khac" });
  check("lọc workspaceId khác → 0", my.length === 0);

  console.log("— Tìm kiếm cho Command Palette —");
  let found = await api.fetchIssues(WS, { q: "được gán" });
  check(
    "q theo tiêu đề → tìm thấy issue",
    found.some((i) => i.id === mine.id),
  );
  found = await api.fetchIssues(WS, { q: mine.key });
  check(
    "q theo key → đúng issue",
    found.length === 1 && found[0].id === mine.id,
  );
} catch (err) {
  fail++;
  failures.push(`exception: ${err?.message ?? err}`);
  console.error("EXCEPTION:", err);
} finally {
  mock.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
if (failures.length) console.log("Thất bại:", failures);
process.exit(fail ? 1 : 0);

/**
 * Contract test Wave 1: chạy mock API (scripts/mock-api.mjs) rồi dùng CHÍNH
 * src/lib/api.ts (transpile tại chỗ) để đi các flow chính:
 * issues (tạo → lọc → PATCH → comment → xóa), cycles (tạo → gắn → progress →
 * đóng + lăn việc), projects (tạo → gắn → progress → sửa → gỡ), intake-email.
 * Chạy: node scripts/contract-test.mjs
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

const PORT = 4100;
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
      const r = await fetch(`http://localhost:${PORT}/workspaces/ws-1/intake-email`);
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

  console.log("— Intake email —");
  const intake = await api.fetchIntakeEmail(WS);
  check("fetchIntakeEmail trả địa chỉ có @", intake.address.includes("@"));

  console.log("— Issues —");
  const i1 = await api.createIssue(WS, { teamId: TEAM, title: "Sửa lỗi đăng nhập", priority: "HIGH" });
  check("tạo issue 1 → key DEV-1", i1.key === "DEV-1");
  const i2 = await api.createIssue(WS, { teamId: TEAM, title: "Viết test cho API" });
  check("tạo issue 2 → key DEV-2", i2.key === "DEV-2");
  let list = await api.fetchIssues(WS, {});
  check("danh sách có 2 issue", list.length === 2);
  list = await api.fetchIssues(WS, { q: "đăng nhập" });
  check("lọc q theo tiêu đề → 1", list.length === 1 && list[0].id === i1.id);
  list = await api.fetchIssues(WS, { q: "DEV-2" });
  check("lọc q theo key → issue 2", list.length === 1 && list[0].id === i2.id);
  list = await api.fetchIssues(WS, { teamId: "team-2" });
  check("lọc teamId khác → 0", list.length === 0);
  const patched = await api.updateIssue(i1.id, { status: "IN_PROGRESS" });
  check("PATCH status → IN_PROGRESS", patched.status === "IN_PROGRESS");
  check("PATCH status → statusGroup IN_PROGRESS", patched.statusGroup === "IN_PROGRESS");
  const detail = await api.fetchIssue(i1.id);
  check("GET chi tiết giữ status mới", detail.status === "IN_PROGRESS");
  const patched2 = await api.updateIssue(i1.id, { priority: "URGENT", labels: ["bug", "auth"], assigneeId: "user-9" });
  check("PATCH priority/labels/assignee", patched2.priority === "URGENT" && patched2.labels.includes("bug") && patched2.assigneeId === "user-9");
  const cmt = await api.addComment(i1.id, "Đã tái hiện được lỗi.");
  check("đăng comment → có id + content", Boolean(cmt.id) && cmt.content.includes("tái hiện"));
  const comments = await api.fetchComments(i1.id);
  check("đọc comments → 1", comments.length === 1);

  console.log("— Cycles —");
  const cycle = await api.createCycle(WS, {
    teamId: TEAM,
    name: "Sprint 1",
    startsAt: "2026-10-19T00:00:00.000Z",
    endsAt: "2026-11-02T00:00:00.000Z",
  });
  check("tạo cycle có id + tên", Boolean(cycle.id) && cycle.name === "Sprint 1");
  await api.addIssueToCycle(cycle.id, i1.id);
  await api.addIssueToCycle(cycle.id, i2.id);
  let cycDetail = await api.fetchCycle(cycle.id);
  check("chi tiết cycle có 2 issue", (cycDetail.issues ?? []).length === 2);
  check("progress cycle: 0/2 = 0%", cycDetail.progress?.totalIssues === 2 && cycDetail.progress?.progressPercent === 0);
  await api.updateIssue(i1.id, { status: "DONE" });
  let cycList = await api.fetchCycles(WS, TEAM);
  const listed = cycList.find((c) => c.id === cycle.id);
  check("list cycles progress: 1/2 = 50%", listed?.progress?.doneIssues === 1 && listed?.progress?.progressPercent === 50);
  const closeRes = await api.closeCycle(cycle.id);
  check("đóng cycle → có nextCycleId", Boolean(closeRes.nextCycleId));
  check("lăn việc: chỉ issue chưa xong (i2)", (closeRes.rolledIssueIds ?? []).join() === i2.id);
  const nextDetail = await api.fetchCycle(closeRes.nextCycleId);
  check("cycle kế chứa issue đã lăn", (nextDetail.issues ?? []).some((i) => i.id === i2.id));
  await api.removeIssueFromCycle(closeRes.nextCycleId, i2.id);
  const nextAfter = await api.fetchCycle(closeRes.nextCycleId);
  check("gỡ issue khỏi cycle kế → 0 issue", (nextAfter.issues ?? []).length === 0);

  console.log("— Projects —");
  const project = await api.createProject(WS, { name: "Ra mắt beta", targetDate: "2026-12-01T00:00:00.000Z" });
  check("tạo project có id", Boolean(project.id));
  await api.addIssueToProject(project.id, i1.id);
  await api.addIssueToProject(project.id, i2.id);
  let prjDetail = await api.fetchProject(project.id);
  check("chi tiết project có 2 issue", (prjDetail.issues ?? []).length === 2);
  const prjList = await api.fetchProjects(WS);
  const prjListed = prjList.find((p) => p.id === project.id);
  check("progress project: 1/2 = 50%", prjListed?.progress?.doneIssues === 1 && prjListed?.progress?.progressPercent === 50);
  const renamed = await api.updateProject(project.id, { name: "Ra mắt beta v2" });
  check("PATCH project đổi tên", renamed.name === "Ra mắt beta v2");
  await api.removeIssueFromProject(project.id, i2.id);
  prjDetail = await api.fetchProject(project.id);
  check("gỡ issue khỏi project → còn 1", (prjDetail.issues ?? []).length === 1);

  console.log("— Xóa issue —");
  await api.deleteIssue(i2.id);
  let threw404 = false;
  try {
    await api.fetchIssue(i2.id);
  } catch (err) {
    threw404 = err?.status === 404;
  }
  check("GET issue đã xóa → 404", threw404);
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

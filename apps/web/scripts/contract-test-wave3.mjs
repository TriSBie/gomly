/**
 * Contract test Wave 3: chạy mock API (scripts/mock-api.mjs, đã có route
 * capture-links + members + capture công khai) rồi dùng CHÍNH src/lib/api.ts
 * (transpile tại chỗ) để đi các flow:
 * - Capture links: tạo → list → info công khai → submit công khai (kèm
 *   honeypot) → xóa link → info trả 404.
 * - Members: list → thêm (201) → trùng (409) → email chưa có tài khoản (404)
 *   → xóa → list cập nhật.
 * - updateIntegrationConfig (PATCH config Slack) trả ok.
 * Chạy: node scripts/contract-test-wave3.mjs
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

const PORT = 4102;
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

async function expectStatus(name, promise, status) {
  try {
    await promise;
    check(`${name} (kỳ vọng lỗi ${status}, thực tế thành công)`, false);
  } catch (err) {
    check(name, err?.status === status);
  }
}

async function waitForMock() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/workspaces/ws-1/members`);
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

  console.log("— Capture links —");
  const link = await api.createCaptureLink(WS, { teamId: TEAM, label: "Zalo group" });
  check("tạo link → có token + id", Boolean(link.token) && Boolean(link.id));
  check("tạo link → path trỏ đúng token", String(link.path ?? "").includes(link.token));
  let links = await api.fetchCaptureLinks(WS);
  check("list links → có link vừa tạo", links.some((l) => l.id === link.id));

  console.log("— Capture công khai —");
  const info = await api.fetchCaptureInfo(link.token);
  check(
    "info công khai → workspaceName + teamName",
    info.workspaceName === "Gomly Demo" && info.teamName === "Engineering",
  );
  const submitted = await api.submitCapture(link.token, {
    senderName: "Chị Lan",
    title: "Cần báo giá bảo trì",
    content: "Gửi báo giá trước thứ 6 giúp em.",
    website: "",
  });
  check("submit công khai → 201 {ok:true}", submitted?.ok === true);
  const botSubmit = await api.submitCapture(link.token, {
    senderName: "Bot",
    title: "Spam",
    content: "Spam content",
    website: "http://spam.example",
  });
  check("submit kèm honeypot → vẫn trả {ok:true} (backend tự lọc)", botSubmit?.ok === true);
  await expectStatus(
    "info token sai → 404",
    api.fetchCaptureInfo("token-khong-ton-tai"),
    404,
  );
  await expectStatus(
    "submit token sai → 404",
    api.submitCapture("token-khong-ton-tai", {
      senderName: "A",
      title: "B",
      content: "C",
    }),
    404,
  );

  console.log("— Xóa link capture —");
  await api.deleteCaptureLink(WS, link.id);
  links = await api.fetchCaptureLinks(WS);
  check("sau xóa → list không còn link", !links.some((l) => l.id === link.id));
  await expectStatus(
    "info link đã thu hồi → 404",
    api.fetchCaptureInfo(link.token),
    404,
  );

  console.log("— Members —");
  let members = await api.fetchMembers(WS);
  check("list members → 2 người seed", members.length === 2);
  check(
    "member có userId/email/role/joinedAt",
    Boolean(members[0].userId && members[0].email && members[0].role && members[0].joinedAt),
  );
  check("member đầu là OWNER", members[0].role === "OWNER");
  const added = await api.addMember(WS, { email: "new@gomly.dev", role: "ADMIN" });
  check(
    "thêm member → trả member đúng email + role",
    added.email === "new@gomly.dev" && added.role === "ADMIN",
  );
  members = await api.fetchMembers(WS);
  check("sau thêm → 3 members", members.length === 3);
  await expectStatus(
    "thêm trùng → 409",
    api.addMember(WS, { email: "new@gomly.dev" }),
    409,
  );
  await expectStatus(
    "thêm email chưa có tài khoản → 404",
    api.addMember(WS, { email: "ghost@gomly.dev" }),
    404,
  );
  await api.removeMember(WS, added.userId);
  members = await api.fetchMembers(WS);
  check(
    "sau xóa → 2 members, không còn người vừa thêm",
    members.length === 2 && !members.some((m) => m.userId === added.userId),
  );

  console.log("— Cấu hình tích hợp —");
  const cfg = await api.updateIntegrationConfig(WS, "conn-1", {
    captureChannelMessages: true,
  });
  check("PATCH config Slack → ok", cfg?.ok === true);
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

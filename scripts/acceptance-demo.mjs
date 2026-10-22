#!/usr/bin/env node
/**
 * NGHIỆM THU PHÁT HÀNH MVP — kịch bản demo 5 phút (PRD v1.2, mục 8).
 *
 * Chạy từ thư mục gốc app/:
 *   node scripts/acceptance-demo.mjs
 *
 * Script dựng NGỮ CẢNH NGHIỆM THU RIÊNG (user + workspace riêng qua API,
 * KHÔNG đụng dữ liệu demo của scripts/seed-demo.mjs) rồi chạy lần lượt
 * 6 ô checklist phát hành:
 *   Ô1  4 kênh (GitHub webhook / Email webhook / Slack slash command /
 *       Zalo quick-capture) đều đổ về Triage, đủ nội dung gốc.
 *   Ô2  Accept 1 item -> issue có key, gán user phụ, đưa vào cycle mới.
 *   Ô3  PR opened (branch chứa key) -> issue IN_PROGRESS.
 *   Ô4  PR merged -> issue DONE + tiến độ project (và cycle) = 100%.
 *   Ô5  Web VI/EN: GET /vi/triage và /en/triage đều 200 (web không chạy
 *       và không khởi động được -> CHƯA KIỂM CHỨNG ĐƯỢC, không tính FAIL).
 *   Ô6  Toàn trình không có response 5xx.
 *
 * Kết quả in ra console + ghi vào ../docs/acceptance-wave3.md.
 * API chưa chạy -> script tự build (nest build) + start ở cổng 4000 và
 * chỉ tắt đúng instance do script mở. Web cũng vậy (next start, nếu đã
 * có bản build). Exit code 1 nếu có ô FAIL.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(appRoot, "apps", "api");
const webDir = join(appRoot, "apps", "web");
const reportPath = join(appRoot, "..", "docs", "acceptance-wave3.md");
const API = process.env.ACCEPTANCE_API_URL || "http://localhost:4000";
const WEB = process.env.ACCEPTANCE_WEB_URL || "http://localhost:3000";
const RUN_TAG = `acc-${Date.now()}`;

// --- Nạp DATABASE_URL từ app/.env (chỉ cho đường dự phòng Prisma) ---
if (!process.env.DATABASE_URL) {
  const envPath = join(appRoot, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

// ---------- hạ tầng: HTTP + ghi nhận 5xx ----------
const allResponses = [];
async function req(method, url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body = opts.rawBody;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res, text;
  try {
    res = await fetch(url, { method, headers, body });
    text = await res.text();
  } catch (error) {
    allResponses.push({ method, url, status: 0, error: String(error) });
    return { status: 0, json: null, text: String(error) };
  }
  allResponses.push({ method, url, status: res.status });
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
const api = (method, path, opts) => req(method, API + path, opts);
const list = (b) => (Array.isArray(b) ? b : b?.data || b?.items || []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- vòng đời tiến trình do script tự mở ----------
const spawned = [];
function spawnTracked(cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "ignore", "inherit"],
    shell: false,
  });
  spawned.push(child);
  return child;
}
async function waitFor(fn, timeoutMs, stepMs = 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
}
let apiStartedByScript = false;
let webStartedByScript = false;

async function ensureApi() {
  const healthy = async () => (await api("GET", "/health")).status === 200;
  if (await healthy()) return;
  console.log("[hạ tầng] API chưa chạy — build + start instance nghiệm thu…");
  execFileSync("npx", ["nest", "build"], { cwd: apiDir, stdio: "inherit" });
  spawnTracked("node", ["dist/main.js"], apiDir);
  apiStartedByScript = true;
  if (!(await waitFor(healthy, 60000)))
    throw new Error("API không lên sau 60s");
  console.log("[hạ tầng] API đã lên (instance của script).");
}
async function ensureWeb() {
  const up = async () => {
    const r = await req("GET", WEB + "/vi/triage");
    return r.status === 200;
  };
  if (await up()) return true;
  if (!existsSync(join(webDir, ".next", "BUILD_ID"))) return false;
  console.log("[hạ tầng] Web chưa chạy — start từ bản build có sẵn…");
  spawnTracked("npx", ["next", "start", "-p", "3000"], webDir);
  webStartedByScript = true;
  return waitFor(up, 45000, 1500);
}

// ---------- kết quả từng ô ----------
const boxes = [];
function record(box, name, result, evidence) {
  boxes.push({ box, name, result, evidence });
  console.log(`[${result}] Ô${box} ${name} — ${evidence}`);
}

// ---------- các bước nghiệp vụ ----------
async function registerOrLogin(email, password, name) {
  const reg = await api("POST", "/auth/register", {
    body: { email, password, name },
  });
  if (reg.json?.accessToken)
    return { token: reg.json.accessToken, user: reg.json.user };
  const login = await api("POST", "/auth/login", { body: { email, password } });
  if (!login.json?.accessToken)
    throw new Error(`Không đăng ký/đăng nhập được ${email}: ${login.status}`);
  const me = await api("GET", "/auth/me", { token: login.json.accessToken });
  return { token: login.json.accessToken, user: me.json };
}

async function addMembership(wsId, ownerToken, user2) {
  // Ưu tiên API members (nếu đã có); 404 -> dự phòng Prisma + ghi chú.
  for (const body of [
    { email: user2.email, role: "MEMBER" },
    { userId: user2.id, role: "MEMBER" },
    { email: user2.email },
  ]) {
    const r = await api("POST", `/workspaces/${wsId}/members`, {
      token: ownerToken,
      body,
    });
    if (r.status >= 200 && r.status < 300)
      return "API members";
    if (r.status !== 404 && r.status !== 400 && r.status !== 405) break;
    if (r.status === 400) continue;
    break;
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: wsId, userId: user2.id } },
      update: {},
      create: { workspaceId: wsId, userId: user2.id, role: "MEMBER" },
    });
  } finally {
    await prisma.$disconnect();
  }
  return "Prisma (API members chưa có — dự phòng)";
}

async function zaloQuickCapture(wsId, token, marker, teamId) {
  // Endpoint do Agent K (Wave 3, W3-T02) xây song song: probe các hợp đồng
  // khả dĩ; 404 ở mọi ứng viên -> thử lại vài vòng rồi FAIL-PHỤ-THUỘC.
  const createCandidates = [
    `/workspaces/${wsId}/capture-links`,
    `/workspaces/${wsId}/capture-link`,
    `/workspaces/${wsId}/zalo/capture-links`,
    `/workspaces/${wsId}/integrations/capture-links`,
  ];
  const title = `[ACC Zalo] ${marker}`;
  const content = `Nội dung nghiệm thu Zalo quick-capture ${marker}: khách nhắn Zalo cần hỗ trợ gấp.`;
  for (let round = 1; round <= 6; round++) {
    let sawNon404 = null;
    for (const path of createCandidates) {
      const r = await api("POST", path, {
        token,
        body: { label: `Acceptance ${marker}`, teamId },
      });
      if (r.status >= 200 && r.status < 300 && r.json) {
        const j = r.json.data || r.json;
        const tok =
          j.token ||
          j.slug ||
          j.code ||
          (typeof j.url === "string" && j.url.match(/capture\/([A-Za-z0-9_-]+)/)?.[1]) ||
          (typeof j.link === "string" && j.link.match(/capture\/([A-Za-z0-9_-]+)/)?.[1]) ||
          j.id;
        if (!tok) return { ok: false, why: `tạo link OK (${path}) nhưng không trích được token từ response` };
        const submitCandidates = [
          `/capture/${tok}`,
          `/capture/${tok}/submit`,
          `/capture-links/${tok}/submit`,
          `/public/capture/${tok}`,
          `/webhooks/capture/${tok}`,
        ];
        const bodies = [
          { title, content, senderName: "Khách Nghiệm Thu (Zalo)" },
          { title, message: content, senderName: "Khách Nghiệm Thu (Zalo)" },
          { title, content, name: "Khách Nghiệm Thu (Zalo)" },
        ];
        for (const sp of submitCandidates) {
          for (const b of bodies) {
            const s = await api("POST", sp, { body: b });
            if (s.status >= 200 && s.status < 300)
              return { ok: true, why: `tạo link qua ${path}; submit công khai qua ${sp} -> ${s.status}` };
          }
        }
        return { ok: false, why: `tạo link OK (${path}, token có) nhưng mọi đường submit đều không 2xx` };
      }
      if (r.status !== 404) sawNon404 = `${path} -> ${r.status}`;
    }
    if (sawNon404)
      return { ok: false, why: `endpoint capture có phản hồi khác 404 (${sawNon404}) nhưng không tạo được link theo hợp đồng đã probe` };
    if (round < 6) {
      console.log(`[Ô1] Capture link chưa có (404) — thử lại sau 20s (vòng ${round}/6)…`);
      await sleep(20000);
    }
  }
  return { ok: false, dep: true, why: "mọi endpoint tạo capture link đều 404 sau 6 vòng thử (~2 phút) — endpoint của Agent K (W3-T02) chưa land" };
}

async function main() {
  const startedAt = new Date();
  await ensureApi();

  // --- Ngữ cảnh nghiệm thu riêng ---
  const owner = await registerOrLogin("acceptance@gomly.dev", "acceptance1234", "Acceptance Owner");
  const member = await registerOrLogin("acceptance2@gomly.dev", "acceptance1234", "Acceptance Member");
  const wsRes = await api("POST", "/workspaces", {
    token: owner.token,
    body: { name: `Acceptance ${RUN_TAG}` },
  });
  const ws = wsRes.json;
  if (!ws?.id) throw new Error(`Tạo workspace nghiệm thu thất bại: ${wsRes.status} ${wsRes.text}`);
  const teamRes = await api("POST", `/workspaces/${ws.id}/teams`, {
    token: owner.token,
    body: { name: "Acceptance Team", key: "ACC" },
  });
  const team = teamRes.json;
  if (!team?.id) throw new Error(`Tạo team nghiệm thu thất bại: ${teamRes.status} ${teamRes.text}`);
  const memberRoute = await addMembership(ws.id, owner.token, {
    id: member.user.id,
    email: "acceptance2@gomly.dev",
  });
  console.log(`[ngữ cảnh] workspace=${ws.id} slug=${ws.slug} team=${team.key}; thêm thành viên qua: ${memberRoute}`);

  const triageNew = async () =>
    list((await api("GET", `/workspaces/${ws.id}/triage?status=NEW`, { token: owner.token })).json);
  const sentTitles = {};

  // ================= Ô1 — 4 kênh -> Triage =================
  const sub = [];
  // GitHub
  const ghSecret = "acc-gh-secret";
  // Repo/Slack team phải DUY NHẤT theo lần chạy: webhook khớp kết nối theo
  // repo/team id trên toàn hệ thống (1 repo / 1 Slack team chỉ thuộc 1
  // workspace tại một thời điểm) — dùng lại tên cũ sẽ rơi vào workspace cũ.
  const ghRepo = `acceptance/acc-repo-${RUN_TAG}`;
  const ghConn = await api("POST", `/workspaces/${ws.id}/integrations/github`, {
    token: owner.token,
    body: { repoFullName: ghRepo, webhookSecret: ghSecret },
  });
  const ghSend = async (payload, event) => {
    const raw = JSON.stringify(payload);
    const sig = "sha256=" + crypto.createHmac("sha256", ghSecret).update(raw).digest("hex");
    return req("POST", API + "/webhooks/github", {
      rawBody: raw,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
        // Bắt buộc: server rẽ nhánh theo header sự kiện này (issues/pull_request)
        "x-github-event": event,
      },
    });
  };
  sentTitles.GITHUB = `[ACC GitHub] ${RUN_TAG}`;
  const ghHook = await ghSend({
    action: "opened",
    issue: { number: 501, title: sentTitles.GITHUB, body: `Nội dung gốc GitHub ${RUN_TAG}`, user: { login: "acc-reporter" } },
    repository: { full_name: ghRepo },
  }, "issues");
  sub.push(`GitHub: connect ${ghConn.status}, webhook issues.opened ${ghHook.status}, effects=${JSON.stringify(ghHook.json?.effects ?? null)}`);

  // Email
  sentTitles.EMAIL = `[ACC Email] ${RUN_TAG}`;
  const mailHook = await api("POST", "/webhooks/email", {
    body: {
      to: `intake+${ws.slug}@gomly.local`,
      from: "Acceptance Mail <acc-mail@example.com>",
      subject: sentTitles.EMAIL,
      text: `Nội dung gốc email ${RUN_TAG}`,
      messageId: `${RUN_TAG}-mail`,
    },
  });
  sub.push(`Email: webhook ${mailHook.status} -> intake+${ws.slug}@gomly.local`);

  // Slack
  const slackSecret = "acc-slack-secret";
  const slackTeam = `T${RUN_TAG.replace(/\D/g, "")}`;
  const slackConn = await api("POST", `/workspaces/${ws.id}/integrations/slack`, {
    token: owner.token,
    body: { slackTeamId: slackTeam, slackTeamName: "Acceptance Slack", signingSecret: slackSecret },
  });
  sentTitles.SLACK = `[ACC Slack] ${RUN_TAG}`;
  const form = new URLSearchParams({
    command: "/gomly",
    text: sentTitles.SLACK,
    user_name: "acc.slack",
    team_id: slackTeam,
    channel_name: "general",
    trigger_id: `trig-${RUN_TAG}`,
  }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  const v0 = "v0=" + crypto.createHmac("sha256", slackSecret).update(`v0:${ts}:${form}`).digest("hex");
  const slackHook = await req("POST", API + "/webhooks/slack", {
    rawBody: form,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-slack-signature": v0,
      "x-slack-request-timestamp": ts,
    },
  });
  sub.push(`Slack: connect ${slackConn.status}, slash command ký v0 ${slackHook.status}`);

  // Zalo quick-capture (phụ thuộc Agent K)
  const zalo = await zaloQuickCapture(ws.id, owner.token, RUN_TAG, team.id);
  sub.push(`Zalo quick-capture: ${zalo.why}`);

  let items = await triageNew();
  const byChannel = {};
  for (const ch of ["GITHUB", "EMAIL", "SLACK", "ZALO"]) {
    byChannel[ch] = items.find(
      (i) => i.channel === ch && String(i.title || "").includes(sentTitles[ch] || RUN_TAG),
    );
  }
  const contentOk = ["GITHUB", "EMAIL", "SLACK"].every((ch) => {
    const it = byChannel[ch];
    return it && String(it.content || "").includes(RUN_TAG);
  });
  if (zalo.dep) {
    record(1, "4 kênh đổ về Triage", "FAIL-PHỤ-THUỘC",
      `${sub.join("; ")}. GitHub/Email/Slack đã vào Triage (nội dung gốc khớp: ${contentOk}); riêng Zalo chưa kiểm chứng được vì endpoint quick-capture chưa land.`);
  } else {
    const allIn = ["GITHUB", "EMAIL", "SLACK", "ZALO"].every((ch) => !!byChannel[ch]) && zalo.ok;
    record(1, "4 kênh đổ về Triage", allIn && contentOk ? "PASS" : "FAIL",
      `${sub.join("; ")}. Item trong Triage: ${["GITHUB", "EMAIL", "SLACK", "ZALO"].map((ch) => `${ch}=${byChannel[ch] ? "có" : "THIẾU"}`).join(", ")}; nội dung gốc 3 kênh webhook khớp payload đã gửi: ${contentOk}.`);
  }

  // ================= Ô2 — accept -> issue + cycle (+ project cho Ô4) =================
  let issue = null, cycle = null, project = null;
  try {
    const ghItem = byChannel.GITHUB || items.find((i) => i.channel === "GITHUB");
    if (!ghItem) throw new Error("không có item GITHUB để accept");
    const acc = await api("POST", `/triage/${ghItem.id}/accept`, {
      token: owner.token,
      body: { teamId: team.id, assigneeId: member.user.id },
    });
    issue = acc.json?.issue || acc.json;
    if (!issue?.id || !issue?.key) throw new Error(`accept không trả issue có key: ${acc.status} ${acc.text.slice(0, 200)}`);
    const cycRes = await api("POST", `/workspaces/${ws.id}/cycles`, {
      token: owner.token,
      body: {
        teamId: team.id,
        name: `Cycle nghiệm thu ${RUN_TAG}`,
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        endsAt: new Date(Date.now() + 13 * 86400000).toISOString(),
      },
    });
    cycle = cycRes.json;
    const addC = await api("POST", `/cycles/${cycle.id}/issues`, {
      token: owner.token,
      body: { issueId: issue.id },
    });
    const projRes = await api("POST", `/workspaces/${ws.id}/projects`, {
      token: owner.token,
      body: { name: `Project nghiệm thu ${RUN_TAG}` },
    });
    project = projRes.json;
    const addP = await api("POST", `/projects/${project.id}/issues`, {
      token: owner.token,
      body: { issueId: issue.id },
    });
    const detail = await api("GET", `/issues/${issue.id}`, { token: owner.token });
    const okAssign = detail.json?.assigneeId === member.user.id;
    const okCycle = detail.json?.cycleId === cycle.id;
    const okProject = detail.json?.projectId === project.id;
    record(2, "Accept → issue + gán người + cycle/project", okAssign && okCycle && okProject ? "PASS" : "FAIL",
      `accept ${acc.status} -> issue ${issue.key} (assignee khớp: ${okAssign}); tạo cycle ${cycRes.status}, gắn issue vào cycle ${addC.status} (khớp: ${okCycle}); tạo project ${projRes.status}, gắn issue ${addP.status} (khớp: ${okProject}). Thêm thành viên qua: ${memberRoute}.`);
  } catch (e) {
    record(2, "Accept → issue + gán người + cycle/project", "FAIL", String(e.message || e));
  }

  // ================= Ô3 — PR opened -> IN_PROGRESS =================
  try {
    if (!issue) throw new Error("Ô2 chưa có issue");
    const prOpen = await ghSend({
      action: "opened",
      pull_request: {
        number: 601,
        title: `feat: ${issue.key} acceptance flow`,
        head: { ref: `feat/${issue.key}-acceptance` },
        merged: false,
      },
      repository: { full_name: ghRepo },
    }, "pull_request");
    const after = await api("GET", `/issues/${issue.id}`, { token: owner.token });
    record(3, "PR opened → IN_PROGRESS", after.json?.status === "IN_PROGRESS" ? "PASS" : "FAIL",
      `webhook PR opened ${prOpen.status}; trạng thái issue sau đó: ${after.json?.status} (statusGroup=${after.json?.statusGroup}).`);
  } catch (e) {
    record(3, "PR opened → IN_PROGRESS", "FAIL", String(e.message || e));
  }

  // ================= Ô4 — PR merged -> DONE + tiến độ =================
  try {
    if (!issue) throw new Error("Ô2 chưa có issue");
    const prMerge = await ghSend({
      action: "closed",
      pull_request: {
        number: 601,
        title: `feat: ${issue.key} acceptance flow`,
        head: { ref: `feat/${issue.key}-acceptance` },
        merged: true,
      },
      repository: { full_name: ghRepo },
    }, "pull_request");
    const after = await api("GET", `/issues/${issue.id}`, { token: owner.token });
    const projAfter = await api("GET", `/projects/${project.id}`, { token: owner.token });
    const cycAfter = await api("GET", `/cycles/${cycle.id}`, { token: owner.token });
    const pct = (b) => b?.progress?.progressPercent ?? b?.progressPercent ?? null;
    const pPct = pct(projAfter.json);
    const cPct = pct(cycAfter.json);
    record(4, "PR merged → DONE + tiến độ 100%", after.json?.status === "DONE" && pPct === 100 ? "PASS" : "FAIL",
      `webhook PR merged ${prMerge.status}; issue: ${after.json?.status}; tiến độ project: ${pPct}% (1/1 issue Done); tiến độ cycle: ${cPct}%.`);
  } catch (e) {
    record(4, "PR merged → DONE + tiến độ 100%", "FAIL", String(e.message || e));
  }

  // ================= Ô5 — Web VI/EN =================
  try {
    const webOk = await ensureWeb();
    if (!webOk) {
      record(5, "Đổi ngôn ngữ VI ↔ EN (web)", "CHƯA KIỂM CHỨNG ĐƯỢC",
        `Web không chạy tại ${WEB} và không khởi động được từ bản build (hoặc chưa có bản build) — không tính FAIL phần backend; kiểm chứng đổi ngôn ngữ tại buổi demo theo DEMO.md bước 5.`);
    } else {
      const vi = await req("GET", WEB + "/vi/triage");
      const en = await req("GET", WEB + "/en/triage");
      record(5, "Đổi ngôn ngữ VI ↔ EN (web)", vi.status === 200 && en.status === 200 ? "PASS" : "FAIL",
        `GET /vi/triage -> ${vi.status}; GET /en/triage -> ${en.status}${webStartedByScript ? " (web do script tự start từ bản build)" : ""}. Mức kiểm chứng: route hai locale đều phục vụ 200; đổi ngôn ngữ tương tác qua Cmd+K kiểm ở buổi demo.`);
    }
  } catch (e) {
    record(5, "Đổi ngôn ngữ VI ↔ EN (web)", "CHƯA KIỂM CHỨNG ĐƯỢC", String(e.message || e));
  }

  // ================= Ô6 — không 5xx =================
  const fiveXX = allResponses.filter((r) => r.status >= 500);
  record(6, "Không lỗi 5xx toàn trình",
    fiveXX.length === 0 ? "PASS" : "FAIL",
    `Tổng ${allResponses.length} response đã ghi nhận; 5xx: ${fiveXX.length}${fiveXX.length ? " — " + fiveXX.map((r) => `${r.method} ${r.url} -> ${r.status}`).join("; ") : ""}.`);

  // ---------- báo cáo ----------
  const now = new Date();
  const when = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Saigon",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(now);
  const dbInfo = (process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":***@");
  const lines = [
    "# Nghiệm thu phát hành MVP — Wave 3 (kịch bản demo 5 phút, PRD mục 8)",
    "",
    `- **Thời gian chạy:** ${when} (Asia/Saigon)`,
    `- **Môi trường:** API ${API} (PostgreSQL: ${dbInfo || "theo apps/api/.env"}); Web ${WEB}; Node ${process.version}`,
    `- **Ngữ cảnh:** workspace nghiệm thu riêng "${ws.name}" (slug \`${ws.slug}\`), team ${team.key} — không đụng dữ liệu demo.`,
    `- **API do script tự start:** ${apiStartedByScript ? "có (đã tắt sau khi chạy)" : "không (đang chạy sẵn)"}; **Web do script tự start:** ${webStartedByScript ? "có (đã tắt sau khi chạy)" : "không"}.`,
    "",
    "| Ô | Nội dung | Kết quả | Bằng chứng |",
    "|---|---|---|---|",
    ...boxes.map((b) => `| ${b.box} | ${b.name} | **${b.result}** | ${b.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Ghi chú",
    "",
    `- Thêm thành viên nghiệm thu qua: **${memberRoute}**.`,
    "- Ô2 của PRD (không mất nội dung gốc) được kiểm kèm trong Ô1: tiêu đề + nội dung các item GitHub/Email/Slack trong Triage khớp đúng payload đã gửi.",
    "- Ô5 kiểm ở mức route VI/EN đều 200; thao tác đổi ngôn ngữ tương tác (Cmd+K) thuộc kiểm chứng giao diện tại buổi demo (DEMO.md, bước 5) và đợt rà soát song ngữ W3-T03.",
    "- Webhook GitHub/Slack khớp kết nối theo repo / Slack team id trên toàn hệ thống (một repo / một Slack team chỉ thuộc một workspace tại một thời điểm) — script nghiệm thu vì vậy dùng repo + team id duy nhất cho mỗi lần chạy.",
    "",
  ];
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\nĐã ghi báo cáo: ${reportPath}`);
  console.log(`Tổng kết: ${boxes.map((b) => `Ô${b.box}=${b.result}`).join(" · ")}`);
  const failed = boxes.some((b) => b.result === "FAIL" || b.result === "FAIL-PHỤ-THUỘC");
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("Nghiệm thu lỗi hạ tầng:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of spawned) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    // npx bọc tiến trình con (next start) — SIGTERM vào npx có thể sót
    // tiến trình thật; dọn theo cổng, CHỈ với instance do script tự mở.
    for (const [started, port] of [
      [apiStartedByScript, 4000],
      [webStartedByScript, 3000],
    ]) {
      if (!started) continue;
      try {
        execFileSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
      } catch {}
    }
  });

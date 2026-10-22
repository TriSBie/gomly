#!/usr/bin/env node
/**
 * Seed dữ liệu demo cho Gomly — chạy từ thư mục gốc app/:
 *
 *   node scripts/seed-demo.mjs
 *
 * Tạo (IDEMPOTENT — chạy lại không tạo trùng):
 *   - Workspace demo "Gomly Demo" (slug: gomly-demo)
 *   - Team key DEV trong workspace đó
 *   - User demo demo@gomly.dev + membership OWNER — CHỈ khi thư viện `argon2`
 *     có trong node_modules (để băm mật khẩu "demo1234" đúng chuẩn argon2id
 *     của kiến trúc). Không có argon2 -> bỏ qua user, chỉ seed workspace/team/intake.
 *   - 4 IntakeItem mẫu, mỗi kênh ZALO / SLACK / EMAIL / GITHUB một cái,
 *     chống trùng bằng dedupeKey "demo:<channel>:v1".
 *   - User phụ demo2@gomly.dev / demo1234, vai trò MEMBER (để demo gán việc
 *     + Inbox hai chiều).
 *   - 1 Project mẫu "Ví điểm thưởng v2" + 1 Cycle đang chạy
 *     "Cycle demo — Sprint hiện tại" + 4 Issue mẫu ở các trạng thái
 *     BACKLOG / TODO / IN_PROGRESS / DONE (chống trùng bằng tiêu đề cố định
 *     trong team DEV) để progress project/cycle hiển thị có ý nghĩa.
 *
 * Yêu cầu: PostgreSQL đang chạy và schema đã được migrate/db push
 * (DATABASE_URL lấy từ biến môi trường hoặc file app/.env).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Nạp .env tối giản (chỉ khi biến chưa có) ---
if (!process.env.DATABASE_URL) {
  const envPath = join(appRoot, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error("Thiếu DATABASE_URL (biến môi trường hoặc app/.env). Dừng seed.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const DEMO_ITEMS = [
  {
    channel: "ZALO",
    dedupeKey: "demo:zalo:v1",
    externalId: "zalo-msg-demo-001",
    senderName: "Chị Lan Anh (khách qua Zalo OA)",
    title: "Khách báo lỗi thanh toán VNPay trên Zalo",
    content:
      "Chị Lan Anh nhắn qua Zalo OA: khách vừa thanh toán VNPay báo thành công nhưng đơn hàng trên web vẫn ở trạng thái chờ thanh toán, khách đang giục vì cần giao hàng trong hôm nay. Nhờ team kiểm tra gấp trước 15h.",
    rawPayload: {
      simulated: true,
      source: "seed-demo",
      event_name: "user_send_text",
      sender: { id: "zalo-user-demo-001", name: "Chị Lan Anh" },
      message: {
        text: "Shop ơi, mình vừa thanh toán VNPay xong mà đơn vẫn báo chưa thanh toán, kiểm tra giúp mình với, mình cần giao hôm nay ạ",
      },
    },
  },
  {
    channel: "SLACK",
    dedupeKey: "demo:slack:v1",
    externalId: "slack-msg-demo-001",
    senderName: "Minh Tuấn (Slack #dev-backend)",
    title: "Nhờ review PR #128: refactor hàng đợi gửi email",
    content:
      "Minh Tuấn nhắn trong kênh #dev-backend: PR #128 refactor hàng đợi gửi email (chuyển sang BullMQ) đã xong, cần 1 người review trước khi merge để kịp bản phát hành tối nay. Ai rảnh vào xem giúp mình với.",
    rawPayload: {
      simulated: true,
      source: "seed-demo",
      event: "message",
      channel: "C_DEV_BACKEND",
      user: "U_MINHTUAN",
      text: "PR #128 refactor email queue xong rồi cả nhà ơi, cần 1 reviewer gấp để merge tối nay",
    },
  },
  {
    channel: "EMAIL",
    dedupeKey: "demo:email:v1",
    externalId: "email-demo-001",
    senderName: "Anh Hùng (đối tác logistics)",
    senderRef: "hung@logistics-partner.vn",
    title: "Đề xuất tính năng: xuất báo cáo tồn kho theo tuần",
    content:
      "Đối tác logistics gửi email đề xuất: cần xuất báo cáo tồn kho theo tuần (file Excel) để đối chiếu với kho vận. Hiện phải xuất tay từng ngày rất mất thời gian và hay lệch số. Mong team cân nhắc đưa vào lộ trình quý này.",
    rawPayload: {
      simulated: true,
      source: "seed-demo",
      from: "hung@logistics-partner.vn",
      subject: "Đề xuất tính năng: báo cáo tồn kho theo tuần",
      snippet:
        "Bên em cần file báo cáo tồn kho theo tuần để đối chiếu kho vận, xuất tay từng ngày mất thời gian quá...",
    },
  },
  {
    channel: "GITHUB",
    dedupeKey: "demo:github:v1",
    externalId: "github-issue-42",
    externalUrl: "https://github.com/gomly-demo/shop-api/issues/42",
    senderName: "trungnguyen-dev (GitHub)",
    title: "[Bug] API /orders trả 500 khi giỏ hàng trống",
    content:
      "Issue mở trên GitHub: gọi POST /orders với giỏ hàng trống trả về lỗi 500 thay vì 400 kèm thông báo rõ ràng. Xảy ra ở bản 1.4.2, có stack trace trong issue. Cần sửa để kiểm tra dữ liệu đầu vào trước khi tạo đơn.",
    rawPayload: {
      simulated: true,
      source: "seed-demo",
      action: "opened",
      issue: {
        number: 42,
        title: "[Bug] API /orders trả 500 khi giỏ hàng trống",
        user: { login: "trungnguyen-dev" },
      },
      repository: { full_name: "gomly-demo/shop-api" },
    },
  },
];

async function main() {
  // 1. Workspace demo
  const workspace = await prisma.workspace.upsert({
    where: { slug: "gomly-demo" },
    update: {},
    create: { name: "Gomly Demo", slug: "gomly-demo" },
  });
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);

  // 2. Team DEV
  const team = await prisma.team.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: "DEV" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Phát triển sản phẩm",
      key: "DEV",
    },
  });
  console.log(`Team: ${team.key} — ${team.name} (${team.id})`);

  // 3. User demo — chỉ khi có argon2 trong node_modules
  let demoUser = null;
  try {
    const argon2Module = await import("argon2");
    const argon2 = argon2Module.default ?? argon2Module;
    const passwordHash = await argon2.hash("demo1234");
    demoUser = await prisma.user.upsert({
      where: { email: "demo@gomly.dev" },
      update: {},
      create: {
        email: "demo@gomly.dev",
        name: "Demo User",
        passwordHash,
        locale: "vi",
      },
    });
    await prisma.membership.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: demoUser.id },
      },
      update: {},
      create: { workspaceId: workspace.id, userId: demoUser.id, role: "OWNER" },
    });
    console.log(
      `User demo: ${demoUser.email} (${demoUser.id}) — mật khẩu "demo1234" (đã băm argon2)`,
    );
  } catch {
    console.log(
      "Bỏ qua user demo: chưa có thư viện argon2 trong node_modules (cài argon2 cho @gomly/api rồi chạy lại seed nếu cần user demo@gomly.dev).",
    );
  }

  // 3b. User phụ demo2 — MEMBER của workspace demo (demo gán việc / Inbox)
  let demo2User = null;
  if (demoUser) {
    try {
      const argon2Module = await import("argon2");
      const argon2 = argon2Module.default ?? argon2Module;
      const passwordHash2 = await argon2.hash("demo1234");
      demo2User = await prisma.user.upsert({
        where: { email: "demo2@gomly.dev" },
        update: {},
        create: {
          email: "demo2@gomly.dev",
          name: "Demo Member",
          passwordHash: passwordHash2,
          locale: "vi",
        },
      });
      await prisma.membership.upsert({
        where: {
          workspaceId_userId: { workspaceId: workspace.id, userId: demo2User.id },
        },
        update: {},
        create: { workspaceId: workspace.id, userId: demo2User.id, role: "MEMBER" },
      });
      console.log(
        `User phụ: ${demo2User.email} (${demo2User.id}) — MEMBER, mật khẩu "demo1234"`,
      );
    } catch {
      console.log("Bỏ qua user phụ demo2 (không băm được mật khẩu argon2).");
    }
  }

  // 4. IntakeItem mẫu theo kênh (idempotent theo dedupeKey)
  for (const def of DEMO_ITEMS) {
    const existing = await prisma.intakeItem.findFirst({
      where: { dedupeKey: def.dedupeKey },
    });
    if (existing) {
      console.log(`Intake ${def.channel}: đã có (${existing.id}), bỏ qua`);
      continue;
    }
    const item = await prisma.intakeItem.create({
      data: {
        workspaceId: workspace.id,
        channel: def.channel,
        triageStatus: "NEW",
        title: def.title,
        content: def.content,
        senderName: def.senderName,
        senderRef: def.senderRef ?? null,
        externalId: def.externalId,
        externalUrl: def.externalUrl ?? null,
        dedupeKey: def.dedupeKey,
        rawPayload: def.rawPayload,
      },
    });
    console.log(`Intake ${def.channel}: đã tạo ${item.id} — "${item.title}"`);
  }

  // 5. Project mẫu + Cycle đang chạy + Issue mẫu đa trạng thái
  //    (idempotent: project/cycle tìm theo tên cố định trong workspace/team;
  //     issue tìm theo tiêu đề cố định trong team — chạy lại không tạo trùng,
  //     không đụng dữ liệu do người dùng tạo thêm)
  const projectName = "Ví điểm thưởng v2";
  let project = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, name: projectName },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: projectName,
        description:
          "Dự án mẫu cho buổi demo: tính năng ví điểm thưởng — khách tích điểm khi mua hàng và đổi điểm sang voucher. Issue mẫu bên dưới cho thấy tiến độ project tự tính theo số issue Done.",
        status: "ACTIVE",
        leadId: demoUser?.id ?? null,
        targetDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    console.log(`Project mẫu: đã tạo "${project.name}" (${project.id})`);
  } else {
    console.log(`Project mẫu: đã có "${project.name}" (${project.id}), bỏ qua`);
  }

  const cycleName = "Cycle demo — Sprint hiện tại";
  let cycle = await prisma.cycle.findFirst({
    where: { workspaceId: workspace.id, teamId: team.id, name: cycleName },
  });
  const cycleStart = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const cycleEnd = new Date(Date.now() + 11 * 24 * 3600 * 1000);
  if (!cycle) {
    cycle = await prisma.cycle.create({
      data: {
        workspaceId: workspace.id,
        teamId: team.id,
        name: cycleName,
        status: "ACTIVE",
        startsAt: cycleStart,
        endsAt: cycleEnd,
      },
    });
    console.log(`Cycle mẫu: đã tạo "${cycle.name}" (${cycle.id})`);
  } else if (cycle.endsAt < new Date() || cycle.status !== "ACTIVE") {
    // Cycle demo đã trôi qua hạn / bị đóng -> làm tươi cửa sổ 2 tuần để buổi
    // demo luôn có 1 cycle đang chạy (chỉ áp cho đúng cycle mẫu của seed).
    cycle = await prisma.cycle.update({
      where: { id: cycle.id },
      data: { status: "ACTIVE", startsAt: cycleStart, endsAt: cycleEnd },
    });
    console.log(`Cycle mẫu: đã làm tươi cửa sổ "${cycle.name}" (${cycle.id})`);
  } else {
    console.log(`Cycle mẫu: đã có "${cycle.name}" (${cycle.id}), bỏ qua`);
  }

  const ISSUE_DEFS = [
    {
      title: "[Demo] Thiết kế màn hình ví điểm thưởng",
      status: "DONE",
      statusGroup: "DONE",
      priority: "MEDIUM",
      assignee: "demo",
      inProject: true,
      inCycle: true,
    },
    {
      title: "[Demo] API quy đổi điểm sang voucher",
      status: "IN_PROGRESS",
      statusGroup: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "demo2",
      inProject: true,
      inCycle: true,
    },
    {
      title: "[Demo] Trang lịch sử giao dịch điểm",
      status: "TODO",
      statusGroup: "TODO",
      priority: "MEDIUM",
      assignee: "demo2",
      inProject: true,
      inCycle: true,
    },
    {
      title: "[Demo] Thông báo đẩy khi điểm sắp hết hạn",
      status: "BACKLOG",
      statusGroup: "BACKLOG",
      priority: "LOW",
      assignee: null,
      inProject: true,
      inCycle: false,
    },
  ];

  async function ensureDemoIssue(def) {
    const existing = await prisma.issue.findFirst({
      where: { teamId: team.id, title: def.title },
    });
    if (existing) return { issue: existing, created: false };
    const assigneeId =
      def.assignee === "demo"
        ? (demoUser?.id ?? null)
        : def.assignee === "demo2"
          ? (demo2User?.id ?? null)
          : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const issue = await prisma.$transaction(async (tx) => {
          const agg = await tx.issue.aggregate({
            where: { teamId: team.id },
            _max: { number: true },
          });
          return tx.issue.create({
            data: {
              workspaceId: workspace.id,
              teamId: team.id,
              number: (agg._max.number ?? 0) + 1,
              title: def.title,
              description:
                "Issue mẫu do seed demo tạo — phục vụ kịch bản trình diễn 5 phút (xem DEMO.md).",
              status: def.status,
              statusGroup: def.statusGroup,
              priority: def.priority,
              assigneeId,
              creatorId: demoUser?.id ?? null,
              projectId: def.inProject ? project.id : null,
              cycleId: def.inCycle ? cycle.id : null,
            },
          });
        });
        return { issue, created: true };
      } catch (error) {
        if (error?.code !== "P2002" || attempt === 4) throw error;
      }
    }
    throw new Error("Không tạo được issue mẫu sau 5 lần thử");
  }

  for (const def of ISSUE_DEFS) {
    const { issue, created } = await ensureDemoIssue(def);
    console.log(
      `Issue mẫu ${def.status}: ${created ? "đã tạo" : "đã có"} DEV-${issue.number} — "${def.title}"`,
    );
  }

  // Tóm tắt kiểm chứng nhanh sau seed
  const [intakeNew, projectIssues, cycleIssues] = await Promise.all([
    prisma.intakeItem.count({
      where: { workspaceId: workspace.id, triageStatus: "NEW" },
    }),
    prisma.issue.findMany({
      where: { projectId: project.id },
      select: { statusGroup: true },
    }),
    prisma.issue.count({ where: { cycleId: cycle.id } }),
  ]);
  const projectDone = projectIssues.filter((i) => i.statusGroup === "DONE").length;
  console.log(
    `Tóm tắt demo: Triage NEW = ${intakeNew} item; Project "${projectName}" = ${projectIssues.length} issue (${projectDone} Done -> tiến độ ${projectIssues.length ? Math.round((projectDone / projectIssues.length) * 100) : 0}%); Cycle mẫu chứa ${cycleIssues} issue.`,
  );

  console.log("Seed demo hoàn tất.");
}

main()
  .catch((error) => {
    console.error("Seed demo lỗi:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

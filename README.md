# Gomly — Monorepo MVP

**Gomly — Mọi việc, về một mối.** Hộp thư công việc hợp nhất cho team dev/startup Việt Nam 2–20 người:
mọi yêu cầu từ Zalo, Slack, email và GitHub đổ về **một Triage duy nhất**, biến thành issue và chạy theo cycle.

> Trạng thái: **Wave 0 đang thi công** — khung monorepo + **auth thật và workspace/team chạy trên DB thật**
> (PostgreSQL + Prisma migrate), đã kiểm chứng end-to-end bằng curl (xem mục kiểm chứng phía dưới).
> Module integrations đã có logic thật từ Wave 1, module notifications từ Wave 2 (xem các mục dưới). Module issues đã có
> logic thật từ Wave 1 (xem mục Issues phía dưới).

## Cấu trúc

```
app/
├── apps/
│   ├── web/            # Next.js (App Router, TypeScript) — giao diện tối, i18n VI/EN (next-intl)
│   └── api/            # NestJS (TypeScript) — REST API, module theo miền
├── packages/
│   └── db/             # Prisma schema dùng chung (@gomly/db)
├── docker-compose.yml  # PostgreSQL 16 + Redis 7 cho môi trường local
├── .env.example        # Biến môi trường mẫu
└── package.json        # npm workspaces: apps/*, packages/*
```

### apps/web
- Routing theo ngôn ngữ: `/vi/...` (mặc định) và `/en/...`, file chuỗi tại `src/messages/vi.json` / `en.json` (64 khóa, khớp 1-1 giữa hai ngôn ngữ).
- Layout có sidebar: Inbox, My Issues, Triage, Issues, Cycles, Projects, Thành viên (đều là route thật và đã dùng thật: Wave 1 cho Issues/Cycles/Projects, Wave 2 cho Inbox/My Issues + Command Palette Cmd+K, Wave 3 cho Thành viên + trang capture công khai `/capture/[token]` không cần đăng nhập).
- Nút chuyển ngôn ngữ VI/EN ở sidebar hoạt động thật (đổi locale giữ nguyên trang).
- **Lát tiền Wave 0 (22/10/2026) — đã nối API thật** theo hợp đồng REST của `apps/api`:
  - `/login`, `/register`: form thật gọi `POST /auth/register|login`; lỗi hiển thị thân thiện (sai mật khẩu 401, lỗi mạng, thông điệp từ server).
  - Bảo vệ route phía client (`AppShell` + `AuthProvider`): chưa có token → `/login`; đã đăng nhập mà chưa có workspace → **onboarding** tạo workspace + team đầu tiên (tên + key, key gợi ý tự động từ tên team); có workspace → vào thẳng `/triage`.
  - `/triage` dùng thật: tải `GET /workspaces/:id/triage?status=NEW`, badge kênh ZALO/SLACK/EMAIL/GITHUB, nút Chấp nhận (chọn team khi có nhiều team) → hiện mã issue (VD `DEV-1`) và nút Bỏ qua; nút **"Tạo yêu cầu mẫu"** gọi `POST /intake/simulate` để demo khi chưa có kênh thật.
  - Sidebar hiện tên workspace, đổi workspace khi có nhiều, hiện user và nút Đăng xuất.
  - Base URL API lấy từ `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:4000`).
  - ⚠️ **Bảo mật (lát cắt):** accessToken đang lưu `localStorage` cho đơn giản — wave sau chuyển sang httpOnly cookie + refresh rotation.
- **Wave 1 (22/10/2026) — Issues/Cycles/Projects dùng thật** (chi tiết ở mục "Trạng thái phần web — Wave 1" bên dưới): `/issues` (danh sách + board kéo-thả + lọc + tạo nhanh), `/issues/[id]` (sửa inline + bình luận + xóa), `/cycles` + `/cycles/[id]` (tiến độ %, thêm/gỡ issue, đóng cycle lăn việc), `/projects` + `/projects/[id]` (tiến độ %, thêm/gỡ issue), Triage hiện địa chỉ email intake của workspace.

### apps/api
- Module **đã có logic thật**: `auth`, `workspaces`, `intake`, `issues` (Wave 1), `integrations`, `cycles`, `projects`, `webhooks` (Wave 1), `notifications` (Wave 2 — bộ máy thông báo + Inbox + My Issues, chi tiết bên dưới).
- `GET /health` → `{ status: "ok", service: "gomly-api", ... }` (kèm cờ đã cấu hình DATABASE_URL/REDIS_URL, không lộ giá trị).
- Cấu hình đọc từ `.env`: `DATABASE_URL`, `REDIS_URL`, `API_PORT` (mặc định 4000), `JWT_SECRET`.

#### Auth (theo ADR-07 trong `docs/architecture.md`)
- `POST /auth/register` `{email, password, name}` → tạo user, mật khẩu hash **argon2id**; email trùng → 409.
- `POST /auth/login` → `{ user, accessToken, refreshToken, accessTokenExpiresIn: 900 }`.
- Access JWT sống **15 phút**, chỉ chứa `sub` = user_id (không nhét quyền workspace — luôn tra membership từ DB).
- Refresh token sống 30 ngày, phía server **chỉ lưu hash SHA-256** (bảng `RefreshToken`); `POST /auth/refresh` **xoay vòng** (token cũ thu hồi ngay, dùng lại → 401); `POST /auth/logout` thu hồi refresh token.
- `GET /auth/me` — cần `Authorization: Bearer <accessToken>`; thiếu/sai token → 401. Guard dùng chung: `src/common/guards/jwt-auth.guard.ts`, decorator `@CurrentUserId()`.

#### Workspaces & Teams
- `POST /workspaces` `{name}` → tạo workspace (slug tự sinh, bỏ dấu tiếng Việt) + `Membership` vai trò `OWNER` cho người tạo.
- `GET /workspaces` → chỉ workspace mình là thành viên (kèm `role`).
- `GET /workspaces/:id` → không phải thành viên → **404** (không rò rỉ sự tồn tại của workspace người khác).
- `POST /workspaces/:id/teams` `{name, key}` → key tự viết hoa (gửi `dev` lưu `DEV`), trùng key trong cùng workspace → 409; không phải thành viên → 404.
- `GET /workspaces/:id/teams` → danh sách team; không phải thành viên → 404.

### packages/db
Prisma schema theo PRD: `Workspace`, `User`, `Membership`, `Team`, `Issue`, `IntakeItem`, `Cycle`,
`Project`, `Comment`, `Notification`, `IntegrationConnection`, cộng `RefreshToken` (lưu hash refresh token cho auth) — kèm enum cho nhóm/trạng thái issue,
priority, kênh intake (ZALO/SLACK/EMAIL/GITHUB), trạng thái triage và index theo `workspaceId` (multi-tenancy).

## Trạng thái phần Intake mẫu + Triage (Wave 0 — Agent B)

Đã có logic thật trong `apps/api/src/modules/intake/` (kèm controller `triage.controller.ts`):

| Endpoint | Mô tả |
|---|---|
| `POST /intake/simulate` | Bearer JWT. Body `{ workspaceId, channel: ZALO\|SLACK\|EMAIL\|GITHUB, senderName, title, content, externalRef? }` → tạo `IntakeItem` NEW, `rawPayload` = toàn bộ body + `simulated: true`. Có `externalRef` trùng (cùng workspace + kênh) → trả item cũ (idempotent qua `dedupeKey`). Không phải thành viên workspace → 404. |
| `GET /workspaces/:workspaceId/triage?status=NEW` | Hàng chờ Triage theo trạng thái (NEW/ACCEPTED/DISMISSED/MERGED), mới nhất trước, kèm issue liên kết nếu có. Kiểm tra membership như trên. |
| `POST /triage/:itemId/accept` | Body `{ teamId, assigneeId?, priority? }` → tạo Issue trong transaction (số thứ tự tiếp theo trong team, chống đụng `@@unique([teamId, number])` bằng retry), trạng thái mặc định BACKLOG, gắn `intakeItemId`, trả kèm `key` hiển thị (VD `DEV-1`). Item chuyển ACCEPTED. Accept lại → trả issue cũ. |
| `POST /triage/:itemId/dismiss` | Body `{ reason? }` → item chuyển DISMISSED, lý do được lưu vào cột `dismissReason` của `IntakeItem` (bổ sung ở Wave 1, migration `20261022023216_add_dismiss_reason`; `rawPayload` vẫn bất biến). |

- **Xác thực:** guard Bearer JWT tự chứa trong module (`guards/bearer-auth.guard.ts`, kiểm chứng HS256 bằng `node:crypto`, không phụ thuộc module auth): chấp nhận claim `sub`/`userId`/`id`, secret đọc từ `JWT_SECRET` (khớp module auth: token ký `{ sub: userId }` bằng `JWT_SECRET`).
- **Hàng đợi:** kiến trúc chốt BullMQ + Redis (queue `intake`) nhưng môi trường hiện chưa có Redis và `bullmq` chưa cài → bước chuẩn hóa chạy **đồng bộ** qua `IntakeQueueService` (điểm gắn BullMQ đã ghi rõ trong `intake-queue.service.ts`); lỗi chuẩn hóa được nuốt để API không sập. Schema chưa có cột `processedAt` nên processor hiện chỉ xác nhận + ghi log.
- **Seed demo:** `node scripts/seed-demo.mjs` (từ gốc `app/`, cần DB đã migrate) — tạo idempotent workspace "Gomly Demo" + team `DEV` + 4 IntakeItem mẫu (mỗi kênh 1, nội dung tiếng Việt) + user `demo@gomly.dev` / mật khẩu `demo1234` (băm argon2 khi thư viện có mặt).
- **Kiểm chứng (22/10/2026):** `nest build` PASS; E2E runtime **22/22 PASS** trên PostgreSQL tạm (embedded-postgres cổng 5433): register qua `/auth/register` → tạo workspace/team → simulate 4 kênh + trùng externalRef → list/404 non-member/401 no-token → accept ra `DEV-1`, `DEV-2` (accept lại idempotent, accept item DISMISSED → 409) → dismiss; seed chạy 2 lần không trùng và đăng nhập bằng tài khoản seed xem được Triage 4 item. Giới hạn: chưa test với Redis/BullMQ (chưa có trong môi trường) và chưa test tải đồng thời.

## Trạng thái phần Issues (Wave 1 — Agent D)

Đã có logic thật trong `apps/api/src/modules/issues/` (dùng `PrismaService` + `JwtAuthGuard` dùng chung ở `src/common`, cùng mẫu 404-cho-non-member như workspaces/intake):

| Endpoint | Mô tả |
|---|---|
| `POST /workspaces/:workspaceId/issues` | Tạo issue. Body `{ teamId, title, description?, status?, priority?, assigneeId?, labels?, estimate?, dueDate?, projectId?, cycleId? }`. Số thứ tự theo team bằng transaction + retry khi đụng `@@unique([teamId, number])` (cùng mẫu triage accept). Trả issue kèm `key` (VD `DEV-12`). Validate: team/project/cycle phải thuộc workspace (cycle phải thuộc đúng team), assignee phải là thành viên — sai → 400. Không phải thành viên workspace → 404. |
| `GET /workspaces/:workspaceId/issues` | Liệt kê, mới nhất trước, kèm `key` + team/assignee/project/cycle rút gọn. Lọc qua query: `teamId`, `status`, `statusGroup`, `assigneeId`, `projectId`, `cycleId`, `q` (tìm theo tiêu đề không phân biệt hoa thường, hoặc khớp mã key dạng `DEV-12`). |
| `GET /issues/:issueId` | Chi tiết + team/workspace/assignee/creator/project/cycle/intake gốc. Không phải thành viên → 404. |
| `PATCH /issues/:issueId` | Sửa title, description, status (tự đồng bộ `statusGroup`: TRIAGE→BACKLOG, còn lại trùng tên nhóm), priority, assigneeId, labels, estimate, dueDate, projectId, cycleId. Gửi `null` cho assigneeId/projectId/cycleId/dueDate/description = gỡ giá trị. |
| `DELETE /issues/:issueId` | **Xóa cứng** — schema Issue chưa có cột `deletedAt` (comment con bị xóa theo Cascade, notification liên kết SetNull). Trả `{ deleted: true, id }`. |
| `GET /issues/:issueId/comments` · `POST /issues/:issueId/comments` | Bình luận theo model `Comment` (cột DB `body`; API nhận/trả trường `content`, response kèm cả `body` + `content` + author rút gọn). Nhắc `@tên`/`@email` lưu nguyên văn trong nội dung — tạo Notification cho người được nhắc thuộc Wave 2, chưa làm. |

- **Schema đợt này:** thêm cột `dismissReason` (String, nullable) vào `IntakeItem` — migration `20261022023216_add_dismiss_reason` đã áp vào DB local 5434; `dismiss` của module intake đã lưu lý do vào cột này.
- **Kiểm chứng (22/10/2026):** `prisma validate` + `generate` + `migrate dev` PASS; `nest build` PASS; bộ test curl độc lập (API chạy cổng riêng 4100, DB 5434, user test đăng ký mới qua `/auth/register`) **36/36 PASS**: tạo issue ra `DEV-1`/`DEV-2` đúng số thứ tự + statusGroup, lọc theo status/statusGroup/assignee/q (cả mã key lẫn tiêu đề), chi tiết kèm team/workspace, non-member 404 ở cả xem/list/tạo, không token 401, PATCH đổi status đồng bộ group + gắn/gỡ project & cycle (dùng project/cycle thật tạo qua Prisma) + gỡ assignee, comment thêm/đọc đúng author, dismiss intake qua API và đọc lại thấy `dismissReason` đã lưu, DELETE xong GET → 404. Server test đã tắt sau khi chạy.

## Trạng thái phần Cycles + Projects (Wave 1 — Agent E)

Đã có logic thật trong `apps/api/src/modules/cycles/` và `apps/api/src/modules/projects/`
(đăng ký trong `app.module.ts`). Mọi route cần Bearer JWT + kiểm membership — không phải thành viên → **404**.

| Endpoint | Mô tả |
|---|---|
| `POST /workspaces/:workspaceId/cycles` | Body `{ teamId, name?, startsAt, endsAt }`. Thiếu `name` → tự sinh `Cycle N` theo số cycle của team. `endsAt <= startsAt` → 400. Trạng thái tự suy: `now` nằm trong khoảng → `ACTIVE`, còn lại `UPCOMING`. |
| `GET /workspaces/:workspaceId/cycles?teamId=` | Danh sách cycle, mỗi cycle kèm tiến độ (gắn phẳng `totalIssues`/`doneIssues`/`progressPercent` + lồng `progress: {...}`). |
| `GET /cycles/:cycleId` | Chi tiết + tiến độ + danh sách issue thuộc cycle (kèm `key` dạng `DEV-1`, `status`, `assigneeId`...). |
| `POST /cycles/:cycleId/issues` | Body `{ issueId }` → gắn issue vào cycle. Issue phải **cùng workspace** với cycle, khác workspace → 404. |
| `DELETE /cycles/:cycleId/issues/:issueId` | Gỡ issue khỏi cycle (`cycleId = null`). |
| `POST /cycles/:cycleId/close` | Body `{ createNext?, nextStartsAt?, nextEndsAt?, rolloverTeamId? }` → đóng cycle. Schema `Cycle` không có cột `closedAt` nên dùng `status = COMPLETED`. Khi `createNext = true`: tạo cycle mới cho **cùng team** (mặc định bắt đầu đúng lúc cycle cũ kết thúc, độ dài bằng cycle cũ) và lăn mọi issue chưa `DONE`/`CANCELED` sang; trả `{ closedCycleId, nextCycleId, rolledIssueIds }`. Khi `createNext = false`: issue chưa xong giữ nguyên trong cycle đã đóng, `rolledIssueIds = []`. `rolloverTeamId` được chấp nhận trong DTO nhưng hiện **chưa dùng** (rollover luôn cùng team theo PRD). |
| `POST /workspaces/:workspaceId/projects` | Body `{ name, description?, targetDate? }` → Project, trạng thái mặc định `PLANNED`. Trả kèm tiến độ. |
| `GET /workspaces/:workspaceId/projects` | Danh sách project kèm tiến độ. |
| `GET /projects/:projectId` | Chi tiết + tiến độ + danh sách issue thuộc project. |
| `PATCH /projects/:projectId` | Cập nhật `{ name?, description?, targetDate?, status? }` (status theo enum `ProjectStatus`); truyền `null` cho `description`/`targetDate` để xóa. |
| `POST /projects/:projectId/issues` / `DELETE /projects/:projectId/issues/:issueId` | Gắn/gỡ issue (`projectId`), issue phải cùng workspace → khác workspace 404. |

- **Tiến độ** tính từ `Issue.statusGroup`: Done = nhóm `DONE`; `progressPercent = round(done/total × 100)`, project/cycle trống → 0%.
- **Kiểm chứng (22/10/2026):** `nest build` PASS; test E2E bằng curl/fetch trên cổng riêng 4101 + DB thật (PostgreSQL 5434, `gomly_dev`): **36/36 PASS** — gồm tạo cycle (tên tự sinh `Cycle 1`, trạng thái ACTIVE) → gắn 2 issue → tiến độ 50% (1 BACKLOG + 1 DONE) → close + `createNext` → issue chưa Done lăn sang cycle mới (bắt đầu đúng `endsAt` cũ), issue Done ở lại, cycle cũ `COMPLETED` → gỡ issue → project: tạo/gắn/t PATCH/tiến độ 100%/gỡ → non-member 404 (list/get/close/project), không token 401, gắn issue khác workspace 404.
  Cách tạo dữ kiện test: user/workspace/team/issue tạo qua API thật (`/auth/register` → intake `simulate` → `accept`); riêng việc set 1 issue sang `DONE` làm trực tiếp qua Prisma vì API sửa issue thuộc phạm vi module Issues (đang xây song song).

## Trạng thái phần Integrations — GitHub + Slack + Email inbound (Wave 1 — Agent F; Slack bổ sung Wave 2 — Agent J)

Đã có logic thật trong `apps/api/src/modules/integrations/` + module mới `apps/api/src/modules/webhooks/`:

| Endpoint | Mô tả |
|---|---|
| `POST /workspaces/:workspaceId/integrations/github` | Bearer + membership (non-member → 404). Body `{ repoFullName: "owner/repo", webhookSecret }` → tạo/cập nhật `IntegrationConnection` provider GITHUB (`externalAccountId` = repo, `config.repoFullName`). Secret được **mã hóa AES-256-GCM** (định dạng `v1:<iv>:<tag>:<data>`, khóa suy ra từ env `INTEGRATION_ENCRYPTION_KEY`, fallback `JWT_SECRET`) rồi mới lưu vào `encryptedCredentials`; response chỉ trả `hasSecret: true`, **không bao giờ lộ secret**. |
| `POST /workspaces/:workspaceId/integrations/slack` | Bearer + membership (non-member → 404). Body `{ slackTeamId: "T0123ABC", slackTeamName?, signingSecret }` → tạo/cập nhật `IntegrationConnection` provider SLACK (`externalAccountId` = slackTeamId). `signingSecret` mã hóa AES-256-GCM như GitHub, response chỉ trả `hasSecret: true` kèm `slackTeamId` + `captureChannelMessages`. Nối lại không làm mất cấu hình capture đã bật. |
| `GET /workspaces/:workspaceId/integrations` | Danh sách kết nối của workspace (đã che secret/token). Kết nối SLACK trả thêm `slackTeamId` + `captureChannelMessages`. |
| `POST /webhooks/slack` | Webhook công khai của Slack (nhận cả JSON và `application/x-www-form-urlencoded`), xác thực **chữ ký v0**: `v0=` + HMAC-SHA256(signingSecret, `"v0:" + x-slack-request-timestamp + ":" + rawBody gốc)`; timestamp lệch quá 5 phút hoặc sai chữ ký → 401; không có kết nối ACTIVE cho `team_id` → 404. Hỗ trợ: `url_verification` → trả `{ challenge }`; **slash command** (`/gomly <nội dung>`) → `IntakeItem` kênh SLACK (`externalId` = `trigger_id`, dedupeKey `SLACK:<workspaceId>:<externalId>`) và trả thông báo ephemeral "Đã ghi nhận yêu cầu vào Gomly Triage ✅"; **message action/shortcut** (JSON `type: "message_action"`) → IntakeItem tương tự, trả `{ ok: true }`; **Events API** (`event_callback` + `event.type = "message"` ở kênh công khai) → CHỈ tạo IntakeItem khi kết nối bật `config.captureChannelMessages` (**mặc định TẮT** — tránh nuốt mọi tin nhắn), `externalId` = `<team_id>:<event.ts>`, bỏ qua tin của bot/subtype. |
| `DELETE /workspaces/:workspaceId/integrations/:connectionId` | Ngắt kết nối (không thuộc workspace → 404). |
| `GET /workspaces/:workspaceId/intake-email` | Trả `{ address: "intake+<workspaceSlug>@gomly.local", instructions }` để UI hiển thị địa chỉ nhận việc qua email. |
| `POST /webhooks/github` | Webhook công khai, xác thực **HMAC-SHA256** (`x-hub-signature-256`) bằng secret của kết nối khớp `repository.full_name` (sai chữ ký → 401, không có kết nối ACTIVE → 404). `issues.opened` → tạo `IntakeItem` kênh GITHUB (`externalId` = `owner/repo#<number>`, dedupeKey `GITHUB:<workspaceId>:<externalId>` — redelivery không tạo trùng). `pull_request`: trích mã issue `[A-Z]+-<số>` từ title/body/branch — `opened`/`reopened`/`synchronize` → Issue sang **IN_PROGRESS**, `closed` + `merged=true` → **DONE** (đồng bộ cả `statusGroup`; đặt lặp lại vô hại). Trả `200 { received: true, effects: [...] }`. |
| `POST /webhooks/email` | Nhận payload inbound phổ biến `{ to, from, senderName?, subject, text?, html?, messageId? }`. Workspace suy ra từ địa chỉ `intake+<slug>@gomly.local` (không khớp → 404). Tạo `IntakeItem` kênh EMAIL: `title` = subject, `content` = text (hoặc rút text từ html), `senderName`/`senderRef` parse từ `from` dạng `Tên <email@x>`, dedupe theo `messageId`. |

- ⚠️ **Bảo mật webhook email:** nếu env `INTAKE_EMAIL_SECRET` được đặt, bắt buộc header `X-Intake-Secret` khớp (sai/thiếu → 401). Nếu env trống, webhook **cho qua nhưng ghi log error cảnh báo** — chỉ chấp nhận được ở môi trường dev, phải đặt secret trước khi dùng thật.
- ⚠️ **Raw body GitHub:** HMAC chuẩn phải tính trên bytes gốc. `main.ts` hiện chưa bật `rawBody` của NestFactory nên service xác thực trên `JSON.stringify(body đã parse)` (đủ khớp với payload JSON chuẩn; controller đã ưu tiên `req.rawBody` nếu có — bật `rawBody: true` ở `main.ts` là tự chuyển sang bytes gốc, không cần sửa module này).
- **Slack (Wave 2 — Agent J):** chữ ký v0 của Slack bắt buộc tính trên bytes gốc — `main.ts` ở trạng thái hiện tại **đã bật `rawBody: true`** nên cả 3 dạng (slash command form-urlencoded, message action JSON, Events API) đều xác thực trên đúng raw body Slack gửi. Bật bắt tin nhắn kênh (`captureChannelMessages`) hiện chưa có API/UI riêng — bật/tắt bằng cách cập nhật `config` của `IntegrationConnection` SLACK trực tiếp trong DB (mặc định tắt khi kết nối). Khi Slack gửi `url_verification` cho team chưa có kết nối, server vẫn trả `challenge` kèm log cảnh báo để hoàn tất bước đăng ký Request URL lần đầu (không tạo dữ liệu); mọi dạng tạo intake khác đều 404 khi không có kết nối.
- **Kiểm chứng Slack (22/10/2026):** `nest build` + `typecheck` PASS; test thật trên cổng riêng 4104 với payload + chữ ký v0 tự chế bằng `node:crypto` (ký trên đúng raw body gửi đi) — **28/28 PASS**: connect/list/non-member 404 (secret mã hóa `v1:...` trong DB đã xác minh trực tiếp, response không lộ secret); `url_verification` trả challenge; slash command → IntakeItem SLACK trong Triage (đọc lại qua API triage), gửi lại cùng `trigger_id` không tạo trùng, sai chữ ký → 401, timestamp cũ 10 phút → 401; message action → tạo item đúng sender; Events API: capture TẮT → không tạo item, bật capture qua Prisma → tạo item, Slack retry cùng `event.ts` không nhân đôi; `team_id` lạ → 404; ngắt kết nối qua DELETE sẵn có → webhook sau đó 404. Chưa gọi ra Slack thật — chỉ xử lý payload nhận vào đúng chuẩn Slack.
- **Kiểm chứng (22/10/2026):** `nest build` PASS; test thật trên cổng riêng 4102 với payload GitHub tự chế + chữ ký HMAC bằng `node:crypto` — **34/34 PASS**: connect/list/DELETE (kèm non-member 404, secret mã hóa trong DB, response không lộ secret); `issues.opened` → Triage có item GITHUB, redelivery không trùng, sai chữ ký 401, repo lạ 404; issue `DEV-1` có sẵn → PR opened (branch `feat/DEV-1-...`) → IN_PROGRESS, synchronize lặp vô hại, closed chưa merge giữ nguyên, merged → DONE, PR không có mã → 200 ignored; email webhook: thiếu secret 401, tạo item EMAIL + parse sender, trùng Message-ID không nhân đôi, slug lạ 404, html-only rút được text. Chế độ không đặt `INTAKE_EMAIL_SECRET` cũng đã test riêng (cổng 4103): cho qua + log cảnh báo đúng 1 lần. Chưa gọi ra GitHub thật — chỉ xử lý payload nhận vào.

## Trạng thái phần Notifications + Inbox + My Issues (Wave 2 — Agent H)

Đã có logic thật trong `apps/api/src/modules/notifications/` (`NotificationsService` + controller `notifications` và `me`), dùng model `Notification` sẵn có trong schema (không sửa schema đợt này; type dùng đúng enum `NotificationType`: `ASSIGNED` / `MENTIONED` / `COMMENTED` / `STATUS_CHANGED` / `INTAKE_RECEIVED`). Service được export và gắn vào `issues` + `intake` qua DI (hai module import `NotificationsModule`).

### Sự kiện phát thông báo (không bao giờ báo cho chính người thực hiện hành động)

| Sự kiện | Type | Người nhận |
|---|---|---|
| Tạo issue có `assigneeId`, PATCH đổi `assigneeId` sang người mới, hoặc Triage accept có `assigneeId` | `ASSIGNED` | Người được gán |
| Bình luận mới trên issue | `COMMENTED` | Creator + assignee của issue (trừ người bình luận) |
| Bình luận có nhắc tên | `MENTIONED` | Thành viên được nhắc (cộng thêm, độc lập với `COMMENTED`) |
| PATCH đổi trạng thái issue (chỉ khi trạng thái thật sự thay đổi) | `STATUS_CHANGED` | Assignee + creator (trừ người đổi) |

- Điểm phát nằm trong `issues.service.ts` (create/update/comment) và `intake.service.ts` (accept — chỉ khi accept tạo issue mới, accept lại idempotent không phát trùng). `NotificationsService.createForUsers(...)` tự lọc actor + trùng + null và **nuốt lỗi** (chỉ ghi log) để việc phát thông báo không bao giờ làm hỏng nghiệp vụ chính.
- **Khớp nhắc tên:** `@<email đầy đủ>` = khớp **chính xác** (không phân biệt hoa thường) với email thành viên workspace — đường khớp đáng tin cậy. Ngoài ra **best-effort** theo họ tên đầy đủ `@<Họ tên>`: thử cả dạng có dấu và bỏ dấu tiếng Việt (VD `@nguyen van a`), yêu cầu ranh giới từ phía sau tên để giảm khớp nhầm; tên ngắn/trùng vẫn có thể khớp nhầm.
- ⚠️ **Chưa gắn:** webhook GitHub đổi trạng thái issue (nằm trong module `integrations`/`webhooks`, ngoài phạm vi đợt này) **chưa** phát `STATUS_CHANGED` — đề xuất: trong `webhooks.service` khi áp dụng chuyển trạng thái PR, gọi `NotificationsService.createForUsers` với actor = null/người liên kết PR (cần quyết định actor vì webhook không có user nội bộ; có thể dùng creator của issue làm actor hệ thống hoặc cho phép `actorId = null` với body ghi rõ "qua GitHub").

### API

| Endpoint | Mô tả |
|---|---|
| `GET /notifications?unreadOnly=true&limit=` | Inbox của chính tôi, mới nhất trước (limit mặc định 50, tối đa 100). Mỗi item kèm `actor` rút gọn, `issueId`, `issueKey` (VD `DEV-1`), `issueTitle`, `body`, `readAt`, `createdAt`. |
| `GET /notifications/unread-count` | `{ count }` số chưa đọc của tôi. |
| `PATCH /notifications/:id/read` | Đánh dấu đã đọc — thông báo không phải của mình → **404**. |
| `POST /notifications/read-all` | Đánh dấu tất cả đã đọc, trả `{ updated }`. |
| `GET /me/issues?statusGroup=&workspaceId=` | My Issues: issue `assigneeId` = tôi, thuộc workspace tôi là thành viên (truyền `workspaceId` không phải thành viên → 404), lọc được theo nhóm trạng thái, kèm `key` + team/workspace/project/cycle rút gọn, sắp xếp `updatedAt` giảm dần. |

- **Kiểm chứng (22/10/2026):** `nest build` PASS; test E2E bằng script fetch trên cổng riêng 4103 + DB thật (PostgreSQL 5434) — **36/36 PASS**: 2 user A/B cùng workspace (**membership của B tạo trực tiếp bằng Prisma** vì repo chưa có API mời/thêm thành viên — chỉ phục vụ test) → A tạo issue gán B → B có đúng 1 `ASSIGNED` + unread = 1 + kèm issueKey/actor → A bình luận nhắc `@email` của B → B thêm `COMMENTED` + `MENTIONED`, unread = 3 → A PATCH status → B có `STATUS_CHANGED`, unread = 4 → A tự gán cho mình → A 0 thông báo → B đọc 1 → unread 3 → lọc `unreadOnly` đúng → read-all → 0 → B bình luận → A có `COMMENTED`, B đọc trộm thông báo của A → 404 → `/me/issues` + lọc statusGroup/workspaceId đúng → Triage accept gán B → B thêm `ASSIGNED` (key khớp) → không token 401. Server test đã tắt sau khi chạy.

## Trạng thái phần Zalo (quick-capture + khung OA) + Members + PATCH config Slack (Wave 3 — Agent K)

### Zalo — Phương án B: Quick-capture (DÙNG ĐƯỢC NGAY, không cần OA/pháp nhân)

Theo kết luận spike (`research/zalo-api-spike.md`), đường intake Zalo ra mắt trước là **quick-capture**: mỗi workspace có link "Gửi yêu cầu" công khai (ghim link/QR trong nhóm Zalo), khách mở form web ngắn → `IntakeItem` kênh **ZALO** vào thẳng Triage. Đã có logic thật trong module mới `apps/api/src/modules/capture/` + model **`CaptureLink`** (migration `20261022030818_add_capture_link`, đã áp vào DB local 5434).

| Endpoint | Mô tả |
|---|---|
| `POST /workspaces/:workspaceId/capture-links` | Bearer + membership (non-member → 404). Body `{ teamId?, label? }` (teamId phải thuộc workspace, sai → 400) → tạo link với **token ngẫu nhiên 32 ký tự** (crypto.randomBytes 24 byte, base64url). Trả `{ id, token, path: "/capture/<token>", label, teamId, createdAt }`. |
| `GET /workspaces/:workspaceId/capture-links?revoked=true\|false` | Danh sách link, mới nhất trước. Mặc định trả tất cả, link đã thu hồi có `revoked: true` + `revokedAt`; `revoked=false` chỉ link đang hiệu lực, `revoked=true` chỉ link đã thu hồi. |
| `DELETE /workspaces/:workspaceId/capture-links/:linkId` | Thu hồi link (`revokedAt = now`, không xóa cứng). Thu hồi lại là vô hại. |
| `GET /capture/:token/info` | **Công khai.** Link hợp lệ + chưa thu hồi → `{ workspaceName, teamName? }` để form hiển thị đúng nơi nhận; không hợp lệ/đã thu hồi → 404. |
| `POST /capture/:token` | **Công khai.** Body `{ senderName, title, content, website? }` → tạo IntakeItem ZALO trạng thái NEW, gán `teamId` theo link (nếu có), `rawPayload.source = "quick-capture"` (ghi rõ: gửi qua link ghim trong nhóm Zalo, không qua OA). Trả `201 { ok: true }`. |

Chống lạm dụng mức cơ bản: trường **`website` là honeypot** (form thật không có — bot điền vào sẽ nhận 201 giả mà KHÔNG tạo item) + **throttle in-memory 10 lần/phút theo (IP, token)**, vượt → 429 + giới hạn độ dài từng trường qua DTO.

### Zalo — Phương án A: OA webhook (MỨC KHUNG — CHƯA kiểm chứng với Zalo thật)

| Endpoint | Mô tả |
|---|---|
| `POST /workspaces/:workspaceId/integrations/zalo` | Bearer + membership. Body `{ oaId, appId?, secretKey? }` → upsert `IntegrationConnection` provider ZALO (`externalAccountId` = oaId); secretKey mã hóa AES-256-GCM như các kênh khác, response chỉ trả `hasSecret` + `zaloOaId`/`zaloAppId`. Nối lại không gửi secretKey → giữ secret cũ. |
| `POST /webhooks/zalo` | Nhận sự kiện OA dạng `{ event_name, app_id?, oa_id? (hoặc recipient.id), sender: { id }, message: { text?, msg_id? } }`. Tra kết nối ACTIVE theo OA id (không có → 404). `user_send_text` → IntakeItem ZALO (dedupe `ZALO:<workspaceId>:<msg_id>` như các kênh); các `user_send_*` khác ghi nhận với tiêu đề `[<event_name>]`; sự kiện không phải tin nhắn người dùng → 200 ignored. |

- ⚠️ **Chữ ký sự kiện Zalo CHƯA được kiểm:** memo spike ghi nhận header `X-ZEvent-Signature` tồn tại (nguồn phụ trợ) nhưng **chưa xác nhận được thuật toán ký chính thức** từ developers.zalo.me, nên endpoint hiện **không kiểm chữ ký** (không bịa thuật toán) và ghi log cảnh báo `error` khi tiến trình khởi động. **Chỉ bật cho khách thật sau khi đối chiếu tài liệu chính thức + bổ sung lớp xác thực**, đồng thời OA của team phải qua xác thực doanh nghiệp + cấp quyền OA API (rào cản hành chính theo spike). `rawPayload` của item OA có cờ `signatureVerified: false` để truy vết.

### Thành viên workspace (bổ sung khoảng trống Wave 2 — trong module `workspaces`)

| Endpoint | Mô tả |
|---|---|
| `GET /workspaces/:id/members` | Mọi thành viên đều gọi được (non-member → 404) → `[{ userId, email, name, avatarUrl, role, joinedAt }]` theo thứ tự tham gia. |
| `POST /workspaces/:id/members` | Body `{ email, role? }` — **chỉ OWNER/ADMIN** (MEMBER/GUEST → **403**; non-member → 404). Người được thêm phải **đã có tài khoản Gomly**: chưa có → 404 "Người dùng chưa có tài khoản Gomly"; đã là thành viên → 409; `role` mặc định MEMBER, gửi `role = OWNER` → 400 (không gán OWNER qua API này). Email tra cứu theo dạng chữ thường như auth. |
| `DELETE /workspaces/:id/members/:userId` | Chỉ OWNER/ADMIN. Không phải thành viên → 404. **Không xóa được OWNER cuối cùng** → 409. Tự xóa mình được nếu còn OWNER khác (hoặc không phải OWNER). Trả `{ removed: true, member }`. |

### PATCH cấu hình kết nối (bổ sung từ Wave 2 — module `integrations`)

- `PATCH /workspaces/:workspaceId/integrations/:connectionId/config` `{ captureChannelMessages: boolean }` (Bearer + membership; kết nối không thuộc workspace → 404) → merge vào `config` JSON của kết nối (dùng cho SLACK: bật/tắt tự bắt tin nhắn kênh công khai qua Events API — từ Wave 3 không cần sửa DB tay nữa). Trả bản ghi kết nối rút gọn (không lộ secret).

- **Kiểm chứng (22/10/2026):** `prisma validate` + `migrate dev` (`20261022030818_add_capture_link`) + `generate` PASS; `nest build` + `tsc --noEmit` PASS; test E2E bằng script fetch trên cổng riêng 4105 + DB thật 5434 — **58/58 PASS**: capture (401/404 quyền, token ≥ 24 ký tự + path đúng, teamId lạ 400, info đúng workspace/team, submit → Triage có item ZALO `source=quick-capture` đúng team, honeypot 201 giả không tạo item, list + lọc revoked, thu hồi → info/submit 404, throttle 10 lần 201 → lần 11 ra 429); Zalo OA (connect non-member 404, secret mã hóa `v1:...` xác minh thẳng trong DB + response không lộ, `user_send_text` → item đúng sender dạng "Zalo user …", gửi lại cùng `msg_id` không trùng, `user_send_image` → tiêu đề `[user_send_image]`, follow → 200 ignored, định danh OA qua `recipient.id` cũng chạy, OA lạ → 404); members (list 1 OWNER, add mặc định MEMBER/role ADMIN, trùng 409, chưa có tài khoản 404 đúng message, role OWNER 400, MEMBER thêm → 403, MEMBER vẫn xem list, xóa OWNER cuối → 409, xóa non-member 404, xóa thường + ADMIN tự xóa mình → 200); Slack config PATCH (bật → đọc lại list thấy true, tắt → false, non-member/kết nối lạ → 404). Server test đã tắt sau khi chạy. **Chưa gọi ra Zalo thật** — OA webhook mới ở mức khung xử lý payload đúng dạng tài liệu spike mô tả.

## Cách chạy dev

Yêu cầu: Node.js ≥ 20, npm ≥ 10, Docker (cho PostgreSQL/Redis local).

```bash
# 1. Cài dependencies (từ thư mục gốc app/)
npm install

# 2. Tạo file môi trường
cp .env.example .env
cp .env.example apps/api/.env

# 3. Bật PostgreSQL + Redis
docker compose up -d

# 4. Kiểm tra + sinh Prisma client (chưa migrate ở mức khung)
npm run db:validate
npm run db:generate
# Khi sẵn sàng tạo DB thật: npm run migrate:dev -w @gomly/db

# 5. Chạy API (http://localhost:4000)
npm run dev:api
curl http://localhost:4000/health

# 6. Chạy web (http://localhost:3000 → tự chuyển về /vi)
npm run dev:web
```

Cổng mặc định: Web **3000**, API **4000**, PostgreSQL **5432**, Redis **6379**.

## Demo & nghiệm thu (Wave 3)

- **Tài liệu demo:** [`../DEMO.md`](../DEMO.md) — cách chạy từ số 0 (máy dev chuẩn với Docker **và** trên VM hiện tại với PostgreSQL embedded cổng 5434), tài khoản/dữ liệu mẫu, checklist trước giờ demo, **kịch bản trình diễn 5 phút** khớp mục 8 PRD kèm lệnh curl mẫu cho từng kênh (dự phòng khi kênh thật chưa nối).
- **Seed demo:** `node scripts/seed-demo.mjs` (từ gốc `app/`) — idempotent tuyệt đối (đã kiểm chứng chạy 2 lần liên tiếp, đếm lại không trùng): workspace "Gomly Demo" + team `DEV`, user `demo@gomly.dev` (OWNER) + `demo2@gomly.dev` (MEMBER, cùng mật khẩu `demo1234`), 4 IntakeItem mẫu 4 kênh ở Triage, project **"Ví điểm thưởng v2"** (4 issue `[Demo]` ở BACKLOG/TODO/IN_PROGRESS/DONE → tiến độ 25%), cycle **"Cycle demo — Sprint hiện tại"** đang ACTIVE chứa 3 issue (tiến độ 33%; cửa sổ tự làm tươi khi đã trôi qua hạn).
- **Nghiệm thu tự động:** `node scripts/acceptance-demo.mjs` — dựng ngữ cảnh nghiệm thu riêng (user + workspace riêng, không đụng dữ liệu demo), chạy 6 ô checklist phát hành của PRD: 4 kênh → Triage (GitHub webhook ký HMAC + header sự kiện, email webhook, Slack slash command ký v0, Zalo quick-capture qua capture link công khai) · accept → issue `ACC-1` + gán thành viên (qua API members) + đưa vào cycle/project · PR opened → IN_PROGRESS · PR merged → DONE + tiến độ project/cycle 100% · web `/vi/triage` + `/en/triage` đều 200 · không lỗi 5xx. API/web chưa chạy thì script tự build/start và chỉ tắt instance nó đã mở. Kết quả ghi vào [`../docs/acceptance-wave3.md`](../docs/acceptance-wave3.md).
- **Kết quả nghiệm thu Wave 3 (22/10/2026): 6/6 PASS** trên VM (PostgreSQL embedded 5434). Lưu ý rút ra khi nghiệm thu: webhook GitHub/Slack khớp kết nối theo repo / Slack team id trên toàn hệ thống (1 repo / 1 Slack team chỉ thuộc 1 workspace tại một thời điểm) — script dùng định danh duy nhất mỗi lần chạy; webhook GitHub bắt buộc có header `x-github-event` (thiếu header → server trả 200 nhưng bỏ qua sự kiện).

## Trạng thái kiểm chứng — Auth + Workspace trên DB thật (22/10/2026)

Chạy thật trên VM (Node v24.20.0). VM không có Docker và `apt` bị treo do mirror
`mirror.cogentco.com` không phản hồi, nên PostgreSQL local được dựng bằng **embedded-postgres**
(binaries tại `/tmp/pg-embed`), chạy ở **port 5434**, datadir `/tmp/gomly-pgdata`, database `gomly_dev`,
user `gomly`. Các file `.env` local (gốc `app/`, `apps/api/`, `packages/db/`) đã trỏ vào DB này + có `JWT_SECRET`.
Trên máy dev bình thường, cứ dùng `docker compose up -d` (port 5432) và sửa lại `DATABASE_URL` trong `.env`.

Khởi động lại PostgreSQL local trên VM nếu đã tắt:

```bash
BIN=/tmp/pg-embed/node_modules/@embedded-postgres/linux-x64/native/bin
runuser -u nobody -- $BIN/pg_ctl -D /tmp/gomly-pgdata -o "-p 5434 -k /tmp -c listen_addresses=localhost" -l /tmp/gomly-pg.log start
```

| Bước | Kết quả |
|---|---|
| `prisma migrate dev` (`20261022021907_init_auth_workspaces`) | ✅ PASS — tạo đủ 12 bảng model (gồm `RefreshToken` mới) + bảng migrations trên `gomly_dev` |
| `nest build` sau khi có auth/workspaces thật | ✅ PASS |
| Hash mật khẩu trong DB | ✅ `$argon2id$v=...` (argon2 native chạy thật, không phải fallback) |
| Chuỗi curl: register → 201 + cặp token; đăng ký trùng email → 409; login sai mật khẩu → 401; login đúng → 200 | ✅ PASS |
| `GET /auth/me` có Bearer → 200 đúng user; không token → 401 | ✅ PASS |
| Tạo workspace → 201, `role: "OWNER"`, slug tự sinh; `GET /workspaces` thấy đúng workspace của mình | ✅ PASS |
| Tạo team với key `dev` → lưu thành `DEV`; tạo trùng key → 409; liệt kê teams → 200 | ✅ PASS |
| **Cross-tenant**: user 2 đăng ký/login → `GET /workspaces` rỗng; mở workspace của user 1 → **404**; tạo team vào workspace của user 1 → **404**; xem teams của user 1 → **404** | ✅ PASS |
| Refresh xoay vòng: refresh bằng token hiện hành → 200 cặp mới; dùng lại token cũ → 401; logout → refresh sau logout → 401 | ✅ PASS |
| Redis local | ⚠️ CHƯA CHẠY — `redis-server` chưa cài được (apt treo như trên); auth/workspace không cần Redis, chỉ queue intake (wave sau) mới cần |

## Trạng thái kiểm chứng khung

Đã chạy thật trên VM ngày 21/10/2026 (Node v24.20.0, npm 10.9.4). Phiên bản thực tế đã cài:
Next.js 15.5.28, React 19.3.1, NestJS 10.4.22, Prisma 6.19.3, next-intl 4.14.9.

| Bước | Kết quả |
|---|---|
| `npm install` (npm workspaces, 460 packages) | ✅ PASS — nhưng phải dùng `--ignore-scripts` (xem lưu ý mạng bên dưới), sau đó tải Prisma engines thủ công |
| `prisma validate` (packages/db) | ✅ PASS — "The schema at prisma/schema.prisma is valid" |
| `prisma generate` | ✅ PASS — sinh Prisma Client thành công |
| `nest build` (apps/api) | ✅ PASS |
| Chạy API + `GET /health` | ✅ PASS — trả `{"status":"ok","service":"gomly-api","databaseConfigured":true,"redisConfigured":true}`; các route `/intake/ping`, `/issues/ping` trả stub OK |
| `next build` (apps/web) | ✅ PASS (sau khi sửa 1 lỗi đường dẫn import trong `src/middleware.ts`) — sinh đủ route `/vi` + `/en` cho trang chủ, triage, inbox, my-issues, cycles, projects |
| Chạy web + kiểm tra nội dung | ✅ PASS — `/` tự chuyển 307 về `/vi`; `/vi/triage` hiện tiếng Việt, `/en/triage` hiện tiếng Anh |
| `docker compose up` | ⚠️ CHƯA CHẠY ĐƯỢC — VM không có Docker. File compose đã khai báo postgres:16 + redis:7 kèm healthcheck; cần máy có Docker để chạy. Chưa migrate vào DB thật. |

## Trạng thái kiểm chứng phần web — lát tiền Wave 0

Chạy ngày 22/10/2026:

| Bước | Kết quả |
|---|---|
| `tsc --noEmit` (apps/web) | ✅ PASS |
| `next build` | ✅ PASS — đủ route `/vi` + `/en` gồm `login`, `register`, `triage` (4.21 kB) |
| Khóa i18n vi/en | ✅ Khớp 1-1 (64/64 khóa, kiểm bằng script) |
| Kiểm chứng hợp đồng API của client (`src/lib/api.ts`) | ✅ PASS 11/11 assertion — chạy thật với **mock API** viết đúng hợp đồng (register → login sai 401 → me → tạo workspace/team → simulate 2 intake → triage NEW → accept ra issue `DEV-1` → dismiss → hết NEW) |
| Smoke test `next start` | ✅ `/` → 307 `/vi`; `/vi/login`, `/en/login`, `/vi/register`, `/en/register` render đúng chuỗi; `/vi/triage` trả 200 (vỏ loading phía client) |
| Flow trình duyệt end-to-end với API thật | ⚠️ CHƯA CHẠY — lúc kiểm chứng, `apps/api` chưa chạy tại localhost (backend đang được hoàn thiện song song; VM không có Docker để dựng PostgreSQL). Khi API lên: chạy `npm run dev:api` + `npm run dev:web` rồi đăng ký tài khoản mới để đi hết flow. Client đã xử lý API vắng mặt bằng thông báo "Không kết nối được máy chủ" + nút Thử lại, không sập trang. |

## Trạng thái phần web — Wave 1 (Agent G, 22/10/2026)

Đã nối API thật (theo đúng hợp đồng của Agent D/E/F) cho Issues, Cycles, Projects:

- **`/issues`** — 2 chế độ: *Danh sách* (bảng key/tiêu đề/trạng thái/ưu tiên/người gán/hạn; lọc theo team + trạng thái + ô tìm `q` debounce 300ms; bấm dòng → chi tiết) và *Bảng* (board 6 cột theo `statusGroup`: Backlog/Todo/In Progress/In Review/Done/Canceled; kéo-thả HTML5 → `PATCH /issues/:id {status}`, kèm `<select>` đổi trạng thái ngay trên thẻ làm fallback). Nút **Tạo issue**: team, tiêu đề, mô tả, priority, gắn cycle/project từ danh sách thật.
- **`/issues/[id]`** — sửa tiêu đề/mô tả/assignee/labels/estimate/hạn trong form chính; cột thuộc tính đổi nhanh trạng thái/priority/cycle/project bằng select (PATCH ngay); khu **bình luận** đọc + đăng; nút xóa issue (có `confirm`) → về danh sách.
- **`/cycles`** — danh sách cycle theo team kèm thanh tiến độ % (từ `progress` của API); form tạo cycle (mặc định 2 tuần). **`/cycles/[id]`** — issues trong cycle, thêm issue (chỉ issue cùng team chưa có cycle), gỡ issue, nút **Đóng cycle** (`POST /close {createNext:true}`) → thông báo số issue đã lăn sang cycle kế.
- **`/projects`** — lưới project kèm % tiến độ + ngày đích; form tạo. **`/projects/[id]`** — sửa tên/mô tả/ngày đích, issues thuộc project + thêm/gỡ issue, tiến độ tự cập nhật.
- **`/triage`** — thêm dòng thông tin **địa chỉ email nhận việc** (`GET /workspaces/:id/intake-email` từ Agent F) kèm nút sao chép; ẩn khi API chưa có.
- `src/lib/api.ts` bổ sung đủ hàm Issues/Cycles/Projects/IntakeEmail theo mẫu Wave 0; Sidebar thêm mục **Issues**. Khóa i18n mới thêm vào namespace `Issues`, `IssueDetail`, `Cycles`, `Projects`, `Nav`, `Triage`.

| Bước kiểm chứng | Kết quả |
|---|---|
| `tsc --noEmit` (apps/web) | ✅ PASS |
| `next build` | ✅ PASS — route mới ×2 locale: `issues` (3.37 kB), `issues/[id]`, `cycles`, `cycles/[id]`, `projects`, `projects/[id]` |
| Khóa i18n vi/en | ✅ Khớp 1-1 (187/187 khóa, kiểm bằng script — Wave 0 là 64) |
| Contract test qua `lib/api.ts` với mock API (`apps/web/scripts/mock-api.mjs` + `contract-test.mjs`) | ✅ PASS **27/27 assertion**: tạo issue → key DEV-1/DEV-2, lọc q/team, PATCH status/priority/labels/assignee, comment; tạo cycle → gắn 2 issue → progress 0% → 50% → đóng cycle lăn đúng issue chưa xong sang cycle kế → gỡ issue; tạo project → gắn 2 issue → progress 50% → PATCH tên → gỡ issue; intake-email; xóa issue → GET 404 |
| Smoke test `next start` | ✅ 200 cho `/vi|en/issues`, `/vi/issues/[id]`, `/vi|en/cycles`, `/vi/cycles/[id]`, `/vi|en/projects`, `/vi/projects/[id]`, `/vi/triage`, `/en/login` (vỏ client) |
| Flow với API thật tại localhost:4000 | ⚠️ CHƯA CHẠY — tại thời điểm kiểm chứng API thật không chạy đồng thời (backend Wave 1 làm song song). Client đã xử lý API vắng mặt bằng thông báo + nút thử lại; khi API lên chỉ cần `npm run dev:api` + `npm run dev:web` là đi hết flow. |

## Trạng thái phần web — Wave 2 (Agent I, 22/10/2026)

Đã nối API (theo hợp đồng backend Wave 2 đang xây song song) cho Inbox, My Issues và Command Palette:

- **`/inbox`** — danh sách thông báo của tôi qua `GET /notifications?unreadOnly=&limit=50`, mới nhất trước; nhãn màu theo loại (ASSIGNED/COMMENT/MENTION/STATUS_CHANGED, loại lạ → nhãn "Thông báo" chung); item chưa đọc có chấm đỏ + nền nổi bật; bộ lọc Tất cả/Chưa đọc; nút **"Đánh dấu tất cả đã đọc"** (`POST /notifications/read-all`); bấm item → `PATCH /notifications/:id/read` (cập nhật lạc quan) rồi điều hướng tới `/issues/[id]` nếu thông báo gắn issue. Trạng thái rỗng riêng cho "tất cả" và "chưa đọc".
- **Huy hiệu chưa đọc trên Sidebar** — `InboxProvider` (`src/lib/inbox-context.tsx`) giữ số chưa đọc từ `GET /notifications/unread-count`: nạp khi shell mount, khi đổi route, và khi cửa sổ focus lại; trang Inbox trừ/gán lạc quan ngay khi đọc nên huy hiệu khớp mà không chờ làm mới. Sidebar còn có nút **Tìm kiếm** mở Command Palette.
- **`/my-issues`** — issue gán cho tôi qua `GET /me/issues`, gom nhóm theo `statusGroup` (đang làm/review trước, Done/Canceled cuối), chip lọc theo nhóm + "Tất cả"; mỗi dòng hiện key, tiêu đề, workspace/team (nếu API trả kèm), ưu tiên, trạng thái, hạn; bấm → chi tiết issue. Trạng thái rỗng: "Bạn chưa được gán việc nào."
- **Command Palette (Cmd+K / Ctrl+K)** — component `CommandPalette.tsx` gắn trong `AppShell` (chỉ ở trạng thái đã đăng nhập + có workspace), mở thêm được bằng nút Tìm kiếm ở Sidebar (event `gomly:open-palette`). Chưa nhập: mục "Đi tới" (Triage, Issues, Cycles, Projects, Inbox, My Issues) + "Hành động" (Tạo issue mới → `/issues?new=1`, IssuesClient tự mở form — hoặc event `gomly:new-issue` nếu đang ở sẵn trang; Đổi ngôn ngữ VI/EN tại chỗ; Đăng xuất). Đã nhập: lọc lệnh theo chữ + tìm issue theo `q` ở workspace hiện tại (debounce 250ms, tối đa 8 kết quả: key + tiêu đề + trạng thái) → Enter/bấm đi tới chi tiết issue. Phím ↑/↓ + Enter, Esc đóng, bấm nền mờ để đóng.
- `src/lib/api.ts` bổ sung: type `Notification` (+ `NotificationActor`), `fetchNotifications`, `fetchUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`, `fetchMyIssues`. Khóa i18n mới ở namespace `Inbox`, `MyIssues`, `Palette`, `Nav.search`.

| Bước kiểm chứng | Kết quả |
|---|---|
| `tsc --noEmit` (apps/web) | ✅ PASS |
| `next build` | ✅ PASS — route `inbox` (5.17 kB) + `my-issues` (4.35 kB) ×2 locale, cùng toàn bộ route cũ |
| Khóa i18n vi/en | ✅ Khớp 1-1 (212/212 khóa, kiểm bằng script — Wave 1 là 187; +25 khóa Wave 2) |
| Contract test Wave 2 qua `lib/api.ts` (`apps/web/scripts/contract-test-wave2.mjs`, mock đã thêm route notifications + `/me/issues`) | ✅ PASS **18/18 assertion**: unread-count 3 → list 4 (mới nhất trước) → unreadOnly 3 → limit → mark read → count 2 → read-all → count 0; my issues chỉ trả việc gán cho user hiện tại + lọc statusGroup/workspaceId; tìm kiếm `q` theo tiêu đề và theo key (phục vụ palette) |
| Contract test Wave 1 (hồi quy) | ✅ PASS 27/27 — mock mở rộng không làm gãy flow cũ |
| Smoke test `next start` | ✅ 200 cho `/vi/inbox`, `/en/inbox`, `/vi/my-issues`, `/en/my-issues`, `/vi/issues` (vỏ client); chuỗi sự kiện palette (`gomly:open-palette`, `gomly:new-issue`) có mặt trong bundle layout/issues đã build |
| Tương tác trình duyệt thật (mở palette bằng Cmd+K, kéo chuột, flow với API thật) | ⚠️ CHƯA LÁI THỬ — không có trình duyệt điều khiển trong môi trường agent; listener Cmd+K/focus/refetch đã kiểm ở mức code + bundle. Khi API Wave 2 lên: `npm run dev:api` + `npm run dev:web`, đăng nhập rồi bấm Cmd+K để đi hết flow. |

## Trạng thái phần web — Wave 3 (Agent M, 22/10/2026)

Đã nối API (theo hợp đồng backend Wave 3 của Agent K, xây song song) cho trang capture công khai, quản lý thành viên và link capture ở Triage:

- **Trang capture CÔNG KHAI `/[locale]/capture/[token]`** (`components/CapturePublicClient.tsx`) — route độc lập: AppShell nhận diện tiền tố `/capture/` và KHÔNG chuyển về /login, không sidebar. Tải `GET /capture/:token/info` → hiện tên workspace/team + form (tên người gửi, tiêu đề, nội dung) + **honeypot `website`** ẩn khỏi người dùng thật (chỉ bot tự điền) → `POST /capture/:token` → màn hình cảm ơn (nêu rõ yêu cầu đã vào hộp thư Triage của team). Token sai/đã thu hồi (404/410) → trang "Link không còn hiệu lực"; mất mạng → thông báo + nút Thử lại. Header có tên Gomly + khẩu hiệu theo locale + nút đổi ngôn ngữ.
- **Quản lý thành viên `/[locale]/members`** (`components/MembersClient.tsx`) + mục **Thành viên** ở Sidebar và Command Palette: danh sách (avatar/initial, tên, email, ngày tham gia, nhãn vai trò OWNER/ADMIN/MEMBER/GUEST qua i18n), form thêm bằng email + chọn vai trò MEMBER/ADMIN/GUEST với lỗi đúng nghĩa theo mã trạng thái (404 = chưa có tài khoản, 409 = đã là thành viên, 403 = không có quyền), nút xóa kèm `confirm` (lỗi từ API được hiển thị nếu bị chặn — VD OWNER cuối). **Lựa chọn đã chốt:** API workspace hiện không trả vai trò của chính người dùng cho client, nên form thêm luôn hiển thị và để API chặn 403 khi không phải OWNER/ADMIN.
- **Thẻ link capture ở `/triage`** — nếu workspace đã có capture link: hiện đầy đủ `origin/<locale>/capture/<token>` + nút Sao chép; chưa có: nút "Tạo link gửi việc" (tạo cho team đầu tiên) rồi hiện link. Nhãn kênh trên badge Triage cũng đã qua khóa i18n (`Triage.channel.*`, fallback mã gốc nếu kênh lạ).
- **`src/lib/api.ts`** bổ sung: `createCaptureLink/fetchCaptureLinks/deleteCaptureLink`, `fetchCaptureInfo/submitCapture` (không auth), `fetchMembers/addMember/removeMember`, `updateIntegrationConfig` (PATCH config Slack — **chưa gắn UI công tắc** vì web hiện không có màn hình quản lý tích hợp để gắn vào).

### Rà soát song ngữ toàn web (Wave 3)

- Parity kiểm bằng script `apps/web/scripts/check-i18n.mjs`: **255/255 khóa khớp 1-1 VI/EN, không khóa nào rỗng** (Wave 2: 212; Wave 3 thêm 43 khóa: `Capture` 17, `Members` 20, `Nav.members`, `Triage.captureLabel/captureCreate` + `Triage.channel.*` 4).
- Quét toàn bộ `src/components`, `src/app`, `src/lib` (chuỗi có dấu tiếng Việt + văn bản Anh cứng trong JSX/placeholder/title/aria-label): **không còn chuỗi hiển thị cứng nào chưa qua i18n** — các chuỗi tiếng Việt tìm được chỉ nằm trong comment code và thông báo lỗi nội bộ cho lập trình viên (throw khi thiếu Provider). Ngoại lệ duy nhất: `placeholder="DEV"` ở Onboarding là ví dụ mã team (không phải chuỗi ngôn ngữ).
- Nhãn động đã đủ khóa: trạng thái issue (`Issues.status.*` 6), độ ưu tiên (`Issues.priority.*` 5), kênh (`Triage.channel.*` 4, mới bổ sung wave này), vai trò (`Members.roles.*` 4, mới), loại thông báo (`Inbox.types.*` 5). Nội dung động từ server (tiêu đề issue, thân thông báo, message lỗi API) hiển thị nguyên văn theo thiết kế các wave trước.

| Bước | Kết quả |
|---|---|
| `tsc --noEmit` (apps/web) | ✅ PASS |
| `next build` | ✅ PASS — route mới `/[locale]/capture/[token]` (ƒ dynamic) + `/[locale]/members` ×2 locale, đủ route cũ |
| Contract test Wave 3 (`apps/web/scripts/contract-test-wave3.mjs`, mock đã thêm route capture-links/members/capture/config) | ✅ PASS **19/19 assertion**: tạo/list/xóa link, info + submit công khai (kèm honeypot), token sai → 404, members list/thêm 201/trùng 409/chưa có tài khoản 404/xóa, PATCH config |
| Contract test Wave 1 + Wave 2 (hồi quy) | ✅ PASS 27/27 và 18/18 |
| Parity i18n (`scripts/check-i18n.mjs`) | ✅ 255/255 khóa khớp, không khóa rỗng |
| Smoke `next start` | ✅ 200 cho `/vi/capture/token-gia`, `/en/capture/token-gia`, `/vi/members`, `/en/members` (vỏ) |
| Lái thử trình duyệt headless (Chromium, web → **mock API**) | ✅ Token giả → hiện đúng trạng thái "Link không còn hiệu lực" (VI) / "This link is no longer valid" (EN), không sập, không bị đá về login; token thật → form render đúng tên workspace/team + trường honeypot có trong DOM; `/vi/members` khi chưa đăng nhập vẫn bị AppShell chuyển về login (chỉ capture là công khai). Khi lái thử phải tắt CORS của trình duyệt vì mock API không gửi header CORS — giới hạn của mock, không phải của app |
| Flow với API thật (Agent K) tại localhost:4000 | ⚠️ CHƯA CHẠY — API Wave 3 đang xây song song, chưa chạy tại thời điểm kiểm chứng. Khi API lên: tạo link ở Triage → mở link ở chế độ ẩn danh → gửi yêu cầu → kiểm tra item vào Triage |

### Lưu ý mạng khi cài đặt (quan trọng)
Trên VM này, kết nối tải binary từ CDN của Prisma (binaries.prisma.sh / npmmirror qua trình tải tích hợp của Prisma)
bị reset (ECONNRESET) khiến `npm install` thường và `@prisma/engines` postinstall đều lỗi.
Cách đã dùng thành công:
1. `npm install --ignore-scripts`
2. Chạy `bash scripts/setup-prisma-engines.sh` để tải engines qua curl (theo redirect của mirror thì được).
3. Khi chạy lệnh prisma, truyền kèm `PRISMA_QUERY_ENGINE_LIBRARY` và `PRISMA_SCHEMA_ENGINE_BINARY` trỏ vào file engine vừa tải (script có in sẵn lệnh mẫu ở cuối).
Trên máy dev bình thường (mạng không bị chặn) thì `npm install` mặc định là đủ, không cần các bước trên.

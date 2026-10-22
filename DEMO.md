# Gomly — Hướng dẫn chạy demo & kịch bản trình diễn 5 phút

> Gomly — "Mọi việc, về một mối": mọi yêu cầu từ **Zalo, Slack, email, GitHub** đổ về **một Triage duy nhất**, biến thành issue và chạy theo cycle tới Done.
> Tài liệu này giúp một người **chưa từng chạy dự án** cũng dựng được bản demo từ số 0 và dẫn lại trọn kịch bản 5 phút (kịch bản nghiệm thu phát hành tại mục 8 PRD v1.2).
> Kiểm chứng tự động thay cho tổng duyệt tay: `node scripts/acceptance-demo.mjs` (xem mục 5).

---

## 1. Tài khoản & dữ liệu demo (sau khi seed)

| Hạng mục | Giá trị |
|---|---|
| Tài khoản chính (lead/owner) | `demo@gomly.dev` / `demo1234` — OWNER workspace "Gomly Demo" |
| Tài khoản phụ (dev được gán việc) | `demo2@gomly.dev` / `demo1234` — MEMBER |
| Workspace | **Gomly Demo** (slug `gomly-demo`), team **DEV** |
| Triage sẵn có | 4 yêu cầu mẫu NEW, mỗi kênh 1 cái: Zalo (khách báo lỗi thanh toán), Slack (nhờ review PR), Email (đề xuất báo cáo tồn kho), GitHub (bug API /orders 500) |
| Project mẫu | **Ví điểm thưởng v2** — 4 issue `[Demo]`: 1 DONE, 1 IN_PROGRESS, 1 TODO, 1 BACKLOG → tiến độ **25%** |
| Cycle mẫu | **Cycle demo — Sprint hiện tại** (đang ACTIVE, cửa sổ 2 tuần quanh hôm nay) — chứa 3 issue mẫu → tiến độ **33%** |
| Địa chỉ email nhận việc của workspace | `intake+gomly-demo@gomly.local` (hiện sẵn trong trang Triage, có nút sao chép) |
| Cổng | Web **3000** · API **4000** · PostgreSQL **5432** (máy dev chuẩn) / **5434** (VM hiện tại) |

Seed nằm ở `app/scripts/seed-demo.mjs` — **idempotent tuyệt đối**: chạy lại bao nhiêu lần cũng không tạo trùng, không phá dữ liệu đã có (đã kiểm chứng chạy 2 lần liên tiếp, đếm lại: 2 user demo, 4 intake mẫu, 1 project mẫu, 1 cycle mẫu, 4 issue `[Demo]`).

---

## 2. Chạy demo từ số 0 — máy dev chuẩn (có Docker)

Yêu cầu: Node.js ≥ 20, npm ≥ 10, Docker.

```bash
cd gomly/app

# 1) Cài dependencies
npm install

# 2) File môi trường (điền JWT_SECRET bất kỳ cho local; DATABASE_URL mặc định
#    trỏ postgres của docker compose ở bước 3)
cp .env.example .env
cp .env.example apps/api/.env

# 3) Bật PostgreSQL 16 + Redis 7
docker compose up -d

# 4) Sinh Prisma client + migrate schema vào DB
npm run db:generate
npm run migrate:dev -w @gomly/db

# 5) Seed dữ liệu demo (chạy lại an toàn)
node scripts/seed-demo.mjs

# 6) Chạy API (terminal riêng) — http://localhost:4000
npm run dev:api
curl http://localhost:4000/health        # -> {"status":"ok",...}

# 7) Chạy web (terminal riêng) — http://localhost:3000 (tự chuyển về /vi)
npm run dev:web
```

Đăng nhập tại `http://localhost:3000/vi/login` bằng `demo@gomly.dev` / `demo1234` → vào thẳng Triage của workspace Gomly Demo.

---

## 3. Chạy demo trên VM hiện tại (không có Docker)

VM này không có Docker (và `apt` đang treo), nên PostgreSQL chạy bằng **embedded-postgres** ở cổng **5434**, datadir `/tmp/gomly-pgdata`, DB `gomly_dev`. Các file `.env` đã trỏ sẵn vào DB này — **không sửa**.

```bash
# 1) Nếu Postgres 5434 chưa chạy (kiểm tra: ss -ltn | grep 5434), khởi động lại:
BIN=/tmp/pg-embed/node_modules/@embedded-postgres/linux-x64/native/bin
runuser -u nobody -- $BIN/pg_ctl -D /tmp/gomly-pgdata -o "-p 5434 -k /tmp -c listen_addresses=localhost" -l /tmp/gomly-pg.log start

cd ~/workspace/gomly/app

# 2) (Chỉ khi schema thay đổi) migrate + seed — seed chạy lại an toàn
npm run migrate:dev -w @gomly/db
node scripts/seed-demo.mjs

# 3) Chạy API từ bản build (nhanh, ổn định cho buổi demo)
npm run build:api
(cd apps/api && node dist/main.js)        # terminal riêng, cổng 4000
curl http://localhost:4000/health

# 4) Chạy web từ bản build có sẵn
(cd apps/web && npx next start -p 3000)   # terminal riêng, cổng 3000
```

> Redis chưa có trên VM: hàng đợi intake chạy **đồng bộ** qua processor dự phòng (điểm gắn BullMQ đã để sẵn trong code) — demo không khác biệt về trải nghiệm, yêu cầu vẫn vào Triage ngay.

---

## 4. Checklist trước giờ demo (5 phút chuẩn bị)

- [ ] PostgreSQL đang chạy (5432 máy dev / 5434 trên VM), API `GET /health` trả `status: ok`.
- [ ] Đã chạy `node scripts/seed-demo.mjs` ít nhất 1 lần trong ngày — dòng cuối phải in: Triage NEW có 4 item mẫu của seed, Project "Ví điểm thưởng v2" tiến độ 25%, Cycle mẫu chứa 3 issue.
- [ ] Đăng nhập thử `demo@gomly.dev` thấy Triage + mở được trang Projects (25%) và Cycles.
- [ ] Mở sẵn 2 cửa sổ trình duyệt: cửa sổ 1 đăng nhập tài khoản **demo** (lead), cửa sổ 2 (ẩn danh/tab riêng) đăng nhập **demo2** (dev) để cho khán giả thấy Inbox/My Issues của người được gán.
- [ ] Chuẩn bị sẵn các lệnh curl ở mục 6 trong terminal (đã thay secret/slug đúng workspace demo) nếu muốn "gửi thật" thay vì dùng 4 item seed có sẵn.
- [ ] Trình duyệt để sẵn trang Triage; kiểm tra Cmd+K mở được Command Palette.
- [ ] Dự phòng mạng: toàn bộ demo chạy localhost, không cần internet (trừ khi muốn nối kênh thật bên ngoài — không khuyến khích trong buổi demo).

---

## 5. Kịch bản trình diễn 5 phút (khớp mục 8 PRD)

Người dẫn: tài khoản **demo@gomly.dev** (lead). Thông điệp xuyên suốt: *"Việc phát sinh ở đâu cũng được — Zalo, Slack, email, GitHub — nhưng chỉ có **một nơi** để xử lý: Triage của Gomly."*

### Bước 1 — Bốn kênh, một Triage (~1,5 phút)

- **Bấm gì:** mở trang **Triage**.
- **Nói:** "Đây là sáng thứ Hai của một tech lead: khách nhắn Zalo báo lỗi thanh toán, đồng đội nhờ review trên Slack, đối tác gửi email đề xuất tính năng, và một bug được mở trên GitHub. Bốn kênh khác nhau — nhưng cả bốn đều đã nằm trong **cùng một hàng chờ**, đủ nội dung gốc, thấy rõ kênh nguồn."
- **Chỉ vào:** 4 item NEW với badge ZALO / SLACK / EMAIL / GITHUB; bấm mở 1 item xem nội dung gốc.
- **Kết quả mong đợi:** 4 yêu cầu trong cùng Triage, không phải chép tay từ kênh nào.
- **Nếu muốn "gửi thật" ngay tại buổi demo:** chạy lần lượt các lệnh curl ở mục 6 (GitHub issue mới, email mới, lệnh Slack `/gomly`, link bắt việc nhanh Zalo) — mỗi lệnh chạy xong, item tương ứng xuất hiện trong Triage. *Dự phòng nếu kênh thật chưa nối:* dùng nút **"Tạo yêu cầu mẫu"** trên trang Triage (chọn kênh) — item vào Triage qua đúng pipeline intake, chỉ khác nguồn phát sinh.

### Bước 2 — Duyệt Triage: accept + dismiss (~1 phút)

- **Bấm gì:** Accept item **GitHub** (bug API /orders) → chọn team DEV, gán cho **Demo Member (demo2)** → issue được tạo (ghi lại mã, dạng `DEV-n`). Accept thêm item **Zalo**. Mở project **Ví điểm thưởng v2** hoặc trang issue vừa tạo để gắn issue vào cycle **Cycle demo — Sprint hiện tại** và project mẫu. Dismiss item **Slack** kèm lý do (ví dụ "đã xử lý trực tiếp trong thread").
- **Nói:** "Duyệt Triage là việc duy nhất lead phải làm tay: nhận thành việc thì gán người ngay; không phải việc thì bỏ qua **kèm lý do** — item rời hàng chờ nhưng không bao giờ bị xóa, tra lại được."
- **Kết quả mong đợi:** issue mới xuất hiện ở Backlog; item đã xử lý rời hàng chờ NEW; tiến độ project/cycle hiển thị; (chuyển sang cửa sổ demo2) **Inbox của demo2 có thông báo được gán việc**.

### Bước 3 — Dev làm việc: PR mở → In Progress (~1 phút)

- **Bấm gì:** (dự phòng bằng curl mục 6.1b) gửi webhook GitHub "PR opened" với branch chứa mã issue vừa accept, ví dụ `feat/DEV-8-fix-orders-500`.
- **Nói:** "Dev không phải quay lại công cụ để cập nhật trạng thái. Chỉ cần branch/PR chứa mã issue — Gomly tự hiểu việc đang được làm."
- **Kết quả mong đợi:** issue tự chuyển **IN_PROGRESS**; My Issues của demo2 cập nhật.

### Bước 4 — Merge PR → Done, tiến độ tự nhảy (~1 phút)

- **Bấm gì:** (curl mục 6.1c) gửi webhook "PR merged".
- **Nói:** "Merge xong là xong: không ai phải nhớ quay lại đóng việc."
- **Kết quả mong đợi:** issue tự chuyển **DONE**; **% tiến độ cycle và project tăng tương ứng** (mở trang Cycles/Projects để khán giả thấy số nhảy); Inbox demo2 có thông báo đổi trạng thái.

### Bước 5 — Song ngữ VI ↔ EN (~0,5 phút)

- **Bấm gì:** nhấn **Cmd+K** (hoặc Ctrl+K) → chọn lệnh đổi ngôn ngữ sang **English** → toàn bộ giao diện chuyển EN; lặp lại để quay về **Tiếng Việt**. (Cũng đổi được bằng nút VI/EN ở sidebar.)
- **Nói:** "Team Việt dùng tiếng Việt, đối tác nước ngoài dùng tiếng Anh — cùng một sản phẩm, đổi tại chỗ, không tải lại, không mất việc đang làm dở."
- **Kết quả mong đợi:** mọi chuỗi giao diện đổi ngôn ngữ, thao tác đang dở không bị phá.

**Câu kết:** "Đó là toàn bộ vòng đời một yêu cầu: phát sinh ở bất kỳ kênh nào → Triage → issue → cycle → Done — trong 5 phút, không một thao tác chép tay."

---

## 6. Lệnh mẫu gửi yêu cầu thật qua webhook (dự phòng kênh chưa nối)

Chạy từ máy đang chạy API. Thay `WS_ID` bằng id workspace Gomly Demo (lấy ở dòng "Workspace:" khi chạy seed, hoặc `GET /workspaces` sau khi đăng nhập) và đăng nhập lấy token trước:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@gomly.dev","password":"demo1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
WS_ID=<id-workspace-gomly-demo>
```

### 6.1 GitHub — nối repo + issue mới + vòng đời PR

```bash
# a) Nối repo (một lần): secret tự đặt, webhook thật của GitHub phải dùng đúng secret này
curl -s -X POST http://localhost:4000/workspaces/$WS_ID/integrations/github \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"repoFullName":"gomly-demo/shop-api","webhookSecret":"demo-gh-secret"}'

# b+c) Issue mới -> Triage; PR opened -> IN_PROGRESS; PR merged -> DONE
# (node ký HMAC trên đúng payload gửi đi, thay DEV-8 bằng mã issue thật khi demo bước 3-4)
node -e '
const c = require("node:crypto");
const send = async (payload) => {
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + c.createHmac("sha256", "demo-gh-secret").update(raw).digest("hex");
  const r = await fetch("http://localhost:4000/webhooks/github", { method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: raw });
  console.log(r.status, await r.text());
};
(async () => {
  await send({ action: "opened", issue: { number: 77, title: "[Bug] Thanh toán VNPay không cập nhật trạng thái", body: "Khách báo đã trừ tiền nhưng đơn vẫn chờ thanh toán.", user: { login: "khach-hang-a" } }, repository: { full_name: "gomly-demo/shop-api" } });
  await send({ action: "opened", pull_request: { number: 78, title: "fix: DEV-8 xu ly gio hang rong", head: { ref: "feat/DEV-8-fix-orders-500" }, merged: false }, repository: { full_name: "gomly-demo/shop-api" } });
  await send({ action: "closed", pull_request: { number: 78, title: "fix: DEV-8 xu ly gio hang rong", head: { ref: "feat/DEV-8-fix-orders-500" }, merged: true }, repository: { full_name: "gomly-demo/shop-api" } });
})();'
```

### 6.2 Email — gửi vào địa chỉ nhận việc của workspace

```bash
curl -s -X POST http://localhost:4000/webhooks/email -H 'Content-Type: application/json' \
  -d '{"to":"intake+gomly-demo@gomly.local","from":"chi.mai@khachhang.vn","subject":"Yêu cầu: thêm cổng thanh toán MoMo","text":"Khách đề xuất thêm MoMo để thanh toán nhanh hơn.","messageId":"demo-mail-001"}'
```

> Nếu môi trường đã đặt `INTAKE_EMAIL_SECRET`, thêm header `-H "X-Intake-Secret: <secret>"` (thiếu/sai → 401). Trên VM hiện tại biến này **chưa đặt** nên webhook cho qua kèm log cảnh báo — chỉ chấp nhận được ở môi trường dev/demo nội bộ.

### 6.3 Slack — lệnh /gomly

```bash
# Nối Slack (một lần): team id + signing secret tự đặt cho buổi demo
curl -s -X POST http://localhost:4000/workspaces/$WS_ID/integrations/slack \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"slackTeamId":"T_DEMO","slackTeamName":"Demo Slack","signingSecret":"demo-slack-secret"}'

# Gửi slash command đã ký v0 (đúng chuẩn Slack)
node -e '
const c = require("node:crypto");
(async () => {
  const form = new URLSearchParams({ command: "/gomly", text: "App mobile crash khi mở màn hình ví", user_name: "demo.dev", team_id: "T_DEMO", channel_name: "general", trigger_id: "trig-demo-" + Date.now() }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v0=" + c.createHmac("sha256", "demo-slack-secret").update(`v0:${ts}:${form}`).digest("hex");
  const r = await fetch("http://localhost:4000/webhooks/slack", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-slack-signature": sig, "x-slack-request-timestamp": ts }, body: form });
  console.log(r.status, await r.text());
})();'
```

### 6.4 Zalo — link bắt việc nhanh (phương án B, US-E3-12)

Zalo không có API chính thức cho tài khoản/nhóm cá nhân (kết luận spike Wave 0), nên kênh Zalo đi **phương án B**: người nhận yêu cầu qua Zalo mở **link bắt việc nhanh** của workspace, dán nội dung + tên người gửi → yêu cầu vào Triage với kênh nguồn **ZALO** y như các kênh khác.

- Tạo/lấy link: trang Triage hiển thị link bắt việc của workspace (mục Zalo quick-capture); hoặc qua API tạo capture link khi endpoint sẵn sàng.
- Người gửi mở link (không cần tài khoản Gomly), điền tiêu đề + nội dung + tên → gửi → quay lại Triage sẽ thấy item ZALO mới.
- *Dự phòng:* nút **"Tạo yêu cầu mẫu"** trên Triage với kênh ZALO, hoặc chuyển tiếp nội dung vào địa chỉ email nhận việc `intake+gomly-demo@gomly.local` (mục 6.2).

---

## 7. Nghiệm thu tự động (thay tổng duyệt tay)

```bash
cd ~/workspace/gomly/app
node scripts/acceptance-demo.mjs
```

Script tự dựng **ngữ cảnh nghiệm thu riêng** (user + workspace riêng, không đụng dữ liệu demo), chạy lần lượt **6 ô checklist phát hành** của PRD: 4 kênh → Triage · accept → issue + gán người + vào cycle · PR opened → IN_PROGRESS · PR merged → DONE + tiến độ project · web VI/EN đều 200 · không lỗi 5xx. Kết quả in ra console và ghi vào `~/workspace/gomly/docs/acceptance-wave3.md`. API chưa chạy thì script tự build + start ở cổng 4000 và tự tắt instance nó đã mở.

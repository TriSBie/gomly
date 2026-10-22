# Gomly — Kế hoạch triển khai production (v1, 22/10/2026)

> TRẠNG THÁI: User đã chốt **Phương án A** (22/10). **Đợt 0 ĐÃ XONG** (22/10): vá main.ts (PORT + CORS theo WEB_ORIGIN — đã kiểm chứng chạy giả lập prod: nghe đúng cổng host cấp, CORS chỉ mở cho origin web), Dockerfile.api + .dockerignore, .env.production.example; chạy lại nghiệm thu local sau vá: **6/6 PASS** (43 response, 0 lỗi 5xx). Lưu ý: Dockerfile chưa test build bằng Docker thật vì máy ảo dev không có Docker — Railway build lần đầu sẽ là bài test thật, cần theo dõi log. Đang chờ Đợt 1 (phần tài khoản phía user).

Mục tiêu: đưa MVP đã nghiệm thu 6/6 ra môi trường bền vững — web trên Vercel, API + DB trên host thật, hết cảnh Postgres nằm trong thư mục tạm của máy ảo dev (sự cố mất dữ liệu 22/10).

## 1. Hiện trạng code (đã kiểm tra thực tế)

| Điểm | Trạng thái | Việc cần làm |
|---|---|---|
| Web gọi API qua `NEXT_PUBLIC_API_URL` (mặc định localhost:4000) | ✅ Đã sẵn biến môi trường | Chỉ cần set trên Vercel |
| API cổng chạy | Đọc `API_PORT` (mặc định 4000) | Host thường cấp `PORT` → vá `main.ts` đọc `PORT ?? API_PORT ?? 4000` |
| CORS | `enableCors()` mở mọi origin | Vá: chỉ cho phép origin web production (biến `WEB_ORIGIN`), giữ localhost khi dev |
| Dockerfile | Chưa có (chỉ có docker-compose cho dev) | Viết Dockerfile API (build → prisma generate → start kèm `migrate deploy`) |
| Healthcheck | `GET /health` có sẵn | Dùng cho host + uptime monitor |
| Migration | 3 migration trong repo | Chạy `prisma migrate deploy` lúc khởi động/khâu release |
| Biến môi trường API | DATABASE_URL, JWT_SECRET, INTEGRATION_ENCRYPTION_KEY, INTAKE_EMAIL_SECRET | Tạo mới cho production (không dùng lại secret dev); INTAKE_EMAIL_SECRET lần này PHẢI đặt |
| Realtime Socket.IO | Mới ở mức kiến trúc, chưa code | Không phát sinh yêu cầu sticky-session ở đợt này |

## 2. Phương án hạ tầng (chọn 1)

### Phương án A — KHUYẾN NGHỊ: Vercel + Railway (API) + Neon (DB)
- Web: Vercel Hobby (miễn phí) — đã có tài khoản + kết nối sẵn.
- API: Railway Hobby ~$5/tháng (đã gồm $5 usage) — deploy từ GitHub/Docker, có custom domain + HTTPS tự động, log/metrics đủ dùng, không ngủ đông (webhook cần luôn thức).
- DB: Neon Free (Postgres 0.5GB, point-in-time restore) — thừa cho MVP; nâng cấp sau khi có khách thật.
- Ưu: ít vận hành nhất, mỗi tầng là đồ chuyên dụng tốt nhất trong tầm giá, DB có backup/PITR ngay từ gói free.
- Nhược: 3 nhà cung cấp (nhưng đều là tài khoản anh đã quen: Vercel/Neon từng dùng cho dự án khác).

### Phương án B — Rẻ nhất: Vercel + VPS Hetzner (API + Postgres cùng máy Docker)
- VPS CX22 ~€4.5/tháng chạy docker-compose (API + Postgres + Caddy tự cấp HTTPS).
- Ưu: 1 hóa đơn rẻ nhất, toàn quyền.
- Nhược: tự vận hành mọi thứ — cập nhật hệ điều hành, backup DB tự lo (script pg_dump + đẩy lưu trữ ngoài), sự cố nửa đêm tự xử. Hợp giai đoạn sau khi có doanh thu hơn là lúc cần tốc độ ra mắt.

### Không chọn
- Render Free: ngủ đông sau 15 phút → webhook GitHub/Slack/Zalo chết, loại. Supabase Free DB: tạm dừng sau 1 tuần không hoạt động + thêm lớp Auth/PostgREST không cần đến.

## 3. Tên miền (làm song song)
- Mua **gomly.app** (chính) + **gomly.dev** (dự phòng/chuyển hướng) — đã kiểm tra RDAP 21/10: cả hai còn trống giá gốc.
- Gán: `gomly.app` → web Vercel; `api.gomly.app` → API (Railway custom domain hoặc DNS CNAME theo hướng dẫn của host).
- Sau khi có domain: cập nhật URL webhook trên GitHub App/Slack App về `https://api.gomly.app/webhooks/...` và link capture thành `https://gomly.app/vi/capture/...`.

## 4. Các bước thực thi (thứ tự, có điểm kiểm chứng)

**Đợt 0 — Chuẩn bị code (≈30–45')** — assistant làm, anh không cần đụng
1. Vá `main.ts`: PORT fallback + CORS theo `WEB_ORIGIN`.
2. Viết `apps/api/Dockerfile` + `.dockerignore`; test build/run container ngay trên môi trường có Docker (hoặc test tương đương bằng bản build production + biến môi trường giả lập prod).
3. `.env.production.example` đầy đủ + checklist secret.
4. Kiểm chứng: acceptance script chạy lại ở local vẫn 6/6 sau khi vá.

**Đợt 1 — Dựng hạ tầng (≈30')** — cần anh ở các bước tài khoản/thanh toán
5. Anh tạo tài khoản Railway (đăng nhập GitHub) + gói Hobby ($5/tháng, cần thẻ).
6. Anh tạo project Neon (hoặc qua Vercel Marketplace) → lấy `DATABASE_URL` production.
7. Assistant cấu hình service API trên Railway (Dockerfile, biến môi trường, custom domain `api.gomly.app`), chạy migrate deploy, kiểm tra `/health`.
8. Assistant deploy web lên Vercel (project `gomly`), set `NEXT_PUBLIC_API_URL=https://api.gomly.app`, tắt SSO protection, gắn `gomly.app`.

**Đợt 2 — Kiểm chứng production (≈20')**
9. Chạy `scripts/acceptance-demo.mjs` trỏ vào API production → phải đạt 6/6 (script dùng ngữ cảnh riêng, không bẩn dữ liệu thật).
10. Smoke tay: mở `https://gomly.app` đăng nhập, gửi 1 việc qua link capture, xem Triage.
11. Production KHÔNG seed dữ liệu demo — tạo workspace thật đầu tiên của anh; dữ liệu demo giữ ở local.

**Đợt 3 — Vận hành tối thiểu (làm ngay sau khi live)**
12. Uptime monitor miễn phí (UptimeRobot) ping `/health` 5 phút/lần.
13. Backup: Neon PITR (có sẵn); ghi lịch rà soát dung lượng DB hàng tháng.
14. Ghi `docs/runbook-prod.md`: cách xem log, redeploy, rollback (Railway/Vercel đều có nút quay bản trước), đổi secret.

## 5. Chi phí dự kiến giai đoạn MVP
| Hạng mục | Chi phí |
|---|---|
| Vercel Hobby | $0 |
| Neon Free | $0 |
| Railway Hobby | ~$5/tháng |
| Tên miền gomly.app + .dev | ~$25–30/năm đầu |
| **Tổng** | **~$5/tháng + tiền miền năm đầu** |

## 6. Rủi ro & lưu ý
- Webhook các kênh (GitHub/Slack/Zalo) chỉ hoạt động thật sau khi có `api.gomly.app` công khai + cập nhật URL ở từng nhà cung cấp — làm ở Đợt 2/3, có checklist riêng.
- Secret production phải khác hẳn secret dev; `INTEGRATION_ENCRYPTION_KEY` mất là mất toàn bộ secret tích hợp đã lưu (ghi vào kho mật khẩu của anh).
- Socket.IO realtime khi làm sau này: Railway chạy 1 instance là ổn; nếu scale nhiều instance mới cần Redis adapter — lúc đó gắn Upstash Redis đồng thời kích hoạt BullMQ.
- DB production tách hẳn DB dev local — không đồng bộ dữ liệu demo lên prod.

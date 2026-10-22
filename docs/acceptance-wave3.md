# Nghiệm thu phát hành MVP — Wave 3 (kịch bản demo 5 phút, PRD mục 8)

- **Thời gian chạy:** lúc 11:31:41 Thứ Năm, 22 tháng 10, 2026 (Asia/Saigon)
- **Môi trường:** API http://localhost:4000 (PostgreSQL: postgresql://gomly:***@localhost:5434/gomly_dev?schema=public); Web http://localhost:3000; Node v24.20.0
- **Ngữ cảnh:** workspace nghiệm thu riêng "Acceptance acc-1792643461098" (slug `acceptance-acc-1792643461098`), team ACC — không đụng dữ liệu demo.
- **API do script tự start:** có (đã tắt sau khi chạy); **Web do script tự start:** có (đã tắt sau khi chạy).

| Ô | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | 4 kênh đổ về Triage | **PASS** | GitHub: connect 201, webhook issues.opened 200, effects=[{"type":"intake_item","channel":"GITHUB","intakeItemId":"1e4b903e-bfef-4dd4-95f6-878432c3a8f2","externalId":"acceptance/acc-repo-acc-1792643461098#501","created":true}]; Email: webhook 200 -> intake+acceptance-acc-1792643461098@gomly.local; Slack: connect 201, slash command ký v0 200; Zalo quick-capture: tạo link qua /workspaces/68d88405-1d7d-4929-a6b3-dbebf13af2d9/capture-links; submit công khai qua /capture/y6yisTTePfMtwsZXgIOKxVRORDvGGvLD -> 201. Item trong Triage: GITHUB=có, EMAIL=có, SLACK=có, ZALO=có; nội dung gốc 3 kênh webhook khớp payload đã gửi: true. |
| 2 | Accept → issue + gán người + cycle/project | **PASS** | accept 201 -> issue ACC-1 (assignee khớp: true); tạo cycle 201, gắn issue vào cycle 201 (khớp: true); tạo project 201, gắn issue 201 (khớp: true). Thêm thành viên qua: API members. |
| 3 | PR opened → IN_PROGRESS | **PASS** | webhook PR opened 200; trạng thái issue sau đó: IN_PROGRESS (statusGroup=IN_PROGRESS). |
| 4 | PR merged → DONE + tiến độ 100% | **PASS** | webhook PR merged 200; issue: DONE; tiến độ project: 100% (1/1 issue Done); tiến độ cycle: 100%. |
| 5 | Đổi ngôn ngữ VI ↔ EN (web) | **PASS** | GET /vi/triage -> 200; GET /en/triage -> 200 (web do script tự start từ bản build). Mức kiểm chứng: route hai locale đều phục vụ 200; đổi ngôn ngữ tương tác qua Cmd+K kiểm ở buổi demo. |
| 6 | Không lỗi 5xx toàn trình | **PASS** | Tổng 43 response đã ghi nhận; 5xx: 0. |

## Ghi chú

- Thêm thành viên nghiệm thu qua: **API members**.
- Ô2 của PRD (không mất nội dung gốc) được kiểm kèm trong Ô1: tiêu đề + nội dung các item GitHub/Email/Slack trong Triage khớp đúng payload đã gửi.
- Ô5 kiểm ở mức route VI/EN đều 200; thao tác đổi ngôn ngữ tương tác (Cmd+K) thuộc kiểm chứng giao diện tại buổi demo (DEMO.md, bước 5) và đợt rà soát song ngữ W3-T03.
- Webhook GitHub/Slack khớp kết nối theo repo / Slack team id trên toàn hệ thống (một repo / một Slack team chỉ thuộc một workspace tại một thời điểm) — script nghiệm thu vì vậy dùng repo + team id duy nhất cho mỗi lần chạy.

# Backlog thi công — Gomly MVP

> Nguồn: PRD Gomly v1.2 (`~/workspace/your_files/linear-clone-prd-mvp/linear-clone-prd-mvp.pdf`) — 31 user stories (US-E1-01…US-E7-03), 7 epic, release waves 0–3, kịch bản demo 5 phút (mục 8 của PRD) là chuẩn nghiệm thu phát hành.
> Stack đã chốt: Next.js (frontend, Vercel) + NestJS (backend, server dài hạn) + PostgreSQL (multi-tenancy theo `workspace_id`) + BullMQ/Redis (hàng đợi intake) + WebSocket/SSE (realtime).
> Bối cảnh nguồn lực: **1 developer solo, làm ngoài giờ, AI hỗ trợ tối đa**. Đích 3 tháng: MVP chạy end-to-end để demo + tìm người đồng hành.

## Cách đọc backlog này

- **Mã task:** `W<wave>-T<số>` — làm theo thứ tự phụ thuộc, không theo số thứ tự cứng.
- **Cỡ (t-shirt size)** — ước lượng cho **1 người làm ngoài giờ** (không phải ngày công full-time), chỉ để so sánh tương đối giữa các task, **không phải cam kết ngày tháng**:
  - **S** ≈ 1 buổi tối · **M** ≈ 2–3 buổi tối · **L** ≈ khoảng 1 tuần ngoài giờ · **XL** ≈ hơn 1 tuần ngoài giờ — gặp XL thì phải xé nhỏ trước khi bắt tay.
- **DoD rút gọn** của từng task là điều kiện tối thiểu để coi task xong; DoD toàn cục của MVP nằm ở mục 4 (checklist demo) và cuối PRD: mọi story **Must** đạt nghiệm thu + demo 5 phút đạt 6/6 + không còn lỗi blocking ở Flow A/B/C.
- **Nguyên tắc lát dọc (PRD mục 10):** mỗi wave kết thúc bằng một flow chạy được đầu-cuối, không kết thúc bằng "xong backend" hay "xong giao diện" riêng lẻ. Khi chậm: cắt **Should** trước, không cắt **Must**, không phá thứ tự kênh (GitHub + email → Slack → Zalo).

---

## 1. Danh sách task theo Wave

### Wave 0 — Spike Zalo + khung kiến trúc + auth/workspace tối thiểu

*Điều kiện hoàn thành wave (theo PRD): kết luận spike Zalo bằng văn bản; IntakeItem mẫu chạy qua được khung kiến trúc; đăng nhập và tạo workspace được.*

| Mã | Task | Story PRD | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| W0-T01 | Spike kiểm chứng Zalo API + kết luận phương án A/B bằng văn bản | Tiền đề US-E3-11/12 | M | — |
| W0-T02 | Dựng monorepo + khung Next.js/NestJS + CI cơ bản | Nền mục 11 | M | — |
| W0-T03 | Schema PostgreSQL lõi + multi-tenancy `workspace_id` + migrations | Mục 3, US-E1-05 | M | W0-T02 |
| W0-T04 | Auth: đăng ký/đăng nhập email | US-E1-01 | M | W0-T02, W0-T03 |
| W0-T05 | Workspace + team mặc định + tiền tố mã issue | US-E1-02, US-E1-03 | M | W0-T04 |
| W0-T06 | Mời thành viên bằng email + kiểm tra cô lập dữ liệu giữa workspace | US-E1-04, US-E1-05 | M | W0-T05 |
| W0-T07 | Hàng đợi BullMQ/Redis + khung adapter intake + thực thể IntakeItem | Mục 5.1, mục 7 | L | W0-T02, W0-T03 |
| W0-T08 | Adapter mẫu (bắt việc thủ công/webhook giả lập) chứng minh intake chạy qua khung | Mục 5.1 | S | W0-T07 |
| W0-T09 | Nền i18n khóa chuỗi (VI mặc định) + khung giao diện tối + chuyển VI/EN | Tiền đề US-E7-03 | M | W0-T02 |
| W0-T10 | Hạ tầng deploy tối thiểu + mua tên miền gomly.app + gomly.dev | Mục 11, mục 12 | S | W0-T02 |

**W0-T01 — Spike Zalo API.** Timebox cứng: hết giờ là chốt kết luận với bằng chứng hiện có. Kiểm chứng: điều kiện mở Zalo OA/bot cho doanh nghiệp, quyền nhận tin nhắn người dùng gửi vào OA/bot, quyền gửi phản hồi, giới hạn/quy trình phê duyệt. *DoD:* tài liệu kết luận 1–2 trang ghi rõ chọn phương án A (OA/bot, US-E3-11) hay B (link/mã bắt việc nhanh + chuyển tiếp email, US-E3-12), kèm bằng chứng (tài liệu API/ảnh chụp/lỗi truy cập nếu bị chặn). Không viết code sản phẩm trong task này.

**W0-T02 — Monorepo + khung app.** Một repo chứa `apps/web` (Next.js App Router) và `apps/api` (NestJS module hóa theo miền: workspace, issues, intake, cycles, projects, notifications, integrations); lint + test runner + CI chạy khi push. *DoD:* clone repo về, cài đặt theo README là chạy được cả web lẫn API ở local, CI xanh.

**W0-T03 — Schema + multi-tenancy.** Tạo bảng cho 10 thực thể ở mục 3 PRD (Workspace, User, Team, Issue, IntakeItem, Cycle, Project, Comment, Notification, IntegrationConnection); mọi bảng nghiệp vụ có `workspace_id`; guard kiểm soát truy cập ở tầng API. *DoD:* migration chạy từ đầu sạch sẽ; query thiếu ngữ cảnh workspace bị chặn ở tầng API.

**W0-T04 — Auth.** Đăng ký bằng email, xác thực, đăng nhập/đăng xuất; ưu tiên dùng thư viện/dịch vụ có sẵn, không tự viết crypto. *DoD:* đạt nghiệm thu US-E1-01 — đăng ký + xác thực xong thì đăng nhập được và được dẫn tới bước tạo workspace.

**W0-T05 — Workspace + team.** Tạo workspace lần đầu (slug không trùng), sinh 1 team mặc định, tạo thêm team với tiền tố mã issue riêng (ví dụ DEV). *DoD:* đạt nghiệm thu US-E1-02, US-E1-03.

**W0-T06 — Mời thành viên + cô lập workspace.** Mời bằng email vào đúng team; link mời hết hạn thì báo rõ và cho gửi lại. Viết test truy cập chéo: dùng URL trực tiếp của workspace khác phải trả lỗi không có quyền. *DoD:* đạt nghiệm thu US-E1-04, US-E1-05 kể cả đường API.

**W0-T07 — Khung intake hợp nhất.** Định nghĩa IntakeItem đúng mục 5.1 PRD (kênh nguồn, nội dung gốc lưu nguyên vẹn, team đích, trạng thái triage, liên kết issue); interface adapter dùng chung cho mọi kênh; webhook/email vào hàng đợi BullMQ xử lý bất đồng bộ, **lưu bản gốc trước — xử lý sau**, có thử lại khi lỗi và idempotency khi kênh gửi trùng sự kiện. *DoD:* một payload mẫu đi qua hàng đợi thành IntakeItem trạng thái "Mới"; gửi trùng payload không sinh item thứ hai; lỗi xử lý được ghi nhận để đối soát.

**W0-T08 — Adapter mẫu.** Một đầu vào tối giản (form nội bộ hoặc webhook giả lập) đẩy yêu cầu vào khung của W0-T07. *DoD:* gửi thử 1 yêu cầu → thấy IntakeItem trong cơ sở dữ liệu/hàng chờ thô. Đây là bằng chứng "khung kiến trúc sống" để kết thúc Wave 0.

**W0-T09 — Nền i18n.** Mọi chuỗi giao diện đi qua khóa i18n ngay từ khung đầu tiên; ngôn ngữ mặc định VI cho tài khoản mới; chuyển VI/EN không tải lại mất ngữ cảnh. *DoD:* khung giao diện + các màn auth/workspace không còn chuỗi cứng; đổi ngôn ngữ hoạt động.

**W0-T10 — Hạ tầng + tên miền.** Frontend lên Vercel; backend NestJS lên server dài hạn (Fly.io/Render/Railway/VPS — **không** chạy backend kiểu serverless trên Vercel); PostgreSQL + Redis ở bậc miễn phí/giá rẻ. Việc của chủ sản phẩm: mua gomly.app + gomly.dev (RDAP 21/10/2026: cả hai chưa đăng ký; gomly.com đã có chủ từ 2009). *DoD:* bản khung truy cập được qua tên miền thật, biến môi trường tách khỏi code.

### Wave 1 — Lõi việc (issues/cycles/projects) + intake GitHub & email

*Điều kiện hoàn thành wave (theo PRD): Flow A chạy với 2 kênh GitHub/email; Flow B chạy trọn tới Done qua merge PR.*

| Mã | Task | Story PRD | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| W1-T01 | Mô hình Issue + tạo issue nhanh (phím C) | US-E2-01 | M | W0-T05 |
| W1-T02 | Trang chi tiết issue: sửa trường + lịch sử hoạt động | US-E2-02 | L | W1-T01 |
| W1-T03 | Board + list theo nhóm trạng thái, kéo-thả đổi trạng thái | US-E2-03 | L | W1-T01 |
| W1-T04 | Bộ lọc issue (assignee / labels / status) | US-E2-04 | M | W1-T03 |
| W1-T05 | Bình luận + @mention trên issue | US-E2-05 | M | W1-T02 |
| W1-T06 | Hủy issue (Canceled) thay vì xóa — *Should, cắt đầu tiên khi trễ* | US-E2-06 | S | W1-T01 |
| W1-T07 | Màn hình Triage: hàng chờ hợp nhất + xem nội dung gốc | US-E3-01 + mục 5.6 | L | W0-T07, W0-T08 |
| W1-T08 | Thao tác Triage: accept / dismiss / gộp trùng + hoàn tác | US-E3-02, 03, 04 | L | W1-T07, W1-T01 |
| W1-T09 | Intake email: địa chỉ nhận việc riêng theo team | US-E3-05 | M | W0-T07, W1-T07 |
| W1-T10 | Kết nối GitHub repo vào team (IntegrationConnection) | US-E3-06 | M | W0-T07 |
| W1-T11 | GitHub issue mới → IntakeItem vào Triage | US-E3-07 | M | W1-T10, W1-T07 |
| W1-T12 | Tự động hóa Git: branch/PR chứa mã issue → In Progress; merge PR → Done | US-E3-08 | L | W1-T10, W1-T01 |
| W1-T13 | Cycles: tạo cycle (mặc định 2 tuần) + thêm/bớt issue | US-E4-01, US-E4-02 | M | W1-T01 |
| W1-T14 | Tiến độ cycle (% Done, không tính Canceled) | US-E4-03 | S | W1-T13 |
| W1-T15 | Đóng cycle + tự lăn việc chưa xong | US-E4-04 | M | W1-T13 |
| W1-T16 | Projects: tạo project + gán/gỡ issue hai chiều | US-E5-01, US-E5-02 | M | W1-T01 |
| W1-T17 | Trang tổng quan project + % tiến độ tự động | US-E5-03 | M | W1-T16, W1-T14 |

**W1-T01 — Issue + tạo nhanh.** Issue đủ trường cốt lõi mục 3.1 PRD; mã tự sinh theo tiền tố team + số tăng dần (DEV-123); tạo bằng phím C, chỉ cần tiêu đề là lưu được, mặc định Todo (hoặc Backlog nếu chọn). *DoD:* đạt nghiệm thu US-E2-01.

**W1-T02 — Chi tiết issue.** Sửa tiêu đề/mô tả (rich text cơ bản), assignee (0–1), priority 5 mức, labels (tên + màu do team định nghĩa), estimate, due date; mọi thay đổi ghi vào lịch sử hoạt động. *DoD:* đạt nghiệm thu US-E2-02.

**W1-T03 — Board/list.** Cột theo 6 nhóm trạng thái (Backlog, Todo, In Progress, In Review, Done, Canceled — mỗi nhóm 1 trạng thái mặc định); kéo-thả trên board hoặc chọn ở list, hai view luôn đồng nhất; phản hồi hiển thị tức thì (cập nhật lạc quan được phép, mục tiêu ~300 ms). *DoD:* đạt nghiệm thu US-E2-03.

**W1-T04 — Bộ lọc.** Lọc kết hợp assignee + labels + status; giữ nguyên bộ lọc khi chuyển list/board. *DoD:* đạt nghiệm thu US-E2-04.

**W1-T05 — Bình luận + mention.** Bình luận trên issue, nhắc tên thành viên; phía nhận thông báo thuộc Wave 2 (W2-T03) nhưng sự kiện mention phải được ghi nhận từ task này. *DoD:* đạt nghiệm thu US-E2-05 trừ phần Notification.

**W1-T06 — Canceled (Should).** Hủy issue thay vì xóa; Canceled không tính vào tiến độ nhưng vẫn tra cứu được. *DoD:* đạt nghiệm thu US-E2-06. **Đây là task Should duy nhất của MVP — ứng viên cắt đầu tiên.**

**W1-T07 — Màn hình Triage.** Một danh sách duy nhất cho mọi kênh, thấy rõ kênh nguồn; bấm vào xem nội dung gốc + link nguồn; mặc định chỉ hiện item "Mới", mới nhất trước, có bộ đếm chưa xử lý theo team; quyền xem giới hạn trong thành viên team sở hữu item; item mới đến được cập nhật realtime (WebSocket/SSE). *DoD:* đạt nghiệm thu US-E3-01 và các yêu cầu chung mục 5.6 PRD.

**W1-T08 — Thao tác Triage.** Accept: tạo issue (Backlog), chọn team (mặc định team đích) và gán người ngay trong thao tác, liên kết hai chiều item ↔ issue. Dismiss: kèm lý do, item rời hàng chờ nhưng tra cứu lại được. Gộp trùng: trỏ tới item/issue chính, item chính ghi nhận số bản trùng. Mọi thao tác xử lý xong cho hoàn tác (undo) vài giây; không thao tác nào được xóa nội dung gốc. *DoD:* đạt nghiệm thu US-E3-02, US-E3-03, US-E3-04.

**W1-T09 — Intake email.** Mỗi team có địa chỉ email nhận việc riêng; email gửi/chuyển tiếp vào địa chỉ đó thành IntakeItem qua dịch vụ email inbound có sẵn. *DoD:* đạt nghiệm thu kênh của US-E3-05 — gửi email → xuất hiện trong Triage trong thời gian hợp lý (mục tiêu dưới 2 phút) với đủ tiêu đề/nội dung/người gửi → accept thành issue được.

**W1-T10 — Kết nối GitHub.** Nối một hoặc nhiều repo vào team qua GitHub App/webhooks; kết nối hiện trong IntegrationConnection với trạng thái hoạt động; token mã hóa khi lưu, không ghi log, chỉ hiển thị che mờ; ngắt kết nối dừng đồng bộ ngay. *DoD:* đạt nghiệm thu US-E3-06.

**W1-T11 — GitHub issue → Triage.** Issue mới mở trên repo đã nối tự sinh IntakeItem, giữ link về issue GitHub gốc. *DoD:* đạt nghiệm thu kênh của US-E3-07.

**W1-T12 — Tự động hóa Git (xương sống của Flow B).** Branch/PR chứa mã issue (ví dụ `dev-123-fix-login`) → issue liên kết PR và chuyển In Progress; PR được merge → issue chuyển Done, không cần thao tác tay. Xử lý sự kiện trùng bằng idempotency của hàng đợi. *DoD:* đạt nghiệm thu US-E3-08 trong cả hai chiều sự kiện.

**W1-T13 — Cycles.** Tạo cycle với ngày bắt đầu/kết thúc đúng độ dài (mặc định 2 tuần), tạo được cycle tiếp nối; thêm/bớt issue từ backlog, issue thuộc tối đa 1 cycle tại một thời điểm. *DoD:* đạt nghiệm thu US-E4-01, US-E4-02.

**W1-T14 — Tiến độ cycle.** Tổng issue, số Done, % hoàn thành = Done / tổng (không tính Canceled), cập nhật ngay khi trạng thái đổi. *DoD:* đạt nghiệm thu US-E4-03.

**W1-T15 — Đóng cycle + lăn việc.** Đóng cycle: issue Done/Canceled ở lại cycle đã đóng; issue chưa xong chuyển sang cycle kế tiếp nếu đã có, chưa có thì về Backlog. *DoD:* đạt nghiệm thu US-E4-04 (Flow C chạy được).

**W1-T16 — Projects.** Tạo project (tên, mô tả, ngày đích, người phụ trách); gán issue vào project từ trang issue hoặc từ project, phản ánh hai chiều; 1 issue tối đa 1 project. *DoD:* đạt nghiệm thu US-E5-01, US-E5-02.

**W1-T17 — Tổng quan project.** % tiến độ tự động theo công thức như US-E4-03 (không có nhập tiến độ thủ công) + danh sách issue theo trạng thái. *DoD:* đạt nghiệm thu US-E5-03.

### Wave 2 — Intake Slack + Inbox/My Issues hoàn chỉnh + Cmd+K

*Điều kiện hoàn thành wave (theo PRD): Flow A đủ 3 kênh; thông báo và command palette đạt nghiệm thu epic.*

| Mã | Task | Story PRD | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| W2-T01 | Kết nối Slack workspace vào team + chọn channel áp dụng | US-E3-09 | M | W0-T07, W1-T07 |
| W2-T02 | Bắt việc từ Slack: thao tác trên tin nhắn hoặc lệnh trong channel | US-E3-10 | M | W2-T01 |
| W2-T03 | Bộ máy thông báo: 4 loại sự kiện sinh Notification | US-E6-01 | L | W1-T05, W1-T08, W1-T12 |
| W2-T04 | Inbox: danh sách thông báo + badge chưa đọc + đánh dấu đã đọc | US-E6-03 | M | W2-T03 |
| W2-T05 | My Issues: việc của tôi nhóm theo trạng thái | US-E6-02 | M | W1-T03 |
| W2-T06 | Tìm kiếm theo từ khóa tiêu đề / mã issue | US-E7-01 | M | W1-T01 |
| W2-T07 | Command palette Cmd+K: tạo issue, nhảy trang, đổi ngôn ngữ | US-E7-02 | L | W2-T06, W0-T09 |

**W2-T01 — Kết nối Slack.** Kết nối qua luồng ủy quyền của Slack, chọn được channel áp dụng; lưu IntegrationConnection như các kênh khác, token mã hóa. *DoD:* đạt nghiệm thu US-E3-09.

**W2-T02 — Bắt việc từ Slack.** Từ menu của tin nhắn hoặc lệnh của ứng dụng trong channel đã nối → IntakeItem giữ nội dung tin, người gửi, link về tin gốc. *DoD:* đạt nghiệm thu kênh của US-E3-10 — gửi yêu cầu từ Slack → hiện trong Triage trong thời gian hợp lý → accept thành issue được.

**W2-T03 — Bộ máy thông báo.** Bốn sự kiện sinh Notification: được gán việc, được @mention, bình luận mới trên việc của tôi, việc của tôi đổi trạng thái (kể cả đổi tự động qua GitHub và qua accept từ Triage). Bấm thông báo mở đúng issue/comment. *DoD:* đạt nghiệm thu US-E6-01 cho cả 4 loại.

**W2-T04 — Inbox.** Danh sách thông báo, đánh dấu đã đọc từng cái hoặc tất cả, badge số chưa đọc cập nhật ngay (realtime). *DoD:* đạt nghiệm thu US-E6-03.

**W2-T05 — My Issues.** Mọi issue có assignee là tôi, nhóm theo trạng thái; Done/Canceled nằm ở nhóm riêng, không lẫn vào nhóm đang làm. *DoD:* đạt nghiệm thu US-E6-02.

**W2-T06 — Tìm kiếm.** Tìm trong phạm vi workspace của mình theo từ khóa tiêu đề hoặc mã issue; nhập mã đầy đủ (DEV-123) mở thẳng issue. *DoD:* đạt nghiệm thu US-E7-01.

**W2-T07 — Cmd+K.** Palette mở từ mọi trang bằng Cmd+K/Ctrl+K; ba nhóm lệnh: tạo issue, nhảy tới trang/team/project, đổi ngôn ngữ; chọn bằng phím mũi tên + Enter. *DoD:* đạt nghiệm thu US-E7-02.

### Wave 3 — Intake Zalo + hoàn thiện song ngữ + đóng gói bản demo

*Điều kiện hoàn thành wave (theo PRD): kịch bản demo 5 phút đạt toàn bộ checklist nghiệm thu phát hành.*

| Mã | Task | Story PRD | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| W3-T01 | Intake Zalo phương án A: tin nhắn vào OA/bot → Triage | US-E3-11 | L | W0-T01 (chốt A), W0-T07, W1-T07 |
| W3-T02 | Bắt việc nhanh phương án B: link/mã dán nội dung + chuyển tiếp email | US-E3-12 | M | W0-T01 (kích hoạt B), W1-T09 |
| W3-T03 | Rà soát song ngữ toàn diện: quét chuỗi cứng VI/EN toàn giao diện | US-E7-03 | M | Mọi task UI W1–W2 |
| W3-T04 | Gói demo: dữ liệu mẫu + kịch bản dẫn 5 phút + tổng duyệt thử | Mục 8 PRD | M | W3-T01/T02, W3-T03 |
| W3-T05 | Chạy nghiệm thu phát hành chính thức + sửa lỗi blocking | Mục 8 + DoD PRD | M | W3-T04 |
| W3-T06 | Đo lường tối thiểu: sự kiện kích hoạt + hoạt động hằng tuần | Mục 9 PRD | S | W0-T05, W1-T08 |

**W3-T01 — Zalo phương án A (chỉ làm nếu spike W0-T01 chốt A).** Khách/đồng đội nhắn vào Zalo OA/bot của công ty → adapter Zalo chuẩn hóa thành IntakeItem của team phụ trách. *DoD:* đạt nghiệm thu kênh dùng chung của US-E3-11 — gửi yêu cầu qua Zalo → hiện trong Triage trong thời gian hợp lý, giữ nội dung gốc và định danh người gửi → accept thành issue được.

**W3-T02 — Zalo phương án B (làm khi spike chốt B, hoặc làm bổ sung sau A nếu còn thời gian).** Trang/link bắt việc nhanh: người nhận yêu cầu qua Zalo cá nhân/nhóm dán nội dung vào, hoặc chuyển tiếp vào địa chỉ email nhận việc của team (dùng lại W1-T09). *DoD:* đạt nghiệm thu kênh của US-E3-12. Nguyên tắc PRD: B dùng lại đúng cơ chế IntakeItem/email nên chuyển A ↔ B không đổi trải nghiệm Triage.

**W3-T03 — Rà soát song ngữ.** Quét toàn bộ giao diện tìm chuỗi cứng; mọi chuỗi qua khóa i18n; lựa chọn ngôn ngữ được nhớ cho lần đăng nhập sau, mặc định VI cho tài khoản mới. *DoD:* đạt nghiệm thu US-E7-03 — rà soát không còn chuỗi cứng; đổi VI → EN → VI không sót, không phá thao tác đang dở.

**W3-T04 — Gói demo.** Workspace demo với team/project/cycle mẫu đúng kịch bản mục 8 PRD; tài liệu dẫn demo từng bước theo 5 bước của kịch bản; chạy tổng duyệt ít nhất 1 lần trọn vẹn. *DoD:* một người chưa biết trước kịch bản cũng dẫn lại được demo chỉ bằng tài liệu này.

**W3-T05 — Nghiệm thu phát hành.** Chạy kịch bản demo 5 phút chính thức, đối chiếu checklist ở mục 4 dưới đây; lỗi blocking sửa và **chạy lại toàn bộ từ đầu** (PRD không cho nghiệm thu từng phần rời rạc). *DoD:* 6/6 ô đạt trong một lần chạy + không còn lỗi blocking ở Flow A/B/C.

**W3-T06 — Đo lường tối thiểu.** Ghi sự kiện: team tạo workspace, intake đầu tiên vào Triage (= kích hoạt theo mục 9 PRD), hoạt động xử lý Triage/tạo/đổi trạng thái issue theo tuần. Đây là nền để sau này chốt giới hạn mềm và mốc thu phí (hai quyết định còn mở, mục 12 PRD) — chưa xây dashboard, chỉ cần dữ liệu truy vấn được. *DoD:* trả lời được bằng số liệu thật: bao nhiêu team đã kích hoạt, bao nhiêu team hoạt động tuần này.

---

## 2. Lát dọc đầu tiên chạy end-to-end (demo được sớm nhất)

**Tiền lát cuối Wave 0 (demo nội bộ, chưa phải sản phẩm):** đăng nhập → tạo workspace/team → gửi 1 yêu cầu qua adapter mẫu → IntakeItem xuất hiện ở hàng chờ thô. Gồm: W0-T02, W0-T03, W0-T04, W0-T05, W0-T07, W0-T08 (+ W0-T09, W0-T10 nếu kịp). Mục đích: chứng minh khung kiến trúc sống, chưa demo cho người ngoài.

**Lát dọc 01 — lát end-to-end thật đầu tiên, là cột mốc quan trọng nhất của dự án.** Một vòng đời việc trọn vẹn trên 2 kênh đầu tiên:

> Email (hoặc issue GitHub) gửi vào → xuất hiện trong Triage → lead **accept** thành issue, gán người → đưa issue vào cycle → dev tạo branch chứa mã issue, mở PR → issue tự **In Progress** → merge PR → issue tự **Done** → % tiến độ cycle cập nhật.

Các task cấu thành (theo đúng thứ tự phụ thuộc): W0-T02 → W0-T03 → W0-T04 → W0-T05 → W0-T07 → **W1-T01** (issue + mã) → **W1-T07** (Triage) → **W1-T08** (accept) → **W1-T09** (email) *hoặc* **W1-T10 + W1-T11** (GitHub vào) → **W1-T13 + W1-T14** (cycle + tiến độ) → **W1-T12** (tự động hóa PR/merge).

Khi lát dọc 01 chạy được, dự án đã có thứ demo đúng thông điệp cốt lõi ("mọi việc, về một mối" + việc tự chạy tới Done) dù board, projects, Slack, Zalo chưa xong. Mọi task ngoài lát này (W1-T02…T06, W1-T16/T17, toàn bộ Wave 2–3) là mở rộng bề ngang sau khi lát dọc đã thông.

---

## 3. KHÔNG làm trong MVP (chống phình scope)

Rút nguyên văn từ mục "RA" (mục 2.2) của PRD. Phát sinh yêu cầu thuộc nhóm này → ghi vào backlog **sau MVP**, không chen vào đợt hiện tại. Muốn đưa vào phải có chấp thuận bằng văn bản của chủ sản phẩm **kèm loại bỏ một hạng mục tương đương** khỏi phạm vi "VÀO" (quy tắc khóa phạm vi của PRD).

- [ ] **Initiatives** — tầng mục tiêu nằm trên project.
- [ ] **Analytics sâu, báo cáo tùy biến** — chỉ có tiến độ cycle/project cơ bản.
- [ ] **AI agents, Triage Intelligence** — triage thủ công là đủ để kiểm chứng wedge.
- [ ] **Workflow tùy biến sâu, custom fields** — một workflow mặc định tốt là chủ đích sản phẩm.
- [ ] **Ứng dụng mobile native** — desktop-first; web responsive mức đọc/thao tác cơ bản là đủ.
- [ ] **SSO/SAML, phân quyền nâng cao** — ngoài phân khúc khách đầu tiên.
- [ ] **Time tracking.**
- [ ] **Gantt.**
- [ ] **Sub-issue** — việc lớn chia thành nhiều issue độc lập gắn cùng project/label.

Giới hạn liên quan cần nhớ khi thi công: issue chỉ có **0–1 assignee**, thuộc **tối đa 1 project** và **1 cycle** tại một thời điểm; mỗi nhóm trạng thái có **đúng 1 trạng thái mặc định**.

---

## 4. Checklist nghiệm thu phát hành MVP (kịch bản demo 5 phút — PRD mục 8)

Chạy trọn kịch bản trong **một lần trình diễn**, bằng yêu cầu thật, **không dùng dữ liệu "diễn" ngoài hệ thống**. Không đạt bất kỳ ô nào = chưa phát hành; sửa rồi chạy lại **toàn bộ từ đầu**.

**Diễn biến kịch bản:** (1) gửi 4 yêu cầu thật từ Zalo, Slack, email, GitHub → (2) accept 2 thành issue + gán người + đưa vào cycle & project, dismiss 1 kèm lý do → (3) tạo branch chứa mã issue, mở PR → (4) merge PR → (5) đổi ngôn ngữ VI → EN → VI qua Cmd+K.

- [ ] **Cả 4 kênh đều đổ về Triage trong cùng một phiên demo, không kênh nào phải nhập tay lại.** — Task liên quan: W1-T09 (email), W1-T11 (GitHub), W2-T02 (Slack), W3-T01/T02 (Zalo); nền: W1-T07.
- [ ] **Không yêu cầu nào bị mất hoặc thiếu nội dung gốc trong suốt kịch bản.** — Task liên quan: W0-T07 (lưu bản gốc trước, thử lại, idempotency), W1-T08 (triage không xóa item).
- [ ] **Tự động hóa GitHub chạy đúng cả hai chiều sự kiện: mở PR → In Progress, merge PR → Done.** — Task liên quan: W1-T12.
- [ ] **Tiến độ cycle/project khớp số issue Done thực tế sau mỗi bước.** — Task liên quan: W1-T14 (cycle), W1-T17 (project).
- [ ] **Đổi ngôn ngữ không sót chuỗi và không phá vỡ thao tác đang dở.** — Task liên quan: W0-T09 (nền i18n), W2-T07 (đổi ngôn ngữ qua Cmd+K), W3-T03 (rà chuỗi cứng).
- [ ] **Toàn bộ kịch bản hoàn thành trong khoảng 5 phút, không lỗi hiển thị chặn đường (blocking).** — Task liên quan: W3-T04 (gói demo + tổng duyệt), W3-T05 (nghiệm thu chính thức).

---

## 5. Rủi ro tiến độ & kế hoạch cắt giảm nếu trễ

### Rủi ro chính (theo PRD mục 13, dịch sang ngôn ngữ tiến độ)

| Rủi ro | Ảnh hưởng tới tiến độ | Giảm thiểu đã gắn sẵn |
|---|---|---|
| Zalo API không truy cập được / điều kiện thay đổi | Kênh khác biệt nhất bị chặn ở Wave 3 — phát hiện muộn là mất cả đích 3 tháng | Spike ngay Wave 0 (W0-T01, timebox cứng); phương án B (W3-T02) dùng lại hạ tầng email/IntakeItem |
| Phạm vi lớn so với nguồn lực solo ngoài giờ | Dàn trải, mọi thứ dở dang, không có bản demo | Backlog này cắt theo lát dọc; quy tắc cắt ở dưới; dịch vụ có sẵn cho auth/email/hạ tầng |
| Mất dữ liệu intake | Phá đúng lời hứa cốt lõi "không việc nào lạc" | W0-T07: lưu bản gốc trước khi xử lý, thử lại, idempotency — không được cắt |
| Song ngữ làm chậm mọi tính năng | Mỗi màn hình tốn gấp đôi công sức ở cuối dự án | i18n từ Wave 0 (W0-T09); rà soát cuối ở W3-T03 thay vì sửa dồn |
| Rò rỉ dữ liệu giữa các workspace | Mất niềm tin của team dùng thử đầu tiên | Test cô lập ngay từ Wave 0 (W0-T06), không để tới cuối |
| Chi phí hạ tầng khi MVP miễn phí | Chi phí chạy thật trước khi có doanh thu | Bậc miễn phí ở giai đoạn đầu (W0-T10); đo tín hiệu từ ngày 1 (W3-T06) |

### Nguyên tắc cắt giảm khi trễ (theo thứ tự — cắt từ trên xuống)

**Giữ bằng mọi giá (xương sống wedge + end-to-end):** khung intake hợp nhất & độ tin cậy intake (W0-T07), màn hình + thao tác Triage (W1-T07, W1-T08), ít nhất 2 kênh vào ở Wave 1 (email W1-T09, GitHub W1-T11), tự động hóa GitHub PR → Done (W1-T12), cycle + tiến độ (W1-T13, W1-T14), khả năng đổi ngôn ngữ VI/EN trong demo (W0-T09, W3-T03) và toàn bộ checklist mục 4. Mất bất kỳ món nào trong nhóm này là mất lý do tồn tại của MVP.

**Cắt/giảm theo thứ tự ưu tiên cắt:**

1. **W1-T06 (Canceled — story Should duy nhất):** cắt hẳn đầu tiên, đúng quy tắc "cắt Should trước Must" của PRD.
2. **Thu gọn Cmd+K (W2-T07):** chỉ giữ 3 nhóm lệnh bắt buộc của nghiệm thu US-E7-02 (tạo issue, nhảy trang, đổi ngôn ngữ), bỏ mọi lệnh phụ/làm đẹp.
3. **Kênh Zalo đi phương án B (W3-T02 thay W3-T01)** nếu phương án A tốn thời gian chờ phê duyệt/truy cập — vẫn đạt nghiệm thu kênh, vẫn giữ wedge 4 kênh.
4. **Thu gọn bộ lọc (W1-T04)** còn assignee + status; **thu gọn trang tổng quan project (W1-T17)** còn % tiến độ + danh sách issue theo trạng thái (đúng mức nghiệm thu tối thiểu).
5. **Giảm độ "bóng bẩy" realtime:** nếu WebSocket/SSE ngốn thời gian, tạm dùng làm mới định kỳ cho Triage/Inbox trong nội bộ wave rồi nâng cấp sau — nhưng bản demo cuối phải cập nhật đủ nhanh để kịch bản 5 phút không bị khựng.
6. **Hoãn W3-T06 (đo lường)** xuống mức ghi log sự kiện thô, phân tích bằng truy vấn tay — không hoãn việc *ghi* sự kiện, chỉ hoãn khâu trình bày.

**Không bao giờ được cắt để cứu tiến độ:** thứ tự kênh (GitHub + email → Slack → Zalo), test cô lập workspace (W0-T06), cơ chế không mất intake (W0-T07), và việc chạy lại toàn bộ kịch bản demo khi nghiệm thu (W3-T05).

---

*Ước lượng trong tài liệu này là ước lượng tương đối cho 1 người làm ngoài giờ — không phải cam kết ngày tháng. Khi bắt đầu mỗi wave, rà lại cỡ của các task trong wave đó với thực tế wave trước rồi mới lên kế hoạch buổi làm việc.*

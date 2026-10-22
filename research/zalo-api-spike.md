# Spike kiểm chứng Zalo API cho Gomly — Memo kết luận

- **Ngày nghiên cứu:** 21/10/2026
- **Phạm vi:** Chỉ nghiên cứu tài liệu; chưa đăng ký OA, chưa tạo ứng dụng, chưa gọi API thật.
- **Câu hỏi cốt lõi:** Khách/thành viên gửi yêu cầu công việc qua Zalo → yêu cầu có tự động xuất hiện trong Triage của Gomly để biến thành issue không?
- **Quy ước nguồn:** Mỗi khẳng định quan trọng ghi kèm URL. Nguồn chính thức của Zalo gồm `developers.zalo.me`, `oa.zalo.me` và `zalo.cloud`. Một số chi tiết kỹ thuật (tên sự kiện webhook) được đối chiếu thêm qua đối tác chính thức Infobip và bản mirror tài liệu Zalo trên DeepWiki — được đánh dấu rõ là nguồn phụ trợ, không thay thế tài liệu gốc.
- **Hạn chế của đợt spike này:** Trang `developers.zalo.me` không tải trực tiếp được từ môi trường nghiên cứu (timeout khi mở trang tài liệu webhook và trang giới thiệu OA). Nội dung trang gốc được kiểm chứng gián tiếp qua (i) trang chính thức `oa.zalo.me` có liên kết thẳng tới tài liệu kỹ thuật trên `developers.zalo.me`, (ii) tài liệu đối tác Infobip mô tả cùng bộ sự kiện webhook, (iii) bản sao cây tài liệu `developers.zalo.me` trên DeepWiki. Các điểm chỉ dựa trên nguồn gián tiếp được liệt kê ở mục "Chưa kiểm chứng được".

---

## 1. Kết luận khả thi (TL;DR)

**KHẢ THI CÓ ĐIỀU KIỆN — theo đúng Phương án A của PRD (OA), nhưng phạm vi hẹp hơn cách người dùng thường hình dung về "Zalo":**

1. **Được:** Zalo OA (Official Account) có cơ chế webhook chính thức đẩy sự kiện tin nhắn người dùng gửi **tới OA** về server của Gomly theo thời gian thực. Các loại sự kiện gồm `user_send_text`, `user_send_image`, `user_send_audio`, `user_send_video`, `user_send_file`, `user_send_link`, `user_send_sticker`, `user_send_location`. Đây là đủ cho intake: tin nhắn → IntakeItem → Triage → issue.
   - Nguồn: https://www.infobip.com/docs/zalo/api (bảng "Inbound message types" liệt kê webhook event); bản mirror tài liệu gốc: https://deepwiki.com/doanhidm1/zalo-docs/7-webhooks-and-real-time-events (dẫn nguồn `docs/v2/official-account/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan.html` trên developers.zalo.me); trang chính thức Zalo xác nhận OA OpenAPI là một kênh tương tác hợp lệ: https://oa.zalo.me/home/documents/vie/guides/tin-tu-van

2. **Điều kiện bắt buộc:**
   - Người gửi phải nhắn **vào OA** (khung chat 1-1 với OA), không phải nhắn vào nhóm Zalo cá nhân thông thường hay chat cá nhân — xem mục 2.
   - Phải có **OA** và một **ứng dụng Zalo (Zalo App)** liên kết với OA, được cấp quyền Official Account API và cấu hình webhook URL (HTTPS). Quy trình liên kết app–OA, cấp quyền OAuth và bật webhook được mô tả tại: https://cnv.vn/cach-su-dung-api-zalo-de-ket-noi-crm/ (nguồn phụ trợ; cổng thực hiện là developers.zalo.me).
   - Việc **gửi ngược** tin phản hồi/xác nhận từ OA bị giới hạn cửa sổ: qua OA OpenAPI chỉ gửi được Tin Tư vấn trong vòng **07 ngày** kể từ tương tác cuối của người dùng; trong **48 giờ** đầu được miễn phí 08 tin, ngoài khung đó tính phí **55đ/tin** (chính sách chính thức). Nguồn: https://oa.zalo.me/home/documents/vie/guides/tin-tu-van và https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099
   - OA muốn dùng đầy đủ (và để dùng ZNS) cần **xác thực doanh nghiệp** bằng giấy tờ pháp lý — xem mục 3.

3. **Không khả thi (chính thức):**
   - **Không có API/bot chính thức cho tài khoản Zalo cá nhân** để đọc tin nhắn chat cá nhân hay tin nhắn trong nhóm Zalo thường. Zalo Social API hoạt động dưới danh nghĩa tài khoản cá nhân nhưng phục vụ đăng nhập/định danh và tương tác xã hội, không phải kênh đọc hội thoại làm intake. Các thư viện "Zalo API cá nhân" không chính thức (đăng nhập QR, nghe sự kiện socket) tồn tại trên GitHub nhưng **không phải sản phẩm của Zalo**, rủi ro khóa tài khoản và vi phạm điều khoản — **loại khỏi phương án sản phẩm**. Nguồn đối chiếu: https://digibird.co/api-zalo-va-cach-su-dung-hieu-qua/ (mô tả Social API); ví dụ thư viện không chính thức: https://github.com/hiennguyen270995/zalo-api-final (không phải của Zalo).
   - **ZNS không phải đường intake.** ZNS (Zalo Notification Service) là kênh **gửi đi một chiều** các thông báo theo mẫu đã duyệt tới số điện thoại (kể cả người chưa quan tâm OA). ZNS chỉ hữu ích cho Gomly ở chiều ngược: gửi thông báo "issue đã xong/thay đổi trạng thái" cho khách. Nguồn: https://nhanh.vn/7-dich-vu-cua-zalo-zns-giup-tang-toi-da-kha-nang-giao-tiep-voi-khach-hang-n101636.html ; điều kiện ZNS (OA đã xác thực, mẫu tin được duyệt, tính phí theo tin thành công ~200–300đ/tin tùy loại): https://minidev.vn/tin-tuc/gui-tin-nhan-zns-theo-chien-dich-nhanh-chong-don-gian-va-hieu-qua-nhat/

4. **Hệ quả kiến trúc quan trọng cho Gomly (đa khách hàng):** OA là tài khoản của **từng doanh nghiệp/team nhận yêu cầu**, không phải của Gomly. Muốn intake cho team nào, team đó phải có OA riêng và ủy quyền (OAuth) cho ứng dụng của Gomly — mô hình giống "kết nối Slack workspace/GitHub repo" ở các kênh khác, không phải Gomly dùng một OA chung cho mọi khách. Điểm này cần phản ánh vào onboarding: "Kết nối Zalo" = team tự tạo/xác thực OA của họ rồi cấp quyền cho Gomly.

---

## 2. Ranh giới kỹ thuật của đường OA webhook

| Khía cạnh | Kết luận | Nguồn |
|---|---|---|
| Nhận tin nhắn 1-1 gửi tới OA | **Có**, qua webhook sự kiện `user_send_*` (text/ảnh/file/audio/video/link/sticker/vị trí) | https://www.infobip.com/docs/zalo/api ; https://deepwiki.com/doanhidm1/zalo-docs/7-webhooks-and-real-time-events |
| Nhận tin trong nhóm Zalo cá nhân thường | **Không có cơ chế chính thức.** Webhook OA chỉ bao phủ tương tác với OA. Tin nhắn trong "nhóm chat GMF" (nhóm do OA tạo/quản lý) được tính là một loại tương tác với OA, nhưng đây là nhóm của OA — không phải nhóm chat cá nhân sẵn có của team | https://oa.zalo.me/home/documents/vie/guides/tin-tu-van (liệt kê "Gửi tin trong nhóm chat GMF" là tương tác với OA) |
| Yêu cầu về webhook endpoint | HTTPS, nhận POST JSON, nên trả HTTP 200 nhanh (mirror tài liệu ghi trong vòng 10 giây), có header chữ ký `X-ZEvent-Signature` để xác thực | https://deepwiki.com/doanhidm1/zalo-docs/7-webhooks-and-real-time-events (nguồn phụ trợ — cần đối chiếu bản gốc khi triển khai) |
| Điều kiện để OA gửi ngược tin Tư vấn | Người dùng đã có tương tác với OA và không chặn OA; qua OpenAPI trong vòng 07 ngày từ tương tác cuối; OA Manager: 365 ngày | https://oa.zalo.me/home/documents/vie/guides/tin-tu-van |
| Chi phí gửi ngược | Miễn phí 08 tin đầu trong 48 giờ kể từ tương tác cuối (đặt lại mỗi tương tác mới); hết hạn mức hoặc ngoài 48 giờ: 55đ/tin; gói dịch vụ OA có sẵn hạn mức miễn phí thêm | https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099 |
| Chi phí nhận tin (webhook) | Tài liệu chính thức truy cập được trong đợt này **không nêu phí cho chiều nhận**; phí phát sinh ở chiều gửi và gói dịch vụ OA. Một nguồn phụ trợ cũ hơn nói OA API miễn phí 1.000 tin đầu/tháng rồi 55đ/tin — **mâu thuẫn với chính sách hiện hành trên oa.zalo.me**, lấy chính sách trên oa.zalo.me làm chuẩn và ghi nhận cần kiểm chứng lại khi triển khai | https://zns.nhanh.vn/zalo-api-oa-la-gi-phan-loai-va-cach-su-dung-cac-api-n97668.html (nguồn phụ trợ, có thể đã cũ) |
| Gói dịch vụ OA | Có gói miễn phí (Cơ bản) và các gói trả phí; từ 01/06/2026 Zalo áp dụng hệ 4 gói Cơ bản / Tiêu chuẩn / Tăng trưởng / Toàn diện (theo nguồn phụ trợ). Giới hạn cụ thể của gói miễn phí đối với API/webhook và số lượt hội thoại **chưa kiểm chứng được trên trang giá chính thức zalo.cloud trong đợt này** | https://v9.com.vn/bang-gia-zalo-oa-2026/ (phụ trợ); trang giá được trang chính thức Zalo dẫn tới: https://zalo.cloud |

---

## 3. Điều kiện mở OA và xác thực

Theo tài liệu/hướng dẫn xoay quanh cổng chính thức `oa.zalo.me`:

- **Cách tạo:** Đăng nhập `oa.zalo.me` bằng tài khoản Zalo cá nhân (số điện thoại/QR) → "Tạo Official Account" → chọn loại tài khoản **Doanh nghiệp** → chọn danh mục → khai tên OA, mô tả, ảnh đại diện/bìa, địa chỉ → hoàn tất. Nguồn: https://eSMS.vn/huong-dan/huong-dan-su-dung/huong-dan-su-dung-oa (hướng dẫn theo cổng oa.zalo.me); https://moti.com.vn/huong-dan-tao-zalo-oa-chi-tiet
- **Ba loại OA:** Doanh nghiệp; Nội dung (báo chí/nhà sáng tạo); Cơ quan nhà nước. Gomly và khách hàng của Gomly thuộc loại **Doanh nghiệp**. Nguồn: https://www.zalo-down.com/blog/858513057697861.html (phụ trợ, mô tả theo Business Portal)
- **Xác thực OA (tích vàng) — xác minh tư cách pháp nhân + người đăng ký là đại diện/được ủy quyền**, nộp tại trang quản lý OA. Hồ sơ doanh nghiệp gồm: bản scan Giấy chứng nhận đăng ký doanh nghiệp; CCCD/hộ chiếu 2 mặt của người đại diện pháp luật (phải trùng thông tin trên giấy phép); giấy ủy quyền/công văn có dấu công ty nếu người nộp không phải đại diện pháp luật; nếu tên OA là tên thương hiệu khác tên pháp nhân thì cần giấy chứng nhận nhãn hiệu hoặc tài liệu chứng minh liên hệ. Hộ kinh doanh dùng giấy đăng ký hộ kinh doanh + CCCD chủ hộ. Nguồn: https://eSMS.vn/huong-dan/huong-dan-su-dung/huong-dan-su-dung-oa ; https://www.pos365.vn/zalo-oa-la-gi-6983.html ; https://subiz.com.vn/blog/cach-su-dung-zalo-oa.html
- **Ràng buộc cho khách hàng của Gomly:** Team startup **chưa có pháp nhân** (chưa đăng ký doanh nghiệp/hộ kinh doanh) nhiều khả năng **không xác thực được OA doanh nghiệp** → không mở khóa được đầy đủ tính năng/ZNS. Đây là rào cản thật với phân khúc 2–20 người (nhiều team làm việc informal). Mức độ hạn chế chính xác của OA **chưa xác thực** đối với webhook/OpenAPI **chưa kiểm chứng được** trong đợt này (xem mục 6).
- **Thời gian xét duyệt:** Nguồn phụ trợ ghi ~1–3 ngày làm việc; không trích từ tài liệu chính thức trong đợt này → chỉ là ước lượng tham khảo.

---

## 4. Bảng so sánh các đường intake Zalo

| Đường intake | Cơ chế | Điều kiện tiên quyết | Giới hạn chính | Độ tin cậy làm intake | Chi phí |
|---|---|---|---|---|---|
| **A1. OA webhook (1-1)** | Khách nhắn vào OA → Zalo POST sự kiện `user_send_*` về webhook Gomly → IntakeItem vào Triage; Gomly trả xác nhận bằng Tin Tư vấn qua OpenAPI | Team có OA (nên xác thực), có Zalo App liên kết OA + được duyệt quyền OA API, webhook HTTPS công khai | Chỉ nhận tin gửi **tới OA**; gửi ngược trong cửa sổ 7 ngày/48 giờ miễn phí 8 tin; phụ thuộc chính sách gói OA | **Cao** — kênh chính thức, real-time, có chữ ký xác thực sự kiện | Nhận: chưa thấy phí; gửi ngược: 55đ/tin ngoài hạn mức miễn phí; có thể cần gói OA trả phí tùy hạn mức |
| **A2. Nhóm chat OA (GMF)** | Tạo nhóm do OA quản lý; tin nhắn trong nhóm được tính là tương tác với OA | OA + tính năng nhóm GMF; thành viên phải vào nhóm của OA | Không thay được nhóm Zalo cá nhân sẵn có của team/khách; có phí duy trì nhóm theo nguồn phụ trợ (25.000–75.000đ/tháng theo cỡ nhóm; tin OA gửi vào nhóm 330đ/tin) | **Trung bình / chưa kiểm chứng** — chưa xác nhận được webhook có đẩy toàn bộ tin thành viên trong nhóm GMF về server hay không | Phí duy trì nhóm (phụ trợ): http://gapone.vn/wp-content/uploads/2024/05/Chi-phi-Zalo-OA-Case-Zalo-OAZalo-ZNS-2.pdf |
| **B1. Deep link / QR vào OA** | Đặt link `zalo.me/<OA>` hoặc QR của OA trong nhóm Zalo, chữ ký email, website → khách bấm vào mở chat OA → quay về đường A1 | Có OA (không nhất thiết đã nối API nếu chỉ để dẫn traffic; nối API mới tự động vào Triage) | Chỉ là "cửa vào"; khách phải chủ động bấm và nhắn trong OA thay vì nhắn ngay trong nhóm | **Cao** (là bổ trợ bắt buộc cho A1, không phải đường intake độc lập) | Miễn phí |
| **B2. Quick-capture link/QR (trang bắt việc nhanh của Gomly)** | Gomly cấp mỗi team một link/QR "Gửi yêu cầu" ghim trong nhóm Zalo → khách mở form web ngắn (tiêu đề, mô tả, đính kèm) → vào thẳng Triage, gán đúng team dự án | Không cần OA, không cần pháp nhân, không phụ thuộc Zalo | Khách rời Zalo sang web form (thêm 1 bước); không bắt được nội dung đã chat trong nhóm; cần cơ chế chống spam link công khai (token/QR theo team) | **Cao nhất về mặt kiểm soát** — dữ liệu có cấu trúc ngay từ đầu, không phụ thuộc bên thứ ba | Chi phí hạ tầng của Gomly |
| **B3. Chuyển tiếp qua email** | Khách/thành viên chuyển tiếp nội dung (hoặc gửi mới) tới địa chỉ intake email của team trong Gomly → email intake (kênh đã có trong MVP) | Chỉ cần hạ tầng email intake của Gomly | Việc nằm trong chat Zalo vẫn phải có người sao chép/chuyển tiếp thủ công; Zalo không có tính năng "forward sang email" tự động | **Trung bình** — phụ thuộc thao tác thủ công của con người | Không thêm chi phí Zalo |
| **C. ZNS** | Gomly gửi thông báo mẫu (đã duyệt) tới số điện thoại qua OA | OA đã xác thực; mẫu tin được Zalo duyệt; người nhận có quan hệ giao dịch với doanh nghiệp | **Một chiều gửi đi**, nội dung theo mẫu cứng, giới hạn thời gian gửi (theo nguồn phụ trợ: trong ±7 ngày quanh sự kiện, khung 6:00–22:00 trừ OTP) — **không dùng làm intake**; chỉ nên dùng báo trạng thái issue cho khách bên ngoài | Không áp dụng cho intake | ~200–300đ/tin thành công tùy loại (phụ trợ): https://nhanh.vn/7-dich-vu-cua-zalo-zns-giup-tang-toi-da-kha-nang-giao-tiep-voi-khach-hang-n101636.html |
| **D. API cá nhân không chính thức** | Thư viện bên thứ ba đăng nhập tài khoản cá nhân bằng QR, nghe sự kiện chat/nhóm | Tài khoản cá nhân + chạy tiến trình thường trực | Không chính thức; rủi ro khóa tài khoản, mất ổn định mỗi khi Zalo đổi giao thức, rủi ro pháp lý/điều khoản; không thể đưa vào sản phẩm thương mại | **Loại bỏ** | — |

---

## 5. Khuyến nghị — khớp Phương án A/B trong PRD

- **Phương án A (chính, có điều kiện): OA webhook.** Giữ nguyên như PRD nhưng hiệu chỉnh phạm vi cam kết:
  - Chỉ hứa "tự động vào Triage" đối với tin nhắn gửi **tới OA của team**. Mọi thông điệp marketing/onboarding phải nói rõ điều này, tránh hứa "đọc được nhóm Zalo của bạn".
  - Luồng kết nối trong Gomly: team tạo OA → xác thực (nếu có pháp nhân) → tại trang developers.zalo.me tạo/liên kết ứng dụng → cấp quyền OAuth cho Gomly → Gomly đăng ký webhook và lưu token mã hóa → kiểm tra kết nối bằng một tin nhắn thử.
  - Thiết kế sẵn **tin xác nhận tự động** ngay khi intake thành công ("Đã ghi nhận yêu cầu #…") — tin này nằm trong cửa sổ 48 giờ/8 tin miễn phí nên gần như không tốn phí ở quy mô MVP, đồng thời tạo cảm giác "việc đã có người nhận" đúng nỗi đau cốt lõi.
  - Không dùng ZNS cho MVP intake; cân nhắc ZNS ở giai đoạn sau cho thông báo trạng thái tới khách hàng bên ngoài (người không có tài khoản Gomly).
- **Phương án B (dự phòng + mặc định cho team chưa có pháp nhân): quick-capture link/QR + email.** Đây nên là đường intake Zalo **ra mắt trước** trong thực tế triển khai, vì:
  - Phân khúc 2–20 người có nhiều team chưa có pháp nhân → chưa xác thực được OA → Phương án A bị chặn ở bước hành chính, không phải kỹ thuật.
  - QR/link ghim trong nhóm Zalo vẫn giải quyết được phần lớn nỗi đau "việc lạc trong chat" mà không cần rời bỏ thói quen nhóm Zalo.
  - Khi team có OA, B1 (deep link/QR vào OA) chuyển đổi mượt sang A1 mà không đổi hành vi người gửi nhiều.
- **Thứ tự triển khai đề xuất trong Wave Zalo:** B2 (quick capture) → B1+A1 (OA webhook cho team có OA) → (sau MVP) ZNS cho thông báo ra ngoài. Đường D (API cá nhân không chính thức) loại bỏ vĩnh viễn khỏi roadmap.

---

## 6. Rủi ro và điểm chưa kiểm chứng được

**Rủi ro:**
1. **Rào cản pháp nhân:** Xác thực OA doanh nghiệp cần giấy đăng ký kinh doanh — team informal (đúng phân khúc mục tiêu) có thể không có. Ảnh hưởng trực tiếp tỉ lệ team dùng được Phương án A.
2. **Phụ thuộc xét duyệt của Zalo:** Cả xác thực OA, duyệt quyền dùng OA API cho ứng dụng, và duyệt mẫu ZNS đều qua Zalo; thời gian và tiêu chí không do Gomly kiểm soát.
3. **Thay đổi chính sách/giá:** Zalo vừa đổi hệ gói OA (theo nguồn phụ trợ, áp dụng từ 01/06/2026) và chính sách tin Tư vấn đã khác thông tin cũ trên internet (miễn phí 1.000 tin/tháng → miễn phí 8 tin/48 giờ + 55đ/tin). Chi phí và hạn mức có thể tiếp tục thay đổi; kiến trúc intake không nên hard-code giả định giá.
4. **Kỳ vọng sai của người dùng:** Người dùng Việt thường hiểu "tích hợp Zalo" = đọc được nhóm chat hiện tại của họ. Sản phẩm không làm được điều đó bằng đường chính thức → rủi ro thất vọng/churn nếu truyền thông không rõ ràng ngay từ onboarding.
5. **Mỗi OA một kết nối:** Số lượng OA/kết nối tăng theo số team khách hàng; cần quản trị token, làm mới access token và xử lý thu hồi quyền ở tầng nền tảng.

**Chưa kiểm chứng được trong đợt spike này (cần vòng kiểm chứng 2 khi có OA thử nghiệm):**
1. Nội dung nguyên văn trang tài liệu webhook trên `developers.zalo.me` (môi trường nghiên cứu không tải trực tiếp được trang; tên sự kiện và yêu cầu endpoint hiện dựa trên Infobip + mirror tài liệu).
2. OA **chưa xác thực** có dùng được OpenAPI/webhook hay không, và hạn mức chính xác của gói OA miễn phí (số lượt hội thoại/tháng, quyền truy cập API) trên trang giá chính thức `zalo.cloud`.
3. Webhook có đẩy tin nhắn của **thành viên trong nhóm chat GMF** về server không, hay chỉ sự kiện liên quan trực tiếp tới OA.
4. Giới hạn tần suất (rate limit) cụ thể của OA OpenAPI và chính sách thử lại (retry) của webhook khi endpoint lỗi/timeout.
5. Quy trình và thời gian Zalo **xét duyệt ứng dụng bên thứ ba đa khách hàng** (một app Gomly phục vụ nhiều OA của nhiều doanh nghiệp) — khác với app tự dùng cho một OA.
6. Trạng thái hiện hành của Zalo Social API (còn mở đăng ký quyền mới hay không) — chỉ ảnh hưởng nếu cân nhắc đăng nhập bằng Zalo, không ảnh hưởng intake.

---

## 7. Checklist việc chủ sản phẩm phải làm

- [ ] Quyết định pháp nhân cho chính Gomly (đăng ký doanh nghiệp/hộ kinh doanh nếu chưa có) — điều kiện để tự xác thực OA "Gomly" phục vụ demo/kiểm thử.
- [ ] Tạo OA "Gomly" loại Doanh nghiệp tại https://oa.zalo.me và chuẩn bị hồ sơ xác thực: giấy đăng ký doanh nghiệp, CCCD người đại diện pháp luật, giấy ủy quyền/công văn (nếu người nộp khác đại diện), chứng minh tên thương hiệu "Gomly" nếu tên OA khác tên pháp nhân.
- [ ] Tạo tài khoản nhà phát triển và một ứng dụng tại https://developers.zalo.me ; liên kết ứng dụng với OA; đăng ký quyền Official Account API và chờ duyệt.
- [ ] Chuẩn bị một endpoint HTTPS công khai (staging) để đăng ký webhook URL và kiểm thử sự kiện `user_send_text` bằng tin nhắn thật.
- [ ] Tra cứu bảng giá/hạn mức gói OA hiện hành tại https://zalo.cloud và xác nhận bằng văn bản (email hỗ trợ Zalo OA) hai điểm: (1) gói miễn phí có được dùng OpenAPI/webhook không; (2) hạn mức hội thoại/tin của từng gói.
- [ ] Hỏi rõ Zalo (qua kênh hỗ trợ nhà phát triển) về mô hình ứng dụng đa khách hàng: một ứng dụng Gomly kết nối nhiều OA thuộc nhiều doanh nghiệp khác nhau có được phép không, cần thỏa thuận đối tác gì.
- [ ] Trong lúc chờ hành chính Zalo: triển khai trước Phương án B2 (quick-capture link/QR) và B3 (email intake) để Wave Zalo không bị chặn toàn bộ bởi thủ tục OA.
- [ ] Cập nhật PRD/onboarding với câu chữ chính xác: "Gomly nhận yêu cầu qua Zalo OA của team bạn" thay cho "Gomly đọc nhóm Zalo của bạn".

---

## Nguồn đã dùng

**Chính thức (Zalo):**
- Tin Tư vấn — điều kiện, cửa sổ 7 ngày qua OpenAPI, chi phí 48 giờ: https://oa.zalo.me/home/documents/vie/guides/tin-tu-van
- Tổng quan các loại tin nhắn trên Zalo OA: https://oa.zalo.me/home/documents/guides/tong-quan-cac-loai-tin-nhan-tren-zalo-official-account-_3651713298729094511
- Chính sách gửi tin và quy định phí (8 tin miễn phí/48 giờ, 55đ/tin ngoài khung): https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099
- Cổng tài liệu kỹ thuật (điểm đến của liên kết "tài liệu kỹ thuật OpenAPI" trong trang chính thức trên): https://developers.zalo.me (không tải trực tiếp được trong đợt này — xem mục Hạn chế)

**Phụ trợ (đối tác/tài liệu thứ cấp, đã đánh dấu trong bài):**
- Infobip — Zalo OA API, bảng sự kiện inbound webhook: https://www.infobip.com/docs/zalo/api
- Mirror cây tài liệu developers.zalo.me — Webhooks & Real-time Events: https://deepwiki.com/doanhidm1/zalo-docs/7-webhooks-and-real-time-events
- Quy trình tạo/xác thực OA: https://eSMS.vn/huong-dan/huong-dan-su-dung/huong-dan-su-dung-oa ; https://www.pos365.vn/zalo-oa-la-gi-6983.html ; https://subiz.com.vn/blog/cach-su-dung-zalo-oa.html
- ZNS — cơ chế, giá tham khảo, điều kiện: https://nhanh.vn/7-dich-vu-cua-zalo-zns-giup-tang-toi-da-kha-nang-giao-tiep-voi-khach-hang-n101636.html ; https://minidev.vn/tin-tuc/gui-tin-nhan-zns-theo-chien-dich-nhanh-chong-don-gian-va-hieu-qua-nhat/
- Hệ gói OA mới từ 01/06/2026: https://v9.com.vn/bang-gia-zalo-oa-2026/
- Social API và ví dụ thư viện cá nhân không chính thức: https://digibird.co/api-zalo-va-cach-su-dung-hieu-qua/ ; https://github.com/hiennguyen270995/zalo-api-final

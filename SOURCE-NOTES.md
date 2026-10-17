# Ghi chú bản xuất PACS

Mã chức năng đối chiếu với bản website ngày 17/10/2026, commit nguồn 9558fad4379f788eeb29acbbb119c79b45c9c7ae.

Bản xuất dùng Cloudflare Workers + D1 trực tiếp. Vite/Worker không phụ thuộc Sites hoặc kết nối ChatGPT. Các tệp thư viện connector còn lại là mã hỗ trợ không dùng trong luồng PACS.

Đăng nhập đọc mật khẩu từ Secret PACS_PASSWORD do chủ tài khoản Cloudflare đặt, không có mật khẩu cứng hoặc token triển khai trong mã nguồn. Dữ liệu chuyến không nằm trong ZIP; D1 mới bắt đầu trống. Không giữ endpoint bảo trì xóa lịch sử theo phiên làm việc cũ.

Có hai cách triển khai: chạy deploy.mjs trên máy (HUONG-DAN.md) hoặc kết nối repo với Cloudflare Workers Builds (README.md). GitHub không bắt buộc cho cách chạy trên máy. Chỉ có URL mới khi triển khai trong tài khoản Cloudflare thành công.

# PACS trên Cloudflare miễn phí

Mã nguồn độc lập với chatgpt.site, giữ các chức năng PACS. Cơ sở dữ liệu mới bắt đầu với 0 chuyến.
Chưa triển khai vào tài khoản của bạn. Chỉ khi deploy thành công mới có link thật.

## Cách làm trên máy của bạn

1. Cài Node.js 22.13 trở lên từ https://nodejs.org/ (chọn LTS đáp ứng phiên bản).
2. Giải nén, mở Terminal trong thư mục `pacs-cloudflare`. Windows: trong File Explorer, nhập `powershell` vào thanh địa chỉ rồi Enter.
3. Chạy:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
node deploy.mjs
```

Trình duyệt quen thuộc sẽ mở để bạn đăng nhập Cloudflare và cho phép Wrangler triển khai.
Script tạo/tái sử dụng D1 `pacs-pilot-db`, tạo bảng nếu chưa có, build và triển khai Worker `pacs-pilot`.
Script không mua tên miền, không đổi gói trả phí và không xóa dữ liệu đang có. Hạn mức Free vẫn áp dụng.
Cuối Terminal sẽ hiện URL thật dạng `https://pacs-pilot.<tên-của-bạn>.workers.dev`.
Nếu cần chọn tên miền phụ workers.dev, chọn tên không chứa GPT.

Nếu đã có Worker `pacs-pilot` cho ứng dụng khác, đổi trường `name` trong `wrangler.json` trước khi chạy.
Nếu có nhiều tài khoản Cloudflare, dùng `CLOUDFLARE_ACCOUNT_ID` để chọn đúng tài khoản theo thông báo Wrangler.

## Tài khoản PACS

Đại lý `daily01`; điều độ `dieudo01`; hoa tiêu `hoatieu.a` đến `hoatieu.l`. Dùng mật khẩu được bạn đặt trong Cloudflare Secret `PACS_PASSWORD`.
Sau khi deploy, mở Worker → Settings → Variables and Secrets, thêm Secret `PACS_PASSWORD` với mật khẩu riêng. Không đặt mật khẩu trong code.

## Cập nhật và kiểm tra

Sau khi sửa code, chạy lại `node deploy.mjs`. Script giữ dữ liệu chuyến đang có.
GitHub là tùy chọn để lưu code. Gói này chưa tạo hoặc sửa repository nào.
Sau deploy, thử đại lý gửi chuyến → điều độ phân công → đúng hoa tiêu nhận → T−2 → thiết bị → xuất phát → dẫn tàu → hoàn tất.
Nếu lỗi, gửi thông báo Terminal, không gửi mật khẩu, token hoặc mã xác thực.

Tài liệu: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
https://developers.cloudflare.com/d1/platform/pricing/

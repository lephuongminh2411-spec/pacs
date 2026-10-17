# PACS · Pilot Assistance and Collision System

Ứng dụng đại lý – điều độ – hoa tiêu. Triển khai độc lập trên Cloudflare Workers + D1 với địa chỉ `workers.dev`, không cần mua tên miền.

## Kết nối GitHub với Cloudflare (không cần cài trên máy)

### 1. Tạo cơ sở dữ liệu

Trong Cloudflare → Storage & databases → D1 → Create database:

- Tên: `pacs-pilot-db`.
- Mở Console của database, chạy toàn bộ nội dung [schema.sql](schema.sql) một lần.
- Sao chép **Database ID**. Đây là mã định danh, không phải API token/mật khẩu.

Cơ sở dữ liệu mới bắt đầu với 0 chuyến. `schema.sql` chỉ tạo bảng/index nếu chưa có, không xóa dữ liệu.

### 2. Kết nối repo

Cloudflare → Workers & Pages → Create application → Import a repository / Continue with GitHub.
Cấp quyền cho Cloudflare đọc riêng repository `lephuongminh2411-spec/pacs`, rồi chọn:

| Thiết lập | Giá trị |
|---|---|
| Worker / Project name | `pacs-pilot` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `pnpm run build:cloudflare` |
| Deploy command | `pnpm run deploy:cloudflare` |
| Build variable `PACS_DATABASE_ID` | Database ID thật vừa tạo |
| Build variable `NODE_VERSION` | `22.16.0` hoặc Node LTS mới hơn đáp ứng package |

Giữ gói Free. Không đưa API token, mật khẩu hoặc mã xác thực vào repository.
Nếu bước kết nối chưa hiện biến build, thêm ở Settings → Builds → Variables rồi Retry build.
Cloudflare sẽ đưa ra địa chỉ thật dạng `https://pacs-pilot.<tên-của-bạn>.workers.dev` sau khi deploy thành công.
Chọn tên miền phụ workers.dev không chứa GPT nếu Cloudflare yêu cầu.

### 3. Kiểm tra

Đăng nhập đại lý gửi yêu cầu → điều độ duyệt/phân công → đúng hoa tiêu mở chuyến → T−2 → thiết bị → xuất phát → dẫn tàu → hoàn tất.
Các lần push sau lên `main` sẽ được Cloudflare build/deploy khi đã kết nối Git integration.

## Tài khoản PACS

| Vai trò | Tài khoản |
|---|---|
| Đại lý | `daily01` |
| Điều độ | `dieudo01` |
| Hoa tiêu | `hoatieu.a` … `hoatieu.l` |

Mật khẩu không được lưu trong repository. Sau khi deploy, mở Worker → Settings → Variables and Secrets → Add → chọn Secret, tên `PACS_PASSWORD`, đặt mật khẩu riêng rồi lưu. Không gửi mật khẩu vào chat hoặc GitHub.

## Chạy trên máy (tùy chọn)

Xem [HUONG-DAN.md](HUONG-DAN.md). Sau khi cài Node.js 22.13 trở lên:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
node deploy.mjs
```

## Giới hạn

Số liệu luồng, triều, AIS, UKC và các khuyến nghị trong ứng dụng chưa phải hệ thống dữ liệu hàng hải được chứng nhận. Hạn mức Free của Workers và D1 vẫn áp dụng.

## Kiểm tra mã nguồn

```sh
pnpm run check
pnpm test
```

Bản ZIP gồm mã giao diện, API, toàn bộ tài nguyên giao diện/bản đồ, schema D1, cấu hình build/deploy và các kiểm tra hiện hành. Không gồm thư viện node_modules, dữ liệu phiên đăng nhập, bản sao cơ sở dữ liệu hoặc cấu hình tài khoản hosting cũ.

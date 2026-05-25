# Slideshow Server

App digital signage cơ bản, tương tự Anthias nhưng gọn hơn.

## Tính năng

- Upload ảnh hoặc video.
- Thêm URL ảnh, video hoặc website.
- Quản lý playlist: bật/tắt, đổi thứ tự, chỉnh thời lượng.
- Video trong playlist có thể chọn phát hết video hoặc chỉ phát theo thời lượng đã đặt.
- Hiệu ứng chuyển slide và tùy chọn hiện/ẩn tên file trên player.
- Player toàn màn hình tại `/player`.
- Đăng nhập admin bằng session cookie, có nút đăng xuất.
- Dữ liệu lưu local trong `data/db.json`, file upload lưu trong `uploads/`.

## Chạy app

```bash
npm start
```

Nếu PowerShell chặn `npm.ps1`, chạy:

```powershell
npm.cmd start
```

Mở trang quản trị tại `http://localhost:3000/`.
Mở màn hình phát tại `http://localhost:3000/player`.

## Đăng nhập admin

Mặc định:

- User: `admin`
- Password: `admin`

Đổi tài khoản bằng biến môi trường:

```powershell
$env:ADMIN_USER="your-user"
$env:ADMIN_PASSWORD="your-password"
$env:PORT="3000"
npm.cmd start
```

Hoặc tạo file `.env`:

```env
PORT=3000
ADMIN_USER=admin
ADMIN_PASSWORD=your-password
```

`/player`, `/uploads/*`, và API đọc state cho player vẫn public. Trang admin và các API thêm/sửa/xóa yêu cầu đăng nhập. Bấm `Đăng xuất` để xóa session.

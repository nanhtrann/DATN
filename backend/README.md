# HR Assistant backend

Backend Express kết nối tới MySQL hiện có và dùng các bảng `users`, `jobs`,
`candidates`, `applications`, `interviews` và `ai_evaluations`. Bảng
`candidate_accounts` được thêm bằng migration riêng để lưu thông tin xác thực
ứng viên; server không tự chạy migration khi khởi động.

## Cấu trúc mã nguồn

```text
backend/
  server.js                  # Entry point
  src/
    app.js                   # Express app, middleware và router mounting
    config/env.js            # Environment configuration
    db/                      # MySQL pool và query dùng chung
    middleware/              # Auth, upload, rate limit, error handler
    routes/                  # Auth, jobs, applications, candidates, interviews, users
    services/                # Tích hợp Gemini AI và SMTP
    utils/                   # Validation và HTTP helpers
  migrations/                # Migration schema cần chạy thủ công
  test/                      # Unit tests
```

## Chạy server

Trong thư mục `backend`, cấu hình `.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=hr_assistant_db
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_SETUP_KEY=replace-with-a-different-random-secret
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `GEMINI_MODEL` và
các biến SMTP có giá trị mặc định hoặc chỉ cần cho chức năng tương ứng.
`JWT_SECRET` phải là một chuỗi bí mật ổn định để token không mất hiệu lực khi
server khởi động lại. Dùng chuỗi ngẫu nhiên tối thiểu 32 ký tự cho cả
`JWT_SECRET` và `ADMIN_SETUP_KEY`. SMTP chỉ cần khi gửi email/lời mời phỏng vấn.

```powershell
npm install
npm start
```

Tài khoản đăng nhập lấy từ bảng `users` hiện có. API hỗ trợ vai trò `admin`
và `hr` theo enum của database. Mật khẩu dạng bcrypt được hỗ trợ; mật khẩu cũ
được băm lại thành bcrypt khi đăng nhập thành công.

Nếu bảng `users` chưa có tài khoản, khởi tạo admin đầu tiên bằng cách đặt
`ADMIN_SETUP_KEY` trong `.env`, sau đó gọi `POST /api/auth/bootstrap` với khóa
đó trong header `x-admin-setup-key`. Body gồm `name`, `email` và `password`
(tối thiểu 12 ký tự). Endpoint chỉ tạo tài khoản khi bảng `users` còn trống,
khóa thao tác đồng thời trên MySQL, và tự vô hiệu hóa sau khi admin đầu tiên
được tạo. Không dùng lại khóa này làm mật khẩu admin.

## Dữ liệu mẫu

Chạy lệnh sau để nạp 15 bộ dữ liệu mẫu hỗn hợp và có thể chạy lại mà không
trùng email hoặc cặp tin tuyển dụng/ứng viên:

```powershell
npm run seed
```

Bộ dữ liệu gồm 15 tin tuyển dụng `[Sample]`, 15 ứng viên, 15 hồ sơ ứng tuyển
cùng đánh giá AI và các lịch phỏng vấn tương ứng.

## Cổng ứng viên

Trước lần chạy đầu tiên sau khi cập nhật, chạy migration
`migrations/001_candidate_accounts.sql` một lần trên database `hr_assistant_db`.
Migration chỉ thêm bảng `candidate_accounts`, liên kết một-một tới `candidates`;
không thay đổi các bảng hiện có. Có thể chạy trong MySQL Workbench hoặc:

```powershell
Get-Content .\migrations\001_candidate_accounts.sql | mysql -u root -p hr_assistant_db
```

Cổng ứng viên nằm tại `/candidate`. Ứng viên đăng ký bằng email mới, đăng nhập,
xem các tin đang tuyển và nộp CV PDF (tối đa 10 MB). Mỗi tài khoản chỉ nộp một
hồ sơ cho mỗi vị trí. Email đã có hồ sơ trong hệ thống nhưng chưa có tài khoản
không được tự liên kết; cần liên hệ nhà tuyển dụng để tránh chiếm đoạt hồ sơ.
Ứng viên chỉ nhận điểm phù hợp AI và trạng thái hồ sơ của chính mình; phần
phân tích chi tiết AI chỉ hiển thị cho nhân sự.

## API

Ngoại trừ `GET /health`, `POST /api/auth/login`, lần khởi tạo admin bằng
`POST /api/auth/bootstrap`, danh sách tin ứng viên `GET /api/candidate-portal/jobs`
và `POST /api/candidate-portal/register`/`login`, các endpoint `/api/*` yêu cầu
header xác thực Bearer phù hợp với loại tài khoản. Đăng nhập và đăng ký được
giới hạn số lần thử từ mỗi địa chỉ IP.

| Nhóm | Endpoint | Mô tả |
| --- | --- | --- |
| Auth | `POST /api/auth/bootstrap`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/password` | Khởi tạo admin một lần, đăng nhập, xem tài khoản và đổi mật khẩu |
| Cổng ứng viên | `GET /api/candidate-portal/jobs`, `POST /api/candidate-portal/register`, `POST /api/candidate-portal/login` | Danh sách tin đang tuyển công khai và xác thực ứng viên |
| Cổng ứng viên | `GET /api/candidate-portal/me`, `GET /api/candidate-portal/applications`, `POST /api/candidate-portal/applications` | Tài khoản, hồ sơ của chính ứng viên và nộp CV; chỉ trả điểm phù hợp AI |
| Jobs | `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id` | Danh sách, tạo, sửa và đóng tin tuyển dụng |
| Applications | `GET/POST /api/applications`, `GET/PATCH /api/applications/:id` | Quản lý hồ sơ và trạng thái Kanban |
| CV / AI | `POST /api/applications/process-cv` | Multipart: `cvFile` (PDF) và `jobId`; trích xuất, chấm điểm, lưu ứng viên/hồ sơ |
| CV / AI | `POST /api/applications/:id/evaluate`, `GET /api/applications/:id/evaluation`, `GET /api/applications/:id/cv` | Chấm điểm lại, xem điểm/ưu nhược điểm/câu hỏi AI và tải CV |
| Candidates | `GET/POST /api/candidates`, `GET/PATCH /api/candidates/:id` | Danh sách và thông tin ứng viên |
| Interviews | `GET/POST /api/interviews`, `PATCH/DELETE /api/interviews/:id` | Lịch phỏng vấn; đặt `sendInvitation: true` để gửi email |
| Email | `POST /api/applications/:id/email` | Gửi email ứng viên; body gồm `subject`, `text`, tùy chọn `to` |
| Dashboard | `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&jobId=1` | Thống kê tổng quan, pipeline, xu hướng theo tháng, phòng ban, tuyển dụng, phỏng vấn và lịch sắp tới |
| Users | `GET/POST /api/users`, `PATCH /api/users/:id` | Quản lý tài khoản/đặt lại mật khẩu; chỉ admin |

Trạng thái tin tuyển dụng: `opening`, `closed`. Trạng thái hồ sơ:
`new`, `screening`, `interview`, `hired`, `rejected`. Trạng thái phỏng vấn:
`scheduled`, `completed`, `cancelled`.

Các file CV được lưu trong `backend/uploads/`; đường dẫn được lưu trong
`applications.cv_file_url` và chỉ tải qua endpoint có xác thực.

AI trả về thông tin trích xuất và tóm tắt trong phản hồi xử lý CV. Database
hiện tại không có cột lưu kỹ năng, học vấn hoặc tóm tắt; backend không tự ý sửa
schema và chỉ lưu các trường có sẵn trong `candidates`/`ai_evaluations`.

Chạy kiểm tra tự động bằng `npm test`. Bộ test không kết nối hoặc ghi dữ liệu
vào MySQL.

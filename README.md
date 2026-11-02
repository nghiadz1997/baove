# NSG SMART GUARD – MOBILE FIRST ARCHITECTURE

Hệ thống quản lý tuần tra, chấm điểm QR và giám sát an ninh trật tự toàn diện dành cho **Trường Cao đẳng Nam Sài Gòn (NSG)**.

---

## 1. TỔNG QUAN ĐỊNH HƯỚNG MOBILE FIRST

- **Nhân viên bảo vệ (Mobile View)**: Điện thoại di động là thiết bị thao tác chính khi đi tuần tra trong khuôn viên trường. Thiết kế giao diện PWA native, tối ưu màn hình từ 360px trở lên, thao tác tiện lợi bằng một tay, hỗ trợ vùng an toàn (Safe Area Insets) cho iPhone có tai thỏ / Dynamic Island và thiết bị Android.
- **Quản lý / Ban Giám hiệu trên điện thoại (Manager Mobile)**: Xem nhanh quân số bảo vệ đang trực, tỷ lệ % hoàn thành tuần tra trong ca, các cảnh báo vị trí GPS bất thường, danh sách sự cố và bản đồ tương tác các chốt an ninh.
- **Quản trị trên máy tính (Desktop Admin)**: Sidebar 12 module chuyên nghiệp phục vụ quản lý tổng thể: Dashboard, Cơ sở, Khu vực, Nhân sự, Ca trực, Phân công, QR/GPS, Tuần tra, Sự cố, Bàn giao, Báo cáo và Cấu hình.
- **Chuyển đổi linh hoạt**: Thanh switcher đầu trang cho phép chuyển đổi ngay lập tức giữa **[Bảo Vệ Mobile]**, **[Quản Lý Mobile]** và **[Desktop Admin]** để kiểm thử mọi kịch bản trên mọi kích cỡ màn hình.

---

## 2. CÁC MODULE CHỨC NĂNG

### A. Mobile App dành cho Bảo vệ
1. **Trang chủ**:
   - Thẻ định danh nhân viên (Tên, Mã NV, Avatar, Cơ sở phụ trách).
   - Ca trực hiện tại (Khung giờ, định mức lượt tuần tra).
   - Nút nhận ca trực / Điểm danh vào ca.
   - Thống kê tiến độ tuần tra thời gian thực: % hoàn thành, số điểm đã kiểm tra, số điểm còn lại.
   - Nút lớn kích hoạt Camera quét QR toàn màn hình.
   - Nút báo cáo sự cố nhanh.
   - Danh sách các lượt quét QR gần nhất.

2. **Màn hình Tuần tra**:
   - Danh sách các điểm chốt thuộc nhiệm vụ được giao.
   - Tự do chọn điểm bất kỳ theo tuyến đường, không bắt buộc tuần tự.
   - Phân biệt rõ điểm **Đã kiểm tra** (Xanh lá) và **Chưa kiểm tra** (Vàng/Xám).
   - Bộ lọc theo: **Khu nhà** (Khu A, B, C, D, Kỹ thuật), **Tầng lầu** (Trệt, Lầu 1, Lầu 2, Lầu 3...), **Trạng thái** (Tất cả, Chưa quét, Đã kiểm tra).
   - Cảnh báo mất kết nối mạng và cơ chế lưu trữ ngoại tuyến (Offline Storage & Auto-sync).

3. **Màn hình Lịch trực & Bàn giao**:
   - Thẻ thông tin các ca trực (Ca sáng 06:00 - 14:00, Ca chiều 14:00 - 22:00, Ca đêm 22:00 - 06:00).
   - Biên bản bàn giao ca trực điện tử: Bàn giao chìa khóa các phòng học, số lượng máy bộ đàm, đèn pin, xe tuần tra, tình hình trật tự trong ca.
   - Lịch sử bàn giao giữa các ca trực.

4. **Tài khoản & Phân quyền**:
   - Hồ sơ nhân viên, đổi người dùng thử nghiệm nhanh.
   - Thông số kỹ thuật hệ thống, trạng thái GPS và kết nối Firebase.

---

### B. Module Quét Mã QR & Định vị GPS (Trọng Tâm Hệ Thống)
- Quét toàn màn hình bằng Camera điện thoại (mặc định Camera sau, hỗ trợ đổi Cam trước và bật đèn Flash).
- Khung quét công nghệ cao với tia laser xanh quét liên tục.
- Yêu cầu và theo dõi vị trí GPS Geolocation chính xác cao (độ chính xác ± mét).
- Tự động tính khoảng cách thực tế (công thức Haversine) từ tọa độ GPS của thiết bị đến tọa độ GPS đã đăng ký của chốt:
  - Nếu khoảng cách **≤ bán kính cho phép (mặc định 35-50m)**: Xác thực hợp lệ.
  - Nếu khoảng cách **> bán kính**: Cảnh báo sai vị trí, đánh dấu nghi vấn trên hệ thống quản lý.
- Cơ chế chống gian lận & chống spam:
  - Khóa giãn cách (cooldown 5 giây) giữa các lần quét.
  - Kiểm tra tính toàn vẹn và gửi xác thực về Cloud Functions / Firestore.
  - Âm thanh bíp tần số kép (Web Audio API) và rung phản hồi (Haptic feedback) khi quét thành công.
- Hộp thoại kết quả sau khi quét: Tên điểm, Cơ sở, Khu nhà, Tầng, Thời gian xác nhận, Trạng thái GPS, nút Tiếp tục tuần tra và nút Báo sự cố tại chốt.

---

### C. Báo Cáo Sự Cố Nhanh Trên Điện Thoại
- Giao diện thao tác bằng một tay.
- Phân loại: Cửa hỏng / quên khóa, PCCC / cháy nổ, Mất an ninh trật tự, Hỏng thiết bị điện nước, Tài sản khả nghi...
- Gợi ý câu mẫu nhanh (Quick phrases).
- Chụp ảnh minh chứng trực tiếp bằng Camera và nén tự động.
- Tự động đóng dấu tọa độ GPS và thời gian gửi.
- Thiết lập mức độ khẩn cấp (Thường, Trung bình, Cao, Khẩn cấp SOS).

---

### D. Desktop Admin Quản Trị Hệ Thống (12 Module)
1. **Dashboard**: Biểu đồ KPI, tiến độ ca trực, lực lượng bảo vệ trực tuyến, bản đồ chốt an ninh trực quan.
2. **Cơ sở**: Quản lý các cơ sở trường (Cơ sở 1 Quận 8, Cơ sở 2 An Phú Tây...).
3. **Khu vực**: Phân chia tòa nhà, khối phòng học, thư viện, ký túc xá, trạm điện.
4. **Nhân sự**: Danh sách bảo vệ, thông tin liên lạc, ca phân công, trạng thái trực.
5. **Ca trực**: Thiết lập định mức giờ và số lượt tuần tra yêu cầu.
6. **Phân công**: Bảng ma trận xếp lịch trực tuần cho toàn đội bảo vệ.
7. **QR / GPS**: Danh mục chốt tuần tra, thiết lập tọa độ, tạo và in mã QR dạng thẻ dán.
8. **Tuần tra**: Nhật ký kiểm định Cloud, khoảng cách GPS, hỗ trợ xuất file Excel/CSV.
9. **Sự cố**: Bảng xử lý sự cố toàn trường, cập nhật trạng thái (Chờ, Đang xử lý, Đã giải quyết) và xem ảnh hiện trường.
10. **Bàn giao**: Quản lý biên bản giao ban và kiểm kê tài sản.
11. **Báo cáo**: Thống kê hiệu suất tuần tra, tỷ lệ hoàn thành ca, thời gian xử lý sự cố.
12. **Cấu hình**: Tham số bán kính GPS cho phép, giãn cách quét chống spam, cài đặt âm thanh và lưu trữ ngoại tuyến.

---

## 3. CẤU HÌNH DATABASE & FIREBASE AUTHENTICATION

- **Super Admin tối cao**: `trongnghia@nsg.edu.vn` (Toàn quyền quản trị, phân quyền, cấp tài khoản và cấu hình hệ thống).
- **Mật khẩu ban đầu**: `123456` (Hệ thống tự động kích hoạt vào Firebase Authentication khi đăng nhập lần đầu).
- **Cơ chế cấp tài khoản**:
  - Super Admin vào mục **Nhân sự** trên Desktop Admin.
  - Bấm **"+ Cấp tài khoản mới"**: Nhập Email (VD: `bv01@nsg.edu.vn`), Mật khẩu, Mã NV, Họ tên, SĐT, và Phân quyền (`Bảo vệ`, `Quản lý`, `Admin`).
  - Tài khoản được khởi tạo trực tiếp trong **Firebase Authentication** và đồng bộ vai trò vào Firestore `users/{uid}`.
  - Người dùng đăng nhập bằng Email hoặc Mã NV + Mật khẩu.

Database Firebase:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBuvfubi3LTh1BicGhcNBIb16WN3uz9sdg",
  authDomain: "baove-bb95b.firebaseapp.com",
  projectId: "baove-bb95b",
  storageBucket: "baove-bb95b.firebasestorage.app",
  messagingSenderId: "445696820627",
  appId: "1:445696820627:web:729791de2c3d032d121466",
  measurementId: "G-VYG7GKB4ZE"
};
```

---

## 4. HƯỚNG DẪN KHỞI CHẠY & KIỂM THỬ

### Cách 1: Khởi chạy bằng Node.js Server
Trong thư mục `D:\BaoVe`, chạy lệnh:
```bash
npm start
```
Hoặc:
```bash
node server.js
```
Truy cập trên trình duyệt: `http://localhost:3000`

### Cách 2: Kiểm thử trên Điện Thoại Thực Tế (iPhone / Android)
1. Kết nối điện thoại và máy tính vào cùng mạng Wi-Fi trường hoặc cá nhân.
2. Mở trình duyệt trên điện thoại (Safari trên iOS hoặc Chrome trên Android).
3. Nhập địa chỉ: `http://<IP_MÁY_TÍNH>:3000` (Ví dụ: `http://192.168.1.15:3000`).
4. Bấm "Thêm vào màn hình chính" (Add to Home Screen) để trải nghiệm như ứng dụng PWA Native.
5. Cho phép cấp quyền Camera và Vị trí (GPS) để kiểm tra tính năng quét QR và tính khoảng cách thực tế.

# Hướng dẫn: Shortcut iPhone quét mã MoMo → gọi `pos-charge`

## Bước 0 — Deploy server

## Bước 1 — Dựng Shortcut

Mở app **Shortcuts** → **+** → đặt tên **"Quét MoMo"**.

### 1. `Scan QR/Barcode`
Quét mã thanh toán khách đưa. Đổi tên kết quả thành **`MaThanhToan`**.

### 2. `Ask for Input`
- Loại: **Number**
- Prompt: "Số tiền (VNĐ)"
- Đổi tên kết quả thành **`SoTien`**

### 3. `Text`

```
https://kiehtt.vercel.app/api/momo/pos-charge?key=DÁN_SHORTCUT_API_KEY_THẬT_VÀO_ĐÂY&amount=[SoTien]&paymentCode=[MaThanhToan]
```
- Thay `DÁN_SHORTCUT_API_KEY_THẬT_VÀO_ĐÂY` bằng giá trị `SHORTCUT_API_KEY` thật (gõ tay trực tiếp, không dùng biến/Shortcut con).
- `[SoTien]` → kéo biến `SoTien` vào đúng vị trí đó.
- `[MaThanhToan]` → kéo biến `MaThanhToan` vào đúng vị trí đó.
- Đổi tên kết quả action Text này thành **`FullURL`**.

*(Nếu có nhiều cửa hàng, thêm `&storeId=XXX` vào cuối chuỗi trên, thay XXX bằng mã cửa hàng cố định hoặc một biến chọn cửa hàng riêng.)*

### 4. `Get Contents of URL`
- URL: biến **`FullURL`** (không gõ URL trực tiếp ở đây nữa — dùng đúng biến vừa dựng)
- Method: **GET**
- Không cần thêm Headers, không cần Request Body — GET dùng query string trong URL nên bỏ trống hết phần Headers/Body.
- Mở **Show More** → tắt **"Fail on HTTP Errors"**, để Shortcut vẫn nhận response khi bị lỗi 401/400/500.

### 5. Lấy các field cần thiết
Thêm các action `Get Dictionary Value`, tất cả cùng lấy từ kết quả action 4:
- Key `message` → đặt tên **`Msg`**
- Key `transId` → đặt tên **`TransId`**
- Key `resultCode` → đặt tên **`ResultCode`**
- Key `error` → đặt tên **`Err`** *(dùng khi bị 401/400, response không có message/transId/resultCode)*

### 6. `Show Alert`
- Title: `Kết quả thanh toán`
- Message: dùng action `Text` nối các biến thành đoạn dễ đọc:
  ```
  Số tiền: [SoTien] đ
  Mã kết quả: [ResultCode]
  [Msg]
  Mã GD: [TransId]
  [Err]
  ```
  Khi thành công, `Err` sẽ rỗng nên không ảnh hưởng gì tới hiển thị.

---

## Bước 2 — Debug nếu vẫn lỗi/đơ

1. Chạy Shortcut → mở Vercel → **Logs** → lọc `pos-charge`.
2. Xem log dừng ở dòng `Bước` nào cuối cùng — đó chính là chỗ bị kẹt (chi tiết xem hướng dẫn debug ở tin nhắn trước).
3. Nếu **hoàn toàn không có log nào** xuất hiện dù chạy Shortcut → vấn đề nằm ở chính Shortcuts (kiểm tra: URL gõ đúng chưa — copy dán lại `FullURL` ra Show Result để xem nó build ra đúng chuỗi URL không, có dính khoảng trắng hay ký tự lạ không).

---

## Lưu ý

- Số tiền min/max: **1.000 – 10.000.000 ₫**.
- Mã quét phải đúng dạng 18 chữ số, có thể có tiền tố `MM`/`mm`.
- Không dùng Shortcut con (Chạy Shortcut →) để lấy key nữa — gõ tay trực tiếp trong URL, giảm 1 lớp có thể gây treo/lỗi quyền.

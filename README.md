# 🟣 MoMo Payment Web — Hướng Dẫn Deploy

Trang thanh toán MoMo đơn giản, deploy lên **Vercel miễn phí** trong 5 phút.

---

## 📁 Cấu trúc project

```
momo-web/
├── lib/
│   └── momo.js              ← Logic tạo chữ ký & gọi API MoMo
├── pages/
│   ├── index.js             ← Trang thanh toán (form nhập số tiền)
│   ├── result.js            ← Trang kết quả sau khi thanh toán
│   ├── _app.js
│   └── api/momo/
│       ├── create.js        ← POST /api/momo/create  (tạo đơn)
│       ├── ipn.js           ← POST /api/momo/ipn     (MoMo callback)
│       └── status.js        ← GET  /api/momo/status  (kiểm tra trạng thái)
├── .env.local               ← Credentials (KHÔNG commit lên Git)
├── package.json
└── README.md
```

---

## 🚀 Deploy lên Vercel (từng bước)

### Bước 1 — Tạo tài khoản Vercel
- Vào **https://vercel.com** → Sign up bằng GitHub (miễn phí)

### Bước 2 — Đưa code lên GitHub
1. Tạo repo mới trên GitHub (private)
2. Upload toàn bộ folder `momo-web` lên repo đó
3. **LƯU Ý**: KHÔNG upload file `.env.local` — đã có trong `.gitignore`

### Bước 3 — Import vào Vercel
1. Vào **https://vercel.com/new**
2. Chọn repo GitHub vừa tạo → **Import**
3. Framework: chọn **Next.js** (tự detect)
4. Nhấn **Deploy** (lần đầu sẽ báo lỗi vì chưa có env — bình thường)

### Bước 4 — Thêm Environment Variables
Sau khi deploy xong, vào:
**Project Settings → Environment Variables** → Thêm từng biến:

| Name | Value |
|------|-------|
| `MOMO_PARTNER_CODE` | `MOMOZLQV20240209` |
| `MOMO_ACCESS_KEY` | `x09Lqsf1XmZDE57S` |
| `MOMO_SECRET_KEY` | `dozQoeTtjCahNRVOtxaC02p6JK9xaE3P` |
| `MOMO_ENDPOINT` | `https://test-payment.momo.vn/v2/gateway/api/create` |
| `NEXT_PUBLIC_BASE_URL` | `https://TÊN-PROJECT.vercel.app` ← copy từ Vercel |

Sau đó nhấn **Redeploy**.

### Bước 5 — Test thử
- Mở URL Vercel của bạn
- Nhập số tiền + nội dung → nhấn Thanh Toán
- Đăng nhập MoMo Test Account (xem bên dưới) để test

---

## 🧪 Tài khoản MoMo Sandbox để test

Cài app **MoMo Test** (không phải app thật):
- Android: https://developers.momo.vn (tải APK từ trang dev)
- Tài khoản test: xem tại https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions

---

## 🔁 Khi muốn go-live (production)

1. Đăng ký merchant tại https://business.momo.vn
2. Lấy credentials production
3. Đổi `MOMO_ENDPOINT` thành:
   ```
   https://payment.momo.vn/v2/gateway/api/create
   ```
4. Cập nhật credentials production trong Vercel → Redeploy

---

## ⚠️ Lưu ý bảo mật

- **KHÔNG** bao giờ để `MOMO_SECRET_KEY` lộ ở frontend
- **KHÔNG** commit `.env.local` lên GitHub
- Trong production nên lưu kết quả IPN vào database thật (PostgreSQL, MongoDB...)
- Hiện tại IPN dùng in-memory store → reset mỗi lần Vercel redeploy

---

## 🐛 Troubleshoot

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `resultCode: 4001` | Sai signature | Kiểm tra SECRET_KEY trong env |
| `resultCode: 2001` | Sai tham số | Kiểm tra amount ≥ 1000 |
| IPN không nhận được | ipnUrl sai | Đảm bảo NEXT_PUBLIC_BASE_URL đúng domain Vercel |
| Redirect lỗi | redirectUrl sai | Tương tự trên |

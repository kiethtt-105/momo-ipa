#!/bin/bash
# Test xem MoMo API có trả về qrCodeUrl không
# Điền đúng giá trị từ .env của bạn vào 4 biến dưới đây rồi chạy: bash test-momo-qr.sh

PARTNER_CODE="MOMOZLQV20240209"
ACCESS_KEY="x09Lqsf1XmZDE57S"
SECRET_KEY="dozQoeTtjCahNRVOtxaC02p6JK9xaE3P"
ENDPOINT="https://payment.momo.vn/v2/gateway/api/create
"          # vd: https://payment.momo.vn/v2/gateway/api/create
BASE_URL="https://kiehtt.vercel.app"   # vd: https://kiehtt.vercel.app

# Dọn ký tự \r (CRLF) phòng trường hợp file bị lưu bằng Notepad trên Windows —
# \r vô hình trên terminal nhưng làm curl báo "URL malformed" (exit code 3)
strip_cr() { printf '%s' "$1" | tr -d '\r'; }
PARTNER_CODE=$(strip_cr "$PARTNER_CODE")
ACCESS_KEY=$(strip_cr "$ACCESS_KEY")
SECRET_KEY=$(strip_cr "$SECRET_KEY")
ENDPOINT=$(strip_cr "$ENDPOINT")
BASE_URL=$(strip_cr "$BASE_URL")

# ─── Data test ───
ORDER_ID="testqr$(date +%s)"
REQUEST_ID="${ORDER_ID}_$(date +%s)"
AMOUNT="10000"
ORDER_INFO="Test QR code"
REDIRECT_URL="${BASE_URL}/result"
IPN_URL="${BASE_URL}/api/momo/ipn"
EXTRA_DATA=""
REQUEST_TYPE="captureWallet"

# ─── Tạo chuỗi ký (đúng thứ tự a-z như lib/momo.js) ───
RAW_SIGNATURE="accessKey=${ACCESS_KEY}&amount=${AMOUNT}&extraData=${EXTRA_DATA}&ipnUrl=${IPN_URL}&orderId=${ORDER_ID}&orderInfo=${ORDER_INFO}&partnerCode=${PARTNER_CODE}&redirectUrl=${REDIRECT_URL}&requestId=${REQUEST_ID}&requestType=${REQUEST_TYPE}"

SIGNATURE=$(echo -n "$RAW_SIGNATURE" | openssl dgst -sha256 -hmac "$SECRET_KEY" | sed 's/^.* //')

echo "=== Raw signature string ==="
echo "$RAW_SIGNATURE"
echo ""
echo "=== Signature ==="
echo "$SIGNATURE"
echo ""

# ─── Gọi API MoMo ───
HTTP_CODE=$(curl -s -o /tmp/momo_resp.json -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "partnerCode": "${PARTNER_CODE}",
  "requestId": "${REQUEST_ID}",
  "amount": ${AMOUNT},
  "orderId": "${ORDER_ID}",
  "orderInfo": "${ORDER_INFO}",
  "redirectUrl": "${REDIRECT_URL}",
  "ipnUrl": "${IPN_URL}",
  "extraData": "${EXTRA_DATA}",
  "requestType": "${REQUEST_TYPE}",
  "signature": "${SIGNATURE}",
  "lang": "vi"
}
EOF
)
CURL_EXIT=$?
RESPONSE=$(cat /tmp/momo_resp.json 2>/dev/null)

echo "=== ENDPOINT đang gọi ==="
echo "$ENDPOINT"
echo ""
echo "=== curl exit code: $CURL_EXIT | HTTP status: $HTTP_CODE ==="
echo ""

if [ -z "$RESPONSE" ]; then
  echo "!!! Response rỗng — ENDPOINT sai, mất mạng, hoặc bị chặn SSL. Kiểm tra lại biến ENDPOINT."
  exit 1
fi

echo "=== MoMo response (raw) ==="
echo "$RESPONSE"
echo ""

echo "=== MoMo response (full) ==="
echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

echo ""
echo "=== Có qrCodeUrl không? ==="
QR=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);process.stdout.write(o.qrCodeUrl||'')}catch(e){}})")
if [ -n "$QR" ]; then
  echo "✓ CÓ qrCodeUrl: $QR"
else
  echo "✗ KHÔNG có qrCodeUrl (rỗng/null) — tài khoản chưa được cấp quyền, hoặc lỗi request."
fi
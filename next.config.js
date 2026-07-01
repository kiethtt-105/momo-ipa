/** @type {import('next').NextConfig} */
const nextConfig = {
  // BẮT BUỘC: không cho Next.js/Turbopack bundle lại 2 package này,
  // nếu không sẽ bị lỗi "input directory .../bin does not exist"
  // vì bundler di chuyển file nhưng puppeteer-core/@sparticuz/chromium
  // tự tìm binary theo đường dẫn gốc trong node_modules.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  // BẮT BUỘC (bug đã biết của @sparticuz/chromium trên Vercel + pnpm):
  // output file tracing của Next.js không tự phát hiện thư mục bin/ của
  // package này vì nó được đọc qua đường dẫn fs lúc runtime, không phải
  // require() trực tiếp nên tracer "nhìn không thấy" -> ép include thủ công.
  // Đổi key '/api/momo/qr-extract' nếu bạn đặt route ở path khác.
  outputFileTracingIncludes: {
    '/api/momo/qr-extract': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
}

module.exports = nextConfig
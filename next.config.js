/** @type {import('next').NextConfig} */
const nextConfig = {
  // BẮT BUỘC: không cho Next.js/Turbopack bundle lại 2 package này,
  // nếu không sẽ bị lỗi "input directory .../bin does not exist"
  // vì bundler di chuyển file nhưng puppeteer-core/@sparticuz/chromium
  // tự tìm binary theo đường dẫn gốc trong node_modules.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
}

module.exports = nextConfig
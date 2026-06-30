/** @type {import('next').NextConfig} */
const nextConfig = {
  // 정적 export (Netlify 정적 호스팅 / `next build` 후 out/ 생성)
  output: 'export',
  // 정적 export 에서는 next/image 최적화 서버가 없으므로 비활성화
  images: { unoptimized: true },
  // 폴더형 경로(out/<page>/index.html) → 정적 호스팅에서 안정적
  trailingSlash: true,
};

module.exports = nextConfig;

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 배포(빌드)할 때마다 달라지는 버전 번호. 화면 속 번호와 version.json 속 번호를 비교해 새 버전을 알아챈다.
const BUILD_ID = String(Date.now())

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
      },
    },
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon-32.png',
        'favicon-192.png',
        'favicon-512.png',
        'icon-maskable-192.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: '클래스로그AI',
        short_name: '클래스로그AI',
        description: '교사를 위한 AI 수업 기록 및 세특 초안 생성 서비스',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'ko',
        icons: [
          {
            src: '/favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        importScripts: ['push-sw.js'],
        // PDF 가이드 창(iframe)이 앱 첫 화면으로 바뀌어 열리지 않도록, PDF 주소는 서비스 워커의 '첫 화면 대신 내주기'에서 뺀다
        navigateFallbackDenylist: [/\.pdf$/, /\.html$/],
        runtimeCaching: [
          {
            // 관리자 페이지(/admin)에서 나가는 Supabase 요청은 캐시를 타지 않고 항상 최신 데이터를 가져온다.
            // (NetworkFirst 캐시로 인해 삭제 직후에도 예전 목록이 다시 보이는 문제 방지)
            urlPattern: ({ url, request }) =>
              /\.supabase\.co$/.test(url.hostname) && (request.referrer || '').includes('/admin'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 10 },
          },
          {
            // 화면 조각(js/css)은 파일 이름에 고유 번호가 있어 바뀌면 새 이름이 된다.
            // 미리 전부 받지 않고, 처음 열 때 한 번 받아 저장해 두고 다음부터는 저장본을 쓴다.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'app-assets', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            // 안내 그림·캐릭터·글꼴 같은 큰 그림 파일도 처음 볼 때 한 번만 받는다
            urlPattern: ({ url, sameOrigin }) => sameOrigin
              && /^\/(guide|screenshots|slide-characters|illustrations|thumbnail|og|fonts)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'app-images', expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
        // 첫 방문 때 304개를 전부 받던 것을 줄여, 첫 화면 뼈대(index.html·아이콘·앱 설명 파일)만 미리 저장한다.
        // (Vercel CDN 요청 한도 절약 — 나머지는 위 runtimeCaching 으로 처음 열 때 저장)
        globPatterns: ['index.html', 'manifest.webmanifest', '*.{ico,png,svg}'],
        // 코딩 글꼴(D2Coding)은 무거워서 미리 내려받지 않고, 부트캠프 템플릿을 쓸 때만 받는다
        globIgnores: ['**/fonts/D2Coding*', '**/Gemini_Generated_Image*'],
      },
    }),
  ],
})

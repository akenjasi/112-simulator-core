/** @type {import('next').NextConfig} */

// DOCKER_BUILD=true  → статический экспорт для Nginx (docker compose up --build)
// DOCKER_BUILD=false → dev-режим с Next.js rewrite-прокси на localhost:8000
const isDockerBuild = process.env.DOCKER_BUILD === 'true'

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,

  // output: 'export' генерирует статические файлы в /out.
  // Нужен для Docker (Nginx раздаёт /out).
  // В dev-режиме НЕ включаем — иначе rewrites не работают.
  ...(isDockerBuild ? { output: 'export' } : {}),

  // Rewrites работают только в dev-режиме (Next.js dev server).
  // В Docker: Nginx проксирует /api/* → backend:8000 напрямую.
  ...(!isDockerBuild
    ? {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: 'http://127.0.0.1:8000/api/:path*',
            },
          ]
        },
      }
    : {}),
}

export default nextConfig

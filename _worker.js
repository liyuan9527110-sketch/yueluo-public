const RELEASE_API = 'https://api.github.com/repos/liyuan9527110-sketch/yueluo-public/releases/latest'
const RELEASE_ASSET = 'Yueluo-latest.zip'
const DOWNLOAD_PATH = '/downloads/阅络-latest.zip'
const SETUP_PATH = '/downloads/阅络安装程序.exe'
const VERSION_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/

function staticCacheControl(pathname) {
  if (pathname === '/' || pathname.endsWith('.html')) {
    return 'public, max-age=0, must-revalidate'
  }
  if (pathname === '/styles.css') {
    return 'public, max-age=0, must-revalidate'
  }
  if (pathname.startsWith('/assets/')) {
    return 'public, max-age=86400, must-revalidate'
  }
  return null
}

async function serveStatic(request, env, pathname) {
  const response = await env.ASSETS.fetch(request)
  const cacheControl = staticCacheControl(pathname)
  if (!cacheControl) return response

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', cacheControl)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function upstreamHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yueluo-download-worker',
  }
}

function unavailable() {
  return new Response('暂时无法获取最新版安装包，请稍后重试。', {
    status: 502,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function downloadLatest(request, installer = false) {
  try {
    const releaseResponse = await fetch(RELEASE_API, {
      headers: upstreamHeaders(),
      cf: { cacheEverything: true, cacheTtl: 300 },
    })
    if (!releaseResponse.ok) return unavailable()

    const release = await releaseResponse.json()
    const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
    if (!VERSION_PATTERN.test(tag)) return unavailable()
    const asset = Array.isArray(release.assets)
      ? release.assets.find((item) => item?.name === (installer ? 'YueluoSetup-latest.exe' : RELEASE_ASSET) && typeof item?.browser_download_url === 'string')
      : undefined
    if (!asset) return unavailable()

    const assetResponse = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': 'yueluo-download-worker' },
      redirect: 'follow',
    })
    if (!assetResponse.ok || !assetResponse.body) return unavailable()

    const version = tag.startsWith('v') ? tag.slice(1) : tag
    const asciiName = installer ? `YueluoSetup-v${version}.exe` : `Yueluo-v${version}.zip`
    const chineseName = installer ? `阅络安装程序-v${version}.exe` : `阅络-v${version}.zip`
    const headers = new Headers(assetResponse.headers)
    headers.set('Content-Type', installer ? 'application/octet-stream' : 'application/zip')
    headers.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(chineseName)}`)
    headers.set('Cache-Control', 'public, max-age=300, must-revalidate')
    headers.set('X-Content-Type-Options', 'nosniff')

    return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
      status: 200,
      headers,
    })
  } catch {
    return unavailable()
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)
    if ((request.method === 'GET' || request.method === 'HEAD') && pathname === SETUP_PATH) {
      return downloadLatest(request, true)
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && pathname === DOWNLOAD_PATH) {
      return downloadLatest(request)
    }
    return serveStatic(request, env, pathname)
  },
}

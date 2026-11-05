import type { Canvas, CanvasDraft, CanvasFile, CanvasLanguage } from '../types'

/**
 * Canvas bundling.
 *
 * A canvas is a small project (index.html, styles.css, app.js, …) but the
 * preview is one sandboxed document. Local <link> and <script src> references
 * are inlined in place so relative paths work without a server, and any file
 * the HTML did not reference is appended in dependency order.
 */

export function languageOf(path: string): CanvasLanguage {
  if (/\.html?$/i.test(path)) return 'html'
  if (/\.css$/i.test(path)) return 'css'
  if (/\.m?js$/i.test(path)) return 'js'
  if (/\.json$/i.test(path)) return 'json'
  if (/\.svg$/i.test(path)) return 'svg'
  return 'md'
}

export function canvasFiles(input: {
  html: string
  css: string
  js: string
  files?: CanvasFile[]
}): CanvasFile[] {
  if (input.files?.length) return input.files
  return [
    { path: 'index.html', language: 'html', content: input.html },
    { path: 'styles.css', language: 'css', content: input.css },
    { path: 'app.js', language: 'js', content: input.js },
  ]
}

export function filesToParts(files: CanvasFile[]): { html: string; css: string; js: string } {
  return {
    html: files.filter((file) => file.language === 'html').map((file) => file.content).join('\n'),
    css: files.filter((file) => file.language === 'css').map((file) => file.content).join('\n'),
    js: files.filter((file) => file.language === 'js').map((file) => file.content).join('\n'),
  }
}

export function draftFromCanvas(canvas: Canvas | CanvasDraft & { files?: CanvasFile[] }): {
  name: string
  description: string
  files: CanvasFile[]
} {
  return {
    name: canvas.name,
    description: canvas.description,
    files: canvasFiles(canvas),
  }
}

export function mergeCanvasFiles(base: CanvasFile[], patch: CanvasFile[]): CanvasFile[] {
  const next = [...base]
  for (const file of patch) {
    const index = next.findIndex((item) => item.path === file.path)
    if (index >= 0) next[index] = file
    else next.push(file)
  }
  return next
}

export function buildCanvasDoc(input: { html: string; css: string; js: string; files?: CanvasFile[] }): string {
  const files = canvasFiles(input)
  const entry =
    files.find((file) => file.path === 'index.html') ??
    files.find((file) => file.language === 'html') ?? {
      path: 'index.html',
      language: 'html' as const,
      content: '<main class="card"><h1>Empty canvas</h1></main>',
    }

  const used = new Set<string>([entry.path])
  const byName = new Map(files.map((file) => [file.path.replace(/^\.?\//, ''), file]))
  const byBase = new Map(files.map((file) => [file.path.split('/').pop()!, file]))
  const resolve = (ref: string) => {
    const clean = ref.split('?')[0].replace(/^\.?\//, '')
    return byName.get(clean) ?? byBase.get(clean.split('/').pop() ?? clean)
  }

  // With explicit files, the legacy html/css/js fields are derived copies.
  const hasFiles = Boolean(input.files?.length)

  let html = entry.content
    .replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
      const file = resolve(href)
      if (!file || file.language !== 'css') return tag
      used.add(file.path)
      return `<style>\n${closeSafe(file.content, 'style')}\n</style>`
    })
    .replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src: string) => {
      const file = resolve(src)
      if (!file || file.language !== 'js') return tag
      used.add(file.path)
      return `<script>\n${closeSafe(file.content, 'script')}\n</script>`
    })
    .replace(/src=["']([^"']+\.svg)["']/gi, (match, src: string) => {
      const file = resolve(src)
      if (!file || file.language !== 'svg') return match
      used.add(file.path)
      return `src="data:image/svg+xml;utf8,${encodeURIComponent(file.content)}"`
    })

  // JSON or Markdown files can be read by scripts at runtime through globals.
  for (const file of files) {
    if (file.language !== 'json') continue
    used.add(file.path)
    html += `\n<script>window.__canvasFiles = Object.assign(window.__canvasFiles || {}, { ${JSON.stringify(file.path)}: ${file.content} })</script>`
  }

  // Only files the caller supplied can be extra sources; synthesized ones
  // (legacy html/css/js) are already represented by input.css/input.js.
  const provided = input.files ?? []
  const css = [
    hasFiles ? '' : input.css,
    ...provided.filter((file) => file.language === 'css' && !used.has(file.path)).map((file) => file.content),
  ]
    .filter(Boolean)
    .join('\n')
  const js = [
    hasFiles ? '' : input.js,
    ...provided.filter((file) => file.language === 'js' && !used.has(file.path)).map((file) => file.content),
  ]
    .filter(Boolean)
    .join('\n')

  return document_(html, css, js)
}

function closeSafe(content: string, tag: 'style' | 'script'): string {
  return content.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
}

function document_(html: string, css: string, js: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet" />
<style>${closeSafe(css, 'style')}</style>
<script>
(function () {
  function report(kind, message) {
    try {
      parent.postMessage({ source: 'mezze-canvas', kind: kind, message: String(message) }, '*')
    } catch (error) {
      // A blocked postMessage must never break the canvas itself.
    }
  }
  window.addEventListener('error', function (event) {
    report('error', event.message || 'Script error')
  })
  window.addEventListener('unhandledrejection', function (event) {
    report('error', 'Unhandled promise rejection: ' + String(event.reason))
  })
  var log = console.log
  console.log = function () {
    try { parent.postMessage({ source: 'mezze-canvas', kind: 'log', message: Array.prototype.join.call(arguments, ' ') }, '*') } catch (e) {}
    log.apply(console, arguments)
  }
})()
</script>
</head>
<body>
${html}
<script>${closeSafe(js, 'script')}</script>
</body>
</html>`
}

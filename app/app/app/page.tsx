import { readFileSync } from 'fs'
import { join } from 'path'

export default function AppPage() {
  const htmlPath = join(process.cwd(), 'public', 'app.html')
  let html = ''
  try {
    html = readFileSync(htmlPath, 'utf8')
  } catch {
    html = '<html><body><h1>Loading...</h1></body></html>'
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}

// 无头浏览器诊断：抓取页面 console/pageerror 输出，检查 #app 渲染情况
// 用法：node scripts/diagnose.mjs [url]
import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://localhost:8080/'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--disable-gpu', '--no-first-run'],
})

try {
  const page = await browser.newPage()
  page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()))
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  page.on('requestfailed', (req) =>
    console.log('[requestfailed]', req.url(), req.failure()?.errorText),
  )

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 2000))

  const info = await page.evaluate(() => ({
    location: location.href,
    appHtmlLength: document.getElementById('app')?.innerHTML.length ?? -1,
    bodySnippet: document.body.innerHTML.slice(0, 300),
  }))
  console.log('[info]', JSON.stringify(info, null, 2))
} finally {
  await browser.close()
}

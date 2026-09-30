import { test, expect } from '@playwright/test'
test('no displayed text is invisible or near-invisible', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('try-demo').click()
  const bad: string[] = []
  for (const view of ['dashboard','advance','grow','liquidity','how']) {
    await page.getByTestId(`nav-${view}`).click()
    await page.waitForTimeout(120)
    const found = await page.evaluate(() => {
      const out: string[] = []
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
      const lum = (rgb: number[]) => {
        const f = rgb.slice(0,3).map((v) => {
          const s = v/255
          return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4)
        })
        return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]
      }
      const bgOf = (el: Element): number[] => {
        let e: Element | null = el
        while (e) {
          const bg = getComputedStyle(e).backgroundColor
          const p = parse(bg)
          const alpha = p.length > 3 ? p[3] : 1
          if (alpha > 0.9) return p
          e = e.parentElement
        }
        return [255,255,255]
      }
      document.querySelectorAll<HTMLElement>('.lcd-value, .stat-val, .sblock-value, .fcard-name, .tiny, .h1, .h2, .h3, .stat-key, .tbl td, .tbl th, .flow-node span, .settle-block div').forEach((el) => {
        const text = (el.textContent ?? '').trim()
        if (!text) return
        const cs = getComputedStyle(el)
        const fg = parse(cs.color)
        const bg = bgOf(el)
        const l1 = lum(fg), l2 = lum(bg)
        const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)
        if (ratio < 4.5) out.push(`${cs.color} on rgb(${bg.slice(0,3)}) ratio=${ratio.toFixed(2)} "${text.slice(0,40)}"`)
      })
      return out
    })
    for (const f of found) bad.push(`${view}: ${f}`)
  }
  expect(bad).toEqual([])
})

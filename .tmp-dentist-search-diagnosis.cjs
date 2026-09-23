const { chromium } = require('playwright-core')
;(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' })
  for (const width of [320, 440]) {
    await page.setViewportSize({ width, height: 800 })
    await page.evaluate(() => { document.querySelector('#qa-dv')?.remove(); const r=document.createElement('div'); r.id='qa-dv'; r.innerHTML='<div class="app-shell"><section class="dv108-page"><section class="dv108-toolbar"><label class="dv108-search"><svg width="16" height="16"></svg><input value="Search dentist"></label><select><option>All</option></select><select><option>All</option></select></section></section></div>'; document.body.append(r) })
    console.log(JSON.stringify(await page.evaluate((width) => { const w=document.querySelector('#qa-dv .dv108-search'), i=w.querySelector('input'), ws=getComputedStyle(w), is=getComputedStyle(i), wr=w.getBoundingClientRect(), ir=i.getBoundingClientRect(); return {width,wrapper:{x:wr.x,width:wr.width,border:ws.border,boxSizing:ws.boxSizing,shadow:ws.boxShadow,padding:ws.padding},input:{x:ir.x,width:ir.width,border:is.border,boxSizing:is.boxSizing,flex:is.flex,padding:is.padding,outline:is.outline}} }, width)))
  }
  await browser.close()
})()

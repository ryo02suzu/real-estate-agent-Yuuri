import asyncio, os, json, re, time
from urllib.parse import urlsplit
from playwright.async_api import async_playwright, expect
async def run():
 url=os.environ['URL']; out=[]
 async with async_playwright() as p:
  for engine in ('chromium','webkit'):
   b=await getattr(p,engine).launch(args=['--enable-unsafe-swiftshader'] if engine=='chromium' else [])
   a=await b.new_context(); pg=await a.new_page()
   try: await pg.goto(os.environ['AUTH'],wait_until='domcontentloaded',timeout=30000)
   except Exception: raise RuntimeError('Preview authentication failed') from None
   assert urlsplit(pg.url).hostname==urlsplit(url).hostname
   cookies=(await a.storage_state())['cookies'];await a.close()
   for w,h in [(375,667),(390,844),(402,874),(430,932),(844,390),(1024,768),(1440,900)]:
    ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=w<1024,has_touch=w<1024,storage_state={'cookies':cookies,'origins':[]})
    page=await ctx.new_page();rec={'browser':engine,'width':w,'height':h,'sha':'f71c3ff441b9db84f7f803d40d0dfd94c8bea736'};out.append(rec)
    try:
     res=await page.goto(url,wait_until='domcontentloaded',timeout=35000);assert res.status==200
     field=page.get_by_label('住所・地番',exact=True) if w<1024 else page.locator('input#address')
     await field.wait_for(timeout=12000);await page.locator('.launch-veil').wait_for(state='hidden',timeout=20000)
     await page.wait_for_timeout(450)
     rec['overflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
     if w<1024:
      el=page.get_by_role('button',name='現在地で調べる',exact=True);await el.wait_for(timeout=5000)
      rec['target']=await el.evaluate("""el=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {height:r.height,width:r.width,top:el.contains(document.elementFromPoint(x,y-21.9)),bottom:el.contains(document.elementFromPoint(x,y+21.9))}}""")
     
      assert rec['target']['height']>=43.99 and rec['target']['top'] and rec['target']['bottom'], 'Current-location target below 44px or covered'
     if w==390:
      await page.screenshot(path='/vercel/'+engine+'-home.png')
      await page.evaluate("""()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='michilu:motion')throw new DOMException('denied','QuotaExceededError');return set.call(this,k,v)}}""")
      await page.get_by_role('button',name=re.compile('^メニュー')).first.click(timeout=6000)
      sw=page.locator('#motion-switch');await expect(sw).to_be_checked(timeout=5000)
      await page.locator('label[for="motion-switch"]').click();await expect(sw).not_to_be_checked(timeout=3500);rec['storageDeniedOff']=True
      await page.keyboard.press('Escape')
      await page.evaluate("""()=>{window.seenFlight=false;new MutationObserver(()=>{if(document.querySelector('dialog.app-touch[open]'))window.seenFlight=true}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})}""")
      await field.fill('東京都新宿区西新宿2丁目8番1号');await page.get_by_role('button',name='調べる',exact=True).click()
      await page.get_by_text('調査の状況',exact=True).first.wait_for(timeout=20000);rec['result']=True;rec['flight']=await page.evaluate('window.seenFlight')
      await page.screenshot(path='/vercel/'+engine+'-result.png')
    except Exception as e: rec['error']=type(e).__name__+': '+str(e).split('Call log:')[0][:180]
    finally: await ctx.close()
    print(json.dumps(rec,ensure_ascii=False),flush=True);open('/vercel/final-checked.json','w').write(json.dumps(out,ensure_ascii=False))
   ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,storage_state={'cookies':cookies,'origins':[]})
   page=await ctx.new_page();rec={'browser':engine,'mode':'normal-search','sha':'f71c3ff441b9db84f7f803d40d0dfd94c8bea736'};out.append(rec)
   try:
    await page.goto(url,wait_until='domcontentloaded');field=page.get_by_label('住所・地番',exact=True);await field.wait_for(timeout=15000)
    await page.locator('.launch-veil').wait_for(state='hidden',timeout=20000)
    await field.fill('東京都新宿区西新宿2丁目8番1号');await page.get_by_role('button',name='調べる',exact=True).click()
    flight=page.locator('dialog.app-touch');await flight.wait_for(state='visible',timeout=12000)
    await page.wait_for_timeout(1400);await page.screenshot(path='/vercel/'+engine+'-flight.png')
    rec['canvases']=await flight.locator('.maplibregl-canvas').evaluate_all('es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
    assert rec['canvases'] and all(x['w']>200 and x['h']>150 for x in rec['canvases'])
    await flight.wait_for(state='hidden',timeout=25000);await page.get_by_text('調査の状況',exact=True).first.wait_for(timeout=20000);rec['result']=True
   except Exception as e:rec['error']=type(e).__name__+': '+str(e).split('Call log:')[0][:180]
   finally:await ctx.close()
   print(json.dumps(rec,ensure_ascii=False),flush=True);open('/vercel/final-checked.json','w').write(json.dumps(out,ensure_ascii=False))
   await b.close()
asyncio.run(run())
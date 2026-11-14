"""Landscape app checks for the candidate build; no Preview/iPhone claim."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright

os.environ.setdefault('REVIEW_URL','http://127.0.0.1:3000')
os.environ.setdefault('REVIEW_SHA','candidate')
exec(Path('/tmp/result-review.py').read_text().rsplit('asyncio.run(main())',1)[0])

async def extra():
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(args=['--enable-unsafe-swiftshader'] if engine=='chromium' else [])
            for width,height in [(568,320),(667,375),(932,430)]:
                await result_case(browser,engine,width,height)
            await result_case(browser,engine,844,390,text200=True)
            ctx=await browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,reduced_motion='reduce',locale='ja-JP')
            page=await ctx.new_page()
            rec={'name':engine+'-landscape-controls','checks':[]}
            REPORT['checks'].append(rec)
            try:
                field=await open_home(page,844)
                await field.fill(ADDRESS)
                await page.get_by_role('button',name='調べる',exact=True).click()
                await page.locator('.pv-page').wait_for(state='visible',timeout=45000)
                await page.get_by_role('tab',name='道路',exact=True).click()
                await page.wait_for_timeout(600)
                for control in await page.locator('[data-app-nav] button,.action-bar button,.action-bar a').all():
                    label=await control.inner_text()
                    geom=await selected_tab_geometry(control)
                    rec['checks'].append({'label':label,**geom})
                    assert geom['box']['height']>=44 and geom['box']['width']>=44, 'Small control: '+label
                    assert all(x['receives'] for x in geom['hit44']), 'Obscured control: '+label
                await capture(page,engine+'-landscape-controls')
                nav=page.locator('[data-app-nav]')
                for label in ['お気に入り','履歴','書類・出力','検索']:
                    control=nav.get_by_role('button',name=label,exact=True)
                    await control.click()
                    assert await control.get_attribute('aria-current')=='page'
                await page.locator('.pv-page').wait_for(state='visible')
                await page.set_viewport_size({'width':390,'height':844})
                await page.wait_for_timeout(500)
                normal=await layout(page)
                assert not normal['horizontalOverflow']
                assert await nav.evaluate('e=>e.getBoundingClientRect().width>300'), 'Nav did not return to portrait'
                await capture(page,engine+'-rotated-back-to-portrait')
                rec['status']='passed'
            except Exception as e:
                rec['status']='failed';rec['error']=str(e)
                await capture(page,engine+'-landscape-controls-failure')
            await ctx.close()
            await result_case(browser,engine,844,390,motion='no-preference')
            await browser.close()
    Path('/tmp/landscape-controls-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
    print(json.dumps([{'name':x['name'],'status':x['status'],'error':x.get('error'),'quality':x.get('quality_failures')} for x in REPORT['checks']],ensure_ascii=False))
    if any(x['status']=='failed' for x in REPORT['checks']):raise SystemExit(1)

asyncio.run(extra())

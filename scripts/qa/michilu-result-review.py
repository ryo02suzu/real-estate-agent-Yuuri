"""Latest-SHA UI regression evidence. Linux browser sizes; never physical iPhone QA."""
import asyncio
import json
import os
import platform
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

OUT = Path("ui-review")
OUT.mkdir(exist_ok=True)
URL = os.environ["REVIEW_URL"]
ADDRESS = "東京都新宿区西新宿2丁目8番1号"  # 東京都庁（公開施設）
TABS = ["概要", "道路", "法令・規制", "ハザード", "周辺環境", "相場・取引事例"]
REPORT = {
    "sha": os.environ["REVIEW_SHA"], "url": URL,
    "preview_url": os.environ.get("PREVIEW_URL", ""), "deployment_tested": False,
    "real_iphone": False, "os": platform.platform(), "checks": [],
    "limitations": ["PC checks cover homepage only, not pixel or full functional regression.",
                    "200% means computed-font simulation, not iOS Dynamic Type.",
                    "Data/API success, all F01-F12, physical keyboard and normal-motion quality remain separate gates."]
}


def save():
    (OUT / "report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")


async def capture(page, name):
    await page.screenshot(path=str(OUT / (name + ".png")), full_page=False)
    (OUT / (name + ".txt")).write_text(await page.locator("body").inner_text(), encoding="utf-8")


async def open_home(page, width, wait_until="domcontentloaded"):
    response = await page.goto(URL, wait_until=wait_until, timeout=45000)
    assert response and response.status == 200, "App document did not return 200"
    assert urlparse(page.url).netloc == urlparse(URL).netloc, "Navigation left the review origin"
    field = page.get_by_label("住所・地番", exact=True) if width < 1024 else page.locator("#address")
    await field.wait_for(state="visible", timeout=30000)
    return field


async def layout(page):
    return await page.evaluate("""() => {
      const box=e=>e?.getBoundingClientRect();
      const title=box(document.querySelector('.pv-title'));
      const overlaps=[];
      for(const selector of ['.pv-bigbtn','.pv-credit','.pv-rothint']){
        const e=document.querySelector(selector), r=box(e);
        if(title&&r&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'){
          const width=Math.min(title.right,r.right)-Math.max(title.left,r.left);
          const height=Math.min(title.bottom,r.bottom)-Math.max(title.top,r.top);
          if(width>1&&height>1)overlaps.push({selector,width,height});
        }
      }
      const pane=document.querySelector('.pv-pane'), r=box(pane);
      let run=0,longest=0;
      if(pane&&r){
        const x=Math.min(innerWidth-1,Math.max(0,r.left+r.width/2));
        for(let y=Math.ceil(Math.max(0,r.top));y<Math.min(innerHeight,r.bottom);y++){
          const hit=document.elementFromPoint(x,y);
          if(hit&&pane.contains(hit)){run++;longest=Math.max(longest,run)}else run=0;
        }
      }
      return {
        width:innerWidth,height:innerHeight,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
        titleOverlaps:overlaps,
        unobscuredPaneRunPx:longest,
        scrollerTop:document.querySelector('[data-scroller]')?.scrollTop,
        maps:[...document.querySelectorAll('.maplibregl-map')].map(e=>({
          box:box(e).toJSON(),
          canvases:[...e.querySelectorAll('canvas')].map(c=>({box:box(c).toJSON(),width:c.width,height:c.height}))
        }))
      };
    }""")


async def selected_tab_geometry(tab):
    return await tab.evaluate("""e=>{
      const r=e.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;
      return {box:r.toJSON(),selected:e.getAttribute('aria-selected'),
        hit44:[[-21,-21],[21,-21],[-21,21],[21,21],[0,0]].map(([dx,dy])=>{
          const x=cx+dx,y=cy+dy,hit=document.elementFromPoint(x,y);
          return {x,y,receives:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&!!hit&&e.contains(hit)};
        })};
    }""")


async def delayed_input(browser, engine):
    rec = {"name": engine + "-delayed-hydration", "engine": engine, "browser_version": browser.version}
    REPORT["checks"].append(rec)
    ctx = await browser.new_context(viewport={"width":390,"height":844}, locale="ja-JP",
                                    is_mobile=True, has_touch=True, reduced_motion="reduce")
    page = await ctx.new_page()
    release = asyncio.Event()

    async def hold_scripts(route):
        if route.request.resource_type == "script":
            await release.wait()
        await route.continue_()

    await page.route("**/*", hold_scripts)
    try:
        field = await open_home(page, 390, wait_until="commit")
        rec["disabled_before_hydration"] = await field.is_disabled()
        assert rec["disabled_before_hydration"], "SSR field accepts input before handlers are ready"
        release.set()
        await field.fill(ADDRESS, timeout=30000)
        await page.wait_for_timeout(1200)
        rec["value_persisted"] = await field.input_value() == ADDRESS
        rec["submit_visible"] = await page.get_by_role("button",name="調べる",exact=True).is_visible()
        assert rec["value_persisted"], "First typed value was erased during hydration"
        assert rec["submit_visible"], "Search action is missing after first input"
        rec["status"] = "passed"
        await capture(page, rec["name"])
    except Exception as error:
        rec["status"] = "failed"
        rec["error"] = str(error)[:2000]
        try:
            await capture(page, rec["name"] + "-failure")
        except Exception:
            pass
    finally:
        release.set()
        await ctx.close()
        save()
        print(json.dumps(rec, ensure_ascii=False), flush=True)


async def result_case(browser, engine, width, height, text200=False):
    name = f"{engine}-{width}x{height}" + ("-text200" if text200 else "")
    rec = {"name": name, "engine": engine, "browser_version": browser.version,
           "page_errors": [], "quality_failures": [], "tabs": []}
    REPORT["checks"].append(rec)
    ctx = await browser.new_context(viewport={"width":width,"height":height}, locale="ja-JP",
                                    device_scale_factor=1,is_mobile=width<1024,has_touch=width<1024,
                                    reduced_motion="reduce")
    page = await ctx.new_page()
    page.on("pageerror", lambda e: rec["page_errors"].append(str(e)[:1200]))
    try:
        field = await open_home(page, width)
        await page.evaluate("document.fonts.ready")
        await capture(page, name + "-home")
        rec["home"] = await layout(page)
        assert not rec["home"]["horizontalOverflow"], "Home overflows horizontally"
        if width >= 1024:
            rec["scope"] = "PC homepage smoke only"
            rec["status"] = "passed"
            return
        await field.fill(ADDRESS)
        await page.get_by_role("button", name="調べる", exact=True).click()
        await page.locator(".pv-page").wait_for(state="visible", timeout=45000)
        await page.get_by_role("tablist",name="物件の情報").wait_for(state="visible")
        await page.wait_for_timeout(1800)
        if text200:
            # Mutate only typography for this explicit simulation; no geometry overrides.
            await page.evaluate("""() => {
              const elements=[...document.querySelectorAll('body *')];
              const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));
              elements.forEach((e,i)=>e.style.setProperty('font-size',(sizes[i]*2)+'px','important'));
            }""")
            await page.wait_for_timeout(400)
        await capture(page, name + "-result")
        rec["result"] = await layout(page)
        assert not rec["result"]["horizontalOverflow"], "Result overflows horizontally"
        if text200 and rec["result"]["titleOverlaps"]:
            rec["quality_failures"].append("200% title overlaps map controls, credits or rotation hint")
        for label in TABS:
            tab = page.get_by_role("tab", name=label, exact=True)
            await tab.click()
            await page.wait_for_timeout(450)
            geo = await selected_tab_geometry(tab)
            rec["tabs"].append({"label":label, **geo})
            assert geo["selected"] == "true", f"{label}: wrong selection"
            assert geo["box"]["height"] >= 44 and geo["box"]["width"] >= 44, f"{label}: target below 44px"
            assert all(p["receives"] for p in geo["hit44"]), f"{label}: 44px target obscured or outside viewport"
            if label == "道路":
                rec["road_layout"] = await layout(page)
                await capture(page, name + "-road")
                # Review heuristic: at least four 24px lines can be read without fixed chrome covering them.
                if width > height and rec["road_layout"]["unobscuredPaneRunPx"] < 96:
                    rec["quality_failures"].append("Landscape research body has less than 96px unobscured height")
        await capture(page, name + "-last-tab")
        rec["end_layout"] = await layout(page)
        assert not rec["end_layout"]["horizontalOverflow"], "Tab content overflows horizontally"
        backs = page.get_by_role("button", name="ホームに戻る", exact=True)
        usable = False
        for button in await backs.all():
            if await button.evaluate("""e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&!!h&&e.contains(h)}"""):
                await button.click()
                usable = True
                break
        assert usable, "No unobscured back control"
        await page.get_by_label("住所・地番", exact=True).wait_for(state="visible", timeout=15000)
        rec["returned_home"] = True
        assert not rec["page_errors"], "Uncaught browser exception"
        rec["interaction_status"] = "passed"
        rec["status"] = "failed" if rec["quality_failures"] else "passed"
    except Exception as error:
        rec["status"] = "failed"
        rec["error"] = str(error)[:2000]
        try:
            await capture(page, name + "-failure")
        except Exception:
            pass
    finally:
        await ctx.close()
        save()
        print(json.dumps({k:v for k,v in rec.items() if k not in ["home","result","tabs","end_layout"]},
                         ensure_ascii=False), flush=True)


async def main():
    async with async_playwright() as pw:
        for engine in ["chromium", "webkit"]:
            browser = await getattr(pw, engine).launch(
                args=["--enable-unsafe-swiftshader"] if engine == "chromium" else [])
            try:
                await delayed_input(browser, engine)
                for width,height in [(375,667),(390,844),(402,874),(430,932),(844,390),(1024,768),(1440,900)]:
                    await result_case(browser, engine, width, height)
                await result_case(browser, engine, 375, 667, text200=True)
            finally:
                await browser.close()
    failures = [r["name"] for r in REPORT["checks"] if r["status"] == "failed"]
    REPORT["failed_cases"] = failures
    REPORT["passed"] = len(REPORT["checks"]) - len(failures)
    save()
    print(json.dumps({"sha":REPORT["sha"],"passed":REPORT["passed"],"failed":failures},ensure_ascii=False))
    if failures:
        raise SystemExit("UI regression/quality gates failed; inspect report.json and screenshots")


asyncio.run(main())

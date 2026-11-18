import asyncio, json, os, re, platform
from collections import Counter
from io import BytesIO
from urllib.parse import urlparse
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
out = Path("ui-review")
out.mkdir(exist_ok=True)
report = {"url": os.environ["REVIEW_URL"], "sha": os.environ["REVIEW_SHA"], "phase": os.environ["REVIEW_PHASE"], "deployment_tested": False, "preview_url": os.environ["PREVIEW_URL"], "os": platform.platform(), "real_iphone": False, "checks": []}

def public_url(raw):
    # Requests use only the public Tokyo Metropolitan Government test address.
    # Keep host/path for diagnosis, but never persist query strings or fragments.
    url = urlparse(raw)
    return url._replace(query="", fragment="").geturl()

def response_event(response, record):
    info = {"url": public_url(response.url), "status": response.status,
            "resource_type": response.request.resource_type, "stage": record["stage"]}
    if response.status >= 400:
        record["http_errors"].append(info)
    if ".pmtiles" in response.url:
        record["range_responses"].append({**info, "range": response.headers.get("content-range")})
    url = urlparse(response.url)
    if url.hostname == "cyberjapandata.gsi.go.jp" and re.match(r"/xyz/(pale|std)/", url.path):
        record["basemap_responses"].append(info)

def map_image_stats(png, background_rgb=(230, 242, 242)):
    # A positive WebGL canvas can still contain only the fallback background.
    # Inspect an actual screenshot of the unobscured map, excluding all app panels.
    image = Image.open(BytesIO(png)).convert("RGB")
    pixels = list(image.get_flattened_data())
    colors = Counter(tuple(v // 16 for v in pixel) for pixel in pixels)
    total = image.width * image.height
    # JapanMap's #e6f2f2 fallback is distinct from the GSI raster sea. Requiring
    # coverage also rejects partially loaded maps, which a color-count check misses.
    background = sum(max(abs(v - c) for v, c in zip(pixel, background_rgb)) <= 4 for pixel in pixels)
    return {"significant_colors": sum(count / total > 0.0005 for count in colors.values()),
            "dominant_ratio": max(colors.values()) / total,
            "unrendered_background_ratio": background / total}

async def wait_for_map_pixels(page, name, record):
    started = asyncio.get_running_loop().time()
    ready_frames = 0
    desktop = page.viewport_size["width"] >= 1024
    # Actual background layers: JapanMap #e6f2f2; gsiStyle #eef1ee.
    background_rgb = (238, 241, 238) if desktop else (230, 242, 242)
    if desktop:
        canvas = page.locator("canvas.maplibregl-canvas").first
        await canvas.wait_for(state="visible", timeout=20000)
        record["canvas_geometry"] = await canvas.bounding_box()
        assert record["canvas_geometry"]["width"] > 200 and record["canvas_geometry"]["height"] > 150, "Desktop MapLibre canvas is empty or collapsed"
    while True:
        viewport = page.viewport_size
        if desktop:
            # The inspected 1024/1440 layouts have a left information panel,
            # top-right tools (ending at y=296), and bottom map controls.
            # Include the rightmost tiles, where old captures were incomplete.
            left = viewport["width"] * 0.62
            top = max(320, viewport["height"] * 0.4)
            bottom = viewport["height"] - 170
        else:
            panel = await page.locator(".mui-panel").bounding_box()
            side = await page.locator('[data-side="1"]').count() > 0
            left = panel["x"] + panel["width"] + 16 if side else 16
            top = 24 if side else 86
            bottom = viewport["height"] - 36 if side else panel["y"] - 16
        clip = {"x":left,"y":top,"width":viewport["width"] - left - 16,"height":bottom - top}
        assert clip["width"] >= 40 and clip["height"] >= 40, "No unobscured home map region"
        png = await page.screenshot(clip=clip)
        stats = map_image_stats(png, background_rgb)
        stats["background_rgb"] = background_rgb
        stats["successful_basemap_responses"] = sum(r["status"] == 200 for r in record["basemap_responses"])
        stats["wait_ms"] = round((asyncio.get_running_loop().time() - started) * 1000)
        stats["clip"] = clip
        record["map_render"] = stats
        painted = (stats["successful_basemap_responses"] > 0
                   and stats["significant_colors"] >= 8 and stats["dominant_ratio"] < 0.985
                   and stats["unrendered_background_ratio"] < 0.02)
        ready_frames = ready_frames + 1 if painted else 0
        stats["consecutive_ready_frames"] = ready_frames
        ready = ready_frames >= 2
        if ready or stats["wait_ms"] >= 20000:
            (out / (name + "-map-region.png")).write_bytes(png)
            assert ready, "Map is still blank/partially rendered after tile and screenshot readiness checks"
            return
        await page.wait_for_timeout(500)

DETAILS = [("urban", "^都市計画"), ("hazard", "^災害リスク"),
           ("parcel", "^地番"), ("utility", "^上下水道"),
           ("land-price", "^近くの地価"), ("station", "^最寄り駅"), ("school", "^学区")]

async def detail_roundtrip(page, name, record, key, label):
    entry = {"name": key, "status": "started"}
    record["details"].append(entry)
    record["stage"] = key
    row = page.get_by_role("button", name=re.compile(label)).first
    detail = page.get_by_test_id("panel-detail")
    back = page.get_by_role("button", name="一覧に戻る", exact=True)
    try:
        assert await row.count() and await row.is_visible() and await row.is_enabled(), "Detail entry is unavailable: " + label
        await row.scroll_into_view_if_needed()
        before = await page.locator(".mui-list-in").evaluate("e => e.scrollTop")
        entry["scroll_before"] = before
        await row.click()
        await back.wait_for(state="visible", timeout=5000)
        await detail.wait_for(state="visible", timeout=5000)
        await page.wait_for_timeout(400)
        box = await detail.bounding_box()
        entry["box"] = box
        entry["text"] = (await detail.inner_text())[:16000]
        await snapshot(page, name + "-detail-" + key, entry)
        assert box and box["height"] >= 80, "Detail body has less than 80px of readable height"
        assert entry["text"].strip(), "Detail body is empty"
        assert not entry["layout"]["horizontalOverflow"], "Horizontal overflow in detail"
        if key == "urban":
            await detail.get_by_role("tab", name="その他の法令", exact=True).click()
            await page.wait_for_timeout(400)
            await snapshot(page, name + "-detail-other-laws", {})
            entry["other_laws_text"] = (await detail.inner_text())[:16000]
        await back.click()
        await detail.wait_for(state="hidden", timeout=5000)
        await page.wait_for_timeout(400)
        entry["scroll_after"] = await page.locator(".mui-list-in").evaluate("e => e.scrollTop")
        assert abs(entry["scroll_after"] - before) <= 2, "Returning lost the result-list scroll position"
        assert page.url == record["result_url"], "Detail navigation changed the selected property URL"
        entry["status"] = "passed"
    except Exception as error:
        entry["status"] = "failed"
        entry["error"] = str(error)[:1200]
        await snapshot(page, name + "-detail-" + key + "-failed", {})
    finally:
        if await back.count() and await back.is_visible():
            await back.click()
            await detail.wait_for(state="hidden", timeout=5000)
            await page.wait_for_timeout(400)

async def snapshot(page, name, record):
    await page.screenshot(path=str(out / (name + ".png")), full_page=True)
    (out / (name + ".txt")).write_text(await page.locator("body").inner_text(), encoding="utf-8")
    record["layout"] = await page.evaluate("""() => ({
      width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
      maps:[...document.querySelectorAll('.maplibregl-map')].map(e=>({class:e.className,box:e.getBoundingClientRect().toJSON(),position:getComputedStyle(e).position,height:getComputedStyle(e).height,canvases:[...e.querySelectorAll('canvas')].map(c=>({box:c.getBoundingClientRect().toJSON(),width:c.width,height:c.height}))})),
      inputs:[...document.querySelectorAll('input')].filter(e=>e.getBoundingClientRect().width).map(e=>({name:e.getAttribute('aria-label')||e.id,fontSize:getComputedStyle(e).fontSize,box:e.getBoundingClientRect().toJSON()})),
      controls:[...document.querySelectorAll('button,a')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.getAttribute('aria-label')||e.innerText,box:e.getBoundingClientRect().toJSON()}))
    })""")

async def home_target_checks(page):
    checks = []
    for label in ["地図で選ぶ", "貼り付け", "使い方", "対応エリア"]:
        target = page.get_by_role("button", name=label, exact=True)
        await target.scroll_into_view_if_needed()
        check = await target.evaluate("""(el) => {
          const r = el.getBoundingClientRect();
          const w = Math.max(44, r.width), h = Math.max(44, r.height);
          const area = {x:r.x + (r.width-w)/2, y:r.y + (r.height-h)/2, width:w, height:h};
          const points = [];
          for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) {
            const x = area.x + 1 + (area.width-2)*fx;
            const y = area.y + 1 + (area.height-2)*fy;
            const hit = document.elementFromPoint(x, y);
            points.push({x,y,hit:!!hit && (hit === el || el.contains(hit)),
              blocker:hit && hit !== el && !el.contains(hit) ? {tag:hit.tagName, class:hit.className} : null});
          }
          return {label:el.textContent.trim(),box:r.toJSON(),area,points,
            passed:points.every(p => p.hit)};
        }""")
        checks.append(check)
    await page.locator(".mui-list-in").evaluate("e => e.scrollTop = 0")
    return checks

async def run():
    async with async_playwright() as pw:
        for engine in ["chromium", "webkit"]:
            browser = await getattr(pw, engine).launch(args=["--enable-unsafe-swiftshader"] if engine == "chromium" else [])
            sizes = [(375,667),(390,844),(402,874),(430,932),(568,320),(844,390)]
            if engine == "chromium": sizes += [(1024,768),(1440,900)]
            for width,height in sizes:
                name = f"{engine}-{width}x{height}"
                record = {"name":name,"browser_version":browser.version,"page_errors":[],"failed_requests":[],"http_errors":[],"basemap_responses":[],"stage":"home"}
                report["checks"].append(record)
                record["console_messages"]=[]
                record["range_responses"]=[]
                ctx = await browser.new_context(viewport={"width":width,"height":height},device_scale_factor=1,locale="ja-JP",is_mobile=width<1024,has_touch=width<1024)
                page = await ctx.new_page()
                page.on("console",lambda msg,r=record:r["console_messages"].append({"type":msg.type,"text":msg.text[:600],"url":public_url(msg.location.get("url","")),"stage":r["stage"]}) if msg.type in ["warning","error"] else None)
                page.on("response",lambda res,r=record:response_event(res,r))
                page.on("pageerror", lambda error,r=record:r["page_errors"].append(str(error)))
                page.on("requestfailed", lambda req,r=record:r["failed_requests"].append({"url":public_url(req.url),"failure":req.failure,"stage":r["stage"]}))
                try:
                    response=await page.goto(report["url"],wait_until="domcontentloaded",timeout=40000)
                    record["http_status"]=response.status if response else None
                    if urlparse(page.url).netloc != urlparse(report["url"]).netloc:
                        raise AssertionError("App navigation left the review origin (authentication/redirect)")
                    await page.locator("input#address").wait_for(state="visible",timeout=20000)
                    assert "MICHILU" in await page.title(), "Expected the MICHILU app title"
                    await page.evaluate("document.fonts.ready")
                    await page.wait_for_timeout(1800)
                    await wait_for_map_pixels(page,name,record)
                    await snapshot(page,name+"-home",record)
                    if width < 1024:
                        record["home_targets"] = await home_target_checks(page)
                    # Failure gate: blank MapLibre canvases passed the old screenshot-only QA.
                    # This checks the app's real layout; never apply an artificial CSS override.
                    if width < 1024 and urlparse(page.url).netloc == urlparse(report["url"]).netloc:
                        await page.locator(".mui-japan-map").wait_for(state="visible", timeout=20000)
                        record["map_geometry"] = await page.locator(".mui-japan-map").first.evaluate(
                            "(e)=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,position:getComputedStyle(e).position})"
                        )
                        canvas = page.locator(".mui-japan-map canvas.maplibregl-canvas").first
                        await canvas.wait_for(state="visible", timeout=20000)
                        record["canvas_geometry"] = await canvas.evaluate(
                            "(e)=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})"
                        )
                        assert record["map_geometry"]["width"] > 200 and record["map_geometry"]["height"] > 150, "Mobile map layout is empty or collapsed"
                        assert record["canvas_geometry"]["width"] > 200 and record["canvas_geometry"]["height"] > 150, "Mobile MapLibre canvas is empty or collapsed"
                    assert not record["layout"]["horizontalOverflow"], "Horizontal overflow on home"
                    assert not record["page_errors"], "Uncaught exception on home"
                    record["status"]="app_home_captured"
                    if width < 1024:
                        record["stage"] = "search"
                        await page.get_by_role("textbox",name=re.compile("住所")).first.fill("東京都新宿区西新宿2丁目8番1号")
                        await snapshot(page,name+"-input",{})
                        await page.get_by_role("button",name="検索",exact=True).first.click()
                        await page.wait_for_function("location.search.includes('q=')",timeout=35000)
                        await page.get_by_role("region", name="調査結果", exact=True).wait_for(state="visible", timeout=35000)
                        await page.wait_for_timeout(6000)
                        await snapshot(page,name+"-result",record)
                        record["result_url"]=page.url
                        record["result_text"]=(await page.locator("body").inner_text())[:12000]
                        assert not record["layout"]["horizontalOverflow"], "Horizontal overflow in result"
                        record["details"] = []
                        for key,label in DETAILS:
                            await detail_roundtrip(page,name,record,key,label)
                        await page.locator(".mui-list-in").evaluate("e => e.scrollTop = 0")
                        await snapshot(page,name+"-returned",{})
                        assert not record["page_errors"], "Uncaught exception during search/details"
                        record["status"]="search_seven_details_return_passed"
                        # Explicit browser simulations; not physical iPhone keyboard or OS text size.
                        if width==390:
                            record["stage"] = "keyboard-viewport-simulation"
                            await page.locator("#address").focus()
                            await page.set_viewport_size({"width":390,"height":430})
                            await page.wait_for_timeout(400)
                            record["keyboard_simulation"] = {}
                            await snapshot(page,name+"-keyboard-viewport-simulation",record["keyboard_simulation"])
                            input_box = await page.locator("#address").bounding_box()
                            assert input_box and input_box["y"] >= 0 and input_box["y"] + input_box["height"] <= 430, "Focused input left the simulated keyboard viewport"
                            await page.set_viewport_size({"width":390,"height":844})
                            await page.locator("#address").blur()
                            record["stage"] = "existing-dom-font-200pct-simulation"
                            await page.evaluate("""() => [...document.querySelectorAll('body *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]).forEach(([e,size])=>{
                              if(size) e.style.fontSize=(size*2)+'px';
                            })""")
                            await page.locator(".mui-list-in").evaluate("e => e.scrollTop = 0")
                            record["font_simulation"] = {"scope":"current DOM only, not OS text zoom or later-mounted details"}
                            await snapshot(page,name+"-text-200pct-simulation",record["font_simulation"])
                            assert not record["font_simulation"]["layout"]["horizontalOverflow"], "Horizontal overflow in font simulation"
                        assert all(d["status"] == "passed" for d in record["details"]), "One or more detail round trips failed"
                        assert all(t["passed"] for t in record["home_targets"]), "Home actions do not own their full 44px tap area"
                except Exception as e:
                    record["status"]="blocked"
                    record["error"]=str(e)[:1200]
                    try: await snapshot(page,name+"-blocked",{})
                    except Exception: pass
                await ctx.close()
                (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
            await browser.close()
    print(json.dumps({"phase":report["phase"],"sha":report["sha"],"checks":[{"name":r["name"],"status":r["status"],"error":r.get("error"),"http_errors":r["http_errors"],"home_targets":[{"label":t["label"],"passed":t["passed"],"misses":sum(not p["hit"] for p in t["points"])} for t in r.get("home_targets",[])],"details":[{k:v for k,v in d.items() if k in ["name","status","error","scroll_before","scroll_after"]} for d in r.get("details",[])]} for r in report["checks"]]},ensure_ascii=False))
asyncio.run(run())
if any(r.get('status') == 'blocked' for r in report['checks']):
    raise SystemExit('Browser review contains blocked cases; see report.json')

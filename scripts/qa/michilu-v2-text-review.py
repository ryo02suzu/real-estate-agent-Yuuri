"""Real-data browser checks with 200% HTML text at each mounted UI state.

This is an explicit CSS-font simulation, not native browser zoom, iOS Dynamic
Type, a physical keyboard, or a Vercel deployment check. No app layout is fixed
by this script: it only enlarges fonts and observes the resulting layout.
"""
import asyncio
import json
import os
import platform
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

OUT = Path("ui-review")
OUT.mkdir(exist_ok=True)
REPORT = {
    "sha": os.environ["REVIEW_SHA"], "url": os.environ["REVIEW_URL"],
    "phase": os.environ["REVIEW_PHASE"], "os": platform.platform(),
    "deployment_tested": False, "real_iphone": False,
    "text_mode": "200% computed HTML font sizes, refreshed after each mount; not native zoom; SVG/pseudo-elements excluded",
    "checks": [],
}
DETAILS = [("urban", "^都市計画"), ("hazard", "^災害リスク"),
           ("parcel", "^地番"), ("utility", "^上下水道"),
           ("land-price", "^近くの地価"), ("station", "^最寄り駅"), ("school", "^学区")]


def clean_url(url):
    return urlparse(url)._replace(query="", fragment="").geturl()


async def enlarge_text(page):
    # Restore ALL earlier overrides before measuring newly mounted children.
    # Otherwise descendants inheriting an enlarged font would become 400%.
    result = await page.evaluate("""async () => {
      // Preserve the position the app has ALREADY chosen. The temporary 100%
      // measurement can clamp scrollTop when enlarged content becomes shorter.
      // App return behavior is asserted separately before this helper runs.
      const scrolls = [...document.querySelectorAll('.mui-panel,.mui-list-in,[data-testid="panel-detail"]')]
        .filter(el => el.getBoundingClientRect().height > 0)
        .map(el => ({el, top:el.scrollTop, left:el.scrollLeft}));
      const saved = window.__qaOriginalFonts ||= new Map();
      for (const [el, old] of saved) {
        if (old.value) el.style.setProperty('font-size', old.value, old.priority);
        else el.style.removeProperty('font-size');
        if (!el.isConnected) saved.delete(el);
      }
      const nodes = [...document.querySelectorAll('body *')]
        .filter(el => el instanceof HTMLElement && !['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName));
      const sizes = nodes.map(el => {
        if (!saved.has(el)) saved.set(el, {
          value: el.style.getPropertyValue('font-size'),
          priority: el.style.getPropertyPriority('font-size')
        });
        return [el, parseFloat(getComputedStyle(el).fontSize)];
      }).filter(([, size]) => size > 0);
      for (const [el, size] of sizes) el.style.setProperty('font-size', `${size * 2}px`, 'important');
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const scrollAdjustments = scrolls.map(({el,top,left}) => {
        const afterReset = el.scrollTop;
        el.scrollTop = top;
        el.scrollLeft = left;
        return {class:el.className,before:top,after_font_reset:afterReset,restored:el.scrollTop};
      });
      const measured = sizes.map(([el,size]) => {
        const r = el.getBoundingClientRect();
        return {tag:el.tagName,class:el.className,baseline:size,
          actual:parseFloat(getComputedStyle(el).fontSize),
          visible:r.width > 0 && r.height > 0};
      });
      // WebKit can retain cached computed sizes for display:none descendants.
      // They are measured again after being shown; only rendered text is a gate.
      const ratios = measured.filter(m => m.visible).map(m => m.actual / m.baseline);
      return {elements: sizes.length, visible_elements:ratios.length,
        min_ratio: Math.min(...ratios), max_ratio: Math.max(...ratios),
        scroll_adjustments:scrollAdjustments,
        outliers: measured.filter(m => Math.abs(m.actual / m.baseline - 2) >= .01)};
    }""")
    assert result["elements"] > 20, "Too few HTML elements for the font simulation"
    assert abs(result["min_ratio"] - 2) < .01 and abs(result["max_ratio"] - 2) < .01, result
    await page.wait_for_timeout(450)
    return result


async def capture(page, name):
    await page.screenshot(path=str(OUT / (name + ".png")), full_page=True)
    (OUT / (name + ".txt")).write_text(await page.locator("body").inner_text(), encoding="utf-8")
    return await page.evaluate("""() => {
      const header = document.querySelector('header');
      const panel = document.querySelector('.mui-panel');
      const band = header?.parentElement;
      const wordmark = header?.querySelector('[aria-label="MICHILU"]');
      const controls = header ? [...header.querySelectorAll('button')].map(el => {
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {label:el.getAttribute('aria-label'),box:r.toJSON(),
          reachable:x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
            && !!hit && (hit === el || el.contains(hit))};
      }) : [];
      return {
      viewport: {width: innerWidth, height: innerHeight},
      header: {
        side:!!document.querySelector('[data-side="1"]'),
        band:band?.getBoundingClientRect().toJSON(),
        wordmark:wordmark?.getBoundingClientRect().toJSON(),
        gap:band && panel ? panel.getBoundingClientRect().top - band.getBoundingClientRect().bottom : null,
        controls
      },
      page_overflow: document.documentElement.scrollWidth > innerWidth + 1,
      panels: [...document.querySelectorAll('.mui-panel,.mui-list-in,[data-testid="panel-detail"]')]
        .filter(e => e.getBoundingClientRect().height > 0).map(e => ({
          class: e.className, box: e.getBoundingClientRect().toJSON(),
          clientWidth: e.clientWidth, scrollWidth: e.scrollWidth,
          clientHeight: e.clientHeight, scrollHeight: e.scrollHeight, scrollTop: e.scrollTop,
          horizontal_overflow: e.scrollWidth > e.clientWidth + 2
        })),
      overflow_elements: [...document.querySelectorAll('.mui-panel *')]
        .filter(e => {
          const container = e.closest('.mui-list-in,[data-testid="panel-detail"],.mui-panel');
          if (!container) return false;
          const r = e.getBoundingClientRect(), c = container.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.right > c.right + 2 || r.left < c.left - 2);
        }).slice(0,40).map(e => ({tag:e.tagName,class:e.className,
          text:e.textContent.slice(0,120),box:e.getBoundingClientRect().toJSON()})),
      clipped_text: [...document.querySelectorAll('button,a,h1,h2,h3,p,span')]
        .filter(e => e.getBoundingClientRect().height > 0 && e.scrollWidth > e.clientWidth + 2
          && ['hidden','clip'].includes(getComputedStyle(e).overflowX))
        .map(e => ({tag: e.tagName, text: e.textContent.slice(0,160),
          font: getComputedStyle(e).fontSize, box: e.getBoundingClientRect().toJSON()}))
    }}""")


def assert_layout(layout):
    assert not layout["page_overflow"], "Document overflows horizontally at 200% text"
    assert all(not p["horizontal_overflow"] for p in layout["panels"]), "Panel content overflows horizontally at 200% text"
    header = layout["header"]
    if header["side"]:
        assert header["gap"] is not None and header["gap"] >= 5, "Landscape panel overlaps enlarged header"
        assert len(header["controls"]) == 2 and all(c["reachable"] for c in header["controls"]), "Enlarged header controls are covered"
        assert header["wordmark"] and header["band"], "Missing enlarged wordmark"
        assert header["wordmark"]["right"] <= header["band"]["right"] and header["wordmark"]["left"] >= header["band"]["left"], "Enlarged wordmark overflows header"


async def home_controls(page, name):
    checks = []
    for label in ["地図で選ぶ", "貼り付け", "使い方", "対応エリア"]:
        button = page.get_by_role("button", name=label, exact=True)
        await button.scroll_into_view_if_needed(timeout=5000)
        checks.append(await button.evaluate("""el => {
          const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {label:el.textContent.trim(), box:r.toJSON(),
            reachable:x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
              && !!hit && (hit === el || el.contains(hit))};
        }"""))
    await page.locator(".mui-panel").evaluate("e => e.scrollTop = e.scrollHeight")
    await capture(page, name + "-home-bottom")
    await page.locator("#address").scroll_into_view_if_needed()
    return checks


async def detail_check(page, name, record, key, label):
    entry = {"name": key, "status": "started"}
    record["details"].append(entry)
    record["stage"] = key
    body = page.get_by_test_id("panel-detail")
    back = page.get_by_role("button", name="一覧に戻る", exact=True)
    try:
        row = page.get_by_role("button", name=re.compile(label)).first
        await row.scroll_into_view_if_needed()
        entry["scroll_before"] = await page.locator(".mui-list-in").evaluate("e => e.scrollTop")
        # click() may scroll an oversized row again after the explicit scroll.
        # Capture the real user-event position before React opens the detail;
        # that is the position the app must restore, not a pre-click estimate.
        await row.evaluate("""el => {
          window.__qaListClick = null;
          el.addEventListener('click', () => {
            const list = el.closest('.mui-list-in');
            window.__qaListClick = list ? {
              scrollTop:list.scrollTop,
              row:el.getBoundingClientRect().toJSON(),
              list:list.getBoundingClientRect().toJSON()
            } : null;
          }, {once:true,capture:true});
        }""")
        await row.click(timeout=5000)
        entry["at_click"] = await page.evaluate("window.__qaListClick")
        assert entry["at_click"] is not None, "Missing actual result-row click position"
        entry["automation_scroll_delta"] = entry["at_click"]["scrollTop"] - entry["scroll_before"]
        await body.wait_for(state="visible", timeout=5000)
        await page.wait_for_timeout(1000)
        entry["fonts"] = await enlarge_text(page)
        await body.evaluate("e => e.scrollTop = 0")
        entry["top"] = await capture(page, name + "-" + key + "-top")
        box = await body.bounding_box()
        entry["body_box"] = box
        assert box and box["height"] >= 80, "Detail body has less than 80px of readable height"
        assert (await body.inner_text()).strip(), "Detail content is empty"
        assert_layout(entry["top"])
        if key == "urban":
            await body.get_by_role("tab", name="その他の法令", exact=True).click(timeout=5000)
            await page.wait_for_timeout(1000)
            entry["other_laws_fonts"] = await enlarge_text(page)
            entry["other_laws"] = await capture(page, name + "-other-laws")
            assert_layout(entry["other_laws"])
        await body.evaluate("e => e.scrollTop = e.scrollHeight")
        await page.wait_for_timeout(100)
        entry["bottom"] = await capture(page, name + "-" + key + "-bottom")
        gap = await body.evaluate("e => e.scrollHeight - e.clientHeight - e.scrollTop")
        assert abs(gap) <= 2, "Cannot reach the end of the detail content"
        await back.click(timeout=5000)
        await body.wait_for(state="hidden", timeout=5000)
        entry["scroll_after_app"] = await page.locator(".mui-list-in").evaluate("e => e.scrollTop")
        assert abs(entry["scroll_after_app"] - entry["at_click"]["scrollTop"]) <= 2, "App return lost actual click-time result-list scroll position before font measurement"
        entry["return_fonts"] = await enlarge_text(page)
        entry["scroll_after"] = await page.locator(".mui-list-in").evaluate("e => e.scrollTop")
        assert abs(entry["scroll_after"] - entry["at_click"]["scrollTop"]) <= 2, "Returning lost actual click-time result-list scroll position"
        assert page.url == record["result_url"], "Detail navigation changed selected property"
        entry["status"] = "passed"
    except Exception as error:
        entry["status"] = "failed"
        entry["error"] = str(error)[:1200]
        await capture(page, name + "-" + key + "-failed")
    finally:
        if await back.count() and await back.is_visible():
            await back.click(timeout=5000)
            await body.wait_for(state="hidden", timeout=5000)
            await enlarge_text(page)


async def run():
    async with async_playwright() as pw:
        for engine in ["chromium", "webkit"]:
            browser = await getattr(pw, engine).launch(args=["--enable-unsafe-swiftshader"] if engine == "chromium" else [])
            for width, height in [(375, 667), (568, 320)]:
                name = f"{engine}-{width}x{height}-text200"
                record = {"name": name, "browser_version": browser.version, "stage": "home", "page_errors": [], "http_errors": [], "details": []}
                REPORT["checks"].append(record)
                ctx = await browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, locale="ja-JP", is_mobile=True, has_touch=True)
                page = await ctx.new_page()
                page.on("pageerror", lambda error, r=record: r["page_errors"].append(str(error)))
                page.on("response", lambda res, r=record: r["http_errors"].append({"url": clean_url(res.url), "status": res.status, "stage": r["stage"]}) if res.status >= 400 else None)
                try:
                    await page.goto(REPORT["url"], wait_until="domcontentloaded", timeout=40000)
                    assert urlparse(page.url).netloc == urlparse(REPORT["url"]).netloc, "Navigation left test origin"
                    await page.locator("#address").wait_for(state="visible", timeout=20000)
                    await page.evaluate("document.fonts.ready")
                    record["home_fonts"] = await enlarge_text(page)
                    record["home"] = await capture(page, name + "-home")
                    record["layout_failures"] = []
                    try:
                        assert_layout(record["home"])
                    except AssertionError as error:
                        record["layout_failures"].append("home: " + str(error))
                    record["home_controls"] = await home_controls(page, name)
                    if not all(c["reachable"] for c in record["home_controls"]):
                        record["layout_failures"].append("Some enlarged home controls cannot be reached by scrolling")
                    await page.locator("#address").fill("東京都新宿区西新宿2丁目8番1号")
                    await page.get_by_role("button", name="検索", exact=True).first.click(timeout=5000)
                    record["stage"] = "result"
                    await page.get_by_role("region", name="調査結果", exact=True).wait_for(state="visible", timeout=35000)
                    await page.wait_for_timeout(6000)
                    record["result_url"] = page.url
                    record["result_fonts"] = await enlarge_text(page)
                    record["result"] = await capture(page, name + "-result")
                    try:
                        assert_layout(record["result"])
                    except AssertionError as error:
                        record["layout_failures"].append("result: " + str(error))
                    for key, label in DETAILS:
                        await detail_check(page, name, record, key, label)
                    assert all(d["status"] == "passed" for d in record["details"]), "Some enlarged detail round trips failed"
                    assert not record["layout_failures"], record["layout_failures"]
                    assert not record["page_errors"], "Uncaught JavaScript errors"
                    record["status"] = "passed"
                except Exception as error:
                    record["status"] = "failed"
                    record["error"] = str(error)[:1200]
                    await capture(page, name + "-failed")
                await ctx.close()
                (OUT / "text-report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")
            await browser.close()
    print(json.dumps({"sha": REPORT["sha"], "checks": [{"name": c["name"], "status": c["status"], "error": c.get("error"), "details": [{"name": d["name"], "status": d["status"], "error": d.get("error")} for d in c["details"]]} for c in REPORT["checks"]]}, ensure_ascii=False))


asyncio.run(run())
if any(c["status"] != "passed" for c in REPORT["checks"]):
    raise SystemExit("200% HTML text simulation failed; inspect text-report.json and screenshots")

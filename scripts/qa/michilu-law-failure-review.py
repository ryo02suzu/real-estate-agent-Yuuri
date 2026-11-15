"""Inject only same-origin law-tile failures in a real static-build browser.

This is not Vercel Preview or a physical iPhone. Public test facility only.
"""
import asyncio
import json
import os
import platform
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

OUT = Path("ui-review")
OUT.mkdir(exist_ok=True)
LABELS = {"morido": "盛土規制法", "hourei": "土砂災害等の区域", "tochi": "自然公園・農振・森林"}
report = {"sha": os.environ["REVIEW_SHA"], "phase": os.environ["REVIEW_PHASE"],
          "url": os.environ["REVIEW_URL"], "os": platform.platform(),
          "deployment_tested": False, "real_iphone": False, "checks": []}

async def capture(page, name, record):
    await page.screenshot(path=str(OUT / (name + ".png")), full_page=True)
    record["text"] = await page.get_by_test_id("panel-detail").inner_text()
    (OUT / (name + ".txt")).write_text(record["text"], encoding="utf-8")
    record["overflow"] = await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")

async def check(browser, engine, failed_keys, width, height):
    name = f"{engine}-{width}x{height}-{'-'.join(failed_keys)}"
    rec = {"name": name, "browser": browser.version, "failed_keys": failed_keys,
           "injected": [], "requests": [], "page_errors": [], "status": "started"}
    report["checks"].append(rec)
    ctx = await browser.new_context(viewport={"width": width, "height": height},
                                    locale="ja-JP", device_scale_factor=1, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    page.on("pageerror", lambda error: rec["page_errors"].append(str(error)))
    failing = True

    async def tiles(route):
        nonlocal failing
        parsed = urlparse(route.request.url)
        family = next((key for key in LABELS if re.match(r"/data/" + key + r"-.*\.pmtiles$", parsed.path)), None)
        if parsed.netloc == urlparse(report["url"]).netloc and family:
            rec["requests"].append(family)
            if family in failed_keys and failing:
                rec["injected"].append({"family": family, "path": parsed.path, "status": 503})
                await route.fulfill(status=503, content_type="text/plain", body="QA simulated unavailable law data")
                return
            if family in failed_keys and not failing:
                # Make the pending retry state observable without changing the app.
                await asyncio.sleep(0.5)
        await route.continue_()

    await page.route("**/*.pmtiles", tiles)
    try:
        await page.goto(report["url"], wait_until="domcontentloaded", timeout=40000)
        # The map canvas is created by a client effect, after hydration.
        await page.locator(".mui-japan-map canvas.maplibregl-canvas").first.wait_for(state="visible", timeout=20000)
        await page.locator("#address").fill("東京都新宿区西新宿2丁目8番1号")
        await page.get_by_role("button", name="検索", exact=True).first.click()
        row = page.get_by_role("button", name=re.compile("^都市計画")).first
        await expect(row).to_be_enabled(timeout=40000)
        await row.click()
        detail = page.get_by_test_id("panel-detail")
        tab = detail.get_by_role("tab", name="その他の法令", exact=True)
        await tab.click()
        await page.evaluate("document.fonts.ready")
        await capture(page, name + "-failed-data", rec)
        assert all(any(x["family"] == key for x in rec["injected"]) for key in failed_keys), "Fault injection did not reach all requested law sources"
        rows = {}
        for key, label in LABELS.items():
            term = detail.locator("dt").filter(has_text=re.compile("^" + re.escape(label) + "$"))
            rows[key] = await term.locator("..").inner_text() if await term.count() else None
        rec["rows"] = rows
        for key in failed_keys:
            assert rows[key], f"{key}: failed data row disappeared"
            assert "読み込めませんでした" in rows[key] and "未確認" in rows[key], f"{key}: failure is not explicitly unknown"
            assert "区域外" not in rows[key], f"{key}: failed data was interpreted as outside the area"
        for key in set(LABELS) - set(failed_keys):
            assert rows[key] and "読み込めませんでした" not in rows[key], f"{key}: unrelated healthy law data lost"
        await expect(detail.get_by_role("link", name="国土数値情報（国土交通省）", exact=True)).to_be_visible()
        assert not rec["overflow"], "Failed law rows overflow horizontally"
        retry = detail.get_by_role("button", name="法令データを再読み込み", exact=True)
        before_url = page.url
        before_counts = {key: rec["requests"].count(key) for key in LABELS}
        await retry.click()
        await expect(detail.get_by_role("button", name="法令データを再読み込み中", exact=True)).to_be_disabled()
        await expect(retry).to_be_enabled(timeout=15000)
        assert await detail.get_by_test_id("law-load-error").count() == len(failed_keys), "Repeated failure was reported as recovered"
        for key in set(LABELS) - set(failed_keys):
            assert rec["requests"].count(key) == before_counts[key], "Retry refetched unrelated successful data"
        failing = False
        await retry.click()
        await expect(detail.get_by_role("button", name="法令データを再読み込み中", exact=True)).to_be_disabled()
        await capture(page, name + "-retry-pending", {})
        await expect(detail.get_by_test_id("law-load-error")).to_have_count(0, timeout=20000)
        await expect(retry).to_have_count(0)
        await expect(tab).to_have_attribute("aria-selected", "true")
        assert page.url == before_url, "Retry changed the selected property"
        for key, label in LABELS.items():
            term = detail.locator("dt").filter(has_text=re.compile("^" + re.escape(label) + "$"))
            await expect(term).to_have_count(1)
        await capture(page, name + "-recovered", {})
        await page.get_by_role("button", name="一覧に戻る", exact=True).click()
        await expect(detail).to_be_hidden()
        assert not rec["page_errors"], "Uncaught browser exception"
        rec["status"] = "passed"
    except Exception as error:
        rec["status"] = "failed"
        rec["error"] = str(error)[:1600]
        try:
            await page.screenshot(path=str(OUT / (name + "-error.png")), full_page=True)
        except Exception:
            pass
    finally:
        await ctx.close()
        (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

async def main():
    async with async_playwright() as pw:
        for engine in ["chromium", "webkit"]:
            browser = await getattr(pw, engine).launch(args=["--enable-unsafe-swiftshader"] if engine == "chromium" else [])
            for keys in [["morido"], ["hourei"], ["tochi"], list(LABELS)]:
                await check(browser, engine, keys, 390, 844)
            await check(browser, engine, list(LABELS), 568, 320)
            await browser.close()
    print(json.dumps({"sha": report["sha"], "checks": [{k:v for k,v in c.items() if k in ["name", "status", "error", "rows"]} for c in report["checks"]]}, ensure_ascii=False))

asyncio.run(main())
if any(c["status"] != "passed" for c in report["checks"]):
    raise SystemExit("Law-data failure review failed; see report.json")

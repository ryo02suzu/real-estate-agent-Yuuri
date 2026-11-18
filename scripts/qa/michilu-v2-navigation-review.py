"""Navigation QA of the exact static build. Live GSI responses; no fabricated results.
Only the two public facilities below are searched. Delay/abort one real reverse
geocode response to exercise stale-result/error handling through visible controls.
This is not a Vercel Preview or physical-iPhone verification.
"""
import asyncio
import json
import os
import platform
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

OUT = Path("ui-review")
OUT.mkdir(exist_ok=True)
A = "東京都新宿区西新宿2丁目8番1号"  # Tokyo Metropolitan Government
B = "東京都千代田区丸の内1丁目9番1号"  # Tokyo Station
ERROR = "通信に失敗しました。電波の良い場所でもう一度お試しください。"
REPORT = {
    "sha": os.environ["REVIEW_SHA"], "url": os.environ["REVIEW_URL"],
    "phase": os.environ["REVIEW_PHASE"], "deployment_tested": False,
    "real_iphone": False, "os": platform.platform(),
    "network_control": "One real GSI reverse-geocode response delayed or aborted; no result fixture",
    "checks": [],
}


def safe_url(raw):
    return urlparse(raw)._replace(query="", fragment="").geturl()


class ReverseGate:
    def __init__(self, record):
        self.record = record
        self.pending = None
        self.gates = []
        self.calls = 0

    def arm(self):
        assert self.pending is None, "Previous response gate has not been claimed"
        gate = {"ready": asyncio.Event(), "release": asyncio.Event(),
                "done": asyncio.Event(), "abort": False, "error": None}
        self.pending = gate
        self.gates.append(gate)
        return gate

    async def route(self, route):
        self.calls += 1
        gate = self.pending
        self.pending = None
        try:
            response = await route.fetch(timeout=25000)
            body = await response.json()
            assert response.ok and body.get("results", {}).get("muniCd"), "Live GSI reverse geocoder unavailable"
            self.record["reverse_responses"].append({
                "call": self.calls, "held": gate is not None, "status": response.status,
                "municipality": body["results"]["muniCd"], "stage": self.record["stage"],
            })
            if gate:
                gate["ready"].set()
                await asyncio.wait_for(gate["release"].wait(), timeout=45)
            if gate and gate["abort"]:
                await route.abort("failed")
            else:
                await route.fulfill(response=response)
        except Exception as error:
            if gate:
                gate["error"] = str(error)[:700]
            else:
                self.record["route_errors"].append(str(error)[:700])
            try:
                await route.abort("failed")
            except Exception:
                pass
        finally:
            if gate:
                gate["ready"].set()
                gate["done"].set()

    async def ready(self, gate):
        await asyncio.wait_for(gate["ready"].wait(), timeout=35)
        assert not gate["error"], gate["error"]

    async def release(self, gate, abort=False):
        gate["abort"] = abort
        gate["release"].set()
        await asyncio.wait_for(gate["done"].wait(), timeout=10)
        assert not gate["error"], gate["error"]

    def cleanup(self):
        for gate in self.gates:
            gate["release"].set()


async def state(page):
    return await page.evaluate("""() => ({
      query:new URLSearchParams(location.search).get('q'),
      input:document.querySelector('#address')?.value,
      nav:{depth:history.state?.depth||0,detail:!!history.state?.detail},
      saved:JSON.parse(localStorage.getItem('michilu:history')||'[]').map(x=>x.address),
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      canvases:[...document.querySelectorAll('canvas.maplibregl-canvas')].map(x=>({
        width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height
      }))
    })""")


async def capture(page, name, record):
    await page.screenshot(path=str(OUT / (name + ".png")), full_page=True)
    (OUT / (name + ".txt")).write_text(await page.locator("body").inner_text(), encoding="utf-8")
    record["snapshot"] = await state(page)
    assert not record["snapshot"]["overflow"], "Horizontal overflow"


async def search(page, query):
    await page.locator("#address").fill(query)
    await page.get_by_role("button", name="検索", exact=True).click()


async def result(page, query, mobile, input_value=None):
    await page.wait_for_function("(q) => new URLSearchParams(location.search).get('q') === q",
                                 arg=query, timeout=35000)
    await expect(page.get_by_role("button", name="検索", exact=True)).to_be_enabled(timeout=35000)
    root = page.get_by_test_id("result-panel") if mobile else page.locator("aside")
    await expect(root).to_contain_text("新宿区" if query == A else "千代田区", timeout=10000)
    await expect(page.locator("#address")).to_have_value(query if input_value is None else input_value)
    assert not await page.get_by_text(ERROR, exact=True).is_visible(), "Search error appeared unexpectedly"
    return await state(page)


async def home(page, mobile):
    await page.wait_for_function("!location.search", timeout=10000)
    if mobile:
        await expect(page.get_by_role("region", name="住所を調べる", exact=True)).to_be_visible()
        await expect(page.locator("#address")).to_have_value("")
    else:
        await expect(page.get_by_role("heading", level=1)).to_contain_text("住所から")
    assert await page.get_by_test_id("result-panel").count() == 0
    assert not await page.locator("button[aria-label='検索'] .animate-spin").count()
    return await state(page)


async def unchanged(page, expected, mobile, query):
    # Give the released final lookup response and React update time to settle.
    # The gate has already confirmed a real reverse-geocoder response was delivered.
    await page.wait_for_timeout(1600)
    actual = await result(page, query, mobile)
    for key in ["query", "input", "nav", "saved"]:
        assert actual[key] == expected[key], f"Late response changed {key}: {actual[key]}"
    return actual


async def check(page, record, label, action):
    record["stage"] = label
    entry = {"name": label, "status": "started"}
    record["steps"].append(entry)
    await action(entry)
    entry["status"] = "passed"


async def exercise(page, record, mobile, gate):
    name = record["name"]
    response = await page.goto(REPORT["url"], wait_until="domcontentloaded", timeout=40000)
    assert response and response.status == 200
    assert urlparse(page.url).netloc == urlparse(REPORT["url"]).netloc, "Navigation left review origin"
    await page.locator("#address").wait_for(state="visible", timeout=20000)
    await page.evaluate("document.fonts.ready")
    await page.wait_for_timeout(800)
    record["reduced_motion_matches"] = await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    assert record["reduced_motion_matches"] == (record["motion"] == "reduce")

    async def seed(entry):
        await search(page, B)
        entry["result"] = await result(page, B, mobile)
        await page.get_by_role("button", name="ホームへ戻る", exact=True).click()
        await home(page, mobile)
    await check(page, record, "live-search-and-home", seed)

    for abort in [False, True]:
        async def race(entry, abort=abort):
            held = gate.arm()
            await search(page, A)
            await gate.ready(held)
            # Search button is disabled while loading; select the real visible
            # history chip instead of dispatching synthetic form events.
            await page.get_by_role("button", name=B, exact=True).click()
            expected = await result(page, B, mobile)
            await gate.release(held, abort=abort)
            entry["after_release"] = await unchanged(page, expected, mobile, B)
            assert A not in entry["after_release"]["saved"], "Stale search leaked into persisted history"
            await capture(page, name + ("-late-error" if abort else "-latest-wins"), entry)
            await page.get_by_role("button", name="ホームへ戻る", exact=True).click()
            await home(page, mobile)
        await check(page, record, "stale-error-ignored" if abort else "new-search-wins", race)

    async def edit(entry):
        held = gate.arm()
        await search(page, A)
        await gate.ready(held)
        await page.locator("#address").fill(B)
        await gate.release(held)
        entry["result"] = await result(page, A, mobile, input_value=B)
        if mobile:
            await page.get_by_role("button", name="キャンセル", exact=True).click()
        else:
            await page.locator("#address").fill(A)
        await result(page, A, mobile)
    await check(page, record, "typing-preserved-during-search", edit)

    if mobile:
        for cancel in ["button", "Escape"]:
            async def cancel_search(entry, cancel=cancel):
                before = await result(page, A, mobile)
                held = gate.arm()
                await search(page, B)
                await gate.ready(held)
                if cancel == "button":
                    await page.get_by_role("button", name="キャンセル", exact=True).click()
                else:
                    await page.locator("#address").press("Escape")
                await result(page, A, mobile)
                await gate.release(held)
                entry["after_release"] = await unchanged(page, before, mobile, A)
            await check(page, record, "cancel-inflight-" + cancel, cancel_search)

        async def detail_back(entry):
            row = page.get_by_role("button", name=re.compile("^都市計画")).first
            await row.scroll_into_view_if_needed()
            before_scroll = await page.locator(".mui-list-in").evaluate("e=>e.scrollTop")
            before_calls = gate.calls
            await row.click()
            await page.get_by_test_id("panel-detail").wait_for(state="visible")
            await page.wait_for_function("history.state?.detail === true")
            await page.go_back()
            await page.get_by_test_id("panel-detail").wait_for(state="hidden")
            await result(page, A, mobile)
            await page.wait_for_timeout(400)
            assert gate.calls == before_calls, "Closing detail issued a new property lookup"
            after_scroll = await page.locator(".mui-list-in").evaluate("e=>e.scrollTop")
            assert abs(after_scroll - before_scroll) <= 2, "Browser Back lost result-list scroll"
            entry.update(scroll_before=before_scroll, scroll_after=after_scroll, reverse_calls=gate.calls)
            await capture(page, name + "-browser-back-detail", entry)
        await check(page, record, "browser-back-closes-detail-only", detail_back)
    else:
        async def pc_controls(entry):
            await page.locator("#address").blur()
            await page.keyboard.press("/")
            await expect(page.locator("#address")).to_be_focused()
            await page.locator("#address").blur()
            await page.locator("#pc-tabs").wait_for(state="visible")
            await page.wait_for_timeout(6000)
            labels = await page.locator("#pc-tabs [role='tab']").all_text_contents()
            assert "法令の制限" in labels and "災害リスク" in labels
            entry["tabs"] = []
            for index, label in enumerate(labels):
                tab = page.locator("#pc-tabs").get_by_role("tab", name=label, exact=True)
                await tab.click()
                await expect(tab).to_have_attribute("aria-selected", "true")
                body = page.locator("#pc-tabs + div")
                await expect(body).not_to_be_empty()
                await page.wait_for_timeout(300)
                tab_record = {"label": label, "text": (await body.inner_text())[:10000]}
                assert tab_record["text"].strip(), "Selected desktop tab is empty"
                await capture(page, name + f"-tab-{index}", tab_record)
                entry["tabs"].append(tab_record)
            await page.get_by_role("button", name="使い方", exact=True).first.click()
            await page.get_by_role("dialog").wait_for(state="visible")
            await page.keyboard.press("Escape")
            await page.get_by_role("dialog").wait_for(state="hidden")
            await result(page, A, mobile)
        await check(page, record, "pc-shortcut-tabs-help", pc_controls)

    async def home_inflight(entry):
        before = await state(page)
        held = gate.arm()
        await search(page, B)
        await gate.ready(held)
        await page.get_by_role("button", name="ホームへ戻る", exact=True).click()
        await home(page, mobile)
        await gate.release(held)
        await page.wait_for_timeout(1600)
        entry["after_release"] = await home(page, mobile)
        assert entry["after_release"]["saved"] == before["saved"], "Home cancellation changed search history"
        await capture(page, name + "-home-after-late-response", entry)
    await check(page, record, "home-ignores-inflight-response", home_inflight)

    async def back_forward(entry):
        await search(page, A)
        await result(page, A, mobile)
        before = await state(page)
        held = gate.arm()
        await search(page, B)
        await gate.ready(held)
        await page.go_back()
        await home(page, mobile)
        await gate.release(held)
        await page.wait_for_timeout(1600)
        at_home = await home(page, mobile)
        assert at_home["saved"] == before["saved"], "Browser Back cancellation changed history"
        await page.go_forward()
        entry["restored"] = await result(page, A, mobile)
        await capture(page, name + "-forward-restored", entry)
    await check(page, record, "browser-back-inflight-and-forward", back_forward)

    async def same_address(entry):
        calls = gate.calls
        held = gate.arm()
        await search(page, A)
        await gate.ready(held)
        await expect(page.get_by_role("button", name="検索", exact=True)).to_be_disabled()
        await gate.release(held)
        await result(page, A, mobile)
        assert gate.calls > calls, "Same-address submission did not perform lookup"
        final = await state(page)
        assert final["saved"].count(A) == 1, "Duplicate search-history entry"
        assert final["canvases"] and all(c["width"] > 0 and c["height"] > 0 for c in final["canvases"])
        entry["state"] = final
        await capture(page, name + "-same-address", entry)
    await check(page, record, "same-address-research", same_address)


async def main():
    async with async_playwright() as pw:
        for engine in ["chromium", "webkit"]:
            browser = await getattr(pw, engine).launch(args=["--enable-unsafe-swiftshader"] if engine == "chromium" else [])
            cases = [(390,844,"no-preference"), (568,320,"no-preference"), (390,844,"reduce")]
            if engine == "chromium":
                cases += [(1024,768,"no-preference"), (1440,900,"no-preference")]
            for width, height, motion in cases:
                record = {"name": f"{engine}-{width}x{height}-{motion}", "browser_version": browser.version,
                          "motion": motion, "stage": "home", "status": "started",
                          "steps": [], "page_errors": [], "http_errors": [], "route_errors": [], "reverse_responses": []}
                REPORT["checks"].append(record)
                mobile = width < 1024
                context = await browser.new_context(viewport={"width": width, "height": height},
                    locale="ja-JP", device_scale_factor=1, is_mobile=mobile, has_touch=mobile, reduced_motion=motion)
                page = await context.new_page()
                page.set_default_timeout(12000)
                gate = ReverseGate(record)
                await page.route("https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?*", gate.route)
                page.on("pageerror", lambda error, r=record: r["page_errors"].append(str(error)[:800]))
                page.on("response", lambda response, r=record: r["http_errors"].append({
                    "url": safe_url(response.url), "status": response.status, "stage": r["stage"]
                }) if response.status >= 400 else None)
                try:
                    await exercise(page, record, mobile, gate)
                    assert not record["page_errors"], "Uncaught JavaScript exception"
                    assert not record["route_errors"], "Live geocoder or response routing failed"
                    record["status"] = "passed"
                except Exception as error:
                    record["status"] = "failed"
                    record["error"] = str(error)[:1500]
                    if record["steps"] and record["steps"][-1]["status"] == "started":
                        record["steps"][-1]["status"] = "failed"
                    try:
                        await capture(page, record["name"] + "-failed", {})
                    except Exception:
                        pass
                finally:
                    gate.cleanup()
                    await context.close()
                    (OUT / "navigation-report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")
                print(json.dumps({"name": record["name"], "status": record["status"], "error": record.get("error"),
                                  "steps": [{"name": s["name"], "status": s["status"]} for s in record["steps"]]}, ensure_ascii=False), flush=True)
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
    if any(c["status"] != "passed" for c in REPORT["checks"]):
        raise SystemExit("Navigation QA failed; inspect navigation-report.json and screenshots")

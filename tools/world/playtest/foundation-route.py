"""Time actual keyboard movement and orbit on the public camp, cave and factory entries.

Run sequentially on the same machine with fresh Chromium HTTP caches. Output includes
the HTML digest and raw animation-frame intervals so results can be tied to each build.
"""
import argparse
import hashlib
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout

DOT = 'aside.world-location svg circle[r="2.6"]'
READY = 'button.world-camp-return:enabled'
SIZE = {"width": 1920, "height": 1080}
SITES = {"camp": "", "cave": "?start=alpha-cave", "factory": "?start=factory"}


def position(page):
    return page.locator(DOT).evaluate("el => ['cx','cy'].map(k => Number(el.getAttribute(k)))")


def describe(intervals):
    if not intervals:
        raise RuntimeError("Empty frame sample")
    ordered = sorted(intervals)
    return {**{f"p{n}Ms": ordered[math.ceil(n * len(ordered) / 100) - 1] for n in (50, 95, 99)},
            "count": len(ordered), "maxMs": ordered[-1], "over50Ms": sum(dt > 50 for dt in ordered),
            "averageFps": round(1000 * len(ordered) / sum(ordered), 2)}


def measure(browser, base, name, suffix):
    with browser.new_context(viewport=SIZE, device_scale_factor=1) as context:
        page = context.new_page()
        errors = []
        failed_requests = []
        page.on("requestfailed", lambda request: failed_requests.append(
            {"url": request.url, "reason": request.failure, "resource": request.resource_type}))
        page.on("pageerror", lambda error: errors.append(str(error)))
        telemetry = []
        def record_response(response):
            if response.status >= 400:
                target = telemetry if response.url.endswith("/api/events") else errors
                target.append(f"{response.status} {response.url}")
        page.on("response", record_response)
        url = urljoin(base, "/world/" + suffix)
        row = {"site": name, "url": url, "errors": errors, "telemetryHttpErrors": telemetry}
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            if not response or not response.ok:
                raise RuntimeError("Failed to load public entry")
            row["htmlSHA256"] = hashlib.sha256(response.body()).hexdigest()
            page.locator(READY).wait_for(timeout=90000)
            page.wait_for_function("!document.querySelector('.world-loading')", timeout=90000)
            row["hudReadyMs"] = round(page.evaluate("performance.now()"))
            row["start"] = position(page)
            row["canvasPixels"] = page.locator("canvas").first.evaluate("el => [el.width,el.height]")
            row["qaApiPresent"] = page.evaluate("Boolean(window.__worldDebug)")
            if row["qaApiPresent"]:
                raise RuntimeError("Expected public game entry")
            page.keyboard.down("KeyW")
            try:
                moved = page.wait_for_function("""([selector, start]) => {
                    const el = document.querySelector(selector);
                    return Math.hypot(el.cx.baseVal.value-start[0], el.cy.baseVal.value-start[1]) > .35
                        && performance.now();
                }""", arg=[DOT, row["start"]], polling=40, timeout=4500)
                row["firstMovementMs"] = round(moved.json_value())
                moved.dispose()
            except BrowserTimeout:
                row["firstMovementMs"] = None
                errors.append("No forward HUD displacement above 0.35 m within 4.5 seconds")
            finally:
                page.keyboard.up("KeyW")
            page.evaluate("""() => {
              const sample = window.routeFrames = {running:true, intervals:[]};
              let last;
              const tick = now => {
                if (!sample.running) return;
                if (last !== undefined) sample.intervals.push(now-last);
                last=now; requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            }""")
            origin = position(page)
            page.keyboard.down("KeyS")
            page.wait_for_timeout(2500)
            page.keyboard.up("KeyS")
            row["afterReverse"] = position(page)
            page.mouse.move(770, 540)
            page.mouse.down()
            for x in (1170, 770, 1200, 740):
                page.mouse.move(x, 540, steps=12)
                page.wait_for_timeout(450)
            page.mouse.up()
            page.keyboard.down("KeyW")
            page.wait_for_timeout(2700)
            page.keyboard.up("KeyW")
            row["end"] = position(page)
            row["reverseDisplacementM"] = round(math.dist(origin, row["afterReverse"]), 2)
            intervals = page.evaluate("() => {window.routeFrames.running=false; return window.routeFrames.intervals}")
            row["frameTime"] = describe(intervals)
            row["rawFrameMs"] = [round(dt, 3) for dt in intervals]
        except Exception as error:
            errors.append(str(error))
        # Freeze the sample before closing the browser context. Aborting a still
        # downloading background GLB while tearing down the test is a different event.
        row["errors"] = list(errors)
        row["requestFailuresDuringRoute"] = list(failed_requests)
        context.close()
        row["errorsDuringTeardown"] = errors[len(row["errors"]):]
        row["requestFailuresDuringTeardown"] = failed_requests[len(row["requestFailuresDuringRoute"]):]
        return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--channel", default="chrome")
    args = parser.parse_args()
    with sync_playwright() as p:
        with p.chromium.launch(channel=args.channel, args=["--use-angle=metal"], headless=True) as browser:
            report = {"sampledAt": datetime.now(timezone.utc).isoformat(), "browser": browser.version,
                      "os": platform.platform(), "viewport": SIZE, "dpr": 1, "freshContextPerEntry": True,
                      "quality": "ordinary Balanced default", "routes": []}
            for name, suffix in SITES.items():
                row = measure(browser, args.base, name, suffix)
                report["routes"].append(row)
                print(name, row.get("firstMovementMs"), row.get("frameTime"), row["errors"], flush=True)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(report, indent=2) + "\n")
    return int(any(row["errors"] for row in report["routes"]))


if __name__ == "__main__":
    raise SystemExit(main())

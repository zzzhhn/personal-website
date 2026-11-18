"""Capture every paired site camera from one production world. Requires Playwright and Pillow."""
import argparse
import hashlib
import io
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urljoin, urlsplit

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
VIEWPORT = {"width": 960, "height": 540}
# Wait for independently suspended districts before framing a site. The player can
# reach "ready" at camp while some of these objects are still downloading.
DISTRICTS = ["world-camp-content", "world-town", "world-street", "world-districts-v4",
             "djc-beach-club", "alpha-island-batch2", "world-ibd-yard", "factory-structure"]
HIDE_UI = "body *:not(canvas):not(:has(canvas)) { visibility: hidden !important; }"


def pairs(ids):
    result = {}
    for shot in ids:
        site, _, time = shot.rpartition("-")
        if not site.startswith("site-") or time not in ("day", "night") or time in result.setdefault(site, {}):
            raise ValueError(f"Unexpected site option {shot!r}")
        result[site][time] = shot
    if not result or any(set(group) != {"day", "night"} for group in result.values()):
        raise ValueError("Each site needs one day and one night camera")
    return result


def shoot(page, select, shot):
    old_frame = page.evaluate("window.__worldDebug.renderLoop().frame")
    select.select_option(shot)
    # The renderer sleeps between shots. Count actual GL frames and wait for the
    # shadow-settling burst plus the real lighting uniform, even on a slow GPU.
    page.wait_for_function("""([shot, frame]) => {
        const d = window.__worldDebug, s = d.state(), loop = d.renderLoop();
        const dark = shot.endsWith('-night'), camera = d.reviewCamera();
        return !document.hidden && s.shot === shot && !s.paused && s.quality === 'balanced'
          && s.weather === 'clear' && s.light === (dark ? 'night' : 'noon')
          && Math.abs(loop.night - Number(dark)) < .001 && loop.frame > frame + 2
          && camera?.settled && camera.onMark && d.stats().triangles > 0;
    }""", arg=[shot, old_frame], timeout=150000)
    camera = page.evaluate("window.__worldDebug.reviewCamera()")
    data = page.locator("canvas").screenshot(style=HIDE_UI, timeout=30000)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if image.size != tuple(VIEWPORT.values()) or max(ImageStat.Stat(image).stddev) < 2:
        raise RuntimeError(f"Empty or incorrectly sized render at {shot}")
    return camera, image


def capture(browser, base):
    errors = []
    context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    try:
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def response(r):
            path = urlsplit(r.url).path
            if r.status >= 400 and path.startswith(("/_astro/", "/assets/world/")):
                errors.append(f"{r.status} {path}")

        page.on("response", response)
        entry = page.goto(urljoin(base, "/world/?quality=balanced&siteReview=1&qa=1"),
                          wait_until="domcontentloaded", timeout=60000)
        if not entry or not entry.ok:
            raise RuntimeError("World entry did not return success")
        # Tie capture to the actual HTML and hashed assets of this checkout's build.
        html = entry.body()
        if html != (ROOT / "dist/world/index.html").read_bytes():
            raise RuntimeError("The preview is serving a different build from dist/world/index.html")
        page.wait_for_function("window.__worldDebug?.state().ready", timeout=150000)
        print("World ready; waiting for district meshes", flush=True)
        try:
            page.wait_for_function("""names => {
                const objects = new Set(window.__worldDebug.sceneObjects());
                return names.every(n => objects.has(n));
            }""", arg=DISTRICTS, polling=500, timeout=90000)
        except Exception as error:
            present = set(page.evaluate("window.__worldDebug.sceneObjects()"))
            raise RuntimeError(f"Scene missing {set(DISTRICTS) - present}. Browser errors: {errors[:4]}") from error
        print("District meshes mounted", flush=True)
        select = page.get_by_role("combobox", name="现场接缝复核机位")
        sites = pairs(select.locator("option").evaluate_all("os => os.map(o => o.value).filter(Boolean)"))
        tile_w, tile_h, label_h = 600, 338, 32
        atlas = Image.new("RGB", (tile_w * 4, (label_h + tile_h) * ((len(sites) + 1) // 2)), "#182429")
        draw = ImageDraw.Draw(atlas)
        font = ImageFont.load_default(size=17)
        records = {}
        for index, (site, group) in enumerate(sites.items()):
            day_camera, day = shoot(page, select, group["day"])
            night_camera, night = shoot(page, select, group["night"])
            if day_camera != night_camera:
                raise RuntimeError(f"Camera/projection/exposure mismatch at {site}")
            change = ImageStat.Stat(ImageChops.difference(day, night)).mean
            if max(change) < 2:
                raise RuntimeError(f"Day and night pixels nearly identical at {site}")
            records[site] = {"camera": day_camera, "meanAbsoluteRgbDifference": change}
            for column, (name, image) in enumerate([("Noon", day), ("Midnight", night)]):
                x = (index % 2 * 2 + column) * tile_w
                y = index // 2 * (tile_h + label_h)
                draw.text((x + 9, y + 5), f"{site[5:]}  /  {name}", font=font, fill="white")
                atlas.paste(image.resize((tile_w, tile_h), Image.Resampling.LANCZOS), (x, y + label_h))
            print(f"{index + 1}/{len(sites)}  {site}", flush=True)
        if errors:
            raise RuntimeError("Browser errors: " + "; ".join(errors[:5]))
        return atlas, {"browser": browser.version, "viewport": VIEWPORT, "quality": "balanced",
                       "preview": entry.url, "entrySha256": hashlib.sha256(html).hexdigest(), "sites": records}
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:4343")
    parser.add_argument("--out", type=Path, default=ROOT / "local/world-atlas")
    parser.add_argument("--cdp", help="Attach to an existing automation-enabled Chromium browser")
    parser.add_argument("--channel", help="Installed Chrome channel if launching a task-owned browser")
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = (p.chromium.connect_over_cdp(args.cdp) if args.cdp
                   else p.chromium.launch(channel=args.channel, headless=True))
        try:
            atlas, manifest = capture(browser, args.base)
        finally:
            if not args.cdp:
                browser.close()
    manifest["checkout"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    manifest["dirty"] = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT))
    manifest["capturedAt"] = datetime.now(timezone.utc).isoformat()
    args.out.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out) as tmp:
        directory = Path(tmp)
        atlas.save(directory / "atlas.jpg", quality=91, subsampling=0)
        manifest["atlasSha256"] = hashlib.sha256((directory / "atlas.jpg").read_bytes()).hexdigest()
        (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        for name in ("atlas.jpg", "manifest.json"):
            os.replace(directory / name, args.out / name)
    print(args.out / "atlas.jpg")


if __name__ == "__main__":
    main()

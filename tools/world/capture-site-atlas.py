"""Capture every paired site camera from one production world. Requires Playwright and Pillow."""
import argparse
import base64
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
from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
VIEWPORT = {"width": 960, "height": 540}
# Wait for independently suspended districts before framing a site. The player can
# reach "ready" at camp while some of these objects are still downloading.
DISTRICTS = ["world-camp-content", "world-town", "world-street", "world-districts-v4",
             "djc-beach-club", "alpha-island-batch2", "world-ibd-yard", "factory-structure"]
TILE_WIDTH, TILE_HEIGHT, LABEL_HEIGHT = 600, 338, 32
ROW_HEIGHT = TILE_HEIGHT + LABEL_HEIGHT


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
    select.evaluate("""(el, shot) => {
        el.value = shot;
        el.dispatchEvent(new Event('change', {bubbles: true}));
    }""", shot)
    # The renderer sleeps between shots. Count actual GL frames and wait for the
    # shadow-settling burst plus the real lighting uniform, even on a slow GPU.
    ready = """([shot, frame, viewport]) => {
        const d = window.__worldDebug, s = d.state(), loop = d.renderLoop();
        const rect = document.querySelector('canvas')?.getBoundingClientRect();
        if (!rect || rect.x !== 0 || rect.y !== 0 || rect.width !== viewport.width || rect.height !== viewport.height)
            throw new Error('Canvas does not cover the capture viewport');
        const dark = shot.endsWith('-night'), camera = d.reviewCamera();
        return !document.hidden && s.shot === shot && !s.paused && s.quality === 'balanced'
          && s.weather === 'clear' && s.light === (dark ? 'night' : 'noon')
          && Math.abs(loop.night - Number(dark)) < .001 && loop.frame > frame + 2
          && camera?.settled && camera.onMark && d.stats().triangles > 0 && {camera, png: d.captureReviewFrame()};
    }"""
    for attempt in range(6):
        try:
            sample = page.wait_for_function(ready, arg=[shot, old_frame, VIEWPORT], polling=350, timeout=60000)
            capture = sample.json_value()
            sample.dispose()
            break
        except PlaywrightTimeout:
            observed = page.evaluate("""() => {
                const d = window.__worldDebug, s = d.state(), c = d.reviewCamera();
                return {shot:s.shot, paused:s.paused, hidden:document.hidden, quality:s.quality, light:s.light,
                    weather:s.weather, loop:d.renderLoop(), onMark:c?.onMark, settled:c?.settled, stats:d.stats()};
            }""")
            print(f"Waiting for {shot} from frame {old_frame}: {observed}", flush=True)
            if attempt == 5:
                raise
    header, encoded = capture["png"].split(",", 1)
    if header != "data:image/png;base64":
        raise RuntimeError(f"Invalid WebGL readback at {shot}")
    data = base64.b64decode(encoded, validate=True)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if image.size != tuple(VIEWPORT.values()) or max(ImageStat.Stat(image).stddev) < 2:
        raise RuntimeError(f"Invalid render at {shot}: {image.size}, channel deviation {ImageStat.Stat(image).stddev}")
    return capture["camera"], image


def capture(browser, base, shard, shards):
    errors = []
    context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    try:
        page = context.new_page()
        def record_error(message):
            errors.append(message)
            print(f"Browser error: {message}", flush=True)

        page.on("pageerror", lambda error: record_error(str(error)))
        page.on("crash", lambda _: record_error("Renderer process crashed"))

        def response(r):
            path = urlsplit(r.url).path
            if r.status >= 400 and path.startswith(("/_astro/", "/assets/world/")):
                record_error(f"{r.status} {path}")

        page.on("response", response)
        entry = page.goto(urljoin(base, "/world/?quality=balanced&siteReview=1&qa=1"),
                          wait_until="domcontentloaded", timeout=60000)
        if not entry or not entry.ok:
            raise RuntimeError("World entry did not return success")
        # Tie capture to the actual HTML and hashed assets of this checkout's build.
        html = entry.body()
        if html != (ROOT / "dist/world/index.html").read_bytes():
            raise RuntimeError("The preview is serving a different build from dist/world/index.html")
        page.wait_for_function("window.__worldDebug?.state().ready", polling=350, timeout=150000)
        print("World ready; waiting for district meshes", flush=True)
        try:
            page.wait_for_function("""names => {
                const objects = new Set(window.__worldDebug.sceneObjects());
                return names.every(n => objects.has(n));
            }""", arg=DISTRICTS, polling=500, timeout=90000)
        except Exception as error:
            present = set(page.evaluate("window.__worldDebug.sceneObjects()"))
            raise RuntimeError(f"Scene missing {set(DISTRICTS) - present}. Browser errors: {errors[:4]}") from error
        if page.evaluate("window.__worldDebug.sceneObjects().includes('alpha-shallows-eight-rune-crossing')"):
            raise RuntimeError("Retired rune bridge mounted on the ordinary Alpha coastal path")
        print("District meshes mounted", flush=True)
        # The software GPU can spend seconds on one frame. This control only
        # needs to exist and be enabled; its bounds and paint timing are immaterial.
        select = page.wait_for_function(
            """document.querySelector('select[aria-label="现场接缝复核机位"]:enabled')""",
            polling=350, timeout=150000).as_element()
        sites = pairs(select.evaluate("el => Array.from(el.options, o => o.value).filter(Boolean)"))
        order = list(sites)
        rows = (len(order) + 1) // 2
        if not 0 <= shard < shards <= rows:
            raise ValueError(f"Invalid shard {shard}/{shards} for {rows} atlas rows")
        selected = order[2 * (rows * shard // shards):2 * (rows * (shard + 1) // shards)]
        atlas = Image.new("RGB", (TILE_WIDTH * 4, ROW_HEIGHT * ((len(selected) + 1) // 2)), "#182429")
        draw = ImageDraw.Draw(atlas)
        font = ImageFont.load_default(size=17)
        records = {}
        for index, site in enumerate(selected):
            group = sites[site]
            day_camera, day = shoot(page, select, group["day"])
            night_camera, night = shoot(page, select, group["night"])
            if day_camera != night_camera:
                raise RuntimeError(f"Camera/projection/exposure mismatch at {site}: {day_camera} vs {night_camera}")
            change = ImageStat.Stat(ImageChops.difference(day, night)).mean
            if max(change) < 2:
                raise RuntimeError(f"Day and night pixels nearly identical at {site}")
            records[site] = {"camera": day_camera, "meanAbsoluteRgbDifference": change}
            # Keep the surveyed camera ID comparable to older manifests; its
            # current playable destination is the coastal path.
            caption = "alpha-coastal-path" if site == "site-alpha-shallows" else site[5:]
            for column, (name, image) in enumerate([("Noon", day), ("Midnight", night)]):
                x = (index % 2 * 2 + column) * TILE_WIDTH
                y = index // 2 * (TILE_HEIGHT + LABEL_HEIGHT)
                draw.text((x + 9, y + 5), f"{caption}  /  {name}", font=font, fill="white")
                atlas.paste(image.resize((TILE_WIDTH, TILE_HEIGHT), Image.Resampling.LANCZOS), (x, y + LABEL_HEIGHT))
            print(f"{index + 1}/{len(selected)}  {site}", flush=True)
        if errors:
            raise RuntimeError("Browser errors: " + "; ".join(errors[:5]))
        return atlas, {"browser": browser.version, "viewport": VIEWPORT, "quality": "balanced",
                       "preview": entry.url, "entrySha256": hashlib.sha256(html).hexdigest(), "siteOrder": order, "sites": records}
    finally:
        context.close()


def assemble(root):
    parts = []
    for source in root.glob("*/manifest.json"):
        manifest = json.loads(source.read_text())
        data = (source.parent / "rows.png").read_bytes()
        if hashlib.sha256(data).hexdigest() != manifest["atlasSha256"]:
            raise ValueError(f"Invalid image digest in {source}")
        parts.append((manifest, Image.open(io.BytesIO(data)).convert("RGB")))
    if not parts:
        raise ValueError("No captured atlas rows")
    first = parts[0][0]
    order = first["siteOrder"]
    parts.sort(key=lambda p: order.index(next(iter(p[0]["sites"]))))
    records, rows = {}, []
    for manifest, image in parts:
        for key in ("checkout", "entrySha256", "browser", "viewport", "quality", "siteOrder"):
            if first[key] != manifest[key]:
                raise ValueError(f"Atlas parts disagree on {key}")
        if set(records).intersection(manifest["sites"]):
            raise ValueError("Duplicate site in captured rows")
        if image.size != (TILE_WIDTH * 4, ROW_HEIGHT * ((len(manifest["sites"]) + 1) // 2)):
            raise ValueError("Unexpected dimensions for captured rows")
        records.update(manifest["sites"])
        rows.append(image)
    if list(records) != order or sum(im.height for im in rows) != ROW_HEIGHT * ((len(order) + 1) // 2):
        raise ValueError("Incomplete or misordered atlas rows")
    atlas = Image.new("RGB", (rows[0].width, sum(im.height for im in rows)))
    y = 0
    for image in rows:
        atlas.paste(image, (0, y))
        y += image.height
    return atlas, {**first, "dirty": any(m["dirty"] for m, _ in parts), "sites": records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:4343")
    parser.add_argument("--out", type=Path, default=ROOT / "local/world-atlas")
    parser.add_argument("--cdp", help="Attach to an existing automation-enabled Chromium browser")
    parser.add_argument("--channel", help="Installed Chrome channel if launching a task-owned browser")
    parser.add_argument("--shard", type=int, default=0, help="Zero-based index of the row group to render")
    parser.add_argument("--shards", type=int, default=1)
    parser.add_argument("--assemble", type=Path, help="Assemble downloaded row groups without a browser")
    args = parser.parse_args()
    if args.assemble:
        atlas, manifest = assemble(args.assemble)
    else:
        with sync_playwright() as p:
            browser = (p.chromium.connect_over_cdp(args.cdp) if args.cdp
                       else p.chromium.launch(channel=args.channel, headless=True))
            try:
                atlas, manifest = capture(browser, args.base, args.shard, args.shards)
            finally:
                if not args.cdp:
                    browser.close()
        manifest["checkout"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        manifest["dirty"] = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT))
    manifest["capturedAt"] = datetime.now(timezone.utc).isoformat()
    args.out.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out) as tmp:
        directory = Path(tmp)
        name = "rows.png" if args.shards > 1 else "atlas.jpg"
        if name.endswith(".png"):
            atlas.save(directory / name)
        else:
            atlas.save(directory / name, quality=91, subsampling=0)
        manifest["atlasSha256"] = hashlib.sha256((directory / name).read_bytes()).hexdigest()
        (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        for file in (name, "manifest.json"):
            os.replace(directory / file, args.out / file)
    print(args.out / name)


if __name__ == "__main__":
    main()

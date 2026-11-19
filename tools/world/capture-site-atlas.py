"""Capture every paired site camera from one production world. Requires Playwright and Pillow."""
import argparse
import base64
import gzip
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
DISTRICTS = ["world-camp-content", "camp-C03-scenario-pilot", "camp-C04-shelter-craft",
             "camp-craft-C05", "camp-craft-C06", "camp-craft-C07", "camp-tree-craft-G17-L0_wood",
             "C02_stone_batch", "camp-workshop-C08",
             "world-town-assets", "world-street", "street-trees-group", "world-districts-v4",
             "G28-entry", "alpha-mine-entry-tool-rack", "alpha-mine-west-ramp",
             "djc-beach-club", "alpha-island-batch2", "alpha-echo-cave-station-6",
             "alpha-station5-three-sluices-waterwheel", "world-ibd-yard", "factory-structure",
             "alpha-mainland-pier-r4-candidate", "alpha-cable-vehicle-model", "alpha-ferry-vehicle-model",
             "alpha-sled-vehicle-model", "cable-lower-canopy-structure", "cable-upper-canopy-structure",
             *[f"alpha-{kind}-gangway-{end}" for kind in ("cable", "ferry", "sled") for end in (0, 1)]]
TILE_WIDTH, TILE_HEIGHT, LABEL_HEIGHT = 600, 338, 32
ROW_HEIGHT = TILE_HEIGHT + LABEL_HEIGHT
# A missing day/night pair cannot be discovered by enumerating the UI alone.
REQUIRED_SITES = frozenset("site-" + label for label in (
    "alpha-shallows alpha-lodge alpha-lodge-entry alpha-cave alpha-summit alpha-wind-sign "
    "alpha-cairns alpha-wheel coaster-infield road-edge exchange-foot club-span club-pool "
    "club-apron ibd-truck camp town quarry factory mainland-ferry sled-bend").split())



def pairs(ids):
    result = {}
    for shot in ids:
        site, _, time = shot.rpartition("-")
        if not site.startswith("site-") or time not in ("day", "night") or time in result.setdefault(site, {}):
            raise ValueError(f"Unexpected site option {shot!r}")
        result[site][time] = shot
    if not result or any(set(group) != {"day", "night"} for group in result.values()):
        raise ValueError("Each site needs one day and one night camera")
    missing = REQUIRED_SITES.difference(result)
    if missing:
        raise ValueError(f'Missing required atlas sites: {sorted(missing)}')
    return result


def shoot(page, select, shot, diagnostics):
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
          && camera?.settled && camera.onMark && d.stats().triangles > 0
          && {camera, png: d.captureReviewFrame(), coverage: d.reviewCollisionInventory()};
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
    coverage = capture["coverage"]
    if coverage["errors"] or not coverage["submitted"]["meshes"]:
        diagnostics.mkdir(parents=True, exist_ok=True)
        image.save(diagnostics / (shot + ".png"))
        (diagnostics / (shot + ".json")).write_text(json.dumps({
            "shot": shot, "camera": capture["camera"], "coverage": coverage,
            "url": page.url, "viewport": VIEWPORT, "quality": "balanced",
        }, indent=2) + "\n")
        raise RuntimeError(f"Collision inventory failed at {shot}: {coverage['errors'][:10]}, submitted={coverage['submitted']}")
    return capture["camera"], image, coverage


def wait_for_districts(page, errors, diagnostics):
    # A GPU runner can take seconds per frame; preserve a useful trace in the
    # job log even when an unsuccessful shard never reaches artifact upload.
    observe = """names => {
        const debug = window.__worldDebug;
        const mounted = new Set(debug?.sceneObjects() ?? []);
        const requests = performance.getEntriesByType('resource')
          .filter(r => /cave|waterwheel/i.test(r.name))
          .map(r => ({path: new URL(r.name).pathname, received: r.encodedBodySize,
                      endedMs: Math.round(r.responseEnd)}));
        return {missing: names.filter(name => !mounted.has(name)),
                frame: debug?.renderLoop()?.frame, requests};
    }"""
    ready = """names => {
        const objects = new Set(window.__worldDebug?.sceneObjects() ?? []);
        return names.every(n => objects.has(n));
    }"""
    for attempt in range(8):
        if not errors:
            try:
                page.wait_for_function(ready, arg=DISTRICTS, polling=750, timeout=30000)
                if not errors:
                    return
            except PlaywrightTimeout:
                pass
        snapshot = page.evaluate(observe, DISTRICTS)
        print(f"District check {attempt + 1}: {snapshot}", flush=True)
        if errors or attempt == 7:
            diagnostics.mkdir(parents=True, exist_ok=True)
            (diagnostics / "district-load.json").write_text(json.dumps(snapshot, indent=2) + "\n")
            raise RuntimeError(f"Scene missing {snapshot['missing']}. Browser errors: {errors[:4]}")


def capture(browser, base, shard, shards, diagnostics, survey_sites=(), build_dir=ROOT / "dist"):
    errors = []
    context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    try:
        page = context.new_page()
        def record_error(message):
            errors.append(message)
            diagnostics.mkdir(parents=True, exist_ok=True)
            (diagnostics / "browser-errors.json").write_text(json.dumps(errors, indent=2) + "\n")
            print(f"Browser error: {message}", flush=True)

        def console_message(message):
            if message.type == "error" and "Failed to load resource" not in message.text:
                # React error boundaries can absorb an exception before pageerror.
                record_error(message.text[:1200])

        page.on("console", console_message)
        page.on("pageerror", lambda error: record_error(str(error)))
        page.on("crash", lambda _: record_error("Renderer process crashed"))

        def response(r):
            path = urlsplit(r.url).path
            if r.status >= 400 and path.startswith(("/_astro/", "/assets/world/")):
                record_error(f"{r.status} {path}")

        def request_failed(request):
            path = urlsplit(request.url).path
            if path.startswith(("/_astro/", "/assets/world/")):
                record_error(f"Resource request failed: {request.failure} {path}")

        page.on("requestfailed", request_failed)
        page.on("response", response)
        entry = page.goto(urljoin(base, "/world/?quality=balanced&siteReview=1&qa=1"),
                          wait_until="domcontentloaded", timeout=60000)
        if not entry or not entry.ok:
            raise RuntimeError("World entry did not return success")
        # Tie capture to the actual HTML and hashed assets of this checkout's build.
        html = entry.body()
        if html != (build_dir / "world/index.html").read_bytes():
            raise RuntimeError("The preview is serving a different build from the specified build directory")
        page.wait_for_function("window.__worldDebug?.state().ready", polling=350, timeout=150000)
        select = page.wait_for_function(
            """document.querySelector('select[aria-label="现场接缝复核机位"]:enabled')""",
            polling=350, timeout=150000).as_element()
        # Freeze the review world before waiting. Otherwise each software-rendered
        # gameplay frame competes with independently suspended React districts.
        # All captured pairs begin with noon, so this also works for the camp shard.
        select.evaluate("""el => {
            el.value = 'site-camp-night';
            el.dispatchEvent(new Event('change', {bubbles: true}));
        }""")
        print("World ready; waiting for district meshes", flush=True)
        wait_for_districts(page, errors, diagnostics)
        if page.evaluate("window.__worldDebug.sceneObjects().includes('alpha-shallows-eight-rune-crossing')"):
            raise RuntimeError("Retired rune bridge mounted on the ordinary Alpha coastal path")
        print("District meshes mounted", flush=True)
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
            day_camera, day, day_coverage = shoot(page, select, group["day"], diagnostics)
            if site in survey_sites:
                # Snapshot before moving the camera so LOD slots and the render list
                # describe the same noon frame as the manifest. This is opt-in.
                survey = page.evaluate("window.__worldDebug.reviewCollisionSources()")
                survey.update({"shot": group["day"], "camera": day_camera,
                               "entrySha256": hashlib.sha256(html).hexdigest()})
                dest = diagnostics.parent / "sources"
                dest.mkdir(parents=True, exist_ok=True)
                with gzip.open(dest / (site + ".json.gz"), "wt", encoding="utf-8") as stream:
                    json.dump(survey, stream, separators=(",", ":"))
            night_camera, night, night_coverage = shoot(page, select, group["night"], diagnostics)
            if day_camera != night_camera:
                raise RuntimeError(f"Camera/projection/exposure mismatch at {site}: {day_camera} vs {night_camera}")
            change = ImageStat.Stat(ImageChops.difference(day, night)).mean
            if max(change) < 2:
                raise RuntimeError(f"Day and night pixels nearly identical at {site}")
            records[site] = {"camera": day_camera, "meanAbsoluteRgbDifference": change,
                             "collisionCoverage": {"day": day_coverage, "night": night_coverage}}
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
    except Exception as error:
        diagnostics.mkdir(parents=True, exist_ok=True)
        (diagnostics / "capture-error.txt").write_text(str(error) + "\n")
        raise
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
    parser.add_argument("--build-dir", type=Path, default=ROOT / "dist",
                        help="Verify the served HTML against this specific build")
    parser.add_argument("--base", default="http://127.0.0.1:4343")
    parser.add_argument("--out", type=Path, default=ROOT / "local/world-atlas")
    parser.add_argument("--cdp", help="Attach to an existing automation-enabled Chromium browser")
    parser.add_argument("--channel", help="Installed Chrome channel if launching a task-owned browser")
    parser.add_argument("--shard", type=int, default=0, help="Zero-based index of the row group to render")
    parser.add_argument("--shards", type=int, default=1)
    parser.add_argument("--survey-site", choices=sorted(REQUIRED_SITES), action="append", default=[],
                        help="Also export all resident meshes, GPU instance poses and physical shapes at this noon camera")
    parser.add_argument("--assemble", type=Path, help="Assemble downloaded row groups without a browser")
    args = parser.parse_args()
    if args.assemble:
        atlas, manifest = assemble(args.assemble)
    else:
        with sync_playwright() as p:
            browser = (p.chromium.connect_over_cdp(args.cdp) if args.cdp
                       else p.chromium.launch(channel=args.channel, headless=True))
            try:
                atlas, manifest = capture(browser, args.base, args.shard, args.shards, args.out / "diagnostics", args.survey_site, args.build_dir)
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

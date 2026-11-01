#!/usr/bin/env python3
"""Map v4 proposal generator (research/plan stage only; does not touch src/).

Writes layout-v4.json, checks-v4.json and zones-v4.svg into docs/world/quality-v3/map-v4/.
World convention follows src/components/world/layout.ts: +X east, -Z north, metres.
Run from the repo root:  python3 docs/world/quality-v3/map-v4/tools/gen_layout_v4.py
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

# ---------------------------------------------------------------- frozen inputs (layout.ts @ 84e4d54)
CAMP = (-42.0, 30.0)
CAMP_RIM_MAX = 26.4      # WorldLandform.campRadius never exceeds 24 + 2.4
CAMP_FOOT = 11.0         # 4.8 -> 1.0 m at the 19 deg grass flank
CAMP_NEED = CAMP_RIM_MAX + CAMP_FOOT
OLD_OUTLINE = [(-70, 20), (-65, -20), (-48, -47), (-15, -57), (16, -55), (29, -46), (31, -30), (28, -10),
               (23, 10), (12, 32), (-4, 52), (-35, 59), (-57, 49)]
OLD_ROAD = [(-30, 34), (-18, 34), (-5, 29), (6, 24), (16, 9), (22, -10), (26, -30), (26, -42), (43, -44), (49, -46)]
BOARDWALK = [(49, -46), (64, -40), (69, -22), (56, -7)]
BOOTHS = [(59, -49), (72, -40), (77, -28), (73, -16), (61, -20), (50, -12)]

# ---------------------------------------------------------------- v4 proposal
# Convex base polygon: WorldLandform.coastFrame assumes convexity; bays/headlands come from its
# along-shore noise (topPush, beachWidth). Concave inlets would need a Landform change.
OUTLINE = [(-99, 30), (-98, -12), (-91, -46), (-72, -76), (-50, -100), (-26, -108), (-2, -102), (16, -86),
           (27.4, -58), (29, -46), (31, -30), (33, -8), (34, 12), (32, 30), (25, 52), (8, 72), (-14, 82),
           (-38, 86), (-64, 80), (-85, 66), (-96, 48)]
RIDGE = {"center": (-30.0, -82.0), "summit_r": 6.0, "base_r": 22.0, "summit_y": 8.0}
G = 1.14  # road surface on the flat

def ridge_y(x, z):
    r = math.dist((x, z), RIDGE["center"])
    if r <= RIDGE["summit_r"]:
        return RIDGE["summit_y"]
    if r >= RIDGE["base_r"]:
        return G
    return G + (RIDGE["summit_y"] - G) * (RIDGE["base_r"] - r) / (RIDGE["base_r"] - RIDGE["summit_r"])

def spiral_trail():
    """Hill road: north foot (-30,-54) -> straight to the ridge foot -> one-turn spiral; height follows arclength."""
    cx, cz = RIDGE["center"]
    pts = [(-30, G, -54), (-30, G, -60)]
    a0 = math.atan2(-60 - cz, -30 - cx)          # +90 deg: the side facing the ring road
    turns, n = 1.0, 16
    ring = []
    for i in range(1, n + 1):
        t = i / n
        a = a0 + 2 * math.pi * turns * t          # counter-clockwise in x/z
        r = RIDGE["base_r"] + (RIDGE["summit_r"] + 0.5 - RIDGE["base_r"]) * t
        ring.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    legs = [math.dist((pts[-1][0], pts[-1][2]), ring[0])] + [math.dist(ring[i], ring[i + 1]) for i in range(n - 1)]
    total, run = sum(legs), 0.0
    for (x, z), L in zip(ring, legs):
        run += L
        pts.append((round(x, 2), round(G + (RIDGE["summit_y"] - G) * run / total, 2), round(z, 2)))
    return pts

CLASSES = {
    # width = carriageway; side = paved extra per side (sidewalk/shoulder); lamp = spacing per side (m)
    "coastal":   {"width": 9.0, "side": 1.0, "lamp": 24.0, "lamp_sides": 1, "color": "#E6DCCB", "label": "环岛海岸路"},
    "avenue":    {"width": 8.0, "side": 2.0, "lamp": 14.0, "lamp_sides": 2, "color": "#F3EBDD", "label": "时间轴大道"},
    "collector": {"width": 8.0, "side": 1.5, "lamp": 18.0, "lamp_sides": 1, "color": "#D9D2C2", "label": "连接路"},
    "local":     {"width": 6.0, "side": 1.5, "lamp": 16.0, "lamp_sides": 1, "color": "#CFC6B4", "label": "街巷"},
    "bridge":    {"width": 8.0, "side": 1.2, "lamp": 9.0, "lamp_sides": 2, "color": "#E6DCCB", "label": "桥/桥头"},
    "dirt":      {"width": 4.5, "side": 0.5, "lamp": 0.0, "lamp_sides": 0, "color": "#B08A5E", "label": "土路/山路"},
    "foot":      {"width": 3.0, "side": 0.0, "lamp": 16.0, "lamp_sides": 1, "color": "#C9A978", "label": "海滨步道"},
    "boardwalk": {"width": 5.5, "side": 0.0, "lamp": 0.0, "lamp_sides": 0, "color": "#8E6E55", "label": "栈道(不动)"},
}
ROADS = [
    # The timeline route keeps the frozen camp exit, ramp and bridge; only the town part moves.
    {"id": "camp-ramp", "cls": "collector", "pts": [(-30, 4.84, 34), (-18, 4.84, 34), (-5, G, 29)], "frozen": True},
    {"id": "camp-road", "cls": "collector", "pts": [(-5, G, 29), (12, G, 29.6), (21, G, 30)]},
    {"id": "avenue", "cls": "avenue", "pts": [(21, G, 30), (21, G, -12), (21, G, -43), (21, G, -54)]},
    {"id": "bridge-link", "cls": "bridge", "pts": [(21, G, -43), (26, G, -42)]},
    {"id": "bridge", "cls": "bridge", "pts": [(26, G, -42), (43, G, -44)], "frozen": True},
    {"id": "park-spur", "cls": "collector", "pts": [(43, G, -44), (49, G, -46)], "frozen": True},
    {"id": "ring-north", "cls": "coastal", "pts": [(21, G, -54), (-4, G, -54), (-30, G, -54), (-56, G, -54), (-76, G, -40), (-86, G, -27)]},
    {"id": "ring-west", "cls": "coastal", "pts": [(-86, G, -27), (-86, G, 30), (-81, G, 54)]},
    {"id": "ring-south", "cls": "coastal", "pts": [(-81, G, 54), (-62, G, 72), (-42, G, 76), (-20, G, 75), (-2, G, 68), (13, G, 52), (21, G, 30)]},
    {"id": "year-street", "cls": "local", "pts": [(21, G, -12), (-4, G, -12)]},
    {"id": "west-road", "cls": "collector", "pts": [(-4, G, -12), (-30, G, -27), (-86, G, -27)]},
    {"id": "back-street", "cls": "local", "pts": [(-4, G, -54), (-4, G, -12), (-4, G, 4)]},
    {"id": "ridge-trail", "cls": "dirt", "pts": spiral_trail()},
    {"id": "beach-walk", "cls": "foot", "pts": [(-66, 1.0, 84), (-40, 1.0, 89), (-14, 1.0, 86), (6, 1.0, 76)]},
    {"id": "boardwalk", "cls": "boardwalk", "pts": [(x, G, z) for x, z in BOARDWALK], "frozen": True},
]
JUNCTIONS = [
    {"id": "J1", "p": (21, 30), "kind": "4-way signal", "note": "营地路×大道起点×环岛南段；进城门户"},
    {"id": "J2", "p": (21, -12), "kind": "T signal", "note": "中段：金融三栋（国投/WQ/MoE）→ AI 评测三栋（字节/VR/混元）"},
    {"id": "J3", "p": (21, -43), "kind": "T signal", "note": "桥头，混元楼正对"},
    {"id": "J8", "p": (21, -54), "kind": "T stop", "note": "大道北端接环岛北段"},
    {"id": "J4", "p": (-4, -54), "kind": "T stop", "note": "后街北口"},
    {"id": "J5", "p": (-30, -54), "kind": "T stop", "note": "北丘山路口"},
    {"id": "J6", "p": (-4, -12), "kind": "4-way stop", "note": "后街×年份街×西向连接路"},
    {"id": "J7", "p": (-86, -27), "kind": "T stop", "note": "西岸路口"},
]
# Six experience buildings keep their current sizes. East face at x=11.5, so the year pillar,
# which WorldYears/WorldExperienceSummary place at east face + 5 m, lands on the avenue curb.
B_SIZES = [("sdic", 9, 8, 8, "2025.05"), ("worldquant", 9, 12, 8, "2025.08"), ("moe", 10, 5, 8, "2025.11"),
           ("aime", 9, 10, 8, "2025.12"), ("video-rebirth", 8, 11, 8, "2026.02"), ("hunyuan", 10, 15, 8, "2026.09")]
B_Z = [18.5, 7.5, -2.5, -21.5, -32.5, -43.0]
BUILDINGS = [{"id": i, "position": (11.5 - w / 2, 1, z), "size": (w, h, d), "start": s}
             for (i, w, h, d, s), z in zip(B_SIZES, B_Z)]
MASSING = [  # non-interactive greybox volumes: x, z, w, d, h, district
    (-13.5, -42, 8, 8, 6.0, "old-town"), (-30.5, -42, 7, 8, 4.0, "old-town"), (-14, -33, 9, 7, 4.5, "old-town"),
    (-13, -2, 7, 7, 4.0, "old-town"),
    (-68, -15, 6, 6, 3.0, "west-shore"), (-76, -14, 5, 5, 2.6, "west-shore"), (-74, -5, 6, 5, 3.4, "west-shore"),
    (-46, 85.5, 3, 3, 2.6, "south-beach"), (-14, 82, 3, 3, 2.6, "south-beach"),
]
FOUNDATIONS = [  # second-phase plots keep their sizes
    {"id": "film", "position": (8, 1.05, -68), "size": (15, 0.2, 12), "moved_from": (-17, 1.05, -42)},
    {"id": "community", "position": (-54, 1.05, -13), "size": (14, 0.2, 12), "moved_from": None},
    {"id": "contact", "position": (-10, 1.05, 43), "size": (13, 0.2, 10), "moved_from": None},
]
PLAZAS = [  # open ground: x, z, w, d, kind
    (-21.5, -42, 7, 8, "pocket-park"), (-4, 9.5, 8, 9, "car-park"),
]
VEHICLES = [
    {"id": "offroad", "position": (-26, 4.84, 34), "yaw": "0", "note": "不变"},
    {"id": "coupe", "position": (26.2, G, 2), "yaw": "PI/2（沿大道）", "note": "从 (19.8, 12) 移到大道海侧港湾停车位（人行道内凹 25–27.5）"},
    {"id": "van", "position": (46, G, -45), "yaw": "0", "note": "不变"},
]
RELOCATIONS = {  # existing objects whose current position conflicts with v4 (greybox props only)
    "trees": [{"from": (-51, 1, -26), "to": (-51, 1, -33), "why": "on west-road"},
              {"from": (-36, 1, -32), "to": (-36, 1, -35.5), "why": "west-road edge"}],
    "roadblocks": [{"from": (10, 1.64, 20), "to": (16, 1.64, 26), "why": "inside the SDIC footprint; moved to the J1 approach curb"}],
    "kept": {"roadblocks": [(-3, 1.64, 28), (24, 1.64, -18), (45, 1.64, -39)],
             "note": "(24,-18) now lies in the avenue's northbound lane, so dynamic-roadblock.mjs keeps its geometry"},
}
LANDMARKS = [
    {"id": "L1", "p": RIDGE["center"], "tier": "全岛", "what": "北丘顶风车+观景台（G29 已有参考图）", "top_y": 18},
    {"id": "L2", "p": (6.5, -43), "tier": "城区", "what": "混元楼顶发光环，大道往北的对景", "top_y": 16},
    {"id": "L3", "p": CAMP, "tier": "营地", "what": "篝火+旗杆（现状）", "top_y": 11},
    {"id": "L4", "p": (-28, 88), "tier": "南滩", "what": "救生瞭望塔", "top_y": 6},
    {"id": "L5", "p": (46, -45), "tier": "园区", "what": "园区总牌/传送门 G28", "top_y": 6},
]
DISTRICTS = [  # schematic polygons for the zone map only (not collision data)
    {"id": "downtown", "label": "时间轴城区", "fill": "#B9AE9C", "poly": [(0, 25), (31, 25), (31, -50), (0, -50)]},
    {"id": "old-town", "label": "老城后街", "fill": "#A99F8C", "poly": [(-1, 6), (-1, -50), (-36, -50), (-36, -31), (-24, -24), (-17, 4)]},
    {"id": "west-shore", "label": "西岸", "fill": "#8C9A4E", "poly": [(-82, 44), (-82, -32), (-62, -32), (-62, 0), (-76, 22)]},
    {"id": "south-beach", "label": "南滩", "fill": "#E3D3B4", "poly": [(-70, 80), (-40, 86), (-14, 84), (8, 71), (-2, 72), (-30, 81), (-60, 78)]},
    {"id": "harbour", "label": "项目园区", "fill": "#4E647D", "poly": [(42, -52), (80, -48), (82, -10), (46, -6)]},
]

# ---------------------------------------------------------------- geometry helpers
def xz(p):
    return (p[0], p[2]) if len(p) == 3 else (p[0], p[1])

def seg_dist(p, a, b):
    (ax, az), (bx, bz) = xz(a), xz(b)
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
    return math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz)

def poly_dist(p, poly):
    return min(seg_dist(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))

def inside(p, poly):
    c = False
    for i in range(len(poly)):
        (x1, z1), (x2, z2) = poly[i], poly[(i + 1) % len(poly)]
        if (z1 > p[1]) != (z2 > p[1]) and p[0] < (x2 - x1) * (p[1] - z1) / (z2 - z1) + x1:
            c = not c
    return c

def signed_in(p, poly):
    return poly_dist(p, poly) if inside(p, poly) else -poly_dist(p, poly)

def convex(poly):
    signs = set()
    for i in range(len(poly)):
        a, b, c = poly[i], poly[(i + 1) % len(poly)], poly[(i + 2) % len(poly)]
        signs.add((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0)
    return len(signs) == 1

def area(poly):
    n = len(poly)
    return abs(sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))) / 2

def perimeter(poly):
    return sum(math.dist(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))

def samples(pts, step=1.0):
    out, s = [], 0.0
    for i in range(len(pts) - 1):
        a, b = xz(pts[i]), xz(pts[i + 1])
        L = math.dist(a, b)
        n = max(1, int(L / step))
        for k in range(n):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, s + L * t))
        s += L
    out.append((*xz(pts[-1]), s))
    return out

def length(pts):
    return sum(math.dist(xz(pts[i]), xz(pts[i + 1])) for i in range(len(pts) - 1))

def half(road):
    c = CLASSES[road["cls"]]
    return c["width"] / 2 + c["side"]

def rect_corners(x, z, w, d):
    return [(x - w / 2, z - d / 2), (x + w / 2, z - d / 2), (x + w / 2, z + d / 2), (x - w / 2, z + d / 2)]

def rect_road_clearance(x, z, w, d, road):
    best = 1e9
    for sx, sz, _ in samples(road["pts"], 0.5):
        dx = max(x - w / 2 - sx, 0, sx - (x + w / 2))
        dz = max(z - d / 2 - sz, 0, sz - (z + d / 2))
        best = min(best, math.hypot(dx, dz) - half(road))
    return best

def rect_overlap(a, b):
    return not (a[0] + a[2] / 2 <= b[0] - b[2] / 2 or b[0] + b[2] / 2 <= a[0] - a[2] / 2 or
                a[1] + a[3] / 2 <= b[1] - b[3] / 2 or b[1] + b[3] / 2 <= a[1] - a[3] / 2)

# ---------------------------------------------------------------- checks
checks = []
def check(name, ok, value, limit):
    checks.append({"name": name, "pass": bool(ok), "value": value, "limit": limit})

check("v4 base outline is convex (WorldLandform.coastFrame assumption)", convex(OUTLINE), convex(OUTLINE), "true")
missing = [p for p in OLD_OUTLINE if not (inside(p, OUTLINE) or poly_dist(p, OUTLINE) < .01)]
check("v4 outline contains every old outline vertex (pure expansion)", not missing, missing, "[]")

sea_exempt = {"bridge", "park-spur", "boardwalk", "bridge-link", "beach-walk"}
rows = []
for r in ROADS:
    if r["id"] in sea_exempt:
        continue
    m = min(signed_in((sx, sz), OUTLINE) for sx, sz, _ in samples(r["pts"])) - half(r) - 0.5
    rows.append({"road": r["id"], "margin_m": round(m, 2)})
check("land roads keep paved edge >= 0.5 m inside the base outline (topPush adds 0.3-3.4 m of top; beach lies outside)", all(x["margin_m"] >= 0 for x in rows), rows, ">= 0")

rows = []
for r in ROADS:
    if r["id"] in ("camp-ramp", "camp-road"):
        continue
    m = min(math.dist((sx, sz), CAMP) for sx, sz, _ in samples(r["pts"])) - half(r) - CAMP_NEED
    rows.append({"road": r["id"], "margin_m": round(m, 2)})
check("new roads clear the camp plateau rim + 19 deg flank foot (37.4 m)", all(x["margin_m"] >= 0 for x in rows), rows, ">= 0")

rows = []
for r in ROADS:
    if r["id"] == "ridge-trail":
        continue
    m = min(math.dist((sx, sz), RIDGE["center"]) for sx, sz, _ in samples(r["pts"])) - half(r) - RIDGE["base_r"]
    rows.append({"road": r["id"], "margin_m": round(m, 2)})
check("roads other than the hill trail clear the ridge foot", all(x["margin_m"] >= 0 for x in rows), rows, ">= 0")
flank = math.degrees(math.atan((RIDGE["summit_y"] - G) / (RIDGE["base_r"] - RIDGE["summit_r"])))
check("ridge flank slope <= 25 deg (walkable surface)", flank <= 25, round(flank, 1), "<= 25")
rm = signed_in((RIDGE["center"][0], RIDGE["center"][1] - RIDGE["base_r"]), OUTLINE)
check("ridge foot stays inside the base outline (north face meets the beach)", rm >= 0, round(rm, 2), ">= 0")
tr = next(r for r in ROADS if r["id"] == "ridge-trail")["pts"]
grades = [round(100 * abs(tr[i + 1][1] - tr[i][1]) / max(.01, math.dist(xz(tr[i]), xz(tr[i + 1]))), 1) for i in range(len(tr) - 1)]
check("hill trail grade per leg <= 14 % (the frozen camp ramp is about 27 %)", max(grades) <= 14, grades, "<= 14")
ramp = [xz(p) for p in ROADS[0]["pts"]]
check("timeline route keeps the frozen camp exit + ramp points", ramp == OLD_ROAD[:3], ramp, str(OLD_ROAD[:3]))

UNCHANGED_RECTS = {"foundation-contact", "foundation-community"}
rects = [("building-" + b["id"], b["position"][0], b["position"][2], b["size"][0], b["size"][2]) for b in BUILDINGS]
rects += [(f"massing-{i}-{m[5]}", m[0], m[1], m[2], m[3]) for i, m in enumerate(MASSING)]
rects += [("foundation-" + f["id"], f["position"][0], f["position"][2], f["size"][0], f["size"][2]) for f in FOUNDATIONS]
rects += [("plaza-" + p[4], p[0], p[1], p[2], p[3]) for p in PLAZAS]
rows = []
for name, x, z, w, d in rects:
    if name in UNCHANGED_RECTS:
        continue  # existing placement beside the frozen ramp/plateau, not a v4 decision
    roads = [r for r in ROADS if r["cls"] != "foot" and not (name == "plaza-car-park" and r["id"] == "back-street")]
    rows.append({"rect": name, "road_clearance_m": round(min(rect_road_clearance(x, z, w, d, r) for r in roads), 2)})
check("volumes/plots keep >= 0.8 m from paved edges (car park = back street dead end; unchanged plots exempt)", all(x["road_clearance_m"] >= .8 for x in rows), rows, ">= 0.8")
rows = []
for name, x, z, w, d in rects:
    cs = rect_corners(x, z, w, d) + [(x, z)]
    rows.append({"rect": name, "outline_margin_m": round(min(signed_in(p, OUTLINE) for p in cs), 2),
                 "camp_margin_m": round(min(math.dist(p, CAMP) for p in cs) - CAMP_NEED, 2),
                 "ridge_margin_m": round(min(math.dist(p, RIDGE["center"]) for p in cs) - RIDGE["base_r"], 2)})
ok = all(r["outline_margin_m"] >= -3.5 and (r["camp_margin_m"] >= 0 or r["rect"] in UNCHANGED_RECTS) and r["ridge_margin_m"] >= 0 for r in rows)
check("volumes on land (beach kiosks may sit <= 3.5 m onto the sand), off camp flank (unchanged plots exempt) and ridge", ok, rows, "outline >= -3.5, camp >= 0, ridge >= 0")
over = [(a[0], b[0]) for i, a in enumerate(rects) for b in rects[i + 1:] if rect_overlap(a[1:], b[1:])]
check("no two volumes/plots overlap", not over, over, "[]")
def bridge_shore_x(poly):
    """x where the bridge centreline (26,-42)->(43,-44) leaves the outline polygon."""
    x = 26.0
    while x < 43 and inside((x, -42 - 2 * (x - 26) / 17), poly):
        x += .05
    return round(x, 2)
bo, bn = bridge_shore_x(OLD_OUTLINE), bridge_shore_x(OUTLINE)
check("bridge open-water span not shortened (outline exit x within +0.5 m of today)", bn <= bo + .5, {"old_x": bo, "v4_x": bn}, "v4 <= old + 0.5")
zs = [b["position"][2] for b in BUILDINGS]
check("buildings ordered by start date south -> north (z strictly decreasing)", all(zs[i] > zs[i + 1] for i in range(5)), zs, "strictly decreasing")
pillars = [b["position"][0] + b["size"][0] / 2 + 5 for b in BUILDINGS]
check("year pillar (east face + 5 m) on the west curb, 0.3-1.5 m from carriageway edge x=17", all(15.5 <= p <= 16.7 for p in pillars), pillars, "15.5..16.7")
van, coupe = VEHICLES[2]["position"], VEHICLES[1]["position"]
check("coupe lay-by in the sea-side sidewalk (x 25-27.5), car body clear of the carriageway", 25.95 <= coupe[0] <= 26.55 and signed_in((coupe[0] + 1, coupe[2]), OUTLINE) > 1, coupe, "x 25.95..26.55 (1.9 m car)")

# ---------------------------------------------------------------- furniture and densities
def near_junction(p, r=7.0):
    return any(math.dist(p, j["p"]) < r for j in JUNCTIONS)

F = {k: 0 for k in ["street_lamp", "traffic_signal_pole", "stop_sign", "street_name_sign", "direction_sign", "crosswalk",
                    "guardrail_m", "delineator", "chevron_sign", "bollard", "bench", "bin", "hydrant", "parking_bay",
                    "bus_shelter", "trail_post", "fence_m"]}
per_road = []
for r in ROADS:
    c, L = CLASSES[r["cls"]], length(r["pts"])
    lamps = 0
    if c["lamp"] and r["id"] != "bridge":   # the frozen bridge keeps its own rail/lamp set
        S = samples(r["pts"], .5)
        for side in range(c["lamp_sides"]):
            s = 4 + c["lamp"] / 2 * side       # second side staggered by half a bay
            while s < L - 2:
                p = next((q[:2] for q in S if q[2] >= s), None)
                if p and not near_junction(p):
                    lamps += 1
                s += c["lamp"]
    F["street_lamp"] += lamps
    js = [j["id"] for j in JUNCTIONS if any(seg_dist(j["p"], r["pts"][i], r["pts"][i + 1]) < .5 for i in range(len(r["pts"]) - 1))]
    per_road.append({"road": r["id"], "class": r["cls"], "length_m": round(L, 1), "lamps": lamps,
                     "lamps_per_100m": round(100 * lamps / L, 1), "junctions": js, "junctions_per_100m": round(100 * len(js) / L, 1)})
    bends = max(0, len(r["pts"]) - 2)
    if r["cls"] == "coastal":
        F["delineator"] += int(L / 10); F["guardrail_m"] += round(.35 * L); F["chevron_sign"] += 2 * bends
    if r["cls"] == "dirt":
        F["trail_post"] += int(L / 8); F["guardrail_m"] += round(.5 * L); F["chevron_sign"] += 4
    if r["cls"] == "avenue":
        F["hydrant"] += int(L / 30); F["bench"] += int(L / 25); F["bin"] += int(L / 25); F["parking_bay"] += int(L * .45 / 6)
    if r["cls"] == "local":
        F["bin"] += int(L / 30); F["fence_m"] += round(.3 * L)
    if r["cls"] == "foot":
        F["bench"] += int(L / 18); F["bin"] += int(L / 30)
for j in JUNCTIONS:
    four = j["kind"].startswith("4")
    if "signal" in j["kind"]:
        F["traffic_signal_pole"] += 4 if four else 3; F["crosswalk"] += 4 if four else 3
    else:
        F["stop_sign"] += 4 if four else 1
    F["street_name_sign"] += 1
F["direction_sign"] = 6      # camp exit, J1 x2, J3, J5, J7
F["bollard"] = 6 * 6         # six forecourts
F["bus_shelter"] = 1         # avenue sea side near J2, decor only (no NPC)
F["bench"] += 6 + 4; F["bin"] += 6 + 2
F["parking_bay"] += 8        # car park at the back street's dead end

def cls_len(*cls):
    return sum(length(r["pts"]) for r in ROADS if r["cls"] in cls)

avenue = next(x for x in per_road if x["road"] == "avenue")
coast = cls_len("coastal")
density = {
    "downtown_avenue": {"length_m": avenue["length_m"], "lamps_per_100m": avenue["lamps_per_100m"],
                        "junctions_per_100m": avenue["junctions_per_100m"],
                        "frontage_buildings_per_100m": round(600 / avenue["length_m"], 1),
                        "incl_second_row_per_100m": round(100 * (6 + 4) / avenue["length_m"], 1)},
    "old_town_local": {"length_m": round(cls_len("local"), 1),
                       "lamps_per_100m": round(100 * sum(x["lamps"] for x in per_road if x["class"] == "local") / cls_len("local"), 1),
                       "junctions_per_100m": round(100 * 4 / cls_len("local"), 1)},
    "coastal_ring": {"length_m": round(coast, 1),
                     "lamps_per_100m": round(100 * sum(x["lamps"] for x in per_road if x["class"] == "coastal") / coast, 1),
                     "junctions_per_100m": round(100 * 4 / coast, 1), "buildings_per_100m": round(100 * 5 / coast, 1)},
    "hill_trail": {"length_m": round(cls_len("dirt"), 1), "lamps_per_100m": 0, "trail_posts_per_100m": 12.5},
}
loop = coast + avenue["length_m"]
route_ids = ("camp-ramp", "camp-road")
route_v4 = sum(length(next(r for r in ROADS if r["id"] == i)["pts"]) for i in route_ids) + length([(21, 0, 30), (21, 0, -43)]) \
    + sum(length(next(r for r in ROADS if r["id"] == i)["pts"]) for i in ("bridge-link", "bridge", "park-spur"))
summary = {
    "outline": {"old_area_m2": area(OLD_OUTLINE), "v4_area_m2": area(OUTLINE), "area_ratio": round(area(OUTLINE) / area(OLD_OUTLINE), 2),
                "old_perimeter_m": round(perimeter(OLD_OUTLINE), 1), "v4_perimeter_m": round(perimeter(OUTLINE), 1),
                "old_bbox": [-70, -57, 31, 59], "v4_bbox": [min(p[0] for p in OUTLINE), min(p[1] for p in OUTLINE), max(p[0] for p in OUTLINE), max(p[1] for p in OUTLINE)]},
    "road_length_m": {"old_drivable": round(length([(x, 0, z) for x, z in OLD_ROAD]), 1),
                      "v4_drivable": round(cls_len("coastal", "avenue", "collector", "local", "bridge", "dirt"), 1),
                      "v4_main_loop": round(loop, 1), "by_class": {k: round(cls_len(k), 1) for k in CLASSES}},
    "loop_seconds": {"offroad_top_22mps": round(loop / 22, 1), "coupe_top_29mps": round(loop / 29, 1), "cruise_12mps": round(loop / 12, 1)},
    "timeline_route_m": {"old": round(length([(x, 0, z) for x, z in OLD_ROAD]), 1), "v4": round(route_v4, 1)},
    "timeline_route_points": [(-30, 4.84, 34), (-18, 4.84, 34), (-5, G, 29), (12, G, 29.6), (21, G, 30), (21, G, -43), (26, G, -42), (43, G, -44), (49, G, -46)],
    "density": density, "per_road": per_road, "furniture": F, "ridge_flank_deg": round(flank, 1), "trail_grades_pct": grades,
}
layout = {
    "convention": "+X east, +Y up, -Z north, metres (layout.ts)", "status": "PROPOSAL ONLY - not wired into src/; needs Astra approval",
    "outline": OUTLINE, "ridge": RIDGE, "classes": CLASSES, "roads": ROADS, "junctions": JUNCTIONS, "buildings": BUILDINGS,
    "massing": MASSING, "foundations": FOUNDATIONS, "plazas": PLAZAS, "vehicles": VEHICLES, "relocations": RELOCATIONS, "landmarks": LANDMARKS, "districts": DISTRICTS,
    "unchanged": {"camp_center": [-42, 4.8, 30], "camp_spawn": [-42, 5.85, 35], "boardwalk": BOARDWALK, "booths": BOOTHS,
                  "bridge": [[26, 1.14, -42], [43, 1.14, -44]], "offroad": [-26, 4.84, 34], "van": [46, 1.14, -45]},
}

# ---------------------------------------------------------------- SVG zone map
def svg():
    W, H, PAD = 1100, 1300, 40
    minx, minz, maxx, maxz = -112, -122, 90, 102
    k = min((W - 2 * PAD) / (maxx - minx), (H - 2 * PAD - 230) / (maxz - minz))
    X = lambda x: PAD + (x - minx) * k
    Z = lambda z: 92 + (z - minz) * k
    P = lambda pts: " ".join(f"{X(xz(p)[0]):.1f},{Z(xz(p)[1]):.1f}" for p in pts)
    halo = 'stroke="#10272B" stroke-width="3.5" paint-order="stroke"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="PingFang SC, Hiragino Sans GB, Helvetica, sans-serif">',
         f'<defs><pattern id="grid" width="{10 * k:.2f}" height="{10 * k:.2f}" patternUnits="userSpaceOnUse" x="{X(0):.2f}" y="{Z(0):.2f}">'
         f'<path d="M {10 * k:.2f} 0 L 0 0 0 {10 * k:.2f}" fill="none" stroke="#3F8A8E" stroke-width=".6"/></pattern>'
         '<radialGradient id="sea" cx="42%" cy="45%" r="75%"><stop offset="0" stop-color="#246A6E"/><stop offset="1" stop-color="#143A40"/></radialGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#sea)"/><rect width="{W}" height="{H}" fill="url(#grid)" opacity=".4"/>',
         f'<text x="{PAD}" y="44" font-size="26" fill="#F3EBDD" font-weight="700">Bobby 岛 · 布局 v4 提案：分区、道路层级与灰盒体块</text>',
         f'<text x="{PAD}" y="72" font-size="14" fill="#CFE3DF">提案未接入代码，待 Astra 审批。网格 10 m；上为北（−Z），右为东（+X）。白虚线：现状海岸。红虚线：现状主路。</text>']
    o.append(f'<polygon points="{P(OUTLINE)}" fill="#E3D3B4" stroke="#E3D3B4" stroke-width="{16 * k:.1f}" stroke-linejoin="round"/>')
    o.append(f'<polygon points="{P(OUTLINE)}" fill="#7E8C3E"/>')
    for d in DISTRICTS:
        o.append(f'<polygon points="{P(d["poly"])}" fill="{d["fill"]}" opacity=".7"/>')
    cx, cz = RIDGE["center"]
    for r, col in [(RIDGE["base_r"], "#6F7F3A"), (14, "#64732F"), (RIDGE["summit_r"], "#56632A")]:
        o.append(f'<circle cx="{X(cx):.1f}" cy="{Z(cz):.1f}" r="{r * k:.1f}" fill="{col}" stroke="#3F4A20" stroke-width="1"/>')
    o.append(f'<circle cx="{X(CAMP[0]):.1f}" cy="{Z(CAMP[1]):.1f}" r="{CAMP_NEED * k:.1f}" fill="#A7B05A" opacity=".6"/>')
    o.append(f'<circle cx="{X(CAMP[0]):.1f}" cy="{Z(CAMP[1]):.1f}" r="{25 * k:.1f}" fill="#C9A978" stroke="#E8803A" stroke-width="3"/>')
    for p in PLAZAS:
        col = {"pocket-park": "#94A84F", "car-park": "#8D8A84"}[p[4]]
        o.append(f'<rect x="{X(p[0] - p[2] / 2):.1f}" y="{Z(p[1] - p[3] / 2):.1f}" width="{p[2] * k:.1f}" height="{p[3] * k:.1f}" fill="{col}" stroke="#F3EBDD" stroke-width=".8"/>')
    for f in FOUNDATIONS:
        (x, _, z), (w, _, d) = f["position"], f["size"]
        o.append(f'<rect x="{X(x - w / 2):.1f}" y="{Z(z - d / 2):.1f}" width="{w * k:.1f}" height="{d * k:.1f}" fill="#A39B89" stroke="#E8803A" stroke-dasharray="4 3" stroke-width="1.5"/>')
    for cls in ["coastal", "avenue", "collector", "bridge", "local", "dirt", "foot", "boardwalk"]:
        for r in (r for r in ROADS if r["cls"] == cls):
            c = CLASSES[cls]
            w = (c["width"] + 2 * c["side"]) * k
            dash = ' stroke-dasharray="7 4"' if cls == "dirt" else ' stroke-dasharray="3 3"' if cls == "foot" else ""
            if cls not in ("foot", "dirt", "boardwalk"):
                o.append(f'<polyline points="{P(r["pts"])}" fill="none" stroke="#3B3A38" stroke-width="{w + 3:.1f}" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>')
            o.append(f'<polyline points="{P(r["pts"])}" fill="none" stroke="{c["color"]}" stroke-width="{w:.1f}" stroke-linejoin="round" stroke-linecap="round"{dash}/>')
    for b in BOOTHS:
        o.append(f'<rect x="{X(b[0] - 3):.1f}" y="{Z(b[1] - 3):.1f}" width="{6 * k:.1f}" height="{6 * k:.1f}" fill="#4E647D" stroke="#4FD1C5" stroke-width="1.2"/>')
    for m in MASSING:
        g = int(150 + 12 * m[4])
        o.append(f'<rect x="{X(m[0] - m[2] / 2):.1f}" y="{Z(m[1] - m[3] / 2):.1f}" width="{m[2] * k:.1f}" height="{m[3] * k:.1f}" fill="rgb({g},{g - 8},{g - 22})" stroke="#4A453C" stroke-width="1"/>')
    colors = ["#E6DCCB", "#7E97B0", "#B0896B", "#DCE3EE", "#B56E5A", "#33465C"]
    for i, b in enumerate(BUILDINGS):
        (x, _, z), (w, h, d) = b["position"], b["size"]
        o.append(f'<rect x="{X(x - w / 2):.1f}" y="{Z(z - d / 2):.1f}" width="{w * k:.1f}" height="{d * k:.1f}" fill="{colors[i]}" stroke="#1E2A33" stroke-width="1.6"/>')
        o.append(f'<text x="{X(x):.1f}" y="{Z(z) + 5:.1f}" font-size="13" text-anchor="middle" fill="{"#F3EBDD" if i == 5 else "#1E2A33"}" font-weight="700">{i + 1}</text>')
        o.append(f'<circle cx="{X(x + w / 2 + 5):.1f}" cy="{Z(z):.1f}" r="3" fill="#4FD1C5" stroke="#10272B"/>')
    for j in JUNCTIONS:
        sig = "signal" in j["kind"]
        o.append(f'<circle cx="{X(j["p"][0]):.1f}" cy="{Z(j["p"][1]):.1f}" r="{7 if sig else 5}" fill="{"#E8803A" if sig else "#F3EBDD"}" stroke="#1E2A33" stroke-width="1.5"/>')
        o.append(f'<text x="{X(j["p"][0]) - 22:.1f}" y="{Z(j["p"][1]) - 8:.1f}" font-size="12" fill="#FFF" font-weight="700" {halo}>{j["id"]}</text>')
    for l in LANDMARKS:
        x, z = l["p"]
        o.append(f'<path d="M {X(x):.1f} {Z(z) - 13:.1f} l 8 14 h -16 z" fill="#F2C14E" stroke="#1E2A33" stroke-width="1.5"/>')
        o.append(f'<text x="{X(x) + 10:.1f}" y="{Z(z) + 14:.1f}" font-size="12" fill="#F2C14E" font-weight="700" {halo}>{l["id"]}</text>')
    for v in VEHICLES:
        x, _, z = v["position"]
        o.append(f'<rect x="{X(x) - 6:.1f}" y="{Z(z) - 4:.1f}" width="12" height="8" rx="2" fill="#E8803A" stroke="#FFF" stroke-width="1.2"/>')
    o.append(f'<polygon points="{P(OLD_OUTLINE)}" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-dasharray="5 5" opacity=".75"/>')
    o.append(f'<polyline points="{P(OLD_ROAD)}" fill="none" stroke="#FF5A5A" stroke-width="1.8" stroke-dasharray="5 4" opacity=".9"/>')
    for t, x, z in [("营地高地（不动）", -62, 20), ("北丘·风车观景台", -52, -110), ("时间轴城区", 24, 24), ("老城后街", -33, -16),
                    ("西岸", -80, 18), ("南滩", -36, 96), ("项目园区（不动）", 46, -2), ("二期·影像", -3, -77),
                    ("二期·社团", -66, -21), ("二期·联系", -24, 53), ("环岛海岸路", -104, -2)]:
        o.append(f'<text x="{X(x):.1f}" y="{Z(z):.1f}" font-size="15" fill="#FFFFFF" font-weight="700" {halo}>{t}</text>')
    ly = H - 190
    o.append(f'<rect x="{PAD - 10}" y="{ly - 26}" width="{W - 2 * PAD + 20}" height="180" rx="10" fill="#10272B" opacity=".88"/>')
    items = [("coastal", "环岛海岸路 9 m + 路肩"), ("avenue", "时间轴大道 8 m + 2 m 人行道"), ("collector", "连接路 8 m"),
             ("local", "街巷 6 m"), ("dirt", "山路/土路 4.5 m"), ("foot", "海滨步道 3 m")]
    for i, (cls, t) in enumerate(items):
        x0, y0 = PAD + (i % 3) * 345, ly + (i // 3) * 30
        c = CLASSES[cls]
        dash = ' stroke-dasharray="7 4"' if cls == "dirt" else ' stroke-dasharray="3 3"' if cls == "foot" else ""
        o.append(f'<line x1="{x0}" y1="{y0}" x2="{x0 + 46}" y2="{y0}" stroke="{c["color"]}" stroke-width="{min(14, (c["width"] + 2 * c["side"]) * 1.2):.1f}"{dash}/>')
        o.append(f'<text x="{x0 + 56}" y="{y0 + 5}" font-size="14" fill="#F3EBDD">{t}</text>')
    y2 = ly + 66
    leg = [(f'<circle cx="{PAD + 8}" cy="{y2}" r="7" fill="#E8803A"/>', PAD + 22, "信号灯路口"),
           (f'<circle cx="{PAD + 146}" cy="{y2}" r="5" fill="#F3EBDD"/>', PAD + 158, "停车让行路口"),
           (f'<path d="M {PAD + 296} {y2 - 9} l 8 14 h -16 z" fill="#F2C14E"/>', PAD + 310, "地标 L1–L5"),
           (f'<rect x="{PAD + 420}" y="{y2 - 5}" width="12" height="8" fill="#E8803A"/>', PAD + 438, "三辆车"),
           (f'<circle cx="{PAD + 516}" cy="{y2}" r="3" fill="#4FD1C5"/>', PAD + 526, "年份灯柱"),
           (f'<rect x="{PAD + 616}" y="{y2 - 6}" width="16" height="12" fill="#A39B89" stroke="#E8803A" stroke-dasharray="4 3"/>', PAD + 640, "二期地基"),
           (f'<rect x="{PAD + 736}" y="{y2 - 6}" width="16" height="12" fill="rgb(196,188,174)" stroke="#4A453C"/>', PAD + 760, "非交互体块")]
    for shape, tx, t in leg:
        o.append(shape + f'<text x="{tx}" y="{y2 + 5}" font-size="14" fill="#F3EBDD">{t}</text>')
    o.append(f'<text x="{PAD}" y="{y2 + 36}" font-size="14" fill="#F3EBDD">经历楼南→北：1 国投证券 25.05 · 2 WorldQuant 25.08 · 3 MoE 25.11 · 4 字节 AIME 25.12 · 5 Video Rebirth 26.02 · 6 腾讯混元 26.09</text>')
    o.append(f'<text x="{PAD}" y="{y2 + 62}" font-size="13" fill="#CFE3DF">营地外圈浅绿环 = 高台 19° 草坡坡脚范围（37.4 m）；北丘三圈 = 坡脚 / 半山 / 山顶平台。沙滩带为示意宽度，实际由 WorldLandform 生成。</text>')
    o.append("</svg>")
    return "\n".join(o)

with open(os.path.join(OUT, "layout-v4.json"), "w") as f:
    json.dump(layout, f, ensure_ascii=False, indent=1)
with open(os.path.join(OUT, "checks-v4.json"), "w") as f:
    json.dump({"summary": summary, "checks": checks}, f, ensure_ascii=False, indent=1)
with open(os.path.join(OUT, "zones-v4.svg"), "w") as f:
    f.write(svg())
failed = [c for c in checks if not c["pass"]]
print(json.dumps({"failed": failed, "outline": summary["outline"], "roads": summary["road_length_m"], "loop_s": summary["loop_seconds"],
                  "route": summary["timeline_route_m"], "density": density, "furniture": F, "grades": grades}, ensure_ascii=False, indent=1))

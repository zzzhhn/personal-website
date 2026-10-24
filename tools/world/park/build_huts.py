"""P06-P11 park huts: one shared structure, two width variants (A 5.2 m, B 6.0 m) in hut.glb.

Run: tools/blender-run.sh park tools/world/park/build_huts.py [--render]
Blender: Z up, front (open side, faces the boardwalk) = -Y -> glTF +Z. Origin: hut floor top (walk
datum) at x = 0, 0.6 m behind the front opening line. Nodes per root:
  shell  walls, posts, lintel, battens, windows, roof, rafters (fixed trimesh collision)
  piles  joists, bearers, piles, braces (fixed trimesh collision)
  floor  floor planks (visual; collision = surfaceBox plate, support top + solid sides)
  lamp   pendant shade, cord, bulb (visual only)
  glow   3 cm cyan strip under the lintel (visual only, Art Lock booth border)
"""
import sys, os, math, random, json
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/park'))
from parklib import *  # noqa

VARIANTS = {'A': 5.2, 'B': 6.0}
Y0, Y1 = -0.6, 3.25            # front opening line, back outer face
D = Y1 - Y0
H_FRONT, H_BACK = 3.15, 2.80   # roof underside at the front / back wall
LINTEL = (2.62, 2.84)

def h(y):
    return H_FRONT + (H_BACK - H_FRONT) * (y - Y0) / D

def slope_prism(y0, y1, x0, x1, z0, top_off=0.0, mat=None):
    """Wall piece from z0 up to the roof underside (+top_off) between y0..y1, extruded x0..x1."""
    return prism([(y0, z0), (y1, z0), (y1, h(y1) + top_off), (y0, h(y0) + top_off)], x0, x1, 'X')

def build(variant, W):
    rnd = random.Random(7 if variant == 'A' else 11)
    hw = W / 2
    shell, piles, floor, lamp, glow = (Part(f'shell_{variant}'), Part(f'piles_{variant}'), Part(f'floor_{variant}'), Part(f'lamp_{variant}', smooth=True), Part(f'glow_{variant}'))
    SL, CR, LW, MW, DW = 'park_slate_paint', 'park_cream_paint', 'park_wood_light', 'park_wood_mid', 'park_wood_dark'
    # ---------------- floor: planks parallel to the front, three wood tones, chamfered tops
    y = Y0
    tones = ['park_wood_deck', 'park_wood_light', 'park_wood_mid', 'park_wood_deck']
    while y < Y1 - 0.01:
        y2 = min(Y1, y + 0.24)
        floor.add(box((-hw, y + 0.004, -0.05), (hw, y2 - 0.004, rnd.uniform(-0.003, 0.0)), inset=0.008), rnd.choice(tones))
        y = y2 + 0.012
    # ---------------- substructure
    for x in (-hw + 0.12, 0.0, hw - 0.12):
        piles.add(box((x - 0.05, Y0 + 0.02, -0.23), (x + 0.05, Y1 - 0.02, -0.05)), DW)
    rows = (Y0 + 0.25, (Y0 + Y1) / 2, Y1 - 0.25)
    for yy in rows:
        piles.add(box((-hw - 0.05, yy - 0.08, -0.41), (hw + 0.05, yy + 0.08, -0.23), bevel=0.01), MW)
        for x in (-hw + 0.12, 0.0, hw - 0.12):
            piles.add(strut((x, yy, -3.0), (x, yy, -0.41), 0.13, 0.12, 8, rot=math.pi / 8), MW)
    for x in (-hw + 0.12, hw - 0.12):  # X braces on both side pile lines
        for a, b in ((rows[0], rows[1]), (rows[1], rows[2])):
            piles.add(strut((x, a, -0.55), (x, b, -1.55), 0.045, 0.045, 6), DW)
            piles.add(strut((x, a, -1.55), (x, b, -0.55), 0.045, 0.045, 6), DW)
    # ---------------- posts (front opening + back corners)
    for sx in (-1, 1):
        x = sx * (hw - 0.08)
        shell.add(box((x - 0.08, Y0, 0.0), (x + 0.08, Y0 + 0.16, h(Y0) + 0.02), bevel=0.012), LW)
        shell.add(box((x - 0.08, Y1 - 0.16, 0.0), (x + 0.08, Y1, h(Y1) + 0.02), bevel=0.012), LW)
    # ---------------- side walls with a window each (outer slate 6 cm, inner cream 4 cm)
    WY, WZ = (0.72, 1.98), (1.05, 1.95)
    for sx in (-1, 1):
        def xr(a, b):  # x range measured inward from the outer face
            xs = sorted((sx * (hw - a), sx * (hw - b)))
            return xs
        for (a, b), mat in (((0.0, 0.06), SL), ((0.06, 0.10), CR)):
            x0, x1 = xr(a, b)
            ya, yb = Y0 + 0.16, Y1 - 0.16
            shell.add(prism([(ya, 0.0), (yb, 0.0), (yb, WZ[0]), (ya, WZ[0])], x0, x1, 'X'), mat)
            shell.add(slope_prism(ya, yb, x0, x1, WZ[1]), mat)
            shell.add(prism([(ya, WZ[0]), (WY[0], WZ[0]), (WY[0], WZ[1]), (ya, WZ[1])], x0, x1, 'X'), mat)
            shell.add(prism([(WY[1], WZ[0]), (yb, WZ[0]), (yb, WZ[1]), (WY[1], WZ[1])], x0, x1, 'X'), mat)
        # board-and-batten on the outer face, interrupted by the window
        bx0, bx1 = xr(-0.025, 0.0)
        yb = Y0 + 0.42
        while yb < Y1 - 0.3:
            spans = [(0.14, h(yb + 0.03) - 0.03)]
            if WY[0] - 0.12 < yb < WY[1] + 0.06:
                spans = [(0.14, WZ[0] - 0.08), (WZ[1] + 0.08, h(yb + 0.03) - 0.03)]
            for z0, z1 in spans:
                shell.add(box((bx0, yb - 0.03, z0), (bx1, yb + 0.03, z1)), SL)
            yb += 0.42
        # window: frame, cross bars, sill, frosted pane
        fx0, fx1 = xr(-0.035, 0.11)
        F = 0.07
        shell.add(box((fx0, WY[0] - F, WZ[0] - F), (fx1, WY[0], WZ[1] + F), bevel=0.006), LW)
        shell.add(box((fx0, WY[1], WZ[0] - F), (fx1, WY[1] + F, WZ[1] + F), bevel=0.006), LW)
        shell.add(box((fx0, WY[0], WZ[1]), (fx1, WY[1], WZ[1] + F), bevel=0.006), LW)
        shell.add(box((fx0, WY[0], WZ[0] - 0.02), (fx1, WY[1], WZ[0]), bevel=0.004), LW)
        mx0, mx1 = xr(0.02, 0.07)
        ym, zm = (WY[0] + WY[1]) / 2, (WZ[0] + WZ[1]) / 2
        shell.add(box((mx0, ym - 0.018, WZ[0]), (mx1, ym + 0.018, WZ[1])), LW)
        shell.add(box((mx0, WY[0], zm - 0.018), (mx1, WY[1], zm + 0.018)), LW)
        sx0, sx1 = xr(-0.09, 0.13)
        shell.add(box((sx0, WY[0] - 0.12, WZ[0] - F - 0.05), (sx1, WY[1] + 0.12, WZ[0] - F), bevel=0.008), LW)
        gx0, gx1 = xr(0.035, 0.055)
        shell.add(box((gx0, WY[0], WZ[0]), (gx1, WY[1], WZ[1])), 'park_glass_frosted')
        # exterior base trim and interior skirting
        tx0, tx1 = xr(-0.035, 0.0)
        shell.add(box((tx0, Y0 + 0.16, 0.0), (tx1, Y1 - 0.16, 0.14), bevel=0.006), DW)
        kx0, kx1 = xr(0.10, 0.12)
        shell.add(box((kx0, Y0 + 0.16, 0.0), (kx1, Y1 - 0.12, 0.1)), LW)
    # ---------------- back wall
    xa, xb = -hw + 0.16, hw - 0.16
    shell.add(box((xa, Y1 - 0.06, 0.0), (xb, Y1, h(Y1))), SL)
    shell.add(box((xa, Y1 - 0.10, 0.0), (xb, Y1 - 0.06, h(Y1))), CR)
    shell.add(box((-hw, Y1, 0.0), (hw, Y1 + 0.035, 0.14), bevel=0.006), DW)
    shell.add(box((xa, Y1 - 0.12, 0.0), (xb, Y1 - 0.10, 0.1)), LW)
    xb_ = -hw + 0.42
    while xb_ < hw - 0.3:
        shell.add(box((xb_ - 0.03, Y1, 0.14), (xb_ + 0.03, Y1 + 0.025, h(Y1) - 0.03)), SL)
        xb_ += 0.42
    # ---------------- front: lintel, header panel, cyan strip
    la = hw - 0.16
    shell.add(box((-la, Y0, LINTEL[0]), (la, Y0 + 0.16, LINTEL[1]), bevel=0.012), LW)
    shell.add(slope_prism(Y0 + 0.02, Y0 + 0.08, -la, la, LINTEL[1]), SL)
    shell.add(slope_prism(Y0 + 0.08, Y0 + 0.12, -la, la, LINTEL[1]), CR)
    glow.add(box((-la + 0.08, Y0 + 0.012, LINTEL[0] - 0.03), (la - 0.08, Y0 + 0.032, LINTEL[0])), 'park_cyan_glow')
    # ---------------- roof: slab with overhang, fascia, rafters
    ry0, ry1, rx = Y0 - 0.55, Y1 + 0.22, hw + 0.25
    shell.add(prism([(ry0, h(ry0)), (ry1, h(ry1)), (ry1, h(ry1) + 0.12), (ry0, h(ry0) + 0.12)], -rx, rx, 'X'), 'park_roof_slate')
    shell.add(box((-rx - 0.04, ry0 - 0.045, h(ry0) - 0.07), (rx + 0.04, ry0, h(ry0) + 0.15), bevel=0.008), LW)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * rx, sx * (rx + 0.04)))
        shell.add(prism([(ry0, h(ry0) - 0.07), (ry1, h(ry1) - 0.07), (ry1, h(ry1) + 0.15), (ry0, h(ry0) + 0.15)], x0, x1, 'X'), LW)
    shell.add(box((-rx - 0.04, ry1, h(ry1) - 0.07), (rx + 0.04, ry1 + 0.04, h(ry1) + 0.15), bevel=0.008), LW)
    # standing seams on the roof (read from the default high camera)
    sx_ = -rx + 0.3
    while sx_ < rx - 0.1:
        shell.add(prism([(ry0 + 0.02, h(ry0 + 0.02) + 0.115), (ry1 - 0.02, h(ry1 - 0.02) + 0.115), (ry1 - 0.02, h(ry1 - 0.02) + 0.155), (ry0 + 0.02, h(ry0 + 0.02) + 0.155)], sx_ - 0.018, sx_ + 0.018, 'X'), 'park_roof_slate')
        sx_ += 0.55
    n = max(5, round((W - 0.6) / 0.8) + 1)
    if n % 2 == 0:
        n += 1
    xs = [-(hw - 0.32) + i * (2 * (hw - 0.32)) / (n - 1) for i in range(n)]
    for x in xs:
        ya, yb = ry0 + 0.06, Y1 - 0.12
        shell.add(prism([(ya, h(ya) - 0.13), (yb, h(yb) - 0.13), (yb, h(yb) + 0.01), (ya, h(ya) + 0.01)], x - 0.04, x + 0.04, 'X'), LW)
    # ---------------- pendant lamp over the exhibit zone (hangs from the centre rafter)
    ly = 1.25
    top = h(ly) - 0.13
    lamp.add(strut((0, ly, 2.27), (0, ly, top + 0.01), 0.008, 0.008, 6), 'park_iron_matte', smooth=False)
    lamp.add(lathe([(0, 0.24), (0.045, 0.24), (0.06, 0.2), (0.24, 0.0), (0.225, -0.005), (0.05, 0.18), (0, 0.19)], 16, center=(0, ly, 2.06)), 'park_brass_matte')
    lamp.add(sphere((0, ly, 2.07), 0.065, 12, 7), 'park_bulb_warm')
    root = make_root(f'hut_{variant}', {
        'assetFamily': 'park-hut', 'variant': variant, 'widthM': W, 'front': '+Z (glTF)', 'up': '+Y (glTF)',
        'origin': 'floor top at x=0, 0.6 m behind the opening line',
        'openingZ': -Y0, 'backInnerZ': -(Y1 - 0.12), 'interiorHalfWidth': hw - 0.12,
        'lampLocalGLB': [0, 2.06, -ly],
        'surfaceBoxes': [[[-hw, -0.25, -Y1], [hw, 0.0, -Y0]]],
        'solidNodes': ['shell', 'piles'],
        'generator': 'park-huts-r1',
    })
    objs = [make_object(p, root) for p in (shell, piles, floor, lamp, glow)]
    return root, objs

if __name__ == '__main__':
    reset_scene()
    roots, all_objs, report = [], [], {}
    for i, (v, W) in enumerate(VARIANTS.items()):
        root, objs = build(v, W)
        roots.append(root); all_objs += objs
        report[v] = inspect(objs)
    blend, glb = export('hut', roots)
    rb = readback(glb)
    out = {'asset': 'hut (P06-P11)', 'variants': VARIANTS, 'evaluated': {k: {'triangles': r['triangles'], 'bounds_min': r['bounds_min'], 'bounds_max': r['bounds_max'], 'problems': r['problems'], 'objects': [(o['name'], o['triangles'], o['shells']) for o in r['objects']]} for k, r in report.items()},
           'glbReadback': {'triangles': rb['triangles'], 'nodes': rb['nodes'], 'materials': rb['materials'], 'problems': rb['problems'], 'bounds_min': rb['bounds_min'], 'bounds_max': rb['bounds_max']},
           'glbBytes': os.path.getsize(glb)}
    write_json(os.path.join(REPO, 'docs/world/park/qa-hut.json'), out)
    print(json.dumps({k: v for k, v in out.items() if k != 'glbReadback'}, indent=0)[:3000])
    print('readback tris', rb['triangles'], 'problems', len(rb['problems']), 'bytes', out['glbBytes'])
    if '--render' in ARGS:
        # Render the readback import (variant B only, shifted apart for framing), dusk + night
        objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        for o in bpy.context.scene.objects:
            if o.parent is None and o.name.startswith('hut_A'):
                o.location.x -= 4.5
            if o.parent is None and o.name.startswith('hut_B'):
                o.location.x += 3.2
        bpy.context.view_layer.update()
        os.makedirs(os.path.join(EVIDENCE, 'hut'), exist_ok=True)
        pre = os.path.join(EVIDENCE, 'hut', 'hut')
        render_views(objs, pre, views=('34_front', 'front', '34_back', 'side'), res=1000)
        render_views(objs, pre, views=('34_front',), res=1000, night=True)

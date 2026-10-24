"""Camp-content L1 assets. Run: tools/blender-run.sh camp tools/world/camp-content/build_assets.py [C11 C12 ...]

Blender Z-up, front +X (toward the fire), width along Y. See docs/world/camp-content/DESIGN.md for
budgets, pad assignment and collision classes. Text never lives in the mesh: label plates are blank
and their GLB-local rectangles are written to root extras for the runtime bilingual Canvas.
"""
import math, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector, Matrix
from cc_lib import Part, box, strut, lathe, torus, sphere, prism, xform, finalize, export, to_glb, run


def ybar(y0, y1, z0, z1, x0, x1, bevel=0.0):
    return box((x0, y0, z0), (x1, y1, z1), bevel=bevel)


def plate_yz(cy, cz, w, h, x0, t, rot=0.0, bevel=0.0):
    """Flat plate in the YZ plane (facing +X), centred at (cy, cz), rotated about X."""
    bm = box((0, -w / 2, -h / 2), (t, w / 2, h / 2), bevel=bevel)
    return xform(bm, rot=('X', rot), loc=(x0, cy, cz))


def bar_yz(p0, p1, w, x0, t, bevel=0.004):
    """Flat bar facing +X between two (y, z) points (round-ish ends via bevel)."""
    (y0, z0), (y1, z1) = p0, p1
    L = math.hypot(y1 - y0, z1 - z0) + w
    bm = box((0, -L / 2, -w / 2), (t, L / 2, w / 2), bevel=bevel)
    return xform(bm, rot=('X', math.atan2(z1 - z0, y1 - y0)), loc=(x0, (y0 + y1) / 2, (z0 + z1) / 2))


# ------------------------------------------------------------------ C11 tool wall
def build_C11():
    body, tools = Part('C11_body'), Part('C11_tools')
    W, POST = 0.95, 0.04              # posts at y = +-W, half thickness
    BX = 0.0                          # board back plane; board front at BX + 0.03
    BF = BX + 0.03
    Z0, Z1 = 0.30, 1.86               # board span
    # posts, skids, rear braces (A-frame so the wall stands on its own)
    for s in (-1, 1):
        y = s * W
        body.add(box((-POST - 0.005, y - POST, 0.0), (POST - 0.005, y + POST, 2.0), bevel=0.008), 'wood_mid')
        body.add(box((-0.48, y - 0.045, 0.0), (0.16, y + 0.045, 0.075), bevel=0.01), 'wood_dark')
        body.add(strut((-0.03, y, 1.45), (-0.43, y, 0.06), 0.032, 0.032, 4, bevel=0.004, rot=math.pi / 4), 'wood_mid')
        # brass bolt heads where the brace meets the post (both faces)
        for side in (-1, 1):
            body.add(strut((-0.02, y + side * POST, 1.38), (-0.02, y + side * (POST + 0.012), 1.38), 0.016, 0.014, 8), 'brass')
    body.add(ybar(-W, W, 0.22, 0.30, BX - 0.035, BX, bevel=0.006), 'wood_mid')          # bottom rail
    body.add(ybar(-W, W, 1.86, 1.94, BX - 0.035, BX + 0.035, bevel=0.008), 'wood_mid')  # cap beam
    # gable roof boards along the wall, overhanging the posts
    for s in (-1, 1):
        x0, x1 = (0.0, 0.25) if s > 0 else (-0.25, 0.0)
        bm = box((x0, -1.02, -0.02), (x1, 1.02, 0.02), bevel=0.008)
        body.add(xform(bm, rot=('Y', s * math.radians(27)), loc=(0.0, 0.0, 2.075)), 'wood_dark')
    body.add(strut((0, -1.03, 2.08), (0, 1.03, 2.08), 0.022, 0.022, 8), 'wood_mid')     # ridge pole
    # five panels of two planks each, separated by dark battens
    inner = 2 * (W - POST)
    bat = 0.035
    pw = (inner - 4 * bat) / 5
    centres = []
    y = -(W - POST)
    for i in range(5):
        y0, y1 = y, y + pw
        centres.append((y0 + y1) / 2)
        mid = (y0 + y1) / 2
        body.add(box((BX, y0 + 0.002, Z0), (BF, mid - 0.003, Z1), bevel=0.005), 'wood_light')
        body.add(box((BX, mid + 0.003, Z0), (BF - 0.002, y1 - 0.002, Z1), bevel=0.005), 'wood_light')
        y = y1
        if i < 4:
            body.add(box((BX - 0.01, y, Z0 - 0.02), (BF + 0.018, y + bat, Z1 + 0.02), bevel=0.006), 'wood_dark')
            y += bat
    # backing cross rails (visible from behind) keep the planks plausible
    for z in (0.55, 1.25, 1.7):
        body.add(ybar(-W + POST, W - POST, z, z + 0.07, BX - 0.03, BX, bevel=0.005), 'wood_mid')
    # ledge with a lip, a paint tin and a brush jar
    body.add(ybar(-W + POST, W - POST, 0.44, 0.47, BF, BF + 0.17, bevel=0.006), 'wood_mid')
    body.add(ybar(-W + POST, W - POST, 0.47, 0.50, BF + 0.15, BF + 0.17, bevel=0.004), 'wood_mid')
    for s in (-1, 1):  # ledge brackets
        body.add(box((BF, s * 0.62 - 0.012, 0.36), (BF + 0.13, s * 0.62 + 0.012, 0.44), bevel=0.004), 'wood_dark')
    tin = lathe([(0, 0), (0.05, 0), (0.05, 0.085), (0.046, 0.09), (0.0, 0.09)], 12, center=(BF + 0.08, -0.36, 0.47))
    body.add(tin, 'canvas_slate')
    jar = lathe([(0, 0), (0.035, 0), (0.038, 0.07), (0.0, 0.07)], 10, center=(BF + 0.08, 0.40, 0.47))
    body.add(jar, 'stone_top')
    for dy, lean in ((-0.012, 0.18), (0.012, -0.15)):
        body.add(strut((BF + 0.08, 0.40 + dy, 0.49), (BF + 0.08 + lean * 0.3, 0.40 + dy + lean * 0.25, 0.66), 0.007, 0.007, 6), 'wood_mid')
    # label plates (blank; runtime draws the bilingual category name)
    labels = []
    for i, cy in enumerate(centres):
        lw, lh, lz = pw - 0.04, 0.17, 1.70
        body.add(plate_yz(cy, lz, lw, lh, BF + 0.003, 0.012, bevel=0.003), 'paper')
        for s in (-1, 1):  # two brass pins
            body.add(strut((BF + 0.012, cy + s * (lw / 2 - 0.025), lz), (BF + 0.024, cy + s * (lw / 2 - 0.025), lz), 0.008, 0.007, 8), 'brass')
        labels.append({'centre': (BF + 0.0155, cy, lz), 'w': lw - 0.07, 'h': lh - 0.03})
    IZ = 1.36  # icon centre
    t = 0.022   # cut-out thickness, proud of the board
    # 0 Programming: </>
    c = centres[0]
    for s_ in (-1, 1):
        tip = (c + s_ * 0.13, IZ)
        for d in (-1, 1):
            body.add(bar_yz(tip, (c + s_ * 0.06, IZ + d * 0.085), 0.032, BF, t), 'canvas_slate')
    body.add(bar_yz((c - 0.035, IZ - 0.11), (c + 0.035, IZ + 0.11), 0.03, BF, t), 'canvas_orange')
    # 1 Office: clipboard with a sheet and a brass clip
    c = centres[1]
    body.add(plate_yz(c, IZ - 0.01, 0.23, 0.31, BF, 0.016, bevel=0.006), 'wood_mid')
    body.add(plate_yz(c, IZ - 0.03, 0.18, 0.23, BF + 0.016, 0.004), 'paper')
    for k in range(3):
        body.add(plate_yz(c - 0.015, IZ + 0.03 - k * 0.055, 0.12, 0.012, BF + 0.0195, 0.002), 'canvas_slate')
    body.add(box((BF + 0.016, c - 0.055, IZ + 0.11), (BF + 0.036, c + 0.055, IZ + 0.155), bevel=0.006), 'brass')
    # 2 AI & Agent: four-point spark with two small sparks
    c = centres[2]
    def spark(cy, cz, r, rin):
        """Four-point star in the YZ plane, extruded along +X (front face at BF + t)."""
        bm = bmesh.new()
        ring = []
        for k in range(8):
            a = math.pi / 2 + k * math.pi / 4
            rr = r if k % 2 == 0 else rin
            ring.append((cy + math.cos(a) * rr, cz + math.sin(a) * rr))
        back = [bm.verts.new((BF, y, z)) for y, z in ring]
        front = [bm.verts.new((BF + t, y, z)) for y, z in ring]
        cb, cf = bm.verts.new((BF, cy, cz)), bm.verts.new((BF + t * 1.6, cy, cz))  # domed centre
        for i in range(8):
            j = (i + 1) % 8
            bm.faces.new((back[j], back[i], cb))
            bm.faces.new((front[i], front[j], cf))
            bm.faces.new((back[i], back[j], front[j], front[i]))
        return bm
    body.add(spark(c - 0.015, IZ - 0.015, 0.14, 0.04), 'canvas_orange')
    body.add(spark(c + 0.11, IZ + 0.11, 0.055, 0.016), 'brass')
    body.add(spark(c - 0.12, IZ + 0.12, 0.038, 0.012), 'brass')
    # 3 Data & ML: bar chart on a baseline with a trend dot line
    c = centres[3]
    body.add(plate_yz(c, IZ - 0.14, 0.27, 0.018, BF, t, bevel=0.003), 'wood_dark')
    for k, h in enumerate((0.1, 0.17, 0.25)):
        yy = c - 0.085 + k * 0.085
        body.add(box((BF, yy - 0.03, IZ - 0.131), (BF + t, yy + 0.03, IZ - 0.131 + h), bevel=0.005), ['accent_olive', 'canvas_slate', 'canvas_orange'][k])
    # 4 Finance: three candlesticks
    c = centres[4]
    for k, (lo, hi, b0, b1, key) in enumerate(((-0.14, 0.04, -0.1, 0.0, 'canvas_orange'), (-0.06, 0.14, -0.03, 0.1, 'accent_olive'), (-0.0, 0.18, 0.04, 0.14, 'accent_olive'))):
        yy = c - 0.09 + k * 0.09
        body.add(box((BF, yy - 0.008, IZ + lo), (BF + 0.012, yy + 0.008, IZ + hi)), 'wood_dark')
        body.add(box((BF + 0.004, yy - 0.032, IZ + b0), (BF + t + 0.004, yy + 0.032, IZ + b1), bevel=0.005), key)
    # pegs + hanging tools (one node, swings about the peg line as interaction feedback)
    PZ = 1.03
    PX = BF + 0.05
    for i, cy in enumerate(centres):
        body.add(strut((BF - 0.005, cy, PZ), (PX + 0.015, cy, PZ + 0.012), 0.011, 0.011, 8), 'wood_dark')
    TX = PX - 0.012  # tool mid-plane (just in front of the board, hangs below the peg)
    # hammer: iron head at the top, handle hanging down
    c = centres[0]
    tools.add(box((TX - 0.017, c - 0.075, PZ - 0.035), (TX + 0.017, c + 0.07, PZ + 0.005), bevel=0.006), 'iron')
    tools.add(box((TX - 0.012, c - 0.105, PZ - 0.03), (TX + 0.012, c - 0.07, PZ - 0.005), top_scale=0.8, bevel=0.003), 'iron')
    tools.add(strut((TX, c + 0.0, PZ - 0.03), (TX, c, PZ - 0.36), 0.014, 0.012, 8), 'wood_mid')
    # wrench: flat bar, ring end below, open jaw above the peg
    c = centres[1]
    tools.add(box((TX - 0.005, c - 0.013, PZ - 0.25), (TX + 0.005, c + 0.013, PZ - 0.03), bevel=0.002), 'steel')
    tools.add(xform(torus((0, 0, 0), 0.026, 0.008, 12, 6, axis='X'), loc=(TX, c, PZ - 0.27)), 'steel')
    for s in (-1, 1):
        tools.add(box((TX - 0.005, c + s * 0.012 - 0.008, PZ - 0.03), (TX + 0.005, c + s * 0.012 + 0.008, PZ + 0.03), bevel=0.002), 'steel')
    # screwdriver: painted handle, steel shaft
    c = centres[2]
    sd = lathe([(0, 0), (0.018, 0.005), (0.02, 0.03), (0.017, 0.1), (0.012, 0.11), (0.0, 0.11)], 12, center=(TX, c, PZ - 0.13))
    tools.add(sd, 'canvas_orange')
    tools.add(strut((TX, c, PZ - 0.13), (TX, c, PZ - 0.32), 0.005, 0.005, 8), 'steel')
    tools.add(box((TX - 0.002, c - 0.006, PZ - 0.335), (TX + 0.002, c + 0.006, PZ - 0.315)), 'steel')
    tools.add(xform(torus((0, 0, 0), 0.014, 0.004, 10, 4, axis='X'), loc=(TX, c, PZ - 0.008)), 'iron')
    # hand saw: tapered steel blade with a wooden grip at the top
    c = centres[3]
    blade = prism([(-0.05, 0.0), (0.05, 0.0), (0.02, -0.34), (-0.035, -0.34)], -0.0035, 0.0035)
    bmesh.ops.rotate(blade, verts=blade.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.rotate(blade, verts=blade.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'))
    tools.add(xform(blade, loc=(TX, c, PZ - 0.06)), 'steel')
    grip = box((TX - 0.014, c - 0.06, PZ - 0.07), (TX + 0.014, c + 0.06, PZ + 0.02), bevel=0.01)
    tools.add(grip, 'wood_mid')
    # pliers: two crossed jaws with orange grips
    c = centres[4]
    for s in (-1, 1):
        tools.add(strut((TX, c + s * 0.012, PZ - 0.01), (TX, c - s * 0.03, PZ - 0.2), 0.008, 0.007, 6), 'steel')
        tools.add(strut((TX, c - s * 0.03, PZ - 0.19), (TX, c - s * 0.045, PZ - 0.33), 0.013, 0.011, 8), 'canvas_orange')
    tools.add(strut((TX - 0.012, c, PZ - 0.07), (TX + 0.012, c, PZ - 0.07), 0.012, 0.012, 8), 'brass')
    root, objs, shift = finalize('C11', [body, tools], pivots={'C11_tools': Vector((PX, 0.0, PZ))},
        part_extras={'C11_tools': {'role': 'feedback-swing', 'pivot': 'node origin on the peg line; rotate about local Z (glTF, wall width) toward +X only'}},
        root_extras={'collision': 'hard: fixed trimesh of C11_body + C11_tools', 'text': 'none in mesh; labelPlates carry runtime Canvas text'})
    root['labelPlatesGLB'] = json.dumps([{'centre': to_glb(l['centre'], shift), 'w': round(l['w'], 4), 'h': round(l['h'], 4), 'normal': [1, 0, 0]} for l in labels])
    root['panelCentresGLB_z'] = json.dumps([round(-(cy + shift.y), 4) for cy in centres])
    export('C11', root, objs)


# ------------------------------------------------------------------ C12 guitar on an A-frame stand
def outline_slab(outline, t, edge, x0=0.0):
    """Closed slab of a CCW (y, z) outline, thickness t along X centred on x0, with a one-step
    rounded rim (outer rings inset by `edge`), so the body edge reads soft under smooth shading."""
    n = len(outline)
    def inset(d):
        out = []
        for i in range(n):
            (ya, za), (yb, zb), (yc, zc) = outline[i - 1], outline[i], outline[(i + 1) % n]
            ny, nz = (zc - za), -(yc - ya)          # outward normal of a CCW loop
            L = math.hypot(ny, nz) or 1
            out.append((yb - ny / L * d, zb - nz / L * d))
        return out
    bm = bmesh.new()
    rings = []
    for x, d in ((x0 - t / 2, edge), (x0 - t / 2 + edge, 0.0), (x0 + t / 2 - edge, 0.0), (x0 + t / 2, edge)):
        rings.append([bm.verts.new((x, y, z)) for y, z in inset(d)])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    # caps fanned from a centre vertex (the outline is concave at the waist)
    for ring, sgn in ((rings[0], -1), (rings[-1], 1)):
        cy = sum(v.co.y for v in ring) / n
        cz = sum(v.co.z for v in ring) / n
        c = bm.verts.new((ring[0].co.x, cy, cz))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ring[i], ring[j], c) if sgn > 0 else (ring[j], ring[i], c))
    return bm


def guitar_outline(samples=22):
    """Acoustic body half-width w(z) as a smooth union of lower / upper bouts; returns CCW loop."""
    lower, upper = (0.19, 0.19), (0.145, 0.465)    # (radius, centre z)
    z0, z1 = lower[1] - lower[0], upper[1] + upper[0]
    def w(z):
        a = math.sqrt(max(0.0, lower[0] ** 2 - (z - lower[1]) ** 2))
        b = math.sqrt(max(0.0, upper[0] ** 2 - (z - upper[1]) ** 2))
        return (a ** 4 + b ** 4) ** 0.25  # p-norm union -> rounded waist
    zs = [z0 + (z1 - z0) * (0.5 - 0.5 * math.cos(math.pi * i / samples)) for i in range(samples + 1)]
    right = [(max(w(z), 0.012), z) for z in zs[1:-1]]
    return [(0.0, z0)] + right + [(0.0, z1)] + [(-y, z) for y, z in reversed(right)]


def build_C12():
    gtr, strings, stand = Part('C12_guitar'), Part('C12_strings'), Part('C12_stand')
    T = 0.10
    outline = guitar_outline()
    gtr.add(outline_slab(outline, T, 0.012), 'wood_mid', orient=True)
    # spruce top: a thin proud skin just in front of the body face (not coplanar)
    top = [(y * 0.985, 0.19 + (z - 0.19) * 0.99) for y, z in outline]
    gtr.add(outline_slab(top, 0.006, 0.002, x0=T / 2 + 0.002), 'wood_light')
    FX = T / 2 + 0.005  # front face of the top
    gtr.add(strut((FX - 0.002, 0, 0.40), (FX + 0.002, 0, 0.40), 0.047, 0.047, 20), 'rubber')          # sound hole
    gtr.add(xform(torus((0, 0, 0), 0.056, 0.005, 20, 4, axis='X'), loc=(FX, 0, 0.40)), 'wood_dark')  # rosette
    pg = [(0.045, 0.3), (0.12, 0.27), (0.13, 0.33), (0.09, 0.37), (0.05, 0.36)]
    pgm = bmesh.new()
    b = [pgm.verts.new((FX - 0.001, y, z)) for y, z in pg]
    f = [pgm.verts.new((FX + 0.002, y, z)) for y, z in pg]
    pgm.faces.new(list(reversed(b))); pgm.faces.new(f)
    for i in range(len(pg)):
        j = (i + 1) % len(pg); pgm.faces.new((b[i], b[j], f[j], f[i]))
    gtr.add(pgm, 'canvas_orange')
    gtr.add(box((FX - 0.002, -0.07, 0.155), (FX + 0.012, 0.07, 0.185), bevel=0.004), 'wood_dark')      # bridge
    gtr.add(box((FX + 0.006, -0.045, 0.176), (FX + 0.014, 0.045, 0.181)), 'paper')                     # saddle
    # neck, fretboard, frets, headstock, pegs
    NZ0, NZ1 = 0.60, 0.97
    gtr.add(box((T / 2 - 0.045, -0.026, NZ0 - 0.02), (T / 2 - 0.005, 0.026, NZ1), bevel=0.008, top_scale=0.9), 'wood_mid')
    gtr.add(box((T / 2 - 0.005, -0.027, NZ0 - 0.12), (FX + 0.006, 0.027, NZ1), bevel=0.002, top_scale=0.88), 'wood_dark')
    for k in range(7):
        z = NZ0 - 0.1 + (NZ1 - NZ0 + 0.1) * (1 - 0.82 ** (k + 1)) / (1 - 0.82 ** 7)
        w = 0.027 - 0.003 * (z - NZ0 + 0.12) / (NZ1 - NZ0 + 0.12)
        gtr.add(box((FX + 0.006, -w, z - 0.0015), (FX + 0.009, w, z + 0.0015)), 'steel')
    gtr.add(box((FX + 0.005, -0.026, NZ1 - 0.006), (FX + 0.012, 0.026, NZ1)), 'paper')                 # nut
    head = box((-0.012, -0.036, 0.0), (0.012, 0.036, 0.19), bevel=0.006, top_scale=1.0)
    xform(head, rot=('Y', math.radians(-13)), loc=(T / 2 - 0.012, 0, NZ1 - 0.005))
    gtr.add(head, 'wood_dark')
    for k in range(3):
        z = NZ1 + 0.045 + k * 0.05
        x = T / 2 - 0.012 - (z - NZ1) * math.tan(math.radians(13))
        for s in (-1, 1):
            gtr.add(strut((x, s * 0.03, z), (x, s * 0.062, z), 0.006, 0.006, 8), 'steel')
            gtr.add(box((x - 0.006, s * 0.06 - 0.004, z - 0.011), (x + 0.006, s * 0.06 + 0.012 * s * 0 + 0.004, z + 0.011), bevel=0.003), 'brass')
    gtr.add(strut((0, 0, 0.0), (-0.0, 0, -0.012), 0.008, 0.006, 8), 'brass')                            # end pin
    for i in range(6):  # strings: one node (vibration feedback)
        y0 = -0.025 + i * 0.01
        y1 = -0.019 + i * 0.0076
        r = 0.0012 + 0.00035 * (5 - i)
        strings.add(strut((FX + 0.0135, y0 * 1.6, 0.178), (FX + 0.0125, y1, NZ1 - 0.003), r, r, 6), 'steel')
    # lean the guitar back 15 deg (top toward -X) and lift it onto the cradle
    LEAN, LIFT = math.radians(-15), 0.12
    for p in (gtr, strings):
        bmesh.ops.rotate(p.bm, verts=p.bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(LEAN, 3, 'Y'))
        bmesh.ops.translate(p.bm, verts=p.bm.verts, vec=(0.0, 0, LIFT))
    # stand: cradle (rubber-padded U), two splayed front legs, a mast parallel to the guitar back with a
    # padded neck yoke (built in the guitar's pre-lean frame, then leaned with it), and a rear leg.
    CZ = LIFT - 0.012
    stand.add(strut((0.07, -0.15, CZ), (0.07, 0.15, CZ), 0.012, 0.012, 10), 'iron_dark')
    for s_ in (-1, 1):
        stand.add(strut((0.07, s_ * 0.15, CZ), (0.07, s_ * 0.15, CZ + 0.06), 0.012, 0.012, 10), 'iron_dark')
        stand.add(strut((0.07, s_ * 0.15, CZ + 0.055), (0.07, s_ * 0.15, CZ + 0.085), 0.017, 0.017, 10), 'rubber')
        stand.add(strut((0.07, s_ * 0.1, CZ), (0.17, s_ * 0.23, 0.0), 0.011, 0.011, 10), 'iron_dark')
        stand.add(sphere((0.17, s_ * 0.23, 0.012), 0.016, 10, 6), 'rubber')
    mast = Part('tmp')
    MX, MZ = -T / 2 - 0.03, 0.74                      # pre-lean frame
    mast.add(strut((MX, 0, -0.02), (MX, 0, MZ), 0.013, 0.012, 10), 'iron_dark')
    for s_ in (-1, 1):
        mast.add(strut((MX, 0, MZ), (MX + 0.02, s_ * 0.045, MZ + 0.012), 0.009, 0.009, 8), 'iron_dark')
        mast.add(strut((MX + 0.02, s_ * 0.045, MZ + 0.012), (T / 2 - 0.02, s_ * 0.045, MZ + 0.012), 0.012, 0.012, 10), 'rubber')
    rot = Matrix.Rotation(LEAN, 3, 'Y')
    bmesh.ops.rotate(mast.bm, verts=mast.bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(mast.bm, verts=mast.bm.verts, vec=(0.0, 0, LIFT))
    low = rot @ Vector((MX, 0, -0.02)) + Vector((0, 0, LIFT))
    stand.merge(mast)
    stand.add(strut((0.07, 0, CZ), (low.x, 0, low.z), 0.011, 0.011, 10), 'iron_dark')
    stand.add(strut((low.x, 0, low.z), (-0.36, 0, 0.0), 0.011, 0.011, 10), 'iron_dark')
    stand.add(sphere((-0.36, 0, 0.012), 0.016, 10, 6), 'rubber')
    root, objs, shift = finalize('C12', [gtr, strings, stand],
        part_extras={'C12_strings': {'role': 'feedback-vibrate', 'pivot': 'asset origin; scale local X about the string plane'}},
        root_extras={'collision': 'pushable: one dynamic convex hull of the whole asset (guitar falls with its stand)', 'massKg': 4.0,
                     'text': 'none'})
    export('C12', root, objs)


# ------------------------------------------------------------------ C13 hex dumbbell (runtime places two)
def build_C13():
    db = Part('C13_dumbbell')
    R, HW, HL = 0.068, 0.165, 0.075     # hex circumradius, half span to outer face, head length
    a = R * math.cos(math.pi / 6)       # apothem = head rest height of the axis
    for s in (-1, 1):
        y_out, y_in = s * HW, s * (HW - HL)
        bm = strut((0, y_in, a), (0, y_out, a), R, R, 6, bevel=0.007, rot=math.pi / 6)
        db.add(bm, 'rubber')
        # steel end cap and inner collar
        db.add(strut((0, y_out, a), (0, y_out + s * 0.004, a), 0.03, 0.026, 16), 'steel')
        db.add(strut((0, y_in - s * 0.012, a), (0, y_in + s * 0.002, a), 0.026, 0.026, 16, bevel=0.002), 'steel')
    # knurled handle: core plus four shallow rings for grip
    db.add(strut((0, -(HW - HL) + 0.010, a), (0, (HW - HL) - 0.010, a), 0.0165, 0.0165, 16), 'steel')
    for k in range(-2, 3):
        db.add(xform(torus((0, 0, 0), 0.0165, 0.0022, 16, 4, axis='Y'), loc=(0, k * 0.022, a)), 'iron')
    root, objs, shift = finalize('C13', [db], root_extras={
        'collision': 'pushable: one dynamic convex hull per instance (two instances on the north pad)',
        'massKg': 10.0, 'text': 'none'})
    export('C13', root, objs)


# ------------------------------------------------------------------ C15 hard-shell suitcase standing on wheels
def build_C15():
    case, handle = Part('C15_case'), Part('C15_handle')
    D, W, H = 0.26, 0.46, 0.62           # depth X, width Y, shell height
    Z0 = 0.06                             # shell bottom (wheels below)
    shell = box((-D / 2, -W / 2, Z0), (D / 2, W / 2, Z0 + H))
    # moulded hard shell: 3-segment round over (smooth-shaded), not a faceted chamfer
    bmesh.ops.bevel(shell, geom=list(shell.edges), offset=0.05, offset_type='OFFSET', profile_type='SUPERELLIPSE',
                    segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    case.add(shell, 'canvas_orange')
    # zip seam band around the middle (proud ring, darker canvas edge), front ribs
    case.add(box((-0.008, -W / 2 - 0.004, Z0 + 0.02), (0.008, W / 2 + 0.004, Z0 + H - 0.02), bevel=0.006), 'canvas_edge')
    for x in (-D / 2, D / 2):
        sx = 1 if x > 0 else -1
        for y in (-0.11, 0.0, 0.11):
            case.add(box((x - sx * 0.01, y - 0.018, Z0 + 0.07), (x + sx * 0.006, y + 0.018, Z0 + H - 0.07), bevel=0.008), 'canvas_orange')
    # corner guards (rubber) at the four bottom corners, 6 mm proud of the shell
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * (D / 2 - 0.05), sx * (D / 2 + 0.006)))
            ya, yb = sorted((sy * (W / 2 - 0.05), sy * (W / 2 + 0.006)))
            case.add(box((xa, ya, Z0 - 0.006), (xb, yb, Z0 + 0.065), bevel=0.012), 'rubber')
    # four spinner wheels in forks
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (D / 2 - 0.045), sy * (W / 2 - 0.05)
            case.add(box((x - 0.02, y - 0.02, Z0 - 0.022), (x + 0.02, y + 0.02, Z0 + 0.002), bevel=0.004), 'iron_dark')
            case.add(strut((x, y - 0.013, 0.029), (x, y + 0.013, 0.029), 0.029, 0.029, 14, bevel=0.004), 'rubber')
            case.add(strut((x, y - 0.015, 0.029), (x, y + 0.015, 0.029), 0.009, 0.009, 8), 'steel')
    # carry handle on the side (+Y) and telescoping handle housing on the back (-X)
    case.add(box((-0.05, W / 2 - 0.004, Z0 + H * 0.55 - 0.012), (0.05, W / 2 + 0.008, Z0 + H * 0.55 + 0.012), bevel=0.004), 'iron_dark')
    case.add(box((-0.04, W / 2 + 0.006, Z0 + H * 0.55 - 0.01), (0.04, W / 2 + 0.03, Z0 + H * 0.55 + 0.01), bevel=0.008), 'rubber')
    for y in (-0.1, 0.1):
        case.add(box((-D / 2 - 0.012, y - 0.016, Z0 + 0.06), (-D / 2 + 0.004, y + 0.016, Z0 + H - 0.02), bevel=0.005), 'iron_dark')
    # telescoping handle (extended a little): two tubes + grip, separate node for the hop feedback
    for y in (-0.1, 0.1):
        handle.add(strut((-D / 2 - 0.004, y, Z0 + H - 0.03), (-D / 2 - 0.004, y, Z0 + H + 0.16), 0.008, 0.008, 10), 'steel')
    handle.add(box((-D / 2 - 0.022, -0.12, Z0 + H + 0.15), (-D / 2 + 0.014, 0.12, Z0 + H + 0.185), bevel=0.012), 'rubber')
    # luggage tag (cream card on a slate strap) hanging from the side handle
    case.add(box((-0.004, W / 2 + 0.024, Z0 + H * 0.55 - 0.085), (0.004, W / 2 + 0.03, Z0 + H * 0.55 - 0.005)), 'canvas_slate')
    case.add(box((-0.03, W / 2 + 0.03, Z0 + H * 0.55 - 0.14), (0.03, W / 2 + 0.036, Z0 + H * 0.55 - 0.08), bevel=0.004), 'paper')
    root, objs, shift = finalize('C15', [case, handle], root_extras={
        'collision': 'pushable: dynamic convex hull of C15_case (handle excluded)', 'massKg': 12.0, 'text': 'none (tag blank)'})
    export('C15', root, objs)


# ------------------------------------------------------------------ C16 hurricane lantern (sits on the C07 desk)
def build_C16():
    frame, glass = Part('C16_frame'), Part('C16_glass')
    # base: fuel tank (lathe), burner collar; glass globe; vented top cap; wire guards; bail handle
    frame.add(lathe([(0, 0), (0.075, 0), (0.082, 0.012), (0.082, 0.05), (0.07, 0.065), (0.045, 0.072), (0.045, 0.085), (0, 0.085)], 16), 'iron_dark')
    frame.add(lathe([(0, 0.084), (0.05, 0.084), (0.052, 0.094), (0, 0.094)], 16), 'brass')
    glass.add(lathe([(0, 0.094), (0.036, 0.094), (0.058, 0.13), (0.062, 0.165), (0.05, 0.205), (0.036, 0.225), (0, 0.225)], 16), 'glass_warm')
    frame.add(lathe([(0, 0.222), (0.05, 0.222), (0.058, 0.232), (0.04, 0.255), (0.022, 0.262), (0.022, 0.275), (0.03, 0.28), (0, 0.29)], 16), 'iron_dark')
    for k in range(4):  # four wire guards from collar to cap, bowed around the globe
        a = k * math.pi / 2 + math.pi / 4
        pts = [(0.054, 0.094), (0.072, 0.13), (0.075, 0.165), (0.063, 0.205), (0.05, 0.228)]
        for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
            frame.add(strut((r0 * math.cos(a), r0 * math.sin(a), z0), (r1 * math.cos(a), r1 * math.sin(a), z1), 0.003, 0.003, 6), 'iron')
    frame.add(xform(torus((0, 0, 0), 0.074, 0.0035, 20, 4), loc=(0, 0, 0.16)), 'iron')
    # bail handle: half ring over the top, pivots on side lugs
    for s in (-1, 1):
        frame.add(strut((0, s * 0.08, 0.04), (0, s * 0.09, 0.04), 0.008, 0.008, 8), 'iron_dark')
    n = 12
    for i in range(n):
        t0, t1 = math.pi * i / n, math.pi * (i + 1) / n
        p0 = (0, 0.09 * math.cos(t0), 0.04 + 0.27 * math.sin(t0))
        p1 = (0, 0.09 * math.cos(t1), 0.04 + 0.27 * math.sin(t1))
        frame.add(strut(p0, p1, 0.003, 0.003, 6), 'iron')
    # wick knob on the burner
    frame.add(strut((0.045, 0, 0.078), (0.07, 0, 0.078), 0.004, 0.004, 6), 'brass')
    frame.add(strut((0.07, 0, 0.078), (0.076, 0, 0.078), 0.011, 0.011, 10), 'brass')
    root, objs, shift = finalize('C16', [frame, glass], root_extras={
        'collision': 'none: sits on the C07 desk top inside the desk collider footprint', 'lightCentreGLB_y': 0.16,
        'text': 'none'})
    export('C16', root, objs)


BUILDERS = {'C11': build_C11, 'C12': build_C12, 'C13': build_C13, 'C15': build_C15, 'C16': build_C16}

if __name__ == '__main__':
    run(BUILDERS)

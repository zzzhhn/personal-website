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


BUILDERS = {'C11': build_C11}

if __name__ == '__main__':
    run(BUILDERS)

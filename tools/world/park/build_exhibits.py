"""P12-P18 park exhibits. Each exhibit is one GLB with a fixed body node and named moving nodes whose
origins are their pivots. Run: tools/blender-run.sh park tools/world/park/build_exhibits.py [P12 ...] [--render]
Blender: Z up, use side (towards the hut opening / the player) = -Y -> glTF +Z. Origin: floor centre.
"""
import sys, os, math, json
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/park'))
from parklib import *  # noqa

LW, MW, DW = 'park_wood_light', 'park_wood_mid', 'park_wood_dark'
BR, IR = 'park_brass_matte', 'park_iron_matte'

def desk_frame(p, w, d, top, legs_inset=0.08, apron=0.11):
    """Shared desk body: chamfered top, tapered legs, aprons and a low stretcher."""
    hw, hd = w / 2, d / 2
    p.add(box((-hw, -hd, top - 0.05), (hw, hd, top), bevel=0.012), LW)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (hw - legs_inset), sy * (hd - legs_inset)
            p.add(box((x - 0.035, y - 0.035, 0), (x + 0.035, y + 0.035, top - 0.045), bevel=0.006, top_scale=1.25), MW)
    for sy in (-1, 1):
        y = sy * (hd - legs_inset)
        p.add(box((-hw + legs_inset, y - 0.012, top - 0.05 - apron), (hw - legs_inset, y + 0.012, top - 0.05)), MW)
    for sx in (-1, 1):
        x = sx * (hw - legs_inset)
        p.add(box((x - 0.012, -hd + legs_inset, top - 0.05 - apron), (x + 0.012, hd - legs_inset, top - 0.05)), MW)
        p.add(box((x - 0.018, -hd + legs_inset, 0.12), (x + 0.018, hd - legs_inset, 0.17)), MW)
    p.add(box((-hw + legs_inset, -0.018, 0.13), (hw - legs_inset, 0.018, 0.16)), MW)

def stool(p, x, y, seat=0.62, r=0.17):
    p.add(strut((x, y, seat - 0.05), (x, y, seat), r, r - 0.005, 12, bevel=0.01), LW, smooth=False)
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3
        top = (x + 0.09 * math.cos(a), y + 0.09 * math.sin(a), seat - 0.045)
        foot = (x + 0.15 * math.cos(a), y + 0.15 * math.sin(a), 0.0)
        p.add(strut(foot, top, 0.022, 0.018, 6), MW)
    p.add(torus((x, y, 0.24), 0.115, 0.012, 12, 4), MW)

def screen(p, cx, cy, cz, w, h, depth=0.05, frame=0.035, mat_frame=DW, yaw=0.0):
    """Monitor shell (frame + back) with a recessed screen face named separately by the caller."""
    R = rot_z(yaw, (cx, cy, cz))
    hw, hh = w / 2, h / 2
    p.add(box((cx - hw - frame, cy, cz - hh - frame), (cx + hw + frame, cy + depth, cz + hh + frame), bevel=0.008), mat_frame, xform=R)
    p.add(box((cx - hw * 0.7, cy + depth, cz - hh * 0.6), (cx + hw * 0.7, cy + depth + 0.03, cz + hh * 0.6), bevel=0.006), mat_frame, xform=R)

def face(name, cx, cy, cz, w, h, yaw=0.0):
    """Screen face: thin slab at the front of a screen shell. Its node origin is its centre, so the
    runtime can replace its material with a canvas texture (UV-less: runtime derives UVs from local x/z)."""
    part = Part(name)
    part.add(box((cx - w / 2, cy - 0.006, cz - h / 2), (cx + w / 2, cy + 0.004, cz + h / 2)), 'park_screen', xform=rot_z(yaw, (cx, cy, cz)))
    return part

EXHIBITS = {}
def exhibit(fn):
    EXHIBITS[fn.__name__.split('_')[1]] = fn
    return fn

# ------------------------------------------------------------------ P12 research desk (alpha-agent)
@exhibit
def build_P12():
    body = Part('body')
    W, D, TOP = 1.7, 0.78, 0.88
    desk_frame(body, W, D, TOP)
    # drawer pedestal on the right
    body.add(box((0.32, -D / 2 + 0.06, 0.18), (0.76, D / 2 - 0.06, TOP - 0.06), bevel=0.01), LW)
    for z0, z1 in ((0.2, 0.42), (0.45, 0.64), (0.67, TOP - 0.08)):
        body.add(box((0.35, -D / 2 + 0.035, z0), (0.73, -D / 2 + 0.06, z1), bevel=0.006), MW)
        body.add(strut((0.54, -D / 2 + 0.035, (z0 + z1) / 2), (0.54, -D / 2 - 0.0, (z0 + z1) / 2), 0.015, 0.013, 6), BR)
    # vertical monitor on an iron arm at the back of the desk
    SX, SY, SZ, SW, SH = -0.12, D / 2 - 0.2, TOP + 0.66, 0.6, 1.0
    body.add(box((SX - 0.2, SY - 0.06, TOP), (SX + 0.2, SY + 0.14, TOP + 0.03), bevel=0.008), IR)
    body.add(strut((SX, SY + 0.06, TOP + 0.03), (SX, SY + 0.06, SZ - 0.05), 0.03, 0.026, 8), IR)
    screen(body, SX, SY - 0.02, SZ, SW, SH)
    scr = face('screen', SX, SY - 0.02, SZ, SW, SH)
    # lever bank: a raised iron rail along the front edge carrying 5 levers in slots
    BANK_Y, BANK_Z = -D / 2 + 0.14, TOP
    body.add(box((-0.72, BANK_Y - 0.09, BANK_Z), (0.2, BANK_Y + 0.09, BANK_Z + 0.07), bevel=0.012), IR)
    levers, pivots = [], {}
    xs = [-0.62 + i * 0.19 for i in range(5)]
    for i, x in enumerate(xs):
        body.add(box((x - 0.022, BANK_Y - 0.075, BANK_Z + 0.07), (x + 0.022, BANK_Y + 0.075, BANK_Z + 0.074)), 'park_rubber')
        for k in range(3):  # detent marks: three positions
            yy = BANK_Y - 0.05 + k * 0.05
            body.add(box((x + 0.03, yy - 0.006, BANK_Z + 0.07), (x + 0.055, yy + 0.006, BANK_Z + 0.075)), BR)
        lv = Part(f'lever_{i}', smooth=True)
        pv = Vector((x, BANK_Y, BANK_Z + 0.07))
        lv.add(strut(pv, pv + Vector((0, 0, 0.2)), 0.011, 0.009, 8), IR, smooth=False)
        lv.add(sphere(pv + Vector((0, 0, 0.225)), 0.03, 12, 8), ['park_accent_orange', 'park_accent_slate', 'park_accent_olive', BR, 'park_accent_orange'][i])
        lv.add(strut(pv - Vector((0, 0, 0.01)), pv + Vector((0, 0, 0.02)), 0.02, 0.02, 8), BR, smooth=False)
        levers.append(lv); pivots[lv.name] = pv
    # stamp: brass handle on a wood block on a pad, at the left of the desk
    PX, PY = -0.55, 0.12
    body.add(box((PX - 0.12, PY - 0.09, TOP), (PX + 0.12, PY + 0.09, TOP + 0.012), bevel=0.003), 'park_accent_brick')
    st = Part('stamp', smooth=False)
    sp = Vector((PX, PY, TOP + 0.012))
    st.add(box((PX - 0.055, PY - 0.04, TOP + 0.014), (PX + 0.055, PY + 0.04, TOP + 0.06), bevel=0.006), MW)
    st.add(strut((PX, PY, TOP + 0.06), (PX, PY, TOP + 0.13), 0.014, 0.012, 8), BR)
    st.add(sphere((PX, PY, TOP + 0.15), 0.032, 10, 6), BR)
    # paper stack and a mug for scale
    for k in range(4):
        body.add(box((0.0 + k * 0.004, -0.05 + k * 0.003, TOP + k * 0.006), (0.3 + k * 0.004, 0.17 + k * 0.003, TOP + 0.006 + k * 0.006)), 'park_cream_paint')
    body.add(lathe([(0, 0), (0.04, 0), (0.042, 0.1), (0.035, 0.1), (0.033, 0.01), (0, 0.01)], 12, center=(0.55, 0.18, TOP)), 'park_cream_paint')
    stl = Part('stool')
    stool(stl, 0.1, -D / 2 - 0.45)
    root = make_root('P12', {'assetId': 'P12', 'exhibit': 'research desk', 'slug': 'alpha-agent', 'front': '+Z (glTF)',
        'levers': 5, 'leverPositions': 3, 'leverAxis': 'local X, +-0.45 rad', 'dynamicNodes': ['stool'], 'solidNodes': ['body'],
        'screenSizeM': [SW, SH]})
    objs = [make_object(body, root), make_object(scr, root, location=(SX, SY - 0.02, SZ)), make_object(st, root, location=tuple(sp))]
    objs += [make_object(l, root, location=tuple(pivots[l.name])) for l in levers]
    objs.append(make_object(stl, root, location=(0.1, -D / 2 - 0.45, 0)))
    return root, objs


def child(part, parent_ob, world_pivot):
    """Display face parented to a moving node (geometry authored in exhibit space)."""
    ob = make_object(part, parent_ob.parent, location=world_pivot)
    ob.parent = parent_ob
    ob.location = Vector(world_pivot) - parent_ob.location
    return ob

# ------------------------------------------------------------------ P13 review booth (evalforge)
@exhibit
def build_P13():
    body = Part('body')
    W, D, H = 1.5, 0.62, 1.05
    # cabinet: plinth, carcass, panelled front with stiles, top with overhang
    body.add(box((-W / 2 + 0.03, -D / 2 + 0.03, 0), (W / 2 - 0.03, D / 2 - 0.03, 0.08)), DW)
    body.add(box((-W / 2, -D / 2, 0.08), (W / 2, D / 2, H - 0.04), bevel=0.01), 'park_slate_paint')
    body.add(box((-W / 2 - 0.03, -D / 2 - 0.03, H - 0.04), (W / 2 + 0.03, D / 2 + 0.03, H), bevel=0.01), LW)
    for x0, x1 in ((-W / 2 + 0.07, -0.04), (0.04, W / 2 - 0.07)):
        body.add(box((x0, -D / 2 - 0.015, 0.16), (x1, -D / 2, H - 0.12), bevel=0.005), 'park_slate_paint')
        body.add(box((x0 + 0.05, -D / 2 - 0.02, 0.2), (x1 - 0.05, -D / 2 - 0.015, H - 0.16)), 'park_roof_slate')
    # upright screen panel with two screens
    PY = D / 2 - 0.12
    body.add(box((-0.72, PY, H), (0.72, PY + 0.08, 1.86), bevel=0.012), LW)
    body.add(box((-0.68, PY - 0.012, H + 0.06), (0.68, PY, 1.82)), MW)
    disp = []
    for i, x in enumerate((-0.34, 0.34)):
        screen(body, x, PY - 0.07, 1.45, 0.54, 0.38, depth=0.055)
        disp.append(face(f'display_clip{i}', x, PY - 0.07, 1.45, 0.54, 0.38))
    # crown with two vote columns: wood posts + frosted back, a bar inside each that grows
    body.add(box((-0.78, PY - 0.06, 1.86), (0.78, PY + 0.14, 1.93), bevel=0.01), LW)
    bars = []
    for i, x in enumerate((-0.34, 0.34)):
        for dx in (-0.08, 0.08):
            for dy in (-0.08, 0.08):
                body.add(box((x + dx - 0.015, PY + 0.04 + dy - 0.015, 1.93), (x + dx + 0.015, PY + 0.04 + dy + 0.015, 2.52)), LW)
        body.add(box((x - 0.1, PY - 0.06, 2.52), (x + 0.1, PY + 0.14, 2.56), bevel=0.008), LW)
        body.add(box((x - 0.07, PY + 0.1, 1.93), (x + 0.07, PY + 0.11, 2.52)), 'park_glass_frosted')
        bar = Part(f'bar_{i}')
        bar.add(box((x - 0.05, PY - 0.01, 1.93), (x + 0.05, PY + 0.09, 2.5)), 'park_accent_orange' if i == 0 else 'park_accent_slate')
        bars.append((bar, (x, PY + 0.04, 1.93)))
        # tick marks on the posts (every 10 votes)
        for k in range(1, 5):
            body.add(box((x + 0.095, PY - 0.03, 1.93 + k * 0.115), (x + 0.11, PY - 0.0, 1.935 + k * 0.115)), BR)
    # pedestal + mushroom button + selector arrow in front
    BY = -D / 2 - 0.42
    body.add(box((-0.16, BY - 0.14, 0), (0.16, BY + 0.14, 0.06), bevel=0.01), DW)
    body.add(box((-0.11, BY - 0.09, 0.06), (0.11, BY + 0.09, 0.9), bevel=0.012, top_scale=0.92), LW)
    body.add(box((-0.15, BY - 0.13, 0.9), (0.15, BY + 0.13, 0.95), bevel=0.01), MW)
    body.add(strut((0, BY, 0.95), (0, BY, 0.98), 0.075, 0.075, 16), IR)
    btn = Part('button', smooth=True)
    btn.add(lathe([(0, 0.0), (0.05, 0.0), (0.05, 0.03), (0.09, 0.04), (0.095, 0.06), (0.07, 0.085), (0, 0.095)], 18, center=(0, BY, 0.975)), 'park_accent_orange')
    sel = Part('selector')
    # flat brass arrow on the pedestal top, in front of the button; points +X (rotated at runtime)
    sel.add(prism([(-0.045, -0.012), (0.015, -0.012), (0.015, -0.028), (0.05, 0.0), (0.015, 0.028), (0.015, 0.012), (-0.045, 0.012)], 0.95, 0.962, 'Z'), BR, xform=Matrix.Translation((0, BY - 0.11, 0)))
    root = make_root('P13', {'assetId': 'P13', 'exhibit': 'review booth', 'slug': 'evalforge', 'front': '+Z (glTF)', 'solidNodes': ['body'],
        'barGrowAxis': 'local Y scale from base', 'selector': 'rotate about local Y'})
    objs = [make_object(body, root)]
    objs += [make_object(d, root, location=(x, PY - 0.07, 1.45)) for d, x in zip(disp, (-0.34, 0.34))]
    objs += [make_object(b, root, location=pv) for b, pv in bars]
    objs.append(make_object(btn, root, location=(0, BY, 0.975)))
    objs.append(make_object(sel, root, location=(0, BY - 0.11, 0.95)))
    return root, objs

# ------------------------------------------------------------------ P14 DJ table (djc)
@exhibit
def build_P14():
    body = Part('body')
    W, D, TOP = 1.7, 0.72, 0.9
    desk_frame(body, W, D, TOP)
    # console slab with raised rear edge
    body.add(box((-0.78, -0.3, TOP), (0.78, 0.3, TOP + 0.05), bevel=0.01), DW)
    body.add(box((-0.78, 0.22, TOP + 0.05), (0.78, 0.3, TOP + 0.09), bevel=0.008), DW)
    plats = []
    for i, x in enumerate((-0.5, 0.5)):
        body.add(box((x - 0.24, -0.2, TOP + 0.05), (x + 0.24, 0.2, TOP + 0.12), bevel=0.012), 'park_slate_paint')
        for fx in (-0.2, 0.2):
            for fy in (-0.16, 0.16):
                body.add(strut((x + fx, fy, TOP + 0.05), (x + fx, fy, TOP + 0.04), 0.02, 0.02, 8), 'park_rubber')
        body.add(strut((x, 0, TOP + 0.12), (x, 0, TOP + 0.13), 0.165, 0.165, 24), IR)
        pl = Part(f'platter_{i}', smooth=False)
        z0 = TOP + 0.13
        pl.add(strut((x, 0, z0), (x, 0, z0 + 0.012), 0.16, 0.16, 28), 'park_vinyl')
        pl.add(torus((x, 0, z0 + 0.012), 0.12, 0.002, 28, 3), 'park_rubber')
        pl.add(strut((x, 0, z0 + 0.012), (x, 0, z0 + 0.015), 0.055, 0.055, 18), 'park_accent_orange' if i == 0 else 'park_accent_olive')
        pl.add(strut((x + 0.035, 0.0, z0 + 0.015), (x + 0.035, 0, z0 + 0.018), 0.012, 0.012, 6), 'park_cream_paint')
        pl.add(strut((x, 0, z0 + 0.015), (x, 0, z0 + 0.04), 0.005, 0.005, 6), BR)
        plats.append((pl, (x, 0, z0)))
        # tonearm: base, pivot, arm, headshell, counterweight
        ax, ay = x + 0.19, 0.13
        body.add(strut((ax, ay, TOP + 0.12), (ax, ay, TOP + 0.16), 0.03, 0.026, 12), BR)
        body.add(strut((ax, ay, TOP + 0.165), (x + 0.05, -0.1, TOP + 0.165), 0.006, 0.006, 6), BR)
        body.add(box((x + 0.03, -0.13, TOP + 0.152), (x + 0.07, -0.09, TOP + 0.162)), IR)
        body.add(strut((ax + 0.02, ay + 0.03, TOP + 0.165), (ax + 0.05, ay + 0.08, TOP + 0.165), 0.018, 0.018, 10), IR)
        # pitch fader slot
        body.add(box((x + 0.19, -0.17, TOP + 0.12), (x + 0.21, -0.02, TOP + 0.124)), 'park_rubber')
    # mixer: body, 4 knobs, two channel faders, crossfader slot with 5 notches
    body.add(box((-0.17, -0.24, TOP + 0.05), (0.17, 0.2, TOP + 0.13), bevel=0.01), 'park_slate_paint')
    for kx in (-0.08, 0.08):
        for ky in (0.12, 0.04):
            body.add(strut((kx, ky, TOP + 0.13), (kx, ky, TOP + 0.15), 0.017, 0.015, 10), 'park_cream_paint')
        body.add(box((kx - 0.006, -0.1, TOP + 0.13), (kx + 0.006, 0.0, TOP + 0.133)), 'park_rubber')
        body.add(box((kx - 0.02, -0.055, TOP + 0.13), (kx + 0.02, -0.035, TOP + 0.15), bevel=0.003), IR)
    body.add(box((-0.12, -0.2, TOP + 0.13), (0.12, -0.184, TOP + 0.133)), 'park_rubber')
    for k in range(5):
        nx = -0.1 + k * 0.05
        body.add(box((nx - 0.002, -0.215, TOP + 0.13), (nx + 0.002, -0.207, TOP + 0.134)), BR)
    fad = Part('crossfader')
    fad.add(box((-0.018, -0.205, TOP + 0.13), (0.018, -0.18, TOP + 0.165), bevel=0.004, top_scale=0.85), 'park_cream_paint')
    # headphones hanging on a hook at the table side
    body.add(strut((0.85, -0.2, TOP - 0.04), (0.92, -0.2, TOP - 0.04), 0.008, 0.008, 6), BR)
    body.add(torus((0.94, -0.2, TOP - 0.2), 0.11, 0.012, 16, 5, axis='X'), 'park_rubber')
    for dy in (-0.1, 0.1):
        body.add(strut((0.94, -0.2 + dy * 0.9, TOP - 0.29), (0.94, -0.2 + dy * 1.0, TOP - 0.24), 0.045, 0.045, 12), 'park_rubber')
    # record crate (small dynamic item) beside the table
    crate = Part('crate')
    cx, cy = -0.55, -0.62
    for x0, x1, y0, y1 in ((cx - 0.2, cx + 0.2, cy - 0.17, cy - 0.15), (cx - 0.2, cx + 0.2, cy + 0.15, cy + 0.17), (cx - 0.2, cx - 0.18, cy - 0.17, cy + 0.17), (cx + 0.18, cx + 0.2, cy - 0.17, cy + 0.17)):
        crate.add(box((x0, y0, 0.02), (x1, y1, 0.3), bevel=0.004), LW)
    crate.add(box((cx - 0.2, cy - 0.17, 0.0), (cx + 0.2, cy + 0.17, 0.02)), MW)
    for k in range(9):
        xx = cx - 0.15 + k * 0.035
        crate.add(box((xx - 0.006, cy - 0.14, 0.02), (xx + 0.006, cy + 0.14, 0.32 - 0.01 * (k % 3))), ['park_accent_orange', 'park_cream_paint', 'park_accent_slate', 'park_accent_olive'][k % 4])
    root = make_root('P14', {'assetId': 'P14', 'exhibit': 'DJ table', 'slug': 'djc', 'front': '+Z (glTF)', 'solidNodes': ['body'], 'dynamicNodes': ['crate'],
        'crossfaderNotchesX': [-0.1, -0.05, 0, 0.05, 0.1]})
    objs = [make_object(body, root)]
    objs += [make_object(p_, root, location=pv) for p_, pv in plats]
    objs.append(make_object(fad, root, location=(0, -0.19, TOP + 0.13)))
    objs.append(make_object(crate, root, location=(cx, cy, 0)))
    return root, objs

# ------------------------------------------------------------------ P15 record wall (hepai)
SLOTS_X, SLOTS_Z = (-0.72, 0.0, 0.72), (2.08, 1.5, 0.92)
@exhibit
def build_P15():
    body = Part('body')
    # board: back panel with frame, mounted 6 cm off the hut wall on two battens
    bx, z0, z1 = 1.22, 0.56, 2.44
    body.add(box((-bx, 0.0, z0), (bx, 0.04, z1), bevel=0.006), LW)
    for zz in (z0 + 0.25, z1 - 0.25):
        body.add(box((-bx + 0.1, 0.04, zz - 0.05), (bx - 0.1, 0.1, zz + 0.05)), DW)
    F = 0.06
    for (a0, a1, c0, c1) in ((-bx - F, bx + F, z1, z1 + F), (-bx - F, bx + F, z0 - F, z0), (-bx - F, -bx, z0, z1), (bx, bx + F, z0, z1)):
        body.add(box((a0, -0.03, c0), (a1, 0.04, c1), bevel=0.008), MW)
    # slot pegs
    for x in SLOTS_X:
        for z in SLOTS_Z:
            body.add(strut((x, 0.0, z + 0.2), (x, -0.06, z + 0.2), 0.012, 0.01, 8), BR)
    records, lines = [], []
    sleeves = ['park_accent_orange', 'park_accent_slate', 'park_accent_olive', 'park_cream_paint', 'park_accent_brick',
               'park_accent_orange', 'park_canvas_olive', 'park_accent_slate', 'park_cream_paint']
    for i in range(9):
        x, z = SLOTS_X[i % 3], SLOTS_Z[i // 3]
        r = Part(f'record_{i}')
        r.add(box((x - 0.17, -0.055, z - 0.17), (x + 0.17, -0.04, z + 0.17), bevel=0.003), sleeves[i])
        # abstract sleeve mark: a circle or bars in a second accent (no logos)
        mark = sleeves[(i + 4) % 9]
        if i % 3 == 0:
            r.add(strut((x, -0.0555, z + 0.02), (x, -0.058, z + 0.02), 0.07, 0.07, 16), mark)
        elif i % 3 == 1:
            for k in range(3):
                r.add(box((x - 0.12, -0.058, z - 0.09 + k * 0.07), (x + 0.12 - k * 0.05, -0.0555, z - 0.07 + k * 0.07)), mark)
        else:
            r.add(prism([(-0.09, -0.08), (0.1, -0.08), (0.0, 0.1)], -0.0555, -0.058, 'Y'), mark, xform=Matrix.Translation((x, 0, z)))
        # vinyl peeking out to the right, with a label
        r.add(strut((x + 0.09, -0.04, z), (x + 0.09, -0.032, z), 0.15, 0.15, 24), 'park_vinyl', xform=rot_x(90, (x + 0.09, -0.036, z)) @ rot_x(-90, (x + 0.09, -0.036, z)))
        records.append((r, (x, -0.04, z)))
    # cords: 12 neighbour links behind the sleeves, each node origin at its midpoint, local X along it
    def cord(name, a, b):
        a, b = Vector(a), Vector(b)
        c = Part(name, smooth=True)
        c.add(strut(a, b, 0.012, 0.012, 8), 'park_canvas_cream', smooth=True)
        lines.append((c, tuple((a + b) / 2)))
    for row in range(3):
        for col in range(2):
            cord(f'cord_h{row}{col}', (SLOTS_X[col], -0.02, SLOTS_Z[row]), (SLOTS_X[col + 1], -0.02, SLOTS_Z[row]))
    for col in range(3):
        for row in range(2):
            cord(f'cord_v{col}{row}', (SLOTS_X[col], -0.02, SLOTS_Z[row]), (SLOTS_X[col], -0.02, SLOTS_Z[row + 1]))
    # little brass knots where cords meet
    for x in SLOTS_X:
        for z in SLOTS_Z:
            body.add(sphere((x, -0.02, z), 0.022, 10, 6), BR)
    # listening stool (small dynamic item)
    stl = Part('stool')
    stool(stl, 0.75, -1.15, seat=0.46, r=0.16)
    root = make_root('P15', {'assetId': 'P15', 'exhibit': 'record wall', 'slug': 'hepai', 'front': '+Z (glTF)', 'solidNodes': ['body'], 'dynamicNodes': ['stool'],
        'slotsLocalGLB': [[x, z, 0.04] for z in SLOTS_Z for x in SLOTS_X], 'cordThicknessAxis': 'cord node local Y/Z scale'})
    objs = [make_object(body, root)]
    objs += [make_object(r, root, location=pv) for r, pv in records]
    objs += [make_object(c, root, location=pv) for c, pv in lines]
    objs.append(make_object(stl, root, location=(0.75, -1.15, 0)))
    return root, objs

# ------------------------------------------------------------------ P16 two camp chairs (kindred)
def camp_chair(p, cx, cy, facing, canvas):
    """Folding director-style camp chair; facing = +1 faces -Y (front), -1 faces +Y."""
    R = rot_z(0 if facing > 0 else 180, (cx, cy, 0))
    W, SEAT, Dp, BACK = 0.56, 0.44, 0.48, 0.9
    hw = W / 2
    for sx in (-1, 1):
        x = cx + sx * hw
        # X legs
        p.add(strut((x, cy - Dp / 2, 0), (x, cy + Dp / 2 - 0.02, SEAT - 0.02), 0.022, 0.02, 6), LW, xform=R)
        p.add(strut((x, cy + Dp / 2, 0), (x, cy - Dp / 2 + 0.02, SEAT - 0.02), 0.022, 0.02, 6), LW, xform=R)
        p.add(strut((x - sx * 0.012, cy, SEAT / 2 - 0.02), (x + sx * 0.012, cy, SEAT / 2 - 0.02), 0.018, 0.018, 8), BR, xform=R)
        # seat rail, back post, armrest
        p.add(box((x - 0.02, cy - Dp / 2, SEAT - 0.04), (x + 0.02, cy + Dp / 2, SEAT), bevel=0.006), LW, xform=R)
        p.add(box((x - 0.022, cy + Dp / 2 - 0.04, 0), (x + 0.022, cy + Dp / 2, BACK), bevel=0.006), LW, xform=R)
        p.add(box((x - 0.03, cy - Dp / 2 + 0.02, SEAT + 0.2), (x + 0.03, cy + Dp / 2, SEAT + 0.235), bevel=0.008), LW, xform=R)
        p.add(box((x - 0.018, cy - Dp / 2 + 0.03, SEAT), (x + 0.018, cy - Dp / 2 + 0.06, SEAT + 0.2)), LW, xform=R)
    p.add(box((cx - hw, cy - 0.02, 0.08), (cx + hw, cy + 0.02, 0.11), bevel=0.005), LW, xform=R)
    # canvas seat (slight sag: three strips) and back sling
    for k, (y0, y1, dz) in enumerate(((-Dp / 2 + 0.02, -0.08, 0.0), (-0.08, 0.08, -0.025), (0.08, Dp / 2 - 0.02, 0.0))):
        p.add(box((cx - hw + 0.02, cy + y0, SEAT - 0.03 + dz), (cx + hw - 0.02, cy + y1, SEAT - 0.012 + dz)), canvas, xform=R)
    p.add(box((cx - hw + 0.02, cy + Dp / 2 - 0.035, SEAT + 0.2), (cx + hw - 0.02, cy + Dp / 2 - 0.015, BACK - 0.04), bevel=0.004), canvas, xform=R)

@exhibit
def build_P16():
    body = Part('body')
    camp_chair(body, 0, -0.75, -1, 'park_canvas_olive')   # chair A (player): faces +Y towards chair B
    camp_chair(body, 0, 0.75, 1, 'park_canvas_cream')     # chair B (empty): faces -Y
    root = make_root('P16', {'assetId': 'P16', 'exhibit': 'two camp chairs', 'slug': 'kindred', 'front': '+Z (glTF)', 'solidNodes': ['body'],
        'seatAGLB': [0, 0.43, 0.75], 'seatAFacingGLB': [0, 0, -1], 'emptySeatGLB': [0, 0.43, -0.75]})
    return root, [make_object(body, root)]

# ------------------------------------------------------------------ P17 side table + lantern (kindred)
@exhibit
def build_P17():
    body = Part('body')
    T = 0.5
    body.add(strut((0, 0, T - 0.035), (0, 0, T), 0.24, 0.24, 20, bevel=0.008), LW)
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        body.add(strut((0.2 * math.cos(a), 0.2 * math.sin(a), 0), (0.1 * math.cos(a), 0.1 * math.sin(a), T - 0.03), 0.02, 0.018, 6), MW)
    body.add(torus((0, 0, 0.17), 0.15, 0.01, 14, 4), MW)
    # lantern: base, four posts, cap, ring handle
    L0 = T
    body.add(strut((0, 0, L0), (0, 0, L0 + 0.03), 0.075, 0.07, 12), BR)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        body.add(strut((0.06 * math.cos(a), 0.06 * math.sin(a), L0 + 0.03), (0.06 * math.cos(a), 0.06 * math.sin(a), L0 + 0.2), 0.007, 0.007, 6), BR)
    body.add(lathe([(0.075, 0), (0.08, 0.02), (0.03, 0.07), (0, 0.075)], 12, center=(0, 0, L0 + 0.2)), BR)
    body.add(torus((0, 0, L0 + 0.31), 0.035, 0.006, 12, 4, axis='X'), BR)
    glass = Part('lamp_glass', smooth=True)
    glass.add(lathe([(0, 0), (0.05, 0.0), (0.056, 0.05), (0.056, 0.12), (0.05, 0.17), (0, 0.17)], 12, center=(0, 0, L0 + 0.03)), 'park_glass_frosted')
    flame = Part('lamp_flame', smooth=True)
    flame.add(lathe([(0, 0), (0.012, 0.01), (0.014, 0.03), (0, 0.06)], 8, center=(0, 0, L0 + 0.07)), 'park_bulb_warm')
    # a mug and a notebook on the table
    body.add(lathe([(0, 0), (0.035, 0), (0.037, 0.085), (0.031, 0.085), (0.029, 0.008), (0, 0.008)], 12, center=(0.13, -0.08, T)), 'park_accent_orange')
    body.add(box((-0.2, -0.05, T), (-0.06, 0.13, T + 0.018), bevel=0.003), 'park_accent_slate')
    body.add(box((-0.195, -0.045, T + 0.018), (-0.065, 0.125, T + 0.02)), 'park_cream_paint')
    root = make_root('P17', {'assetId': 'P17', 'exhibit': 'side table + lantern', 'slug': 'kindred', 'front': '+Z (glTF)', 'solidNodes': ['body'],
        'lampNodes': ['lamp_glass', 'lamp_flame']})
    return root, [make_object(body, root), make_object(glass, root, location=(0, 0, L0 + 0.03)), make_object(flame, root, location=(0, 0, L0 + 0.07))]

# ------------------------------------------------------------------ P18 pivot blackboard + lectern (interactive learning)
@exhibit
def build_P18():
    body = Part('body')
    BW, BH, PZ = 2.0, 1.1, 1.5     # board size, pivot height
    hx = BW / 2 + 0.1
    for sx in (-1, 1):
        x = sx * hx
        body.add(box((x - 0.045, -0.045, 0.0), (x + 0.045, 0.045, PZ + 0.72), bevel=0.01), LW)
        body.add(box((x - 0.06, -0.38, 0.0), (x + 0.06, 0.38, 0.09), bevel=0.012, top_scale=None), MW)
        body.add(strut((x - sx * 0.045, 0, PZ), (x - sx * 0.075, 0, PZ), 0.035, 0.035, 10), BR)
    body.add(box((-hx, -0.04, PZ + 0.68), (hx, 0.04, PZ + 0.76), bevel=0.01), LW)
    body.add(box((-hx, -0.03, 0.42), (hx, 0.03, 0.48), bevel=0.008), LW)
    # chalk tray + chalk on the low rail
    body.add(box((-0.7, -0.12, 0.48), (0.7, 0.0, 0.5), bevel=0.005), MW)
    body.add(box((-0.7, -0.125, 0.5), (0.7, -0.11, 0.53)), MW)
    for k, c in enumerate(('park_cream_paint', 'park_cream_paint', 'park_accent_orange')):
        body.add(strut((-0.3 + k * 0.12, -0.06, 0.51), (-0.24 + k * 0.12, -0.06, 0.51), 0.008, 0.008, 6), c)
    # board (moves): slate face both sides, wood frame
    board = Part('board')
    T = 0.04
    board.add(box((-BW / 2, -T / 2, PZ - BH / 2), (BW / 2, T / 2, PZ + BH / 2)), 'park_chalkboard')
    F = 0.05
    for (a0, a1, c0, c1) in ((-BW / 2 - F, BW / 2 + F, PZ + BH / 2, PZ + BH / 2 + F), (-BW / 2 - F, BW / 2 + F, PZ - BH / 2 - F, PZ - BH / 2),
                             (-BW / 2 - F, -BW / 2, PZ - BH / 2, PZ + BH / 2), (BW / 2, BW / 2 + F, PZ - BH / 2, PZ + BH / 2)):
        board.add(box((a0, -T / 2 - 0.012, c0), (a1, T / 2 + 0.012, c1), bevel=0.008), MW)
    front = Part('display_front')
    front.add(box((-BW / 2 + 0.01, -T / 2 - 0.002, PZ - BH / 2 + 0.01), (BW / 2 - 0.01, -T / 2, PZ + BH / 2 - 0.01)), 'park_chalkboard')
    back = Part('display_back')
    back.add(box((-BW / 2 + 0.01, T / 2, PZ - BH / 2 + 0.01), (BW / 2 - 0.01, T / 2 + 0.002, PZ + BH / 2 - 0.01)), 'park_chalkboard')
    # lectern: front-right, sloped top facing the board (the speaker looks at the class = +Y side? no: faces -Y)
    lx, ly = 1.25, -1.0
    body.add(box((lx - 0.3, ly - 0.24, 0), (lx + 0.3, ly + 0.24, 0.06), bevel=0.01), DW)
    body.add(box((lx - 0.24, ly - 0.18, 0.06), (lx + 0.24, ly + 0.18, 1.0), bevel=0.012, top_scale=0.94), LW)
    for zz in (0.3, 0.62):
        body.add(box((lx - 0.245, ly - 0.185, zz), (lx + 0.245, ly - 0.17, zz + 0.03)), MW)
    body.add(prism([(ly - 0.26, 1.0), (ly + 0.24, 1.0), (ly + 0.24, 1.2), (ly - 0.26, 1.05)], lx - 0.3, lx + 0.3, 'X', bevel=0.01), MW)
    body.add(box((lx - 0.18, ly - 0.05, 1.12), (lx + 0.12, ly + 0.15, 1.14)), 'park_cream_paint', xform=rot_x(-6, (lx, ly, 1.12)))
    root = make_root('P18', {'assetId': 'P18', 'exhibit': 'pivot blackboard + lectern', 'slug': 'interactive-learning-platforms', 'front': '+Z (glTF)',
        'solidNodes': ['body'], 'boardPivotGLB': [0, PZ, 0], 'boardSizeM': [BW, BH], 'flipAxis': 'local X'})
    ob_board = make_object(board, root, location=(0, 0, PZ))
    objs = [make_object(body, root), ob_board, child(front, ob_board, (0, -T / 2 - 0.001, PZ)), child(back, ob_board, (0, T / 2 + 0.001, PZ))]
    return root, objs

if __name__ == '__main__':
    only = [a for a in ARGS if a.startswith('P')]
    os.makedirs(os.path.join(EVIDENCE, 'exhibits'), exist_ok=True)
    for aid, fn in EXHIBITS.items():
        if only and aid not in only:
            continue
        reset_scene()
        root, objs = fn()
        ev = inspect(objs)
        blend, glb = export(aid, [root])
        rb = readback(glb)
        rep = {'asset': aid, 'evaluatedTriangles': ev['triangles'], 'bounds': [ev['bounds_min'], ev['bounds_max']], 'problems': ev['problems'],
               'parts': [(o['name'], o['triangles']) for o in ev['objects']], 'glbReadbackTriangles': rb['triangles'], 'readbackBounds': [rb['bounds_min'], rb['bounds_max']],
               'readbackProblems': rb['problems'], 'nodes': rb['nodes'], 'materials': rb['materials'], 'glbBytes': os.path.getsize(glb)}
        write_json(os.path.join(REPO, f'docs/world/park/qa-{aid}.json'), rep)
        print(aid, 'tris', ev['triangles'], 'readback', rb['triangles'], 'problems', len(ev['problems']), len(rb['problems']), 'bytes', rep['glbBytes'])
        for p in rb['problems'][:4]:
            print('  rb', p['name'], p['negative_shells'], p['nonmanifold_edges'], p['degenerate_faces'])
        if '--render' in ARGS:
            mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH']
            render_views(mesh, os.path.join(EVIDENCE, 'exhibits', aid), views=('34_front', 'front', 'side'), res=800, focus=None)

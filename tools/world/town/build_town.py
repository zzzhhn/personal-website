"""Town L1 buildings and props (docs/world/town/DESIGN.md).

Run: tools/blender-run.sh town tools/world/town/build_town.py <repo_root> T01 [T02 ...]
Footprints come from BUILDINGS_V4 (layout-v4-flag.ts); Blender X = world X, Blender Y = -world Z,
so the +X facade faces the avenue. Origin at footprint centre, ground level.
"""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from townlib import *  # noqa

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = os.path.abspath(ARGS[0]) if ARGS else os.getcwd()
ONLY = ARGS[1:]

PLAZA = 0.15   # forecourt top above the building base (world 1.15 vs 1.0)

# ============================================================== T01 SDIC: stone, square columns, revolving door
def build_T01():
    A = Asset('T01')
    X0, X1, Y = -4.5, 4.5, 4.0            # footprint 9 (x) x 8 (y), height 8
    CX = 2.0                              # core front (portico recess wall)
    A.extras.update(building='sdic', footprint=[9, 8, 8])
    # plinth under the core, portico platform flush with the forecourt
    A.box((X0, -Y, 0), (CX - 0.2, Y, 0.6), 'town_stone_dark', 0.02)
    A.box((CX - 0.2, -Y, 0), (X1, Y, PLAZA), 'town_stone_dark', 0.01)
    for i in range(9):  # paving joints as shallow real slabs (2 mm proud, not coplanar)
        y = -Y + 0.45 + i * 0.89
        A.box((CX, y - 0.015, PLAZA), (X1 - 0.05, y + 0.015, PLAZA + 0.004), 'town_stone')
    A.col_box((X0, -Y, 0), (CX, Y, 8.0), 'col_core')
    A.col_box((CX - 0.2, -Y, -0.2), (X1, Y, PLAZA), 'col_portico_floor')
    # core walls with real openings
    Z0, Z1 = 0.6, 6.6
    side_p, side_n = Face('y', 1, Y - 0.1), Face('y', -1, -Y + 0.1)
    back, front = Face('x', -1, X0 + 0.1), Face('x', 1, CX)
    for F, k in ((side_p, 'sp'), (side_n, 'sn')):
        facade(A, F, X0 + 0.1, CX, Z0, Z1, 4, 2, 0.95, 2.05, 'town_stone', 'T01' + k, wz=0.45)
        wall(A, F, X0 + 0.1, CX, Z1, 7.2, 'town_stone')
    facade(A, back, -Y + 0.3, Y - 0.3, Z0, Z1, 3, 2, 1.0, 2.05, 'town_stone', 'T01b', wz=0.45)
    wall(A, back, -Y + 0.3, Y - 0.3, Z1, 7.2, 'town_stone')
    # front recess wall: two tall ground windows, revolving-door bay, three upper windows
    bay = (-Y + 0.3 + (2 * Y - 0.6) / 3, -Y + 0.3 + 2 * (2 * Y - 0.6) / 3)
    facade(A, front, -Y + 0.3, bay[0], PLAZA, 3.6, 1, 1, 1.1, 2.4, 'town_stone', 'T01fl', wz=0.35)
    facade(A, front, bay[1], Y - 0.3, PLAZA, 3.6, 1, 1, 1.1, 2.4, 'town_stone', 'T01fr', wz=0.35)
    facade(A, front, -Y + 0.3, Y - 0.3, 3.6, Z1, 3, 1, 1.1, 2.1, 'town_stone', 'T01f1', wz=0.4)
    wall(A, front, -Y + 0.3, Y - 0.3, Z1, 7.2, 'town_stone')
    # door bay behind the drum: dark glass doors under a transom (the bay itself was skipped above)
    A.box(*front.box(-0.2, 0, bay[0], bay[1], 3.0, 3.6), 'town_stone')
    A.box(*front.box(-0.23, -0.12, bay[0], bay[1], PLAZA, 3.0), 'town_glass_dark')
    A.box(*front.box(-0.12, -0.06, bay[0], bay[1], 2.62, 2.7), 'town_metal')
    for u in (bay[0], bay[1] - 0.08):
        A.box(*front.box(-0.12, -0.04, u, u + 0.08, PLAZA, 3.0), 'town_metal')
    # string course, cornice band, corner quoins on the core
    for z0, z1, out in ((3.55, 3.7, 0.06), (6.6, 6.75, 0.08)):
        A.box((X0, -Y, z0), (CX + out, Y, z1), 'town_stone_dark', 0.015)
    for sy in (1, -1):   # corner quoins: alternating long/short blocks, 4 cm proud on both faces
        for k in range(7):
            z = Z0 + k * 0.86
            w = 0.28 if k % 2 == 0 else 0.2
            ys = sorted((sy * (Y - 0.1 + 0.04), sy * (Y - 0.1 - w)))
            A.box((X0 + 0.06, ys[0], z + 0.02), (X0 + 0.1 + w, ys[1], z + 0.82), 'town_stone_dark', 0.015)
    # portico: four square columns, entablature with dentils, solid attic over the porch
    PX = X1 - 0.35
    for y in (-3.7, -1.25, 1.25, 3.7):
        A.box((PX - 0.33, y - 0.33, PLAZA), (PX + 0.33, y + 0.33, PLAZA + 0.22), 'town_stone_dark', 0.03)
        A.box((PX - 0.29, y - 0.29, PLAZA + 0.22), (PX + 0.29, y + 0.29, PLAZA + 0.34), 'town_stone', 0.025)
        A.box((PX - 0.24, y - 0.24, PLAZA + 0.34), (PX + 0.24, y + 0.24, 5.88), 'town_stone', 0.04)
        for a in (-0.1, 0.0, 0.1):   # fluting: proud fillets on the three visible faces
            A.box((PX + 0.235, y + a - 0.022, 0.7), (PX + 0.255, y + a + 0.022, 5.6), 'town_stone_dark')
            A.box((PX + a - 0.022, y + 0.235, 0.7), (PX + a + 0.022, y + 0.255, 5.6), 'town_stone_dark')
            A.box((PX + a - 0.022, y - 0.255, 0.7), (PX + a + 0.022, y - 0.235, 5.6), 'town_stone_dark')
        A.box((PX - 0.3, y - 0.3, 5.88), (PX + 0.3, y + 0.3, 6.02), 'town_stone', 0.02)
        A.box((PX - 0.36, y - 0.36, 6.02), (PX + 0.36, y + 0.36, 6.2), 'town_stone_dark', 0.03)
        A.col_box((PX - 0.33, y - 0.33, PLAZA), (PX + 0.33, y + 0.33, 6.2), f'col_column_{y:+.0f}')
    A.box((CX, -Y, 6.2), (X1 - 0.02, Y, 6.62), 'town_stone', 0.02)                     # architrave + porch ceiling
    A.box((CX, -Y, 6.62), (X1 - 0.1, Y, 7.0), 'town_stone')               # frieze
    for i in range(26):
        y = -Y + 0.2 + i * 0.3
        A.box((X1 - 0.12, y - 0.07, 6.9), (X1 - 0.02, y + 0.07, 7.0), 'town_stone_dark')
    A.box((CX, -Y, 7.0), (X1, Y, 7.2), 'town_stone_dark', 0.03)                          # cornice
    A.col_box((CX - 0.2, -Y, 6.2), (X1, Y, 8.0), 'col_attic')
    # roof, parapet (attic band with sign panel), coping, roof plant box
    A.box((X0 + 0.15, -Y + 0.15, 6.95), (CX, Y - 0.15, 7.15), 'town_roof')
    for mn, mx in (((X0, -Y, 7.2), (X0 + 0.25, Y, 7.9)), ((X1 - 0.25, -Y, 7.2), (X1, Y, 7.9)),
                   ((X0 + 0.25, -Y, 7.2), (X1 - 0.25, -Y + 0.25, 7.9)), ((X0 + 0.25, Y - 0.25, 7.2), (X1 - 0.25, Y, 7.9))):
        A.box(mn, mx, 'town_stone')
    A.box((X0 - 0.0, -Y, 7.9), (X1, Y, 8.0), 'town_trim', 0.02)
    # low pediment over the portico: raking cornice (proud, darker) around a recessed tympanum
    A.add(gable(CX + 0.6, X1 + 0.06, -Y - 0.06, Y + 0.06, 8.0, 9.0), 'town_stone_dark')
    A.add(gable(CX + 0.4, X1 - 0.06, -Y + 0.3, Y - 0.3, 8.0, 8.78), 'town_stone')
    A.box((CX + 0.5, -Y - 0.06, 7.94), (X1 + 0.08, Y + 0.06, 8.06), 'town_stone_dark', 0.02)
    A.box((X1, -2.3, 7.28), (X1 + 0.03, 2.3, 7.84), 'town_dark')                          # sign panel (runtime face)
    A.anchor('anchor_sign', (X1 + 0.035, 0, 7.56), w=4.4, h=0.5, normal='+X')
    A.box((-2.6, -1.6, 7.15), (-0.6, 0.6, 8.3), 'town_metal', 0.03)
    for k in range(6):
        A.box((-0.6, -1.5 + k * 0.35, 7.4), (-0.56, -1.3 + k * 0.35, 8.1), 'town_dark')
    # revolving door: glass drum (two curved glass walls), metal rings, canopy, four wings
    D = (CX + 0.95, 0.0)
    R = 1.05
    for a0, a1 in ((math.radians(35), math.radians(145)), (math.radians(215), math.radians(325))):
        A.add(arc_wall(D, R - 0.05, R, a0, a1, PLAZA, 2.55, 8), 'town_glass_dark', smooth=True)
        for a in (a0, a1):
            A.add(cyl((D[0] + R * math.cos(a), D[1] + R * math.sin(a)), 0.05, PLAZA, 2.55, 8), 'town_metal', smooth=True)
    A.add(cyl(D, R + 0.08, 2.55, 2.85, 24), 'town_metal', smooth=True)
    A.add(cyl(D, R + 0.02, PLAZA, PLAZA + 0.03, 24), 'town_metal', smooth=True)
    A.add(cyl(D, 0.06, PLAZA, 2.55, 10), 'town_metal', smooth=True)
    for k in range(4):
        a = math.radians(20 + 90 * k)
        w = box((0.06, -0.025, PLAZA + 0.05), (R - 0.08, 0.025, 2.45))
        rot_z(w, a)
        xform(w, Matrix.Translation((D[0], D[1], 0)))
        A.add(w, 'town_glass_dark')
    A.col_bm(cyl(D, R + 0.08, PLAZA, 2.85, 16), 'col_drum')
    # flagless poles: two bronze wall lamps flanking the door (unlit metal + small warm glass)
    for u in (-1.75, 1.75):
        A.box(*front.box(0, 0.12, u - 0.08, u + 0.08, 2.4, 2.75), 'town_metal', 0.01)
        A.box(*front.box(0.12, 0.2, u - 0.06, u + 0.06, 2.45, 2.7), 'town_glass_lit')
    return A


# ============================================================== shared bits for the curtain-wall towers
def curtain(A, F, u0, u1, z0, z1, pitch_u, floor_h, key, fin='town_slate', band='town_slate', fin_out=0.14,
            glass_set=0.12, lit_share=0.6, skip=None):
    """Curtain wall on plane F: glass panes set back, vertical fins every pitch_u, spandrel band per floor."""
    nu = max(1, round((u1 - u0) / pitch_u)); pu = (u1 - u0) / nu
    nf = max(1, round((z1 - z0) / floor_h)); fh = (z1 - z0) / nf
    A.box(*F.box(-0.35, -glass_set - 0.02, u0, u1, z0, z1), 'town_dark')       # backing slab (never seen through)
    for f in range(nf):
        zb = z0 + f * fh
        A.box(*F.box(-glass_set - 0.02, 0.02, u0, u1, zb, zb + 0.55), band)    # spandrel band
        for c in range(nu):
            if skip and skip(c, f):
                continue
            a, b = u0 + c * pu, u0 + (c + 1) * pu
            g = 'town_glass_lit' if lit(f'{key}:{c}:{f}', lit_share) else 'town_glass_dark'
            A.box(*F.box(-glass_set - 0.02, -glass_set, a + 0.03, b - 0.03, zb + 0.55, zb + fh), g)
            A.box(*F.box(-glass_set, -glass_set + 0.03, a + 0.03, b - 0.03, zb + fh * 0.62, zb + fh * 0.62 + 0.04), 'town_metal')
    for c in range(nu + 1):
        u = u0 + c * pu
        A.box(*F.box(-glass_set - 0.02, fin_out, u - 0.05, u + 0.05, z0, z1), fin)
    return nu, nf

def parapet(A, x0, x1, y0, y1, z0, h, mat, t=0.25, coping='town_trim'):
    for mn, mx in (((x0, y0, z0), (x0 + t, y1, z0 + h)), ((x1 - t, y0, z0), (x1, y1, z0 + h)),
                   ((x0 + t, y0, z0), (x1 - t, y0 + t, z0 + h)), ((x0 + t, y1 - t, z0), (x1 - t, y1, z0 + h))):
        A.box(mn, mx, mat)
    A.box((x0 - 0.03, y0 - 0.03, z0 + h), (x1 + 0.03, y1 + 0.03, z0 + h + 0.08), coping, 0.015)

def louvre_box(A, x0, x1, y0, y1, z0, z1, mat='town_metal'):
    A.box((x0, y0, z0), (x1, y1, z1), 'town_roof', 0.02)
    n = int((y1 - y0) / 0.22)
    for k in range(n):
        y = y0 + 0.11 + k * (y1 - y0 - 0.22) / max(1, n - 1)
        A.box((x1, y - 0.06, z0 + 0.15), (x1 + 0.04, y + 0.06, z1 - 0.12), mat)
        A.box((x0 - 0.04, y - 0.06, z0 + 0.15), (x0, y + 0.06, z1 - 0.12), mat)
    A.box((x0 - 0.05, y0 - 0.05, z1), (x1 + 0.05, y1 + 0.05, z1 + 0.08), 'town_trim', 0.015)

# ============================================================== T02 WorldQuant: glass box, blank screen wall, glazed lobby
def build_T02():
    A = Asset('T02')
    X0, X1, Y, H = -4.5, 4.5, 4.0, 12.0
    A.extras.update(building='worldquant', footprint=[9, 12, 8])
    L = 1.2          # lobby setback on the front and both sides
    LZ = 3.4         # lobby height (upper floors cantilever over it)
    # plinth / plaza-level floor
    A.box((X0, -Y, 0), (X1, Y, PLAZA), 'town_stone_dark', 0.01)
    A.col_box((X0, -Y, -0.2), (X1, Y, PLAZA), 'col_floor')
    # glazed lobby box set back; corner columns hold the upper block
    lx0, lx1, ly = X0 + 0.3, X1 - L, Y - L
    A.box((lx0, -ly, PLAZA), (lx1 - 0.1, ly, LZ), 'town_dark')
    for F, u0, u1 in ((Face('x', 1, lx1), -ly, ly), (Face('y', 1, ly), lx0, lx1), (Face('y', -1, -ly), lx0, lx1)):
        n = int(round((u1 - u0) / 1.3))
        for k in range(n):
            a, b = u0 + k * (u1 - u0) / n, u0 + (k + 1) * (u1 - u0) / n
            A.box(*F.box(-0.1, -0.04, a + 0.03, b - 0.03, PLAZA + 0.05, LZ - 0.2), 'town_glass_lit' if lit(f'T02lob{u0}{k}', 0.8) else 'town_glass_dark')
            A.box(*F.box(-0.04, 0.02, a - 0.03, a + 0.03, PLAZA, LZ - 0.15), 'town_metal')
        A.box(*F.box(-0.04, 0.02, u1 - 0.03, u1 + 0.03, PLAZA, LZ - 0.15), 'town_metal')
        A.box(*F.box(-0.04, 0.03, u0, u1, LZ - 0.2, LZ - 0.12), 'town_metal')
    # double door in the middle of the lobby front (frame proud of the glass)
    fr = Face('x', 1, lx1)
    A.box(*fr.box(0.02, 0.08, -1.0, 1.0, PLAZA, 2.5), 'town_metal')
    A.box(*fr.box(0.03, 0.06, -0.95, 0.95, PLAZA + 0.02, 2.42), 'town_glass_dark')
    for u in (-0.08, 0.08):
        A.box(*fr.box(0.06, 0.1, u - 0.02, u + 0.02, 0.9, 1.5), 'town_metal')
    A.col_box((lx0, -ly, PLAZA), (lx1 + 0.08, ly, LZ), 'col_lobby')
    A.col_box((X0, -Y, PLAZA), (lx0, Y, LZ), 'col_lobby_back')
    for (x, y) in ((X1 - 0.35, Y - 0.35), (X1 - 0.35, -Y + 0.35)):
        A.add(cyl((x, y), 0.3, PLAZA, LZ, 16), 'town_slate', smooth=True)
        A.add(cyl((x, y), 0.36, PLAZA, PLAZA + 0.08, 16), 'town_metal', smooth=True)
        A.col_bm(cyl((x, y), 0.3, PLAZA, LZ, 12), f'col_pilotis_{y:+.0f}')
    # lobby soffit (underside of the cantilever) with recessed downlights
    A.box((lx1 - 0.1, -Y, LZ - 0.1), (X1, Y, LZ), 'town_trim')
    A.box((X0 + 0.3, Y - L, LZ - 0.1), (lx1, Y, LZ), 'town_trim')
    A.box((X0 + 0.3, -Y, LZ - 0.1), (lx1, -Y + L, LZ), 'town_trim')
    for y in (-3.0, -1.5, 0.0, 1.5, 3.0):
        A.add(cyl((X1 - 0.6, y), 0.09, LZ - 0.115, LZ - 0.1, 10), 'town_glass_lit')
    # upper block: transfer slab, curtain walls on four faces
    A.box((X0, -Y, LZ), (X1, Y, LZ + 0.45), 'town_slate', 0.02)
    UZ0, UZ1 = LZ + 0.45, H - 0.9
    front = Face('x', 1, X1)
    def screen_skip(c, f):  # leave a 3-bay x 2-floor zone for the screen wall
        return 3 <= c <= 5 and f in (1, 2)
    nu, nf = curtain(A, front, -Y, Y, UZ0, UZ1, 1.0, (UZ1 - UZ0) / 3, 'T02f', skip=screen_skip)
    curtain(A, Face('y', 1, Y), X0, X1, UZ0, UZ1, 1.0, (UZ1 - UZ0) / 3, 'T02s')
    curtain(A, Face('y', -1, -Y), X0, X1, UZ0, UZ1, 1.0, (UZ1 - UZ0) / 3, 'T02n')
    curtain(A, Face('x', -1, X0), -Y, Y, UZ0, UZ1, 1.0, (UZ1 - UZ0) / 3, 'T02b', fin='town_dark', band='town_dark')
    A.col_box((X0, -Y, LZ), (X1, Y, H), 'col_upper')
    # blank screen wall: dark panel in a proud slate frame, mounting rails behind (front face, floors 2-3)
    fh = (UZ1 - UZ0) / 3
    sz0, sz1 = UZ0 + fh + 0.15, UZ0 + 3 * fh - 0.15
    su0, su1 = -1.0, 2.0
    A.box(*front.box(0.0, 0.18, su0 - 0.15, su1 + 0.15, sz0 - 0.15, sz1 + 0.15), 'town_slate', 0.02)
    A.box(*front.box(0.18, 0.24, su0, su1, sz0, sz1), 'town_screen')
    A.box(*front.box(0.18, 0.26, su0 - 0.15, su1 + 0.15, sz0 - 0.15, sz0 - 0.05), 'town_dark')
    A.anchor('anchor_screen', front.point(0.245, (su0 + su1) / 2, (sz0 + sz1) / 2), w=su1 - su0, h=sz1 - sz0, normal='+X')
    # crown: slate cornice band, parapet, roof, plant room with louvres
    A.box((X0 - 0.05, -Y - 0.05, UZ1), (X1 + 0.05, Y + 0.05, UZ1 + 0.35), 'town_slate', 0.02)
    A.box((X0 + 0.2, -Y + 0.2, UZ1 + 0.2), (X1 - 0.2, Y - 0.2, UZ1 + 0.35), 'town_roof')
    parapet(A, X0, X1, -Y, Y, UZ1 + 0.35, 0.55, 'town_slate')
    A.box(*front.box(0.0, 0.04, -2.6, 2.6, UZ1 + 0.4, UZ1 + 0.85), 'town_dark')   # sign band on the parapet
    A.anchor('anchor_sign', front.point(0.045, 0, UZ1 + 0.625), w=5.2, h=0.45, normal='+X')
    louvre_box(A, -3.4, -0.8, -2.2, 1.6, UZ1 + 0.35, UZ1 + 1.75)
    A.add(cyl((1.6, 2.2), 0.35, UZ1 + 0.35, UZ1 + 1.2, 14), 'town_metal', smooth=True)
    A.add(cyl((1.6, 2.2), 0.4, UZ1 + 1.2, UZ1 + 1.28, 14), 'town_metal', smooth=True)
    return A


# ============================================================== T03 MoE Capital: two-storey California flat roof
def build_T03():
    A = Asset('T03')
    X0, X1, Y, H = -5.0, 5.0, 4.0, 5.0
    A.extras.update(building='moe', footprint=[10, 5, 8])
    P = 1.8                       # ground-floor porch depth under the upper floor
    CX = X1 - P                   # ground-floor shopfront plane
    Z1 = 2.55                     # first floor level
    A.box((X0, -Y, 0), (X1, Y, PLAZA), 'town_stone_dark', 0.01)
    for i in range(1, 10):        # terracotta-ish porch paving joints
        x = CX + i * P / 10
        A.box((x - 0.012, -Y + 0.05, PLAZA), (x + 0.012, Y - 0.05, PLAZA + 0.004), 'town_stone')
    A.col_box((X0, -Y, -0.2), (X1, Y, PLAZA), 'col_floor')
    # ground floor: brick base walls (sides/back with windows), glazed shopfront with double door
    sp, sn, bk = Face('y', 1, Y), Face('y', -1, -Y), Face('x', -1, X0)
    for F, k in ((sp, 'gs'), (sn, 'gn')):
        facade(A, F, X0, CX, PLAZA, Z1, 3, 1, 1.2, 1.2, 'town_brick', 'T03' + k, wz=0.62, sill_mat='town_stone')
    facade(A, bk, -Y + 0.2, Y - 0.2, PLAZA, Z1, 3, 1, 1.2, 1.2, 'town_brick', 'T03gb', wz=0.62, sill_mat='town_stone')
    A.col_box((X0, -Y, PLAZA), (CX, Y, Z1), 'col_ground')
    sf = Face('x', 1, CX)
    A.box(*sf.box(-0.2, 0, -3.8, 3.8, PLAZA, PLAZA + 0.45), 'town_brick')          # stall riser
    for k, (a, b) in enumerate(((-3.8, -1.0), (1.0, 3.8))):
        n = 3
        for j in range(n):
            u0, u1 = a + j * (b - a) / n, a + (j + 1) * (b - a) / n
            A.box(*sf.box(-0.12, -0.06, u0 + 0.03, u1 - 0.03, PLAZA + 0.45, Z1 - 0.35), 'town_glass_lit' if lit(f'T03sf{k}{j}', 0.75) else 'town_glass_dark')
            A.box(*sf.box(-0.06, 0.0, u0 - 0.03, u0 + 0.03, PLAZA + 0.45, Z1 - 0.3), 'town_wood')
        A.box(*sf.box(-0.06, 0.0, b - 0.03, b + 0.03, PLAZA + 0.45, Z1 - 0.3), 'town_wood')
        A.box(*sf.box(-0.06, 0.02, a, b, PLAZA + 0.42, PLAZA + 0.48), 'town_wood')
    A.box(*sf.box(-0.2, 0, -3.8, 3.8, Z1 - 0.35, Z1), 'town_cream')               # transom band
    A.box(*sf.box(-0.2, 0, -Y, -3.8, PLAZA, Z1), 'town_brick')
    A.box(*sf.box(-0.2, 0, 3.8, Y, PLAZA, Z1), 'town_brick')
    for u0, u1 in ((-1.0, -0.04), (0.04, 1.0)):                                          # double door, wood frame
        A.box(*sf.box(-0.14, -0.08, u0, u1, PLAZA, Z1 - 0.4), 'town_glass_dark')
        for a in (u0, u1 - 0.07):
            A.box(*sf.box(-0.08, -0.02, a, a + 0.07, PLAZA, Z1 - 0.4), 'town_wood')
        A.box(*sf.box(-0.08, -0.02, u0, u1, Z1 - 0.47, Z1 - 0.4), 'town_wood')
        A.box(*sf.box(-0.08, -0.02, u0, u1, PLAZA, PLAZA + 0.12), 'town_wood')
        A.box(*sf.box(-0.02, 0.06, (u0 + u1) / 2 - 0.015 + (0.3 if u0 < 0 else -0.3), (u0 + u1) / 2 + 0.015 + (0.3 if u0 < 0 else -0.3), 0.9, 1.5), 'town_metal')
    A.box(*sf.box(-0.2, 0, -1.0, 1.0, Z1 - 0.4, Z1 - 0.35), 'town_wood')
    # porch posts (slender steel) at the porch edge, side return walls
    for y in (-3.75, 3.75):
        A.box((X1 - 0.22, y - 0.1, PLAZA), (X1 - 0.02, y + 0.1, Z1), 'town_cream', 0.02)
        A.col_box((X1 - 0.22, y - 0.1, PLAZA), (X1 - 0.02, y + 0.1, Z1), f'col_post_{y:+.0f}')
    for y in (-1.3, 1.3):
        A.add(cyl((X1 - 0.12, y), 0.07, PLAZA, Z1, 10), 'town_metal', smooth=True)
        A.col_bm(cyl((X1 - 0.12, y), 0.08, PLAZA, Z1, 8), f'col_steel_{y:+.0f}')
    # first floor slab (porch ceiling), upper floor cream walls with ribbon windows
    A.box((X0, -Y, Z1), (X1, Y, Z1 + 0.3), 'town_cream', 0.02)
    A.box((CX, -Y + 0.12, Z1 - 0.02), (X1 - 0.02, Y - 0.12, Z1), 'town_wood')               # wood porch soffit
    for k in range(9):
        x = CX + 0.1 + k * 0.2
        A.box((x - 0.02, -Y + 0.12, Z1 - 0.05), (x + 0.02, Y - 0.12, Z1 - 0.02), 'town_wood')
    UZ0, UZ1 = Z1 + 0.3, H - 0.25
    up = Face('x', 1, X1)
    # ribbon window: long strip broken by thin mullions, wood louvres on the south half
    A.box(*up.box(-0.2, 0, -Y, Y, UZ0, UZ0 + 0.55), 'town_cream')
    A.box(*up.box(-0.2, 0, -Y, Y, UZ1 - 0.3, UZ1), 'town_cream')
    A.box(*up.box(-0.2, 0, -Y, -Y + 0.4, UZ0 + 0.55, UZ1 - 0.3), 'town_cream')
    A.box(*up.box(-0.2, 0, Y - 0.4, Y, UZ0 + 0.55, UZ1 - 0.3), 'town_cream')
    n = 8
    for j in range(n):
        u0, u1 = -Y + 0.4 + j * (2 * Y - 0.8) / n, -Y + 0.4 + (j + 1) * (2 * Y - 0.8) / n
        A.box(*up.box(-0.2, -0.12, u0, u1, UZ0 + 0.55, UZ1 - 0.3), 'town_glass_lit' if lit(f'T03up{j}') else 'town_glass_dark')
        A.box(*up.box(-0.12, -0.06, u0 - 0.025, u0 + 0.025, UZ0 + 0.55, UZ1 - 0.3), 'town_trim')
    A.box(*up.box(-0.12, 0.08, -Y + 0.35, Y - 0.35, UZ0 + 0.5, UZ0 + 0.56), 'town_trim', 0.01)  # continuous sill
    for k in range(16):                                    # vertical cedar slats screening the south half
        u = 0.3 + k * 0.22
        A.box(*up.box(0.1, 0.18, u - 0.035, u + 0.035, UZ0 + 0.5, UZ1 - 0.25), 'town_wood')
    A.box(*up.box(0.02, 0.18, 0.2, 3.8, UZ1 - 0.3, UZ1 - 0.22), 'town_wood')
    A.box(*up.box(0.02, 0.18, 0.2, 3.8, UZ0 + 0.44, UZ0 + 0.5), 'town_wood')
    for u in (0.25, 3.75):
        A.box(*up.box(0.0, 0.18, u - 0.04, u + 0.04, UZ0 + 0.44, UZ1 - 0.22), 'town_wood')
    for F, k in ((sp, 'us'), (sn, 'un')):
        facade(A, F, X0, X1, UZ0, UZ1, 4, 1, 1.5, 1.05, 'town_cream', 'T03' + k, wz=0.55)
    facade(A, bk, -Y + 0.2, Y - 0.2, UZ0, UZ1, 3, 1, 1.4, 1.05, 'town_cream', 'T03ub', wz=0.55)
    A.col_box((X0, -Y, Z1), (X1, Y, H), 'col_upper')
    # thin flat roof plate with deep overhang (0.6 m) and fascia; roof deck, AC unit, skylight
    A.box((X0 - 0.6, -Y - 0.6, UZ1), (X1 + 0.6, Y + 0.6, UZ1 + 0.18), 'town_trim', 0.02)
    A.box((X0 - 0.62, -Y - 0.62, UZ1 + 0.18), (X1 + 0.62, Y + 0.62, UZ1 + 0.26), 'town_cream', 0.02)
    A.box((X0 + 0.1, -Y + 0.1, UZ1 + 0.26), (X1 - 0.1, Y - 0.1, UZ1 + 0.3), 'town_roof')
    A.box((-3.2, -2.6, UZ1 + 0.3), (-1.8, -1.4, UZ1 + 0.95), 'town_trim', 0.03)
    A.add(cyl((-2.5, -2.0), 0.42, UZ1 + 0.95, UZ1 + 0.99, 16), 'town_metal', smooth=True)
    A.box((0.5, 0.8, UZ1 + 0.3), (2.3, 2.6, UZ1 + 0.5), 'town_metal', 0.02)
    A.box((0.58, 0.88, UZ1 + 0.5), (2.22, 2.52, UZ1 + 0.53), 'town_glass_dark')
    # sign: wood letters board on the porch fascia (runtime face)
    A.box(*up.box(0.0, 0.05, -2.4, 2.4, Z1 + 0.04, Z1 + 0.28), 'town_wood')
    A.anchor('anchor_sign', up.point(0.055, 0, Z1 + 0.16), w=4.6, h=0.22, normal='+X')
    # planter boxes either side of the door (succulent mounds)
    for y in (-2.3, 2.3):
        A.box((CX + 0.15, y - 0.55, PLAZA), (CX + 0.75, y + 0.55, PLAZA + 0.45), 'town_cream', 0.03)
        A.box((CX + 0.2, y - 0.5, PLAZA + 0.38), (CX + 0.7, y + 0.5, PLAZA + 0.43), 'town_brick')
        for k in range(3):
            A.add(lathe([(0, 0), (0.14, 0.03), (0.17, 0.12), (0.1, 0.24), (0, 0.27)], 8, (CX + 0.45, y - 0.3 + k * 0.3, PLAZA + 0.42), k), 'palm_leaf', smooth=True)
        A.col_box((CX + 0.15, y - 0.55, PLAZA), (CX + 0.75, y + 0.55, PLAZA + 0.7), f'col_planter_{y:+.0f}')
    return A



# ============================================================== T12 palms (two variants as child parts; leaves carry _WIND)
def palm(A, tag, height, lean, lean_dir, n_fronds, seed, origin=(0, 0, 0)):
    import random
    rnd = random.Random(seed)
    A.use(f'T12_{tag}_trunk')
    # curved trunk: stacked tapering rings (one ring per ~0.32 m), each ring a slightly flared frustum
    segs = int(height / 0.32)
    d = Vector((math.cos(lean_dir), math.sin(lean_dir), 0))
    def axis(t):  # quadratic lean
        return Vector(origin) + d * (lean * t * t) + Vector((0, 0, height * t))
    sides = 9
    for i in range(segs):
        t0, t1 = i / segs, (i + 1) / segs
        p0, p1 = axis(t0), axis(t1)
        r0 = 0.2 - 0.07 * t0 + (0.05 if i == 0 else 0)
        r1 = 0.2 - 0.07 * t1
        prof = [(r0 * 0.9, 0.0), (r0, 0.06), (r1 * 1.08, (p1 - p0).length * 0.92), (r1 * 0.92, (p1 - p0).length)]
        bm = lathe(prof, sides, (0, 0, 0), rot=i * 0.35)
        q = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
        xform(bm, Matrix.Translation(p0) @ q.to_matrix().to_4x4())
        A.add(bm, 'palm_trunk', smooth=True,
              wind=lambda co, h=height: (min(1.0, (co.z / h) ** 2), 0.0, 0.0, 0.0))
    top = axis(1.0)
    # crown shaft + boot and coconut cluster
    A.add(lathe([(0.0, -0.05), (0.15, 0.0), (0.2, 0.18), (0.17, 0.42), (0.08, 0.55), (0.0, 0.6)], 10, tuple(top)), 'palm_trunk', smooth=True,
          wind=lambda co, h=height: (min(1.0, (co.z / h) ** 2), 0.0, 0.0, 0.0))
    for k in range(5):
        a = k * 2 * math.pi / 5 + rnd.random() * 0.4
        c = top + Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, 0.05 + 0.05 * (k % 2)))
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.1)
        xform(bm, Matrix.Translation(c))
        A.add(bm, 'palm_trunk', smooth=True, wind=lambda co, h=height: (min(1.0, (co.z / h) ** 2), 0.0, 0.0, 0.0))
    A.use(f'T12_{tag}_leaves')
    for f in range(n_fronds):
        az = f * 2 * math.pi / n_fronds + rnd.uniform(-0.15, 0.15)
        L = rnd.uniform(2.3, 2.9)
        rise = rnd.uniform(0.35, 0.75) if f % 3 else rnd.uniform(0.1, 0.3)
        droop = rnd.uniform(1.3, 1.9)
        dirv = Vector((math.cos(az), math.sin(az), 0))
        side = Vector((-math.sin(az), math.cos(az), 0))
        n = 9
        def rachis(t):
            return top + Vector((0, 0, 0.45)) + dirv * (L * t) + Vector((0, 0, rise * t * 2.2 - droop * t * t))
        bm = bmesh.new()
        # midrib: thin quad strip (two-sided card) + pinnae as folded V blades either side
        prev = None
        for i in range(n + 1):
            t = i / n
            c = rachis(t)
            w = 0.035 * (1 - t) + 0.008
            a_ = bm.verts.new(c - side * w); b_ = bm.verts.new(c + side * w)
            if prev:
                bm.faces.new((prev[0], prev[1], b_, a_))
            prev = (a_, b_)
        for i in range(1, n):
            t = i / n
            c = rachis(t)
            tang = (rachis(min(1, t + 0.05)) - rachis(max(0, t - 0.05))).normalized()
            span = 0.62 * math.sin(math.pi * min(1, t * 1.05)) + 0.1
            for sgn in (-1, 1):
                tip = c + side * sgn * span + tang * 0.18 - Vector((0, 0, 0.16 + 0.25 * t))
                fold = Vector((0, 0, 0.045))
                r0 = c + tang * -0.07
                r1 = c + tang * 0.07
                mid = (c + tip) / 2 + fold + tang * 0.06
                v = [bm.verts.new(x) for x in (r0, r1, mid, tip)]
                bm.faces.new((v[0], v[2], v[3])); bm.faces.new((v[2], v[1], v[3]))
                bm.faces.new((v[0], v[1], v[2]))
        grp = (f % 8 + 0.5) / 8
        def w(co, base=top, Ln=L, g=grp, h=height):
            r = min(1.0, (co - base).length / Ln)
            return (1.0, r, r * r, g)
        A.add(bm, 'palm_leaf' if f % 2 else 'palm_leaf_dark', smooth=False, closed=False, wind=w)
    # trunk collider: slim hull along the lower 3 m (leaves have none)
    pts = [axis(t) for t in (0.0, min(1.0, 3.0 / height))]
    bm = bmesh.new()
    for p, r in ((pts[0], 0.24), (pts[1], 0.2)):
        for k in range(8):
            a = k * math.pi / 4
            bm.verts.new((p.x + r * math.cos(a), p.y + r * math.sin(a), p.z))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    A.col_bm(bm, f'col_{tag}_trunk')

def build_T12():
    A = Asset('T12')
    A.extras.update(kind='palm', variants=['a', 'b'], windAttribute='_WIND xyzw=bend,branch,leaf,phaseGroup')
    palm(A, 'a', 6.4, 0.7, 0.4, 11, 7)
    palm(A, 'b', 5.3, 1.0, 2.6, 10, 19, origin=(0, -4.0, 0))
    # variant b is authored 4 m along Blender -Y (glTF +Z); runtime subtracts variantOrigin
    A.part_extras = {f'T12_{v}_{p}': {'variant': v, 'variantOriginGLB': [0, 0, 0] if v == 'a' else [0, 0, 4.0]} for v in 'ab' for p in ('trunk', 'leaves')}
    return A

BUILDERS = {k[6:]: v for k, v in globals().items() if k.startswith('build_T')}

def main():
    ids = ONLY or sorted(BUILDERS)
    report = {}
    for aid in ids:
        reset_scene()
        A = BUILDERS[aid]()
        objs, lo, hi = finalize(A)
        glb = export(A, objs, REPO)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH' and not o.name.startswith('col_'))
        report[aid] = dict(glb=os.path.relpath(glb, REPO), tris=tris, bounds=[list(lo), list(hi)], colliders=len(A.cols))
        print(f'[town] {aid} tris={tris} bounds={tuple(round(v,3) for v in lo)}..{tuple(round(v,3) for v in hi)} cols={len(A.cols)}')
    print('[town-report]', json.dumps(report))

main()

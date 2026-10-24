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

"""Build one L1 vehicle GLB.  Run via:
  tools/blender-run.sh vehicles tools/world/vehicles/build_vehicle.py G25 [--render]
Outputs public/assets/world/vehicles/<ID>.glb, tools/world/vehicles/blend/<ID>.blend,
docs/world/vehicles/<ID>-report.json, hull JSON entry, preview renders.
"""
import sys, os, math, json, importlib
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/vehicles'))
import vehlib as V
importlib.reload(V)
import bpy
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ASSET = ARGS[0] if ARGS else 'G25'
RENDER = '--render' in ARGS
GEN = 'vehicles-r1'

def mirror_y(points):
    return [(x, -y, z) for x, y, z in points]

def side_map(s, plane_y):
    """(u=x, v=z, d=outward) on a side plane y = s*plane_y(z)."""
    return lambda u, v, d: (u, s * (plane_y(v) + d), v)

def face_map_x(x0, s=1):
    """(u=y, v=z, d) on a plane x = x0, d outward along s*X."""
    return lambda u, v, d: (x0 + s * d, u, v)

def slope_map(base, top):
    """(u=y, v=distance along the slope from base, d=outward normal) on the plane through the XZ
    segment base->top (extruded along Y). Normal points to +X side (front glass) or -X (rear glass)."""
    b, t = Vector((base[0], base[1])), Vector((top[0], top[1]))
    s = (t - b).normalized()
    n = Vector((s.y, -s.x)) if s.y > 0 and base[0] > top[0] else Vector((-s.y, s.x))
    return lambda u, v, d: (b.x + s.x * v + n.x * d, u, b.y + s.y * v + n.y * d), (t - b).length

def lamp_x(part, hulls, x0, y, z, r, s, lens_mat, bezel_mat, segs=24, dome=0.022, ring=True):
    """Round lamp on a face x = x0 facing s*X: bezel ring, recessed housing, domed lens."""
    rot = Matrix.Rotation(-s * math.pi / 2, 4, 'Z')  # local +Y (lathe axis) -> s*X
    at = Matrix.Translation((x0, y, z)) @ rot
    bm, _ = V.lathe([(0, -0.01), (r * 1.18, -0.01), (r * 1.18, 0.012), (r * 1.02, 0.02), (r * 0.98, 0.004), (0, 0.004)], segs, closed=True)
    part.add(V.xform(bm, at), bezel_mat if ring else 'veh_accent_dark')
    prof = [(0, 0.0)] + [(r * math.cos(a), dome * math.sin(a) + 0.006) for a in (0.0, 0.6, 1.1)] + [(0, dome + 0.006)]
    bm, _ = V.lathe(prof, segs, closed=True)
    part.add(V.xform(bm, at), lens_mat)

# =============================================================================================
#  G25 offroad 4x4 (Defender-90 type). slate body, orange roof + rear upper, cream bumpers.
# =============================================================================================
def build_G25():
    R, TRACK, WB = 0.378, 0.96, 2.652
    AX = WB / 2
    BODY_Y = -1.0566  # ground plane in rigid-body space (measured rest, DESIGN 1)
    CLIP = 0.42
    FLARE_CLIP = 0.30  # flare blocks sit over the tyres: a low post can never get under them (DESIGN 6)
    SLIDER_Z = 0.30   # sill / rock-slider bottom between the axles (clears 18 cm curbs and 30 cm steps)
    body = V.Part('G25_body', smooth_angle=32)
    H = V.Hulls()
    HW = 0.98
    ARCH_HW, ARCH_H, SILL = 0.405, 0.43, 0.50
    def arch(cx, flat=False):
        pts = V.squircle_arch(cx, SILL, ARCH_HW, ARCH_H, n=13, p=3.2)
        return [(x, SILL) for x, _ in pts] if flat else pts
    def tub_profile(t):
        flat = t < 0.78
        p = [(1.80, SILL), (1.805, 1.03), (1.775, 1.115), (1.70, 1.135), (0.64, 1.22), (-1.78, 1.22), (-1.80, 1.20), (-1.80, SILL)]
        p += arch(-AX, flat) + arch(AX, flat)
        return V.offset_poly(p, 0.018) if t > 0.99 else p
    tub_ts = [0, 0.7755, 0.796, 0.959, 1.0]
    def tub_mat(i, to, c):
        x, y, z = c
        in_arch = any(abs(x - s * AX) < ARCH_HW + 0.01 for s in (1, -1))
        if z < SILL + 0.006:
            return 'veh_accent_dark'
        if in_arch and z < SILL + ARCH_H + 0.04 and abs(y) < 0.95:
            return 'veh_accent_dark'
        return 'veh_paint_slate'
    bm, fm = V.loft_y(tub_profile, tub_ts, HW, tub_mat, 'veh_paint_slate')
    H.take('tub', bm)
    body.add(bm, face_mats=fm)

    # greenhouse: front cab (slate) + rear tub (orange), planar tumblehome, buried 3 cm in the tub
    GZ0, GZ1, K = 1.19, 1.81, 0.09
    WS_B, WS_T = (0.655, GZ0), (0.53, GZ1)
    def gh(hw0, x0, x1, front):
        def prof(t):
            if front:
                p = [(x0, GZ0), (WS_B[0], GZ0), WS_T, (x0, GZ1)]
            else:
                p = [(x0, GZ0), (x1, GZ0), (x1, GZ1), (x0, GZ1)]
            return V.offset_poly(p, 0.025) if t > 0.99 else p
        yfn = lambda t, x, z: t * (hw0 - K * max(0.0, z - GZ0))
        return prof, yfn
    for front, hw0, x0, x1, mat in ((True, 0.971, -0.11, None, 'veh_paint_slate'), (False, 0.975, -1.80, -0.10, 'veh_paint_orange')):
        prof, yfn = gh(hw0, x0, x1, front)
        bm, fm = V.loft_y(prof, [0, 0.96, 1.0], hw0, lambda i, to, c, m=mat: m, mat, yfn=yfn)
        H.take('cabin', bm)
        body.add(bm, face_mats=fm)
    plane_g = lambda hw0: (lambda z: hw0 - K * max(0.0, z - GZ0))
    # roof slab with drip edge
    RZ0, RZ1 = 1.795, 1.885
    rhw = 0.975 - K * (RZ0 - GZ0) + 0.012
    roof_p = V.rrect(-1.815, RZ0, 0.565, RZ1, 0.035, 2)
    bm, fm = V.loft_y(lambda t: V.offset_poly(roof_p, 0.018) if t > 0.99 else roof_p, [0, 0.965, 1.0], rhw,
                      lambda i, to, c: 'veh_paint_orange', 'veh_paint_orange')
    H.take('cabin', bm)
    body.add(bm, face_mats=fm)

    # glass: windscreen, door windows, rear side windows, rear window
    m, L = slope_map(WS_B, WS_T)
    bm, _ = V.prism(V.rrect(-0.80, 0.07, 0.80, L - 0.06, 0.03, 2), m, -0.012, 0.006)
    body.add(bm, 'veh_glass')
    # windscreen centre post + wiper
    bm, _ = V.prism(V.rrect(-0.025, 0.05, 0.025, L - 0.04, 0.01, 1), m, -0.01, 0.012)
    body.add(bm, 'veh_paint_slate')
    for yy in (-0.38, 0.38):
        bm, _ = V.prism([(yy - 0.30, 0.10), (yy + 0.02, 0.10), (yy + 0.02, 0.118), (yy - 0.30, 0.122)], m, 0.004, 0.016)
        body.add(bm, 'veh_accent_dark')
    for s in (1, -1):
        afx = lambda z: WS_B[0] + (WS_T[0] - WS_B[0]) * (z - GZ0) / (GZ1 - GZ0) - 0.075
        door_win = [(-0.05, 1.27), (afx(1.27), 1.27), (afx(1.745), 1.745), (-0.05, 1.745)]
        bm, _ = V.prism(door_win, side_map(s, plane_g(0.971)), -0.01, 0.006)
        body.add(bm, 'veh_glass')
        bm, _ = V.prism(V.rrect(-1.70, 1.275, -0.24, 1.74, 0.04, 2), side_map(s, plane_g(0.975)), -0.01, 0.006)
        body.add(bm, 'veh_glass')
        # door skin (raised 6 mm, chamfered) -> real door seam; handle; hinge plates
        flat = lambda z: HW
        bm, _ = V.stepped_plate(V.rrect(-0.12, 0.545, 0.60, 1.175, 0.025, 2), side_map(s, flat), -0.004, 0.006, 0.003)
        body.add(bm, 'veh_paint_slate')
        bm, _ = V.stepped_plate(V.rrect(-0.06, 1.045, 0.10, 1.085, 0.012, 2), side_map(s, flat), 0.0, 0.026, 0.006)
        body.add(bm, 'veh_accent_dark')
        for hz in (0.70, 1.02):
            bm, _ = V.stepped_plate(V.rrect(0.54, hz, 0.64, hz + 0.07, 0.01, 1), side_map(s, flat), 0.0, 0.018, 0.004)
            body.add(bm, 'veh_accent_dark')
        # rear quarter seam (side panel) + fuel cap
        bm, _ = V.stepped_plate(V.rrect(-1.72, 1.01, -0.20, 1.175, 0.02, 2), side_map(s, flat), -0.004, 0.005, 0.0025)
        body.add(bm, 'veh_paint_slate')
        if s == -1:
            bm, _ = V.stepped_plate(V.circle(-1.25, 1.07, 0.055, 16), side_map(s, flat), 0.0, 0.012, 0.004)
            body.add(bm, 'veh_accent_dark')
        # side step / rock slider
        # rock slider between the arches: box rail + round tube, vertical outer face from 0.30 to 0.50 m.
        # It is also the sill collision block (own hull, vertical sides: a low post cannot ride under it)
        y0, y1 = (0.84, 1.0) if s > 0 else (-1.0, -0.84)
        bm = V.box((-0.86, y0, SLIDER_Z), (0.86, y1, 0.50), 0.014)
        H.take('sill' + ('L' if s > 0 else 'R'), bm)
        body.add(bm, 'veh_accent_dark')
        body.add(V.cylinder((-0.84, s * 1.005, SLIDER_Z + 0.07), (0.84, s * 1.005, SLIDER_Z + 0.07), 0.032, 10), 'veh_metal_dark')
        for xx in (-0.55, 0.0, 0.55):
            body.add(V.cylinder((xx, s * 0.96, SLIDER_Z + 0.07), (xx, s * 1.0, SLIDER_Z + 0.07), 0.022, 8), 'veh_metal_dark')
        # fender flares: band around each arch, buried in the side, outer face at y = 1.125
        for cx in (AX, -AX):
            inner = V.squircle_arch(cx, SILL, ARCH_HW, ARCH_H, n=13, p=3.2)
            outer = V.squircle_arch(cx, SILL - 0.02, ARCH_HW + 0.065, ARCH_H + 0.07, n=13, p=3.2, forward=False)
            band = inner + outer
            bm, _ = V.stepped_plate(band, lambda u, v, d, s=s: (u, s * d, v), 0.955, 1.125, 0.016)
            fl = 'flare' + ('F' if cx > 0 else 'R') + ('L' if s > 0 else 'R')
            # vertical-faced block over the flare (front/back faces vertical so a post or trunk can never act
            # as a ramp under the sloped arch ends); covers the tyre's outer face from CLIP to the arch top
            xs = [x for x, z in band]
            H.boxpts(fl, (min(xs), min(s * 0.955, s * 1.125), FLARE_CLIP), (max(xs), max(s * 0.955, s * 1.125), max(z for x, z in band)))
            body.add(bm, 'veh_paint_slate')
        # mirror: arm + housing + glass
        body.add(V.cylinder((0.60, s * 0.955, 1.29), (0.555, s * 1.095, 1.385), 0.014, 8), 'veh_accent_dark')
        bm = V.box((0.50, s * 1.075 if s > 0 else -1.185, 1.33), (0.585, 1.185 if s > 0 else -1.075, 1.47), 0.02)
        body.add(bm, 'veh_accent_dark')
        bm, _ = V.prism(V.rrect(-0.045, 1.345, 0.045, 1.455, 0.012, 1) if s > 0 else V.rrect(-0.045, 1.345, 0.045, 1.455, 0.012, 1),
                        lambda u, v, d, s=s: (0.50 - d, s * (1.13 + u), v), -0.004, 0.004)
        body.add(bm, 'veh_glass')

    # beltline capping (slim dark strip) both sides
    for s in (1, -1):
        bm, _ = V.prism(V.rrect(-1.79, 1.168, 0.63, 1.188, 0.008, 1), side_map(s, lambda z: HW), -0.004, 0.008)
        body.add(bm, 'veh_accent_dark')
    # hood: raised centre panel + vents
    hz = lambda x: 1.22 + (x - 0.64) * (1.135 - 1.22) / (1.70 - 0.64)
    hm = lambda u, v, d: (u, v, hz(u) + d)
    bm, _ = V.stepped_plate(V.rrect(0.76, -0.44, 1.62, 0.44, 0.06, 3), hm, -0.01, 0.022, 0.012)
    body.add(bm, 'veh_paint_slate')
    for s in (1, -1):
        for k in range(3):
            bm, _ = V.prism(V.rrect(1.02 + k * 0.07, s * 0.62 - 0.12, 1.05 + k * 0.07, s * 0.62 + 0.12, 0.01, 1), hm, -0.006, 0.008)
            body.add(bm, 'veh_accent_dark')
    # front face: grille panel, slats, round headlights, amber indicators
    fx = 1.805
    bm, _ = V.stepped_plate(V.rrect(-0.88, 0.70, 0.88, 1.06, 0.03, 2), face_map_x(fx), -0.01, 0.014, 0.006)
    body.add(bm, 'veh_accent_dark')
    for zz in (0.80, 0.87, 0.94, 1.01):
        bm, _ = V.prism(V.rrect(-0.40, zz - 0.012, 0.40, zz + 0.012, 0.008, 1), face_map_x(fx), 0.0, 0.03)
        body.add(bm, 'veh_metal_dark')
    for s in (1, -1):
        lamp_x(body, H, fx + 0.012, s * 0.625, 0.885, 0.098, 1, 'veh_light_front', 'veh_accent_cream', segs=24)
        bm, _ = V.stepped_plate(V.rrect(s * 0.80 - 0.035, 0.85, s * 0.80 + 0.035, 0.92, 0.012, 1), face_map_x(fx + 0.01), 0.0, 0.016, 0.004)
        body.add(bm, 'veh_accent_amber')
    # front bumper, bull bar hoop with two driving lamps, D-ring shackles
    bm = V.box((1.78, -0.95, 0.44), (1.99, 0.95, 0.645), 0.03)
    H.take('bumperF', bm)
    body.add(bm, 'veh_accent_cream')
    # steel skid plate under the bumper: vertical front face down to 0.33 m (perimeter collision, DESIGN 6)
    bm, _ = V.prism([(1.62, 0.33), (1.93, 0.33), (1.965, 0.36), (1.965, 0.45), (1.62, 0.45)], lambda u, v, d: (u, d, v), -0.70, 0.70)
    H.take('bumperF', bm)
    body.add(bm, 'veh_metal_dark')
    hoop = [(1.995, -0.36, 0.62), (2.02, -0.33, 0.84), (2.025, -0.25, 0.90), (2.025, 0.25, 0.90), (2.02, 0.33, 0.84), (1.995, 0.36, 0.62)]
    for b in V.tube_path(hoop, 0.024, 10):
        H.take('bumperF', b)
        body.add(b, 'veh_accent_cream')
    body.add(V.cylinder((1.995, 0, 0.66), (2.025, 0, 0.88), 0.02, 8), 'veh_accent_cream')
    body.add(V.cylinder((2.008, -0.345, 0.765), (2.008, 0.345, 0.765), 0.016, 8), 'veh_accent_cream')
    for s in (1, -1):
        lamp_x(body, H, 2.04, s * 0.17, 0.765, 0.052, 1, 'veh_light_front', 'veh_accent_dark', segs=16, dome=0.012, ring=False)
        body.add(V.cylinder((2.0, s * 0.17, 0.765), (2.035, s * 0.17, 0.765), 0.06, 14), 'veh_accent_dark')
        body.add(V.torus((2.01, s * 0.55, 0.50), (0, 1, 0), 0.034, 0.011, 10, 5), 'veh_metal')
    # rear face: door skin, window, handle, spare-carrier bracket, tail + reverse lamps, bumper, hitch
    rx = -1.80
    rm = face_map_x(rx, -1)
    bm, _ = V.stepped_plate(V.rrect(-0.58, 0.56, 0.66, 1.17, 0.025, 2), rm, -0.004, 0.006, 0.003)
    body.add(bm, 'veh_paint_slate')
    bm, _ = V.prism(V.rrect(-0.62, 1.28, 0.62, 1.72, 0.04, 2), face_map_x(rx, -1), -0.01, 0.006)
    body.add(bm, 'veh_glass')
    bm, _ = V.stepped_plate(V.rrect(-0.50, 0.95, -0.36, 0.99, 0.012, 1), rm, 0.0, 0.026, 0.006)
    body.add(bm, 'veh_accent_dark')
    for s in (1, -1):
        bm, _ = V.stepped_plate(V.rrect(s * 0.86 - 0.055, 0.80, s * 0.86 + 0.055, 1.10, 0.025, 2), rm, -0.004, 0.018, 0.006)
        body.add(bm, 'veh_light_brake')
        bm, _ = V.stepped_plate(V.rrect(s * 0.86 - 0.055, 0.69, s * 0.86 + 0.055, 0.77, 0.02, 2), rm, -0.004, 0.016, 0.005)
        body.add(bm, 'veh_light_reverse')
        bm = V.box((-1.94, s * 0.62 if s > 0 else -0.95, 0.44), (-1.77, 0.95 if s > 0 else -0.62, 0.645), 0.025)
        H.take('bumperR', bm)
        body.add(bm, 'veh_accent_cream')
    bm = V.box((-1.86, -0.62, 0.52), (-1.78, 0.62, 0.61), 0.015)
    body.add(bm, 'veh_accent_dark')
    # rear cross-member / valance: vertical rear face down to 0.34 m
    bm, _ = V.prism([(-1.90, 0.34), (-1.62, 0.34), (-1.62, 0.45), (-1.90, 0.45), (-1.925, 0.37)], lambda u, v, d: (u, d, v), -0.88, 0.88)
    H.take('bumperR', bm)
    body.add(bm, 'veh_metal_dark')
    bm = V.box((-2.04, -0.07, 0.50), (-1.84, 0.07, 0.575), 0.012)
    H.take('bumperR', bm)
    body.add(bm, 'veh_metal_dark')
    body.add(V.cylinder((-2.0, 0, 0.575), (-2.0, 0, 0.60), 0.012, 8), 'veh_metal')
    bm, _ = V.lathe([(0, -0.035)] + [(0.035 * math.sin(a), -0.035 * math.cos(a)) for a in (0.5, 1.0, 1.57, 2.1, 2.6)] + [(0, 0.035)], 12, closed=False)
    body.add(V.xform(bm, Matrix.Translation((-2.0, 0, 0.635)) @ Matrix.Rotation(math.pi / 2, 4, 'X')), 'veh_metal')
    # underbody: chassis rails + axle housings between the wells (visible from low angles)
    for s in (1, -1):
        body.add(V.box((-1.70, s * 0.36 - 0.05, 0.43), (1.70, s * 0.36 + 0.05, 0.505)), 'veh_accent_dark')
    # roof rack (tube frame, 6 legs, cross bars) + spare tyre on the rack
    rz = RZ1 + 0.09
    rx0, rx1, ry = -1.64, 0.36, 0.80
    frame = [(rx0, -ry, rz), (rx1, -ry, rz), (rx1, ry, rz), (rx0, ry, rz), (rx0, -ry, rz)]
    for b in V.tube_path(frame, 0.02, 8):
        H.take('rack', b)
        body.add(b, 'veh_metal_dark')
    for xx in (rx0, (rx0 + rx1) / 2, rx1):
        for s in (1, -1):
            body.add(V.cylinder((xx, s * ry, RZ1 - 0.01), (xx, s * ry, rz), 0.018, 8), 'veh_metal_dark')
    for xx in (-1.24, -0.84, -0.44, -0.04):
        body.add(V.cylinder((xx, -ry, rz), (xx, ry, rz), 0.016, 8), 'veh_metal_dark')
    spare = V.build_wheel('spare', R, 0.28, 0.24, 5, 'veh_accent_cream', 'veh_metal', segs=24,
                          tread=dict(rows=2, count=11, depth=0.022, block_frac=0.55))
    sbm = spare.bm
    mat_names = spare.slots
    sbm.faces.ensure_lookup_table()
    fmats = [mat_names[f.material_index] for f in sbm.faces]
    V.xform(sbm, Matrix.Translation((-0.70, 0, rz + 0.012 + 0.14)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    H.take('rack', sbm)
    body.add(sbm, face_mats=fmats)
    return dict(body=body, hulls=H, R=R, TRACK=TRACK, AX=AX, BODY_Y=BODY_Y, CLIP=CLIP,
                wheel=dict(width=0.30, rim_r=0.235, spokes=5, rim='veh_accent_cream', hub='veh_metal', segs=32,
                           tread=dict(rows=2, count=14, depth=0.024, block_frac=0.56)))

BUILDERS = {'G25': build_G25}

def main():
    V.reset_scene()
    spec = BUILDERS[ASSET]()
    root = bpy.data.objects.new(ASSET, None)
    bpy.context.scene.collection.objects.link(root)
    body = V.make_object(spec['body'], root)
    w = spec['wheel']
    wp = V.build_wheel(f'{ASSET}_wheel', spec['R'], w['width'], w['rim_r'], w['spokes'], w['rim'], w['hub'], segs=w['segs'],
                       tread=w.get('tread'), steel=w.get('steel', False), spoke_w=w.get('spoke_w', 0.032))
    wheel_me = V.make_object(wp, root)
    me = wheel_me.data
    bpy.data.objects.remove(wheel_me)
    wheels = []
    # glTF +Z right = Blender -Y. Order matches wheelGeometry().points: FR, FL, RR, RL.
    for name, x, side in (('wheel-front-right', spec['AX'], -1), ('wheel-front-left', spec['AX'], 1),
                          ('wheel-rear-right', -spec['AX'], -1), ('wheel-rear-left', -spec['AX'], 1)):
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        ob.location = (x, side * spec['TRACK'], spec['R'])
        if side < 0:
            ob.rotation_euler = (0, 0, math.pi)
        wheels.append(ob)
    objs = [body] + wheels
    hulls = spec['hulls'].export()
    lo, hi = V.world_bounds(objs)
    root['assetId'] = ASSET
    root['generator'] = GEN
    root['front'] = '+X'; root['up'] = '+Y (glTF)'; root['right'] = '+Z (glTF)'
    root['origin'] = 'tyre contact plane centre; wheel centre y = +r'
    root['wheelRadius'] = spec['R']; root['wheelWidth'] = w['width']
    root['bodyY'] = spec['BODY_Y']; root['clip'] = spec['CLIP']
    root['collisionSchema'] = 'vehicle-hulls-v1'
    root['collisionHulls'] = json.dumps(hulls)
    checks = {o.name: V.mesh_checks(o) for o in [body, wheels[0]]}
    src_tris = {o.name: V.evaluated_tris(o) for o in objs}
    body_name, wheel_name = body.name, wheels[0].name
    glb = V.export_glb(ASSET, root, objs)
    V.write_hulls(ASSET, {'bodyY': spec['BODY_Y'], 'clip': spec['CLIP'], 'wheelRadius': spec['R'], 'wheelWidth': w['width'], 'hulls': hulls})
    render = None
    if RENDER:
        render = V.render_views(ASSET, root, objs)
    back = V.reimport_check(glb)
    report = {'asset': ASSET, 'generator': GEN, 'blender': bpy.app.version_string, 'sourceBounds': [lo, hi],
              'sourceTris': src_tris, 'bodyTris': src_tris[body_name], 'wheelTris': src_tris[wheel_name],
              'totalTris': sum(src_tris.values()), 'checks': checks, 'reimport': back,
              'hulls': [{'part': h['part'], 'faces': h['faces'], 'points': len(h['points']) // 3} for h in hulls],
              'render': render}
    os.makedirs(V.DOC_DIR, exist_ok=True)
    with open(os.path.join(V.DOC_DIR, f'{ASSET}-report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    print('[vehicle]', json.dumps({k: report[k] for k in ('asset', 'bodyTris', 'wheelTris', 'totalTris', 'sourceBounds')}))
    print('[vehicle] checks', json.dumps(checks))
    print('[vehicle] reimport', json.dumps({k: back[k] for k in ('tris', 'bounds', 'bytes')}))

main()

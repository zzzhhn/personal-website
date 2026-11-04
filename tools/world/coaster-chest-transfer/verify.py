"""Check the published source interface, GLB channels and moving geometry."""
import hashlib
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
baseline = "0f3274b8f7a933d1e396ced857fc4bed7fd7d63d"
out = (Path(sys.argv[1]) if len(sys.argv) > 1
       else root / "docs/world/phase-2-playground/coaster-chest-transfer-20261104")
glb = out / "coaster-chest.glb"
blob = glb.read_bytes()
magic, version, length = struct.unpack_from("<4sII", blob)
assert (magic, version, length) == (b"glTF", 2, len(blob))
json_len, kind = struct.unpack_from("<I4s", blob, 12)
assert kind == b"JSON"
g = json.loads(blob[20:20 + json_len])
bin_len, kind = struct.unpack_from("<I4s", blob, 20 + json_len)
assert kind == b"BIN\0"
data = memoryview(blob)[28 + json_len:]
assert len(data) == bin_len


def access(i):
    a = g["accessors"][i]
    view = g["bufferViews"][a["bufferView"]]
    assert view.get("buffer", 0) == 0
    assert not a.get("sparse")
    fmt = "<" + {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[a["componentType"]] * {
        "SCALAR": 1, "VEC2": 2, "VEC3": 3,
    }[a["type"]]
    pos = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", struct.calcsize(fmt))
    return [struct.unpack_from(fmt, data, pos + stride * j) for j in range(a["count"])]


def sub(a, b):
    return tuple(i - j for i, j in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


prims = 0
triangles = 0
positions = []
for mesh in g["meshes"]:
    pts = []
    for p in mesh["primitives"]:
        prims += 1
        assert p.get("mode", 4) == 4 and 0 <= p["material"] < len(g["materials"])
        at = p["attributes"]
        vertex, normal, uv = (access(at[k]) for k in ("POSITION", "NORMAL", "TEXCOORD_0"))
        assert len(vertex) == len(normal) == len(uv)
        assert all(math.isfinite(x) for arr in (vertex, normal, uv) for row in arr for x in row)
        assert all(.995 < math.hypot(*n) < 1.005 for n in normal)
        indices = [r[0] for r in access(p["indices"])]
        assert len(indices) % 3 == 0 and all(0 <= i < len(vertex) for i in indices)
        triangles += len(indices) // 3
        for i in range(0, len(indices), 3):
            a, b, c = (vertex[indices[j]] for j in range(i, i + 3))
            assert math.hypot(*cross(sub(b, a), sub(c, a))) > 1e-10, mesh["name"]
        pts.extend(vertex)
    positions.append(pts)

names = {n["name"]: i for i, n in enumerate(g["nodes"])}
roots = {g["nodes"][i]["name"] for i in g["scenes"][g["scene"]]["nodes"]}
assert roots == {"ChestBody", "ChestLid", *(f"Lock{i:02}" for i in range(1, 7)),
                 *(f"Signal{i:02}" for i in range(1, 8))}, roots
assert not any(g.get(k) for k in ("animations", "cameras", "skins"))


def local(node):
    o = g["nodes"][node]
    # The builder supplies positions and editable local origins, with rest
    # rotation and scale identity. Exporting a different basis would change
    # the direction of lid and lock rotations applied by Three.
    assert "matrix" not in o
    for expected, observed in zip((0, 0, 0, 1), o.get("rotation", (0, 0, 0, 1))):
        assert abs(expected - observed) < 1e-5
    assert o.get("scale", [1, 1, 1]) == [1, 1, 1]
    return o.get("translation", (0, 0, 0))


def near(a, b, tolerance=1e-5):
    return all(abs(x - y) <= tolerance for x, y in zip(a, b))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def subtree(node, pose=(0, 0, 0), rotate_x=0):
    o = g["nodes"][node]
    pts = positions[o["mesh"]][:] if "mesh" in o else []
    for child in o.get("children", []):
        pts.extend(subtree(child))
    c, s = math.cos(rotate_x), math.sin(rotate_x)
    origin = add(local(node), pose)
    return [add((x, c * y - s * z, s * y + c * z), origin) for x, y, z in pts]


def bounds(points):
    return [[round(func(p[i] for p in points), 4) for i in range(3)] for func in (min, max)]


body = names["ChestBody"]
lid = names["ChestLid"]
assert near(local(body), (0, 0, 0)) and near(local(lid), (0, 1.23, -1))
body_bounds = bounds(subtree(body))
closed = bounds(subtree(lid))
opened = bounds(subtree(lid, rotate_x=-1.3))
assert near(closed[0], (-1.95, .858, -1.10), .03)
assert near(closed[1], (1.95, 1.422, 1.225), .03)
assert opened[1][1] > 3.23 and opened[1][2] < -.05
# A point on the fixed axis does not move; the front lip lifts up and back.
assert near(add(local(lid), (0, 0, 0)), (0, 1.23, -1))
lip = add(local(lid), (0, 2.1 * math.sin(1.3), 2.1 * math.cos(1.3)))
assert near(lip, (0, 3.2535, -.4383), .001)

for i in range(1, 8):
    name = f"{i:02}"
    signal = names[f"Signal{name}"]
    assert near(local(signal), (-1.5 + (i - 1) * .5, 1.044, 1.122))
    if i == 7:
        break
    lock, shackle, lens = (names[k + name] for k in ("Lock", "Shackle", "LockLens"))
    assert near(local(lock), (-1.38 + (i - 1) * .55, 0, 0))
    assert near(local(shackle), (-.108, .735, 1.151))
    assert {shackle, lens}.issubset(g["nodes"][lock]["children"])
    # The free leg rotates out to +Z; the anchored leg lifts inside its bore.
    free_leg_open = add(local(shackle), (.216 * math.cos(1.12), .058 - .035, .216 * math.sin(1.12)))
    assert near(free_leg_open, (-.0139, .758, 1.3454), .002)

mat = {m["name"]: m for m in g["materials"]}
assert len(mat) == 7
assert all(m.get("alphaMode", "OPAQUE") == "OPAQUE" for m in mat.values())
for key in ("01 Petrol baked enamel", "03 Copper satin powder coat"):
    assert mat[key]["extensions"]["KHR_materials_clearcoat"]["clearcoatFactor"] > .2
for key in ("03 Copper satin powder coat", "04 Brushed hardware"):
    assert "metallicRoughnessTexture" in mat[key]["pbrMetallicRoughness"]
assert len(g["images"]) == 2 and all(i["mimeType"] == "image/png" and "bufferView" in i for i in g["images"])
for image in g["images"]:
    offset = g["bufferViews"][image["bufferView"]].get("byteOffset", 0)
    assert data[offset:offset + 8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack_from(">II", data, offset + 16) == (256, 256)

attractions = root / "src/components/world/attractions"
old = subprocess.check_output(
    ["git", "show", f"{baseline}:src/components/world/attractions/WorldIntentDevices.tsx"], cwd=root, text=True,
)
new = (attractions / "WorldCoasterChestTransfer.tsx").read_text()
for kept in (
    "coasterWorld([-8, 0, 59.5])",
    "e.stopPropagation(); activateIntentTarget('chest')",
    "progress.chestOpen && !progress.keyTaken",
    "position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}",
    "coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])",
    "1 - Math.exp(-dt * 7)",
):
    assert kept in old and kept in new, kept
assert "OPEN_LID = -1.3" in new and "OPEN_SHACKLE = -1.12" in new and "SHACKLE_LIFT = .058" in new
assert "i < passed.length" in new and "passed.includes(`T${i + 1}`)" in new
native = out / "coaster-chest-editable.blend"
assert native.is_file()
report = {
    "baselineCommit": baseline,
    "sha256": hashlib.sha256(blob).hexdigest(),
    "editableSha256": hashlib.sha256(native.read_bytes()).hexdigest(),
    "bytes": len(blob), "triangles": triangles, "primitives": prims,
    "materials": list(mat), "images": len(g["images"]),
    "doubleSidedOpaqueMaterials": sum(m.get("doubleSided", False) for m in mat.values()),
    "axis": "+Y up, +Z front; meters", "roots": sorted(roots),
    "bodyBounds": body_bounds, "closedLidBounds": closed, "openLidBounds": opened,
    "frontLipAtOpen": [round(a, 4) for a in lip],
    "checks": ["finite positions, unit normals, UVs, nondegenerate indices", "embedded PBR channels",
               "six lock roots and hinge poses", "unchanged interaction datums in source"],
    "visualAcceptance": "requires actual engine comparison",
}
(out / "export-check.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Chest verification passed: {triangles} triangles, {prims} GLB primitives, {len(mat)} materials")

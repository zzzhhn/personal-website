"""Replay actual Three.js skin matrices captured by transitions.mjs (WORLD_CAPTURE_SKIN=1) and audit
(1) every closed shell for self-intersection and (2) every cross-shell crossing against the A6
relation table of tools/world/guide/qa_relations.py.

Blender -b --factory-startup -P this.py -- INPUT.json OUTPUT.json [--every N] [--no-relations]
Read-only: no scene/asset mutation; input reports are never rewritten.

Same-shell (unchanged method): 10 um disposable rest weld; BVHTree.overlap candidates; edge-sharing
pairs excluded; one-shared-vertex pairs resolved by float witness then the exact rational test.

Cross-shell (A6, runtime): RELATIONS / UNINTENDED_NAMED are read from qa_relations.py source by AST
(single source of truth, not copied). The 11 parts are identified from the captured topology itself,
not by vertex numbers: welded components, largest = body (must carry pelvis weight); every other shell
must be one-hot (>=0.99) on a single bone; hand/foot -> mitten/boot side, chest -> zip, two pelvis
shells -> bag (lower centroid) / bagflap (higher), three head shells -> helmet / visor / dot by size
(helmet largest; dot smallest; visor in between). Any other configuration aborts.
Each cross-shell triangle pair from BVHTree.overlap gets segment witnesses (selfx_core.witnesses, the
native A6 helper). A body triangle is labelled by the bone with the largest rest weight interpolated
barycentrically at the mean witness point (as qa_relations.tri_label). The pair is 'embedded-expected'
only if that exact (part, part|region) pair is declared; otherwise 'unintended' and the sample fails.
Pairs without a witness (coplanar / float-only) are 'unclassified' and also fail: never assumed clear.
For every declared relation, burial and exposure are measured exactly as qa_relations.test: signed
distance (closest-face normal sign) of guest vertices + 15-point barycentric grid near the host to the
closed host shell and vice versa; burial = deepest interpenetration, exposed = farthest guest point
outside. Both must stay >= the declared minima in every sample.
Limits: float32 captured matrices (CPU skin replay, not GPU identity), finite sampling only (no
continuous-time claim), closest-face sign can misjudge points near sharp concave host edges, the 10 um
rest weld averages seam copies (bound reported), regions follow rest weights at the crossing.
"""
import bpy, ast, gzip, hashlib, json, sys
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
HERE = Path(__file__).resolve().parent
GUIDE_TOOLS = HERE.parents[1] / 'guide'
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(GUIDE_TOOLS))
from guide_intersection_math import intersection_points, exact_shared_vertex_only
import selfx_core

args = sys.argv[sys.argv.index('--')+1:]
source, destination = Path(args[0]), Path(args[1])
EVERY = int(args[args.index('--every')+1]) if '--every' in args else 1
RELATIONS_ON = '--no-relations' not in args
input_bytes = source.read_bytes()
if source.suffix == '.gz':
    input_bytes = gzip.decompress(input_bytes)
data = json.loads(input_bytes)


def load_relation_table():
    """RELATIONS/TORSO/UNINTENDED_NAMED from qa_relations.py without executing its Blender driver."""
    path = GUIDE_TOOLS / 'qa_relations.py'
    text = path.read_text()
    keep = [n for n in ast.parse(text).body if isinstance(n, ast.Assign) and len(n.targets) == 1
            and isinstance(n.targets[0], ast.Name) and n.targets[0].id in ('TORSO', 'RELATIONS', 'UNINTENDED_NAMED')]
    scope = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(path), 'exec'), scope)
    return scope['RELATIONS'], scope['UNINTENDED_NAMED'], hashlib.sha256(text.encode()).hexdigest()


RELATIONS, UNINTENDED_NAMED, RELATIONS_SHA = load_relation_table()
ALLOWED = {}
for R in RELATIONS:
    gl = [R['guest']] if R['guest_regions'] is None else [f"body|{r}" for r in R['guest_regions']]
    hl = [R['host']] if R['host_regions'] is None else [f"body|{r}" for r in R['host_regions']]
    for g in gl:
        for h in hl:
            ALLOWED[frozenset((g, h))] = R['id']


def canon(bone):
    """GLTFLoader strips '.' from bone names (handR); the A6 table uses Blender names (hand.R)."""
    return bone[:-1] + '.' + bone[-1] if len(bone) > 1 and bone[-1] in 'LR' and bone[-2] != '.' else bone


def matrix(values):
    return np.array(values, dtype=np.float64).reshape(4, 4).T


def deform(topology, sample):
    output = []
    by_id = {m['id']: m for m in sample['meshes']}
    for mesh in topology['meshes']:
        pose = by_id[mesh['id']]
        positions = np.array(mesh['positions']).reshape(-1, 3)
        positions = np.einsum('ij,nj->ni', matrix(pose['bindMatrix']), np.c_[positions, np.ones(len(positions))])
        weights = np.array(mesh['skinWeight']).reshape(-1, 4)
        indices = np.array(mesh['skinIndex'], dtype=int).reshape(-1, 4)
        palette = pose.get('boneMatrices') if 'boneMatrices' in pose else sample['skeletons'][pose['skeleton']]
        bones = np.array(palette).reshape(-1, 4, 4).transpose(0, 2, 1)
        skinned = np.zeros_like(positions)
        for slot in range(4):
            skinned += np.einsum('nij,nj->ni', bones[indices[:, slot]], positions) * weights[:, slot, None]
        skinned = np.einsum('ij,nj->ni', matrix(pose['bindMatrixInverse']), skinned)
        skinned = np.einsum('ij,nj->ni', matrix(pose['meshToGuide']), skinned)
        if not np.isfinite(skinned).all(): raise ValueError('nonfinite reconstructed skin positions')
        output.append(skinned[:, :3])
    return np.concatenate(output)


def topology_for(snapshot):
    positions, triangles, weights, offset = [], [], [], 0
    for mesh in snapshot['meshes']:
        p = np.array(mesh['positions']).reshape(-1, 3)
        # G24's material primitives share one rest/bind space. Fail explicitly if
        # a later rig changes that contract instead of welding unrelated spaces.
        if not np.allclose(matrix(mesh['bindMatrix']), np.eye(4), atol=1e-8):
            raise ValueError('nonidentity bind space needs explicit rest-space normalization')
        positions.extend(p.tolist())
        triangles.extend((np.array(mesh['indices']).reshape(-1, 3) + offset).tolist())
        ids = np.array(mesh['skinIndex'], dtype=int).reshape(-1, 4)
        ws = np.array(mesh['skinWeight']).reshape(-1, 4)
        for ids_row, ws_row in zip(ids, ws):
            row = defaultdict(float)
            for i, w in zip(ids_row, ws_row):
                if w > 0: row[canon(mesh['bones'][int(i)])] += float(w)
            weights.append(dict(row))
        offset += len(p)
    kd = KDTree(len(positions))
    for i, p in enumerate(positions): kd.insert(Vector(p), i)
    kd.balance()
    parent = list(range(len(positions)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i, p in enumerate(positions):
        for _, j, _ in kd.find_range(Vector(p), 1e-5): parent[find(j)] = find(i)
    roots = [find(i) for i in range(len(positions))]
    unique = {r: i for i, r in enumerate(sorted(set(roots)))}
    welded = np.array([unique[r] for r in roots])
    count = len(unique)
    tris = [tuple(int(welded[i]) for i in t) for t in triangles]
    adjacency = [set() for _ in range(count)]
    for tri in tris:
        for a, b in zip(tri, tri[1:]+tri[:1]): adjacency[a].add(b); adjacency[b].add(a)
    components, seen = [], set()
    for i in range(count):
        if i in seen: continue
        stack, comp = [i], set(); seen.add(i)
        while stack:
            n = stack.pop(); comp.add(n)
            for j in adjacency[n]-seen: seen.add(j); stack.append(j)
        components.append(comp)
    comp_id = {v: i for i, comp in enumerate(components) for v in comp}
    # Welded rest weights: seam copies carry identical skin data (checked), so take the first copy.
    wweld = [None] * count
    for i, w in enumerate(weights):
        if wweld[welded[i]] is None: wweld[welded[i]] = w
        elif any(abs(wweld[welded[i]].get(k, 0) - w.get(k, 0)) > 1e-4 for k in set(w) | set(wweld[welded[i]])):
            raise ValueError('welded seam copies disagree on skin weights')
    rest = np.zeros((count, 3)); np.add.at(rest, welded, np.array(positions)); rest /= np.bincount(welded)[:, None]
    body = max(components, key=len)
    if not any('pelvis' in wweld[i] for i in body):
        raise ValueError('largest rest component is not the body')
    return welded, tris, comp_id, components, wweld, rest


def identify_parts(components, wweld, rest):
    """Part name per component from geometry + one-hot skin, never from vertex numbers."""
    body = max(range(len(components)), key=lambda c: len(components[c]))
    names, by_bone, info = {body: 'body'}, defaultdict(list), {}
    for c, comp in enumerate(components):
        if c == body: continue
        dominant = Counter()
        onehot = True
        for v in comp:
            bone, w = max(wweld[v].items(), key=lambda kv: kv[1])
            dominant[bone] += 1
            onehot &= w >= .99
        if not onehot or len(dominant) != 1:
            raise ValueError(f'rigid part {c} is not one-hot on one bone: {dict(dominant)}')
        bone = next(iter(dominant))
        pts = rest[sorted(comp)]
        info[c] = dict(bone=bone, vertices=len(comp), centroid=pts.mean(0).round(4).tolist(),
                       size=(pts.max(0) - pts.min(0)).round(4).tolist())
        by_bone[bone].append(c)
    for bone, comps in by_bone.items():
        if bone in ('hand.L', 'hand.R') and len(comps) == 1: names[comps[0]] = 'mitten.' + bone[-1]
        elif bone in ('foot.L', 'foot.R') and len(comps) == 1: names[comps[0]] = 'boot.' + bone[-1]
        elif bone == 'chest' and len(comps) == 1: names[comps[0]] = 'zip'
        elif bone == 'pelvis' and len(comps) == 2:
            low, high = sorted(comps, key=lambda c: info[c]['centroid'][1])   # guide space is Y-up
            names[low], names[high] = 'bag', 'bagflap'
        elif bone == 'head' and len(comps) == 3:
            dot, visor, helmet = sorted(comps, key=lambda c: info[c]['vertices'])
            names[helmet], names[visor], names[dot] = 'helmet', 'visor', 'dot'
        else:
            raise ValueError(f'unexpected rigid shells on {bone}: {comps}')
    expected = sorted(['body', 'helmet', 'visor', 'dot', 'boot.R', 'boot.L', 'mitten.R', 'mitten.L', 'bag', 'bagflap', 'zip'])
    if sorted(names.values()) != expected:
        raise ValueError(f'part identification mismatch: {sorted(names.values())}')
    for c in info: info[c]['part'] = names[c]
    return names, info


GRID = [(a / 4, b / 4, (4 - a - b) / 4) for a in range(5) for b in range(5 - a)]


def relation_audit(pts, tris, comp_id, names, wweld, shell_tris, examples_left):
    def bary(p, a, b, c):
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18: return (1 / 3, 1 / 3, 1 / 3)
        v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
        bc = [max(0.0, 1 - v - w), max(0.0, v), max(0.0, w)]
        t = sum(bc) or 1.0
        return [x / t for x in bc]

    def label(tri, at):
        part = names[comp_id[tri[0]]]
        if part != 'body': return part
        acc = Counter()
        for i, k in zip(tri, bary(at, *(pts[i] for i in tri))):
            for n, w in wweld[i].items(): acc[n] += k * w
        return 'body|' + acc.most_common(1)[0][0]

    tree = BVHTree.FromPolygons(pts, tris, all_triangles=True)
    emb, unint, unclassified, named, examples = Counter(), Counter(), Counter(), Counter(), []
    for a, b in tree.overlap(tree):
        if a >= b: continue
        ta, tb = tris[a], tris[b]
        if comp_id[ta[0]] == comp_id[tb[0]]: continue
        A = [pts[i] for i in ta]; B = [pts[i] for i in tb]
        W = selfx_core.witnesses(A, B)
        if not W:
            centre = (sum(A, Vector()) + sum(B, Vector())) / 6
            key = '|'.join(sorted((label(ta, centre), label(tb, centre))))
            unclassified[key] += 1
            if len(examples) < examples_left:
                examples.append(dict(kind='unclassified-no-witness', pair=key, triangles=[a, b], center=[round(x, 5) for x in centre]))
            continue
        at = sum(W, Vector()) / len(W)
        la, lb = label(ta, at), label(tb, at)
        rid = ALLOWED.get(frozenset((la, lb)))
        if rid:
            emb[rid] += 1; continue
        key = '|'.join(sorted((la, lb)))
        unint[key] += 1
        for n, f in UNINTENDED_NAMED.items():
            if f(la, lb): named[n] += 1
        if len(examples) < examples_left:
            extent = max(((p - q).length for p in W for q in W), default=0.)
            examples.append(dict(kind='unintended', pair=key, triangles=[a, b], witness=[round(x, 5) for x in at],
                                 segment_m=round(extent, 6), coordinates=[[list(map(float, p)) for p in A], [list(map(float, p)) for p in B]]))
    # burial / exposure, identical sampling to qa_relations.test
    trees, shell_of = {}, {v: k for k, v in names.items()}
    def host_tree(part):
        if part not in trees: trees[part] = BVHTree.FromPolygons(pts, shell_tris[shell_of[part]], all_triangles=True)
        return trees[part]
    def sdist_pts(tree, P):
        out = []
        for q in P:
            loc, nrm, _, dist = tree.find_nearest(q)
            out.append(dist if (q - loc).dot(nrm) > 0 else -dist)
        return out
    def dominant(i): return max(wweld[i].items(), key=lambda kv: kv[1])[0]
    def surface(ids, near, part):
        S = set(ids)
        lo = Vector([min(pts[i][k] for i in near) - 0.01 for k in range(3)])
        hi = Vector([max(pts[i][k] for i in near) + 0.01 for k in range(3)])
        P = []
        for t in shell_tris[shell_of[part]]:
            if t[0] in S and t[1] in S and t[2] in S:
                c = [pts[i] for i in t]
                if all(min(v[k] for v in c) <= hi[k] and max(v[k] for v in c) >= lo[k] for k in range(3)):
                    P += [c[0] * g0 + c[1] * g1 + c[2] * g2 for g0, g1, g2 in GRID]
        return P
    rel = {}
    for R in RELATIONS:
        gs, hs = shell_of[R['guest']], shell_of[R['host']]
        ids = [i for i in range(len(pts)) if comp_id[i] == gs and (R['guest_regions'] is None or dominant(i) in R['guest_regions'])]
        hid = [i for i in range(len(pts)) if comp_id[i] == hs and (R['host_regions'] is None or dominant(i) in R['host_regions'])]
        if not ids or not hid:
            rel[R['id']] = dict(measured=False, reason='empty guest or host region'); continue
        sd = sdist_pts(host_tree(R['host']), [pts[i] for i in ids])
        rd = sdist_pts(host_tree(R['guest']), [pts[i] for i in hid])
        sg = sdist_pts(host_tree(R['host']), surface(ids, hid, R['guest'])) or [1.0]
        sh = sdist_pts(host_tree(R['guest']), surface(hid, ids, R['host'])) or [1.0]
        g_in, h_in = max(0.0, -min(sd), -min(sg)), max(0.0, -min(rd), -min(sh))
        burial, exposed = max(g_in, h_in), max(0.0, max(sd))
        rel[R['id']] = dict(measured=True, guest_vertices=len(ids), guest_inside_host=sum(d < 0 for d in sd),
                            host_vertices=len(hid), host_inside_guest=sum(d < 0 for d in rd),
                            guest_depth_in_host_m=round(g_in, 5), host_depth_in_guest_m=round(h_in, 5),
                            burial_m=round(burial, 5), exposed_m=round(exposed, 5),
                            passed=burial >= R['min_burial_m'] and exposed >= R['min_exposed_m'])
    return dict(embedded_expected=dict(emb), unintended=dict(unint), unintended_named=dict(named),
                unclassified=dict(unclassified), relations=rel), examples


views = data.get('views')
if views is None:
    # Single-pose calibration accepts a direct actor + skin snapshot.
    views = [{'skinTopology': data['skin'], 'samples': [data], 'zoom': None}]
report = {'input': str(source), 'inputSha256': hashlib.sha256(input_bytes).hexdigest(),
          'inputFileSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'blender': bpy.app.version_string, 'relationsSource': {'path': str(GUIDE_TOOLS / 'qa_relations.py'), 'sha256': RELATIONS_SHA},
          'relationsDeclared': RELATIONS, 'sampleStride': EVERY, 'relationsAudited': RELATIONS_ON,
          'scope': 'captured CPU skin poses; all closed shells individually; cross-shell crossings vs A6 relation table; finite sampling',
          'limits': ('10um disposable rest seam weld with averaged deformed copies; float BVH/rays; exact single-vertex fallback; '
                     'cross-shell: witness required (no-witness pairs fail as unclassified), body region from rest weights at the crossing, '
                     'closest-face normal sign for burial/exposure (can misjudge near sharp concave host edges); '
                     'no GPU identity or continuous-time claim; only captured frames are tested'),
          'views': []}
for view in views:
    topo = view.get('skinTopology')
    if not topo: raise ValueError('record with WORLD_CAPTURE_SKIN=1; missing topology')
    welded, tris, comp_id, comps, wweld, rest = topology_for(topo)
    names, parts_info = identify_parts(comps, wweld, rest)
    shell_tris = defaultdict(list)
    for t in tris: shell_tris[comp_id[t[0]]].append(t)
    counts = np.bincount(welded)
    rows, errors, rel_failures, max_seam = [], [], [], 0.
    selected = view['samples'][::EVERY]
    for row in selected:
        sample = row.get('skin')
        if not sample: raise ValueError('missing skin sample')
        original = deform(topo, sample)
        merged = np.zeros((len(counts), 3)); np.add.at(merged, welded, original); merged /= counts[:, None]
        max_seam = max(max_seam, float(np.linalg.norm(original-merged[welded], axis=1).max()))
        pts = [Vector(v) for v in merged]
        tree = BVHTree.FromPolygons(pts, tris, all_triangles=True)
        cases, cross, resolved = [], {}, 0
        for i, j in tree.overlap(tree):
            if i >= j: continue
            a, b = tris[i], tris[j]
            if comp_id[a[0]] != comp_id[b[0]]:
                key = '/'.join(sorted((names[comp_id[a[0]]], names[comp_id[b[0]]])))
                cross[key] = cross.get(key, 0)+1; continue
            shared = set(a)&set(b)
            if len(shared) >= 2: continue
            aa, bb = [pts[k] for k in a], [pts[k] for k in b]
            hits, extent = intersection_points(aa, bb)
            if shared and hits and all(any((hit-pts[k]).length <= 1e-5 for k in shared) for hit in hits): continue
            if len(shared) == 1 and not hits and exact_shared_vertex_only(aa, bb, pts[next(iter(shared))]) is True:
                resolved += 1; continue
            cases.append({'component': comp_id[a[0]], 'part': names[comp_id[a[0]]], 'triangles': [i, j], 'segment_m': extent,
                          'classification': 'noncoplanar_segment' if extent > 1e-5 else 'unresolved',
                          'coordinates': [[list(p) for p in aa], [list(p) for p in bb]]})
        out = {'t': row.get('t'), 'phase': row.get('label'), 'animation': row['actor']['animation'],
               'animationTime': row['actor'].get('animationTime'),
               'remainingSameShellPairs': len(cases), 'sameShellParts': dict(Counter(c['part'] for c in cases)),
               'resolvedVertexContacts': resolved, 'crossShellCandidates': cross}
        if RELATIONS_ON:
            audit, examples = relation_audit(pts, tris, comp_id, names, wweld, shell_tris, 6)
            out.update(audit)
            failed_relations = [k for k, v in audit['relations'].items() if not v.get('measured') or not v['passed']]
            out['relationsPassed'] = not audit['unintended'] and not audit['unclassified'] and not failed_relations
            if not out['relationsPassed'] and len(rel_failures) < 24:
                rel_failures.append({'t': row.get('t'), 'phase': row.get('label'), 'animation': out['animation'],
                                     'animationTime': out['animationTime'], 'unintended': audit['unintended'],
                                     'unclassified': audit['unclassified'], 'failedRelations': {k: audit['relations'][k] for k in failed_relations},
                                     'examples': examples})
        rows.append(out)
        if cases and len(errors) < 12: errors.append({'t': row.get('t'), 'phase': row.get('label'), 'cases': cases[:12]})
    phases = {}
    for r in rows:
        p = phases.setdefault(r['phase'], {'samples': 0, 'sameShellFailures': 0, 'relationFailures': 0, 'unintendedMax': {}, 'unclassifiedMax': {},
                                           'minBurial_m': {}, 'minExposed_m': {}, 'failedFrames': []})
        p['samples'] += 1
        bad_same = r['remainingSameShellPairs'] > 0
        p['sameShellFailures'] += bad_same
        if RELATIONS_ON:
            p['relationFailures'] += not r['relationsPassed']
            for k, v in r['unintended'].items(): p['unintendedMax'][k] = max(p['unintendedMax'].get(k, 0), v)
            for k, v in r['unclassified'].items(): p['unclassifiedMax'][k] = max(p['unclassifiedMax'].get(k, 0), v)
            for k, v in r['relations'].items():
                if v.get('measured'):
                    p['minBurial_m'][k] = min(p['minBurial_m'].get(k, 9), v['burial_m'])
                    p['minExposed_m'][k] = min(p['minExposed_m'].get(k, 9), v['exposed_m'])
        if bad_same or (RELATIONS_ON and not r['relationsPassed']):
            if len(p['failedFrames']) < 40:
                p['failedFrames'].append({'t': r['t'], 'animation': r['animation'], 'animationTime': r['animationTime'],
                                          'sameShellParts': r['sameShellParts'],
                                          'unintended': r.get('unintended', {}), 'unclassified': r.get('unclassified', {}),
                                          'failedRelations': [k for k, v in r.get('relations', {}).items() if not v.get('measured') or not v['passed']]})
    summary = {}
    if RELATIONS_ON:
        for R in RELATIONS:
            measured = [r for r in rows if r['relations'][R['id']].get('measured')]
            if not measured:
                summary[R['id']] = {'measured': False, 'passed': False}; continue
            b = min(measured, key=lambda r: r['relations'][R['id']]['burial_m'])
            x = min(measured, key=lambda r: r['relations'][R['id']]['exposed_m'])
            summary[R['id']] = {'min_burial_m': b['relations'][R['id']]['burial_m'], 'at': [b['phase'], b['t'], b['animation']],
                                'min_exposed_m': x['relations'][R['id']]['exposed_m'], 'exposed_at': [x['phase'], x['t'], x['animation']],
                                'declared_min_burial_m': R['min_burial_m'], 'declared_min_exposed_m': R['min_exposed_m'],
                                'max_crossing_pairs': max(r['embedded_expected'].get(R['id'], 0) for r in rows),
                                'unmeasuredSamples': len(rows) - len(measured),
                                'passed': len(measured) == len(rows) and all(r['relations'][R['id']]['passed'] for r in measured)}
    same_ok = max_seam <= 1e-5 and all(r['remainingSameShellPairs'] == 0 for r in rows)
    rel_ok = (not RELATIONS_ON) or all(r['relationsPassed'] for r in rows)
    report['views'].append({'zoom': view.get('zoom'), 'assetSha256': view.get('assetSha256'),
                            'meshCount': len(topo['meshes']), 'triangles': len(tris), 'shellSizes': sorted(map(len, comps), reverse=True),
                            'parts': {info['part']: {k: v for k, v in info.items() if k != 'part'} for info in parts_info.values()},
                            'maxSeamCorrection_m': max_seam, 'samples': len(rows), 'phases': phases, 'relationSummary': summary,
                            'rows': rows, 'examples': errors, 'relationFailures': rel_failures,
                            'seamMergeBoundExceeded': max_seam > 1e-5,
                            'sameShellPassed': same_ok,
                            'crossShellPassed': rel_ok if RELATIONS_ON else None,
                            'passed': same_ok and rel_ok and RELATIONS_ON})
report['assetSha256'] = sorted({v['assetSha256'] for v in report['views'] if v['assetSha256']})
report['sameShellPassed'] = all(view['sameShellPassed'] for view in report['views'])
report['crossShellPassed'] = all(view['crossShellPassed'] for view in report['views']) if RELATIONS_ON else None
report['passed'] = RELATIONS_ON and report['sameShellPassed'] and report['crossShellPassed'] and EVERY == 1
if EVERY != 1: report['notFullCoverage'] = f'only every {EVERY}th captured frame was audited; not an acceptance result'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('views', 'relationsDeclared')}))
for view in report['views']:
    print(json.dumps({'zoom': view['zoom'], 'assetSha256': view['assetSha256'], 'samples': view['samples'],
                      'sameShellPassed': view['sameShellPassed'], 'crossShellPassed': view['crossShellPassed'],
                      'phases': {k: {kk: vv for kk, vv in p.items() if kk in ('samples', 'sameShellFailures', 'relationFailures', 'unintendedMax', 'unclassifiedMax')} for k, p in view['phases'].items()},
                      'relationSummary': {k: [v.get('min_burial_m'), v.get('min_exposed_m'), v['passed']] for k, v in view['relationSummary'].items()}}))
if not report['passed']: raise SystemExit(1)

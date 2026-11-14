// Frozen pre-change implementation: independent equivalence oracle.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
const clusters = new Map();
const CLUSTER_AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]].map(a => new Vector3(...a).normalize());
function clusterExtremes(points) {
    if (points.length <= 18)
        return points;
    const selected = new Set();
    for (const axis of CLUSTER_AXES) {
        let lo = points[0], hi = points[0], min = Infinity, max = -Infinity;
        for (const p of points) {
            const d = p.dot(axis);
            if (d < min) {
                min = d;
                lo = p;
            }
            if (d > max) {
                max = d;
                hi = p;
            }
        }
        selected.add(lo);
        selected.add(hi);
    }
    return [...selected];
}
function clusterHull(g, cell) {
    const id = `${g.uuid}:${cell}`, cached = clusters.get(id);
    if (cached)
        return cached;
    const pos = g.getAttribute('position'), wind = g.getAttribute('_wind'), idx = g.index;
    const key = new Map(), weld = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
        let w = key.get(k);
        if (w === undefined) {
            w = i;
            key.set(k, i);
        }
        weld[i] = w;
    }
    const parent = Int32Array.from({ length: pos.count }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
    } return x; };
    const n = idx ? idx.count : pos.count, at = (j) => weld[idx ? idx.getX(j) : j];
    for (let j = 0; j < n; j += 3) {
        const a = find(at(j)), b = find(at(j + 1)), c = find(at(j + 2));
        parent[b] = a;
        parent[find(c)] = a;
    }
    // Component centroids -> bins.
    const comp = new Map();
    for (let i = 0; i < pos.count; i++) {
        if (weld[i] !== i)
            continue;
        const r = find(i);
        let c = comp.get(r);
        if (!c) {
            c = { sx: 0, sy: 0, sz: 0, n: 0, verts: new Set() };
            comp.set(r, c);
        }
        c.sx += pos.getX(i);
        c.sy += pos.getY(i);
        c.sz += pos.getZ(i);
        c.n++;
        c.verts.add(i);
    }
    const bins = new Map();
    for (const c of comp.values()) {
        const k = `${Math.floor(c.sx / c.n / cell)},${Math.floor(c.sy / c.n / cell)},${Math.floor(c.sz / c.n / cell)}`;
        const list = bins.get(k) ?? [];
        for (const v of c.verts)
            list.push(v);
        bins.set(k, list);
    }
    const P = [], W = [], I = [];
    for (const verts of bins.values()) {
        const pts = verts.map(i => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        let hp = null;
        if (verts.length >= 4) {
            try {
                const h = new ConvexGeometry(clusterExtremes(pts));
                hp = h.getAttribute('position');
                h.dispose();
            }
            catch {
                hp = null;
            }
        }
        // A closed hull around a few flat leaves can cost more than the original leaves. Keep those
        // leaves unchanged instead; apply this decision per cluster, not only after merging the asset.
        const set = new Set(verts);
        let binTriangles = 0;
        for (let j = 0; j < n; j += 3)
            if (set.has(at(j)) && set.has(at(j + 1)) && set.has(at(j + 2)))
                binTriangles++;
        if (hp && hp.count >= binTriangles * 3)
            hp = null;
        const base = P.length / 3;
        if (hp && hp.count >= 4) {
            for (let i = 0; i < hp.count; i++) {
                P.push(hp.getX(i), hp.getY(i), hp.getZ(i));
                const src = key.get(`${hp.getX(i).toFixed(4)},${hp.getY(i).toFixed(4)},${hp.getZ(i).toFixed(4)}`) ?? verts[0];
                if (wind)
                    W.push(wind.getX(src), wind.getY(src), wind.getZ(src), wind.getW(src));
                I.push(base + i);
            }
        }
        else {
            // Degenerate (single flat card): keep its own triangles.
            const map = new Map();
            for (let j = 0; j < n; j += 3) {
                const tri = [at(j), at(j + 1), at(j + 2)];
                if (!tri.every(v => set.has(v)))
                    continue;
                for (const v of tri) {
                    let m = map.get(v);
                    if (m === undefined) {
                        m = P.length / 3;
                        map.set(v, m);
                        P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
                        if (wind)
                            W.push(wind.getX(v), wind.getY(v), wind.getZ(v), wind.getW(v));
                    }
                    I.push(m);
                }
            }
        }
    }
    const out = new BufferGeometry();
    out.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
    if (wind)
        out.setAttribute('_wind', new BufferAttribute(new Float32Array(W), 4));
    out.setIndex(I);
    out.boundingSphere = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
    // Keep whichever is cheaper (a part that is already a few big cards gains nothing).
    const result = I.length < n ? out : g;
    clusters.set(id, result);
    return result;
}
export { clusterHull };
export const clear = () => clusters.clear();

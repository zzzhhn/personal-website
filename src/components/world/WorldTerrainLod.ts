/**
 * Render LOD for the island terrain (spec §12.4: chunked terrain, coarse far mesh, no cracks). Pure TS.
 * Physics keeps the full 0.5 m mesh; only the rendered index buffers change.
 *
 * 16 m tiles (8 x 8 blocks of 2 m). A tile is fine (original 0.5 m triangles) when the camera is within
 * FINE_R of it, otherwise each originally fine 2 m block is drawn as a 4-triangle fan around its centre
 * node. Where a coarse tile touches a fine tile, the coarse blocks on that edge include every 0.5 m border
 * node in their fan (stitching), so both sides share the same edge vertices: watertight, no skirts.
 * Blocks that were already coarse (2 m flat interior, deep shelf) are identical in both levels.
 */
import { buildTerrain, GRID } from './WorldLandform';

export const TILE_BLOCKS = 8, BLOCK = 4, FINE_R = 28;
const NX = GRID.nx + 1;

export interface LodTile {
  bi0: number; bj0: number; minX: number; minZ: number; maxX: number; maxZ: number; chunk: number;
  fine: Uint32Array;
  /** Fine level without the blocks hidden under the paving. */
  fineOpen: Uint32Array;
  /** Coarse interior (blocks not on the tile edge, or edge blocks that were never fine). */
  coarseCore: Uint32Array;
  /** All coarse edge blocks unstitched (the common case: no fine neighbour). */
  edgePlain: Uint32Array;
  /** Per coarse edge block: the tile sides it touches (0 -z, 1 +x, 2 +z, 3 -x) and one fan per stitch
   * mask over those sides (bit k = sides[k] stitched), so a block only adds border nodes on sides that
   * face a fine tile. */
  edge: { sides: number[]; variants: Uint32Array[]; all: Uint32Array[] }[];
  coarseCoreOpen: Uint32Array; edgePlainOpen: Uint32Array;
}

/** `covered(x, z)` true = opaque paving lies above this point with margin; fully covered 2 m blocks are
 * not rendered while the paving is mounted (variant `hidden`), physics is unaffected. */
export function buildLodTiles(chunkOf: (x: number, z: number) => number, covered: (x: number, z: number) => boolean = () => false) {
  const t = buildTerrain(), { NB, MB, kind, start, count } = t.blocks, idx = t.indices;
  const v = (i: number, j: number) => t.vertexOf[j * NX + i];
  /** Fan around the block centre; perimeter CCW from +y (x right, z down): left edge down, bottom right,
   * right edge up, top left. `full[s]` adds the intermediate border nodes on side s. */
  const fan = (bi: number, bj: number, full: boolean[], out: number[]) => {
    const i0 = bi * BLOCK, j0 = bj * BLOCK, c = v(i0 + 2, j0 + 2), per: number[] = [];
    // side 3 (-x, left): (i0, j0) -> (i0, j0+4)
    for (let k = 0; k < BLOCK; k++) if (k === 0 || full[3]) per.push(v(i0, j0 + k));
    // side 2 (+z, bottom): (i0, j0+4) -> (i0+4, j0+4)
    for (let k = 0; k < BLOCK; k++) if (k === 0 || full[2]) per.push(v(i0 + k, j0 + BLOCK));
    // side 1 (+x, right): (i0+4, j0+4) -> (i0+4, j0)
    for (let k = 0; k < BLOCK; k++) if (k === 0 || full[1]) per.push(v(i0 + BLOCK, j0 + BLOCK - k));
    // side 0 (-z, top): (i0+4, j0) -> (i0, j0)
    for (let k = 0; k < BLOCK; k++) if (k === 0 || full[0]) per.push(v(i0 + BLOCK - k, j0));
    if (per.length === 4) {
      // No stitched side: two triangles over the corners, split along the flatter diagonal.
      const P = t.positions, y = (q: number) => P[q * 3 + 1];
      if (Math.abs(y(per[0]) - y(per[2])) <= Math.abs(y(per[1]) - y(per[3]))) out.push(per[0], per[1], per[2], per[0], per[2], per[3]);
      else out.push(per[1], per[2], per[3], per[1], per[3], per[0]);
      return;
    }
    for (let k = 0; k < per.length; k++) out.push(c, per[k], per[(k + 1) % per.length]);
  };
  const tiles: LodTile[] = [];
  for (let tj = 0; tj * TILE_BLOCKS < MB; tj++) for (let ti = 0; ti * TILE_BLOCKS < NB; ti++) {
    const bi0 = ti * TILE_BLOCKS, bj0 = tj * TILE_BLOCKS, bi1 = Math.min(NB, bi0 + TILE_BLOCKS), bj1 = Math.min(MB, bj0 + TILE_BLOCKS);
    const fineOpen: number[] = [], coreOpen: number[] = [], plainOpen: number[] = [];
    const fine: number[] = [], core: number[] = [], plain: number[] = [], edgeBlocks: { sides: number[]; variants: Uint32Array[]; all: Uint32Array[] }[] = [];
    let any = false;
    for (let bj = bj0; bj < bj1; bj++) for (let bi = bi0; bi < bi1; bi++) {
      const b = bj * NB + bi, k = kind[b];
      if (!k) continue;
      any = true;
      const x0 = GRID.minX + bi * BLOCK * .5, z0 = GRID.minZ + bj * BLOCK * .5;
      const hide = [0, 1, 2].every(a => [0, 1, 2].every(c => covered(x0 + a, z0 + c)));
      for (let q = start[b]; q < start[b] + count[b]; q++) { fine.push(idx[q]); if (!hide) fineOpen.push(idx[q]); }
      if (k !== 2) { for (let q = start[b]; q < start[b] + count[b]; q++) { core.push(idx[q]); if (!hide) coreOpen.push(idx[q]); } continue; }
      const touch = [bj === bj0, bi === bi1 - 1, bj === bj1 - 1, bi === bi0];
      const sides = [0, 1, 2, 3].filter(q => touch[q]);
      if (!sides.length) { const o: number[] = []; fan(bi, bj, [false, false, false, false], o); core.push(...o); if (!hide) coreOpen.push(...o); continue; }
      { const o: number[] = []; fan(bi, bj, [false, false, false, false], o); plain.push(...o); if (!hide) plainOpen.push(...o); }
      const variants: Uint32Array[] = [];
      for (let m = 0; m < 1 << sides.length; m++) {
        const full = [false, false, false, false]; sides.forEach((q, n) => { if (m & (1 << n)) full[q] = true; });
        const o: number[] = []; fan(bi, bj, full, o); variants.push(new Uint32Array(o));
      }
      edgeBlocks.push({ sides, variants: hide ? variants.map(() => new Uint32Array(0)) : variants, all: variants } as { sides: number[]; variants: Uint32Array[]; all: Uint32Array[] });
    }
    if (!any) continue;
    const minX = GRID.minX + bi0 * BLOCK * .5, minZ = GRID.minZ + bj0 * BLOCK * .5, maxX = GRID.minX + bi1 * BLOCK * .5, maxZ = GRID.minZ + bj1 * BLOCK * .5;
    tiles.push({ bi0, bj0, minX, minZ, maxX, maxZ, chunk: chunkOf((minX + maxX) / 2, (minZ + maxZ) / 2),
      fine: new Uint32Array(fine), fineOpen: new Uint32Array(fineOpen), coarseCore: new Uint32Array(core), coarseCoreOpen: new Uint32Array(coreOpen), edgePlain: new Uint32Array(plain), edgePlainOpen: new Uint32Array(plainOpen), edge: edgeBlocks });
  }
  return tiles;
}

const distToBox = (x: number, z: number, T: LodTile) => Math.hypot(Math.max(T.minX - x, 0, x - T.maxX), Math.max(T.minZ - z, 0, z - T.maxZ));

/** Index arrays per chunk for a camera at (x, z). Stitching: a coarse tile's side is stitched when the
 * tile across it is fine. Corner blocks: stitched if any of their tile sides faces a fine neighbour. */
export function lodIndices(tiles: LodTile[], x: number, z: number, fineR = FINE_R, open = false) {
  const key = (ti: number, tj: number) => ti * 4096 + tj;
  const byKey = new Map<number, LodTile>(), fine = new Set<LodTile>();
  for (const T of tiles) { byKey.set(key(T.bi0 / TILE_BLOCKS, T.bj0 / TILE_BLOCKS), T); if (distToBox(x, z, T) < fineR) fine.add(T); }
  const parts = new Map<number, Uint32Array[]>();
  let triangles = 0;
  const push = (c: number, a: Uint32Array) => { if (!a.length) return; (parts.get(c) ?? parts.set(c, []).get(c)!).push(a); triangles += a.length / 3; };
  for (const T of tiles) {
    if (fine.has(T)) { push(T.chunk, open ? T.fineOpen : T.fine); continue; }
    push(T.chunk, open ? T.coarseCoreOpen : T.coarseCore);
    const ti = T.bi0 / TILE_BLOCKS, tj = T.bj0 / TILE_BLOCKS;
    const nb = [byKey.get(key(ti, tj - 1)), byKey.get(key(ti + 1, tj)), byKey.get(key(ti, tj + 1)), byKey.get(key(ti - 1, tj))];
    const stitched = nb.map(n => !!n && fine.has(n));
    if (!stitched.some(Boolean)) { push(T.chunk, open ? T.edgePlainOpen : T.edgePlain); continue; }
    for (const e of T.edge) { let m = 0; e.sides.forEach((q, n) => { if (stitched[q]) m |= 1 << n; }); push(T.chunk, (open ? e.variants : e.all)[m]); }
  }
  const out = new Map<number, Uint32Array>();
  for (const [c, list] of parts) {
    const n = list.reduce((s, a) => s + a.length, 0), arr = new Uint32Array(n);
    let o = 0; for (const a of list) { arr.set(a, o); o += a.length; }
    out.set(c, arr);
  }
  return { chunks: out, triangles, fineTiles: fine.size };
}

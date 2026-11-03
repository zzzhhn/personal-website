/** Batch 5 street construction. Runtime remains a single attributed/batched mesh per group.
 * Keep editable named parts here; collision always comes from the unchanged pre-craft Builder. */
import { Builder, S, bar, bezier, box, cyl, lathe, plate, rectPoly, tube, type Surf, type V3 } from './WorldStreetGeometry.ts';
import { FACILITY_SURFACE, facilityCraftEnabled, tagShelterSurfaces } from './WorldFacilitySurface';
import { tagBenchBinSurfaces } from './WorldBenchBinSurface';
import { binR2Enabled, buildBinR2Details } from './WorldBinConstruction';

export type StreetFacility = 'bench' | 'shelter' | 'lamp' | 'signal' | 'bin' | 'roadblock' | 'seawallBay' | 'timberPost' | 'timberBeam';
export interface FacilityOptions { height?: number; arm?: number; pole?: Surf; base?: Surf; cyanRing?: boolean; len?: number }
const collisionSource = new WeakMap<Builder, Builder>();
/** Fixed trimeshes must read this source too; .hulls() is separately bound for dynamic consumers. */
export const streetFacilityCollision = (visual: Builder) => collisionSource.get(visual) ?? visual;
/** Explicitly separate visual geometry from the complete original proxy. */
export function bindStreetFacilityCollision(visual: Builder, original: Builder) {
  const proxy = streetFacilityCollision(original);
  if (visual === proxy) throw new Error('A visual Builder cannot bind itself as its collision proxy');
  collisionSource.set(visual, proxy); visual.hulls = () => proxy.hulls();
  return visual;
}

/** Copy selected original named parts without welding or changing vertex/atlas/material semantics. */
function retain(B: Builder, old: Builder, names: string[]) {
  for (const p of old.parts) {
    if (!names.includes(p.name)) continue;
    const end = p.end < 0 ? old.pos.length / 3 : p.end, offset = B.pos.length / 3 - p.start;
    B.part(p.name, false);
    for (const key of ['pos', 'nrm', 'col', 'mat', 'suv'] as const) {
      const size = key === 'mat' ? 4 : key === 'suv' ? 2 : 3;
      B[key].push(...old[key].slice(p.start * size, end * size));
    }
    for (let i = 0; i < old.idx.length; i += 3) {
      if (old.idx[i] >= p.start && old.idx[i] < end) B.idx.push(old.idx[i] + offset, old.idx[i + 1] + offset, old.idx[i + 2] + offset);
    }
  }
}
function part(B: Builder, name: string, fn: () => void) { B.part(name, false); fn(); }
function ring(B: Builder, y: number, r: number, width: number, surf: Surf, n = 16) {
  lathe(B, [[r - width, y - width], [r, y - width], [r, y + width], [r - width, y + width], [r - width, y - width]], surf, { sides: n, caps: false });
}

function bench(B: Builder) {
  for (const x of [-.78, .78]) {
    part(B, `leg${x}`, () => {
      // A single cast cheek carries seat, back and arm; separate shoes meet the paving.
      B.tr([x, 0, 0], [0, Math.PI / 2, 0], () => {
        for (const outline of [
          [[.19, .025], [.29, .025], [.22, .425], [.13, .41]],
          [[-.31, .025], [-.22, .025], [-.17, .425], [-.255, .425]],
          [[-.255, .40], [-.17, .425], [-.265, .87], [-.33, .84]],
        ]) plate(B, outline as [number, number][], .052, S.slate, S.slate, S.slateDark, .008);
      });
      box(B, [x - .026, .365, -.235], [x + .026, .425, .255], S.slate, .007);
      for (const z of [-.24, .235]) box(B, [x - .072, 0, z - .065], [x + .072, .032, z + .065], S.slateDark, .008);
      tube(B, bezier([x, .425, -.235], [x, .705, -.30], [x, .66, .08], 8), .024, S.slate, 8);
      box(B, [x - .032, .635, -.27], [x + .032, .675, .075], S.slate, .012);
    });
  }
  part(B, 'seat.underframe', () => {
    for (const z of [-.15, .15]) box(B, [-.8, .365, z - .022], [.8, .415, z + .022], S.slateDark, .006);
    for (const x of [-.78, .78]) box(B, [x - .04, .405, -.28], [x + .04, .43, .28], S.iron, .006);
  });
  for (let i = 0; i < 5; i++) {
    const z = -.24 + i * .12;
    part(B, `seat.slat-${i}`, () => box(B, [-.9, .425, z - .042], [.9, .47, z + .042], S.woodLight, .009));
  }
  for (let i = 0; i < 3; i++) {
    const t = (i + .5) / 3, y = .55 + t * .3, z = .24 + t * .06;
    part(B, `back.slat-${i}`, () => B.tr([0, y, z], [-.2, 0, 0], () => box(B, [-.9, -.041, -.022], [.9, .041, .022], S.woodLight, .008)));
  }
}

function shelter(B: Builder, old: Builder) {
  retain(B, old, ['slab', 'post', ...(facilityCraftEnabled() ? [] : ['rear']), 'end', 'poster']);
  if (facilityCraftEnabled()) {
    // Source identity: WorldStreetAssets specifies frosted glass, not a solid
    // white enclosure. Keep the outer rear frame/kick rail and inset 12mm panes.
    for (let i = 0; i < 3; i++) part(B, `rear.frosted-pane-${i}`, () => {
      const z0 = -1.5 + i, z1 = z0 + .97;
      box(B, [.624, .34, z0 + .012], [.636, 2.28, z1 - .012], S.glass);
      // Continuous EPDM pocket and metal pressure beads explain how the pane
      // meets its frame; exposed glass edges retain their actual thickness.
      for (const z of [z0, z1]) {
        box(B, [.608, .32, z - .008], [.65, 2.3, z + .008], S.rubber, .002);
        box(B, [.6, .32, z - .014], [.616, 2.3, z + .014], S.slate, .003);
      }
    });
    part(B, 'rear.original-kick-and-mullions', () => {
      box(B, [.61, .2, -1.54], [.66, .32, 1.54], S.slate, .008);
      for (const z of [-.515, .485]) box(B, [.61, .32, z - .02], [.66, 2.3, z + .02], S.slate, .006);
    });
  }
  part(B, 'roof.primary-frame', () => {
    for (const x of [-.62, .64]) box(B, [x - .035, 2.23, -1.57], [x + .035, 2.39, 1.57], S.slate, .009);
    for (const z of [-1.54, 0, 1.54]) box(B, [-.65, 2.28, z - .04], [.67, 2.38, z + .04], S.slate, .009);
    // Four knee braces explain the front roof projection without obstructing the open street side.
    for (const z of [-1.54, 1.54]) for (const x of [-.62, .64]) bar(B, [x, 2.04, z], [x - .2, 2.31, z], .018, S.slate, 6);
  });
  part(B, 'roof.folded-pan', () => {
    B.tr([-.085, 2.425, 0], [0, 0, -.018], () => box(B, [-.865, -.035, -1.72], [.865, .035, 1.72], S.slateDark, .015));
    for (const z of [-1.72, 1.72]) box(B, [-.96, 2.365, z - .018], [.79, 2.47, z + .018], S.slate, .008);
    box(B, [-.98, 2.30, -1.72], [-.92, 2.46, 1.72], S.slate, .01);
    box(B, [-.987, 2.325, -1.6], [-.981, 2.342, 1.6], S.cyan);
    if (facilityCraftEnabled()) {
      // A folded weather cap and three standing seams read at walking range.
      for (const z of [-1.68, 1.68]) box(B, [-.95, 2.44, z - .028], [.78, 2.49, z + .028], S.galv, .009);
      for (const z of [-.82, 0, .82]) B.tr([-.085, 2.425, z], [0, 0, -.018], () =>
        box(B, [-.85, .035, -.018], [.85, .075, .018], S.slate, .006));
    }
  });
  part(B, 'rear.glazing-beads', () => {
    for (const y of [.33, 2.29]) box(B, [.598, y - .018, -1.5], [.656, y + .018, 1.5], S.galv, .004);
    for (const z of [-1.5, -.5, .5, 1.5]) for (const y of [.45, 2.15]) box(B, [.59, y - .035, z - .035], [.665, y + .035, z + .035], S.slate, .006);
  });
  for (const z of [-1.15, 0, 1.15]) part(B, `perch.bracket-${z}`, () => {
    box(B, [.55, .04, z - .035], [.6, .46, z + .035], S.slate, .006);
    bar(B, [.575, .23, z], [.22, .455, z], .022, S.slate, 6);
    box(B, [.19, .425, z - .033], [.6, .46, z + .033], S.slateDark, .006);
  });
  for (let i = 0; i < 3; i++) part(B, `perch.slat-${i}`, () => {
    const x = .25 + i * .13;
    box(B, [x - .057, .46, -1.3], [x + .057, .50, 1.3], S.woodLight, .008);
  });
}

function lamp(B: Builder, old: Builder, o: FacilityOptions) {
  const H = o.height ?? 4.4, reach = o.arm ?? 1.35, pole = o.pole ?? S.slate;
  retain(B, old, ['base', 'shaft', 'arm', 'cap']);
  part(B, 'hatch', () => {
    box(B, [-.052, .255, .101], [.052, .465, .132], o.base ?? S.slateDark, .009);
    box(B, [-.035, .28, .133], [.035, .44, .139], pole, .005);
    box(B, [.018, .345, .14], [.029, .369, .148], S.iron, .003);
  });
  const head: V3 = reach > 0 ? [0, H + .30, -reach] : [0, H + .02, 0], R = reach > 0 ? .30 : .22;
  part(B, 'head', () => B.tr(head, [0, 0, 0], () => {
    // Hollow pressed dome with a real turned-in lip, dark gasket and separate optical dish.
    lathe(B, [[R, -.06], [R + .015, -.04], [R * .92, .04], [R * .7, .10], [.05, .16], [0, .17],
      [0, .155], [.047, .145], [R * .67, .085], [R * .89, .025], [R - .012, -.05], [R, -.06]], pole, { sides: 20, smooth: 45, caps: false });
    ring(B, -.056, R + .008, .013, S.slateDark, 20);
    lathe(B, [[R - .025, -.062], [R * .72, -.038], [R * .25, -.024], [R * .25, -.03], [R * .72, -.044], [R - .025, -.068], [R - .025, -.062]], S.creamPaint, { sides: 20, caps: false, smooth: 45 });
    lathe(B, [[0, -.078], [R * .63, -.078], [R * .71, -.069], [0, -.065]], S.lensWarm, { sides: 20, caps: false, smooth: 45 });
    if (o.cyanRing !== false) lathe(B, [[R + .016, -.045], [R + .016, -.03], [R + .012, -.03], [R + .012, -.045], [R + .016, -.045]], S.cyan, { sides: 20, caps: false });
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = Math.cos(a) * (R - .013), z = Math.sin(a) * (R - .013);
      box(B, [x - .012, -.085, z - .012], [x + .012, -.035, z + .012], S.iron, .004);
    }
  }));
}

function head(B: Builder, label: string, origin: V3) {
  part(B, label, () => B.tr(origin, [0, 0, 0], () => {
    box(B, [-.105, -.46, -.15], [.12, .46, .15], S.slateDark, .025);
    B.tr([.02, 0, 0], [0, -Math.PI / 2, 0], () => plate(B, rectPoly(.56, 1.18), .025, S.creamPaint, S.black, S.black, .006));
    // Back service lid, gasket reveal and continuous hinge, connected to the box.
    box(B, [.12, -.415, -.128], [.145, .415, .128], S.black, .012);
    box(B, [.145, -.40, -.115], [.16, .40, .115], S.slate, .012);
    B.tr([.14, -.35, .145], [0, 0, 0], () => cyl(B, .018, .018, 0, .70, S.iron, 8));
    [[.29, S.lensRed], [0, S.lensAmber], [-.29, S.lensGreen]].forEach(([y, surface]) => {
      B.tr([-.125, y as number, 0], [0, 0, Math.PI / 2], () => {
        lathe(B, [[.109, -.012], [.118, 0], [.118, .014], [.105, .025], [.101, .02], [.101, -.012], [.109, -.012]], S.black, { sides: 16, caps: false });
        cyl(B, .099, .099, -.004, .012, surface as Surf, 16);
        // Only the upper half is hooded; the lamp stays visible to a walking camera.
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i + .5) * Math.PI / 6;
          B.tr([.119 * Math.cos(a), .073, .119 * Math.sin(a)], [0, -a, 0], () => box(B, [-.006, -.073, -.032], [.006, .073, .032], S.black));
        }
      });
    });
  }));
}
function signal(B: Builder, old: Builder) {
  retain(B, old, ['base', 'shaft', 'mast', 'hatch']);
  part(B, 'head.hanger', () => {
    box(B, [-.045, 5.25, -3.12], [.045, 5.36, -2.98], S.iron, .008);
    bar(B, [0, 5.25, -3.05], [0, 5.44, -3.05], .032, S.slate, 8);
    for (const y of [1.80, 2.40]) {
      ring(B, y, .10, .018, S.iron, 12);
      bar(B, [0, y, 0], [-.16, y, 0], .025, S.iron, 8);
    }
  });
  head(B, 'head', [0, 4.98, -3.05]); head(B, 'near-head', [-.16, 2.1, 0]);
}

function bin(B: Builder) {
  part(B, 'drum', () => {
    lathe(B, [[.215, 0], [.24, .03], [.24, .075], [.263, .12], [.276, .78], [.276, .825],
      [.252, .825], [.252, .12], [.21, .1], [.215, 0]], S.slate, { sides: 24, smooth: 40, caps: false });
    cyl(B, .25, .25, .10, .115, S.slateDark, 24);
    ring(B, .79, .286, .015, S.galv, 24);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      B.tr([0, 0, 0], [0, a, 0], () => box(B, [-.009, .14, .264], [.009, .72, .279], S.slate, .006));
    }
  });
  part(B, 'lid', () => {
    // Ring opening with real inner wall: no black decal pretending to be a hole.
    lathe(B, [[.29, .825], [.305, .855], [.29, .92], [.19, .995], [.145, .995], [.145, .963], [.182, .955], [.26, .9], [.27, .84], [.29, .825]], S.creamPaint, { sides: 24, caps: false, smooth: 40 });
  });
  part(B, 'mouth.inner-baffle', () => {
    cyl(B, .225, .225, .70, .713, S.slateDark, 24);
    lathe(B, [[.15, .965], [.15, .92], [.19, .86], [.194, .862], [.154, .92], [.154, .965], [.15, .965]], S.slateDark, { sides: 24, caps: false });
  });
  part(B, 'lid.hinge', () => {
    for (const x of [-.12, .12]) box(B, [x - .027, .75, -.274], [x + .027, .89, -.24], S.slateDark, .006);
    bar(B, [-.16, .88, -.265], [.16, .88, -.265], .023, S.iron, 10);
  });
}

function roadblock(B: Builder, old: Builder) {
  retain(B, old, ['boards']);
  for (const x of [-.56, .56]) part(B, `frame.trestle-${x}`, () => {
    for (const z of [-1, 1]) {
      // Rectangular folded-steel legs have a broad face, rather than thin rods.
      // Bottoms splay outward into the fixed rubber shoes; tops converge into the hinge.
      B.tr([x, .50, z * .175], [-z * .25, 0, 0], () => box(B, [-.023, -.49, -.016], [.023, .49, .016], S.slateDark, .005));
      box(B, [x - .065, 0, z * .3 - .07], [x + .065, .04, z * .3 + .07], S.rubber, .01);
    }
    bar(B, [x - .06, .95, 0], [x + .06, .95, 0], .035, S.galv, 10);
    box(B, [x - .04, .91, -.065], [x + .04, .99, .065], S.slate, .008);
    // Two folding arms meet at the centre knuckle, and limit the trestle spread.
    bar(B, [x, .36, -.21], [x, .31, 0], .014, S.iron, 6);
    bar(B, [x, .31, 0], [x, .36, .21], .014, S.iron, 6);
    bar(B, [x - .026, .31, 0], [x + .026, .31, 0], .022, S.galv, 8);
  });
  part(B, 'boards.edge-channels', () => {
    for (const side of [-1, 1]) for (const y of [.49, .58, .66, .88]) {
      const z = side * (.3 * (1 - y) + .045);
      box(B, [-.65, y - .008, z - .025], [.65, y + .008, z + .025], S.creamPaint, .004);
    }
  });
}

function seawall(B: Builder, len: number) {
  part(B, 'post', () => {
    box(B, [-.045, -.5, -.045], [.045, .96, .045], S.creamPaint, .01);
    box(B, [-.06, .96, -.06], [.06, 1, .06], S.creamPaint, .01);
    box(B, [-.095, .005, -.095], [.095, .03, .095], S.galv, .009);
    box(B, [-.068, .03, -.068], [.068, .105, .068], S.creamPaint, .009);
  });
  part(B, 'handrail', () => {
    bar(B, [0, 1, 0], [len, 1, 0], .034, S.creamPaint, 12);
    bar(B, [0, .14, 0], [len, .14, 0], .023, S.creamPaint, 8);
    bar(B, [0, .55, 0], [len, .55, 0], .022, S.creamPaint, 8);
    for (const y of [.14, .55, 1]) bar(B, [0, y, 0], [.09, y, 0], y === 1 ? .043 : .031, S.creamPaint, 10);
  });
  part(B, 'balusters', () => {
    for (let i = 1; i <= 3; i++) {
      const x = len * i / 4;
      bar(B, [x, .14, 0], [x, .98, 0], .014, S.creamPaint, 8);
      for (const y of [.17, .94]) B.tr([x, 0, 0], [0, 0, 0], () => cyl(B, .022, .019, y, y + .035, S.creamPaint, 8));
    }
  });
}

function timberPost(B: Builder) {
  part(B, 'post', () => lathe(B, [[.1, -.45], [.105, -.02], [.1, .43], [.096, .50], [.07, .55], [0, .57]], S.woodMid, { sides: 12, smooth: 40 }));
  part(B, 'post.saddle', () => {
    // Galvanised U-saddle meets the existing .57 m beam datum; no layout/seating change.
    box(B, [-.115, .535, -.075], [.115, .57, .075], S.iron, .007);
    for (const z of [-1, 1]) box(B, [-.105, .50, z * .09 - .012], [.105, .685, z * .09 + .012], S.iron, .007);
    bar(B, [0, .455, -.105], [0, .455, .105], .017, S.iron, 8);
  });
}
function timberBeam(B: Builder, len: number) {
  part(B, 'beam', () => B.tr([-len / 2, .085, 0], [0, 0, -Math.PI / 2], () => {
    lathe(B, [[.074, 0], [.085, .018], [.085, len - .018], [.074, len]], S.woodMid,
      { sides: 12, smooth: 40, surfs: [S.woodLight, S.woodMid, S.woodLight] });
    // Long shallow checks follow the log instead of evenly repeated circumferential bark rings.
    for (const a of [.55, 2.45, 4.7]) B.tr([0, 0, 0], [0, a, 0], () => {
      box(B, [-.0025, .13, .083], [.0025, Math.max(.14, len - .16), .086], S.woodDark, .001);
    });
  }));
}

function lampRework(B: Builder, old: Builder, o: FacilityOptions) {
  lamp(B, old, o);
  const height = o.height ?? 4.4, reach = o.arm ?? 1.35;
  part(B, 'base.anchor-sleeve', () => lathe(B,
    [[.167,.078],[.174,.092],[.169,.13],[.152,.15],[.143,.145],[.145,.105],[.153,.078],[.167,.078]],
    S.galv, { sides:12, smooth:42, caps:false }));
  part(B, 'arm.shaft-sleeve', () => lathe(B,
    [[.072,height-.22],[.092,height-.19],[.092,height+.035],[.074,height+.06],
      [.055,height+.048],[.055,height-.21],[.072,height-.22]],
    S.slateDark, { sides:12, smooth:42, caps:false }));
  const arm = bezier([0,height-.1,0], [0,height+.44,-reach*.35], [0,height+.32,-reach], 10);
  part(B, 'arm.root-coupling', () => tube(B, arm.slice(0,4), [.065,.063,.055,.048], S.galv, 8));
  part(B, 'head.arm-socket', () => tube(B, arm.slice(6,10), [.038,.041,.047,.052], S.galv, 8));
}

function signalRework(B: Builder, old: Builder) {
  signal(B, old);
  part(B, 'mount.overhead-saddle', () => {
    box(B, [-.076,5.275,-3.126], [.076,5.445,-2.974], S.galv, .014);
  });
  part(B, 'mount.pole-brackets', () => {
    for (const y of [1.80,2.40]) box(B, [-.103,y-.043,-.069], [.075,y+.043,.069], S.galv, .01);
  });
  for (const [label, origin] of [['head', [0,4.98,-3.05]], ['near-head',[-.16,2.1,0]]] as const) {
    part(B, label+'.folded-side-rails', () => B.tr([...origin], [0,0,0], () => {
      for (const side of [-1,1]) {
        const z = side * .151;
        box(B, [-.103,-.40,z-.014], [.135,.40,z+.014], S.galv, .007);
      }
    }));
  }
}

/** Slots use the existing street shader and skip the original active optical faces. */
function tagReworkSurfaces(builder: Builder) {
  for (let at = 0; at < builder.mat.length; at += 4) {
    const [roughness, metalness, glow, atlas] = builder.mat.slice(at, at + 4);
    if (glow || atlas) continue;
    const matches = (surface: Surf) => roughness === surface.rough && metalness === surface.metal;
    if (matches(S.galv) || matches(S.iron)) builder.mat[at + 3] = -FACILITY_SURFACE.metal;
    else if ([S.slate, S.slateDark, S.creamPaint, S.orange].some(matches)) builder.mat[at + 3] = -FACILITY_SURFACE.paint;
  }
}

function roadblockRework(B: Builder, old: Builder) {
  retain(B, old, ['boards']);
  // Offset the upper leg behind the two raked sign faces while retaining the foot spread.
  const legProfile = [[.02, .30], [.30, .155], [.62, .042], [.96, .042]];
  const legDepth = (y: number) => {
    const i = legProfile.findIndex(([top]) => top >= y);
    const [lo, z0] = legProfile[i - 1], [hi, z1] = legProfile[i];
    return z0 + (z1 - z0) * (y - lo) / (hi - lo);
  };
  for (const x of [-.56, .56]) {
    part(B, `frame.splayed-legs-${x}`, () => {
      const section: [number, number][] = [[-.035,-.017],[.035,-.017],[.035,.017],[-.035,.017]];
      const outward: V3[] = [[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
      for (const side of [-1, 1]) {
        const rings = legProfile.map(([y,z]) => section.map(([dx,dz]): V3 => [x+dx,y,side*z+dz]));
        B.face(rings[0], S.galv, [0,-1,0]);
        B.face(rings[rings.length-1], S.galv, [0,1,0]);
        for (let i = 1; i < rings.length; i++) for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          B.face([rings[i-1][edge],rings[i-1][next],rings[i][next],rings[i][edge]], S.galv, outward[edge]);
        }
      }
    });
    part(B, `frame.shoes-${x}`, () => {
      for (const side of [-1, 1]) {
        const z = side * .3;
        box(B, [x - .072, 0, z - .074], [x + .072, .048, z + .074], S.rubber, .01);
      }
    });
    part(B, `frame.hinge-${x}`, () => {
      box(B, [x - .049, .905, -.088], [x + .049, .984, .088], S.slateDark, .008);
      bar(B, [x - .065, .943, 0], [x + .065, .943, 0], .029, S.galv, 10);
    });
    part(B, `frame.lock-brace-${x}`, () => {
      box(B, [x - .017, .327, -.151], [x + .017, .365, .151], S.slateDark, .005);
    });
    for (const y of [.48, .77]) part(B, `boards.saddles-${x}-${y}`, () => {
      const inner = legDepth(y);
      const outer = .3 * (1 - y) + .045 - .009;
      for (const side of [-1, 1]) {
        const z0 = side * (inner - .012), z1 = side * outer;
        box(B, [x - .04, y - .025, Math.min(z0, z1)], [x + .04, y + .025, Math.max(z0, z1)], S.slateDark, .006);
      }
    });
  }
  part(B, 'boards.folded-edges', () => {
    for (const [y, height] of [[.48, .20], [.77, .22]]) for (const side of [-1, 1]) {
      const z = side * (.3 * (1 - y) + .045);
      B.tr([0, y, z], [Math.atan2(.3, 1) * side, 0, 0], () => {
        for (const edge of [-1, 1]) {
          const top = edge * height / 2;
          box(B, [-.65, top - .008, -.015], [.65, top + .008, .015], S.creamPaint, .004);
        }
      });
    }
  });
}

export function finishStreetFacility(baseline: Builder, kind: StreetFacility, lod: 0 | 1, o: FacilityOptions = {}): Builder {
  const legacy = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('facilityCraft') === 'legacy';
  // Existing far geometry is intentionally reused; no extra per-instance draw or update loop.
  if (legacy || lod === 1 || (kind === 'lamp' && o.arm === 0)) return baseline;
  const rework = facilityCraftEnabled() && (typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('streetRework') !== 'baseline');
  const B = new Builder(); B.cell = [...baseline.cell];
  if (kind === 'bench') bench(B);
  else if (kind === 'shelter') shelter(B, baseline);
  else if (kind === 'lamp') {
    if (rework) { lampRework(B, baseline, o); tagReworkSurfaces(B); }
    else lamp(B, baseline, o);
  }
  else if (kind === 'signal') {
    if (rework) { signalRework(B, baseline); tagReworkSurfaces(B); }
    else signal(B, baseline);
  }
  else if (kind === 'bin' && binR2Enabled()) {
    const reference = new Builder(); bin(reference);
    retain(B, reference, ['drum']);
    buildBinR2Details(B);
    retain(B, reference, ['lid.hinge']);
  }
  else if (kind === 'bin') bin(B);
  else if (kind === 'roadblock') {
    if (rework) { roadblockRework(B, baseline); tagReworkSurfaces(B); }
    else roadblock(B, baseline);
  }
  else if (kind === 'seawallBay') seawall(B, o.len ?? 2);
  else if (kind === 'timberPost') timberPost(B);
  else timberBeam(B, o.len ?? 4.2);
  if (kind === 'shelter') tagShelterSurfaces(B);
  if (kind === 'bench' || kind === 'bin') tagBenchBinSurfaces(B, kind);
  return bindStreetFacilityCollision(B, baseline);
}

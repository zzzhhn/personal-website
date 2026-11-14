import { ShapeUtils, Vector2 } from 'three';
import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactoryModule } from './factory-game.ts';
import type { FactorySolid } from './factory-geometry.ts';

export interface FactoryMachineCasingPalette {
  cream: Surf; teal: Surf; steel: Surf; silver: Surf; dark: Surf;
}

/** Fixed machine-local casing. Translate both geometry and solids by
 * [-27,0,FACTORY_LINE_Z[module]] before merging/baking in factory-local space.
 * Replace the old base, four columns, top beam, fixed Y=4.15 silver head and
 * external yellow guide bars. KEEP the Y=1.215 press bed, conveyors, lamp,
 * aisle marks and every moving ram/piston/guard in WorldFactoryMechanisms.
 * No new process, actuator or moving die is simulated here. Caller owns
 * geometry.dispose(); no materials/textures/shared resources are created. */
export function buildFactoryMachineCasing(module: FactoryModule, palette: FactoryMachineCasingPalette) {
  if (!(['frame', 'wheels', 'shell'] as string[]).includes(module)) throw new TypeError('Invalid factory machine module');
  const b = new Builder(), solids: FactorySolid[] = [], P = palette;
  const box = (at: V3, size: V3, surf: Surf, solid = false, bevel = 0) => {
    cbox(b, at, size, surf, bevel);
    if (solid) solids.push({ at: [...at], size: [...size] });
  };
  // Sectional columns and cross-saddles carry the retained bed's underside
  // Y=.865. Four corner feet, not a solid block filling the material throat.
  const postSection = [[-.23,-.23],[.23,-.23],[.23,-.15],[.05,-.15],[.05,.15],[.23,.15],
    [.23,.23],[-.23,.23],[-.23,.15],[-.05,.15],[-.05,-.15],[-.23,-.15]].map(p => new Vector2(...p as [number,number]));
  for (const x of [-2.4, 2.4]) for (const z of [-2.02, 2.02]) {
    box([x, .22, z], [.72, .2, .7], P.steel, true, .02);
    // One continuous I section: the web meets both flanges, rather than
    // three parallel bars separated by 60 mm of air. A single extruded
    // boundary also avoids coplanar internal box faces at those joins.
    for (const tri of ShapeUtils.triangulateShape(postSection, [])) for (const y of [.32, 4.4])
      b.face(tri.map(i => [x + postSection[i].x, y, z + postSection[i].y] as V3), P.teal, [0,y < 1 ? -1 : 1,0]);
    postSection.forEach((p,i) => {
      const q=postSection[(i+1)%postSection.length];
      const surf=Math.abs(p.y)===.15&&p.x===q.x?P.steel:P.teal;
      b.face([[x+p.x,.32,z+p.y],[x+q.x,.32,z+q.y],[x+q.x,4.4,z+q.y],[x+p.x,4.4,z+p.y]],
        surf,[q.y-p.y,0,p.x-q.x]);
    });
    solids.push({ at: [x, 2.36, z], size: [.46, 4.08, .46] });
  }
  for (const z of [-1.7, 1.7]) box([0, .44, z], [5.26, .28, .28], P.teal, true, .018);
  for (const x of [-1.55, 1.55]) box([x, .655, 0], [.3, .42, 3.65], P.steel, true, .016);
  // Four outer yoke members and four inner ties leave a .5 m square bore.
  // A deeper central crown reads as a press casting, with sloped load paths
  // returning into the original four posts. Its lower face stays above the
  // complete raised guard envelope; the .5 m central rod bore is untouched.
  const crown = [[-2.65,5.02],[-2.57,5.1],[2.57,5.1],[2.65,5.02],[2.65,4.4],
    [2.15,4.4],[1.45,4.06],[-1.45,4.06],[-2.15,4.4],[-2.65,4.4]].map(p => new Vector2(...p as [number,number]));
  for (const z of [-2.05, 2.05]) {
    const paint=module==='shell'?P.cream:P.teal;
    for (const tri of ShapeUtils.triangulateShape(crown, [])) for (const side of [-1,1])
      b.face(tri.map(i=>[crown[i].x,crown[i].y,z+side*.35] as V3),paint,[0,0,side]);
    crown.forEach((p,i)=>{
      const q=crown[(i+1)%crown.length];
      b.face([[p.x,p.y,z-.35],[q.x,q.y,z-.35],[q.x,q.y,z+.35],[p.x,p.y,z+.35]],paint,[p.y-q.y,q.x-p.x,0]);
    });
    solids.push({at:[0,4.75,z],size:[5.3,.7,.7]});
    // The added rectangular centre has an exact collider. Sloping haunches
    // above head height remain visual, outside all moving/walking corridors.
    solids.push({at:[0,4.23,z],size:[2.9,.34,.7]});
  }
  for (const x of [-2.4, 2.4]) box([x, 4.75, 0], [.5, .7, 3.4], P.teal, true, .025);
  for (const x of [-1.2, 1.2]) box([x, 4.75, 0], [1.9, .7, .6], P.steel, true, .02);
  for (const z of [-.975, .975]) box([0, 4.75, z], [.5, .7, 1.45], P.steel, true, .02);
  // Carry the retained lamp housing (Y=3.9, half-height .08) from the yoke.
  box([0, 4.19, -1.9], [.12, .42, .1], P.steel);
  // A real annular receiver surrounds the existing moving .15 m-radius rod.
  // Its bore is deliberately absent from the box-collider set.
  lathe(b, [[.195, 3.95], [.34, 3.95], [.36, 4.08], [.36, 4.95], [.32, 5.095], [.195, 5.095], [.195, 3.95]],
    P.silver, { sides: 12, faceted: true, caps: false });
  // C-section fixed guides surround, rather than cover, the live Z=-2.15 gate.
  for (const side of [-1, 1]) {
    box([side * 2.155, 2.68, -2.15], [.03, 2.9, .26], P.steel);
    for (const dz of [-.11, .11]) box([side * 2.07, 2.68, -2.15], [.2, 2.9, .04], P.silver);
  }

  if (module === 'frame') {
    // Exposed load-path knees and split rear cabinets identify the bracket
    // frame press. These are fixed reinforcements outside the moving platen.
    for (const side of [-1, 1]) for (const z of [-2.02, 2.02]) {
      const points: V3[] = [[side * 2.17, .32, z], [side * 2.82, .32, z], [side * 2.17, 1.45, z]];
      for (const dz of [-.07, .07]) b.face(points.map(p => [p[0], p[1], p[2] + dz] as V3), P.steel, [0, 0, Math.sign(dz)]);
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        b.face([[p[0], p[1], z - .07], [q[0], q[1], z - .07], [q[0], q[1], z + .07], [p[0], p[1], z + .07]],
          P.steel, [side * (q[1] - p[1]), side * (p[0] - q[0]), 0]);
      });
    }
    for (const y of [1.04, 3.79]) box([0, y, 2.15], [4.7, .14, .24], P.steel, true, .02);
    for (const x of [-1.35, 1.35]) {
      box([x, 2.42, 2.2], [1.45, 2.66, .18], P.teal, true, .025);
      box([x, 2.42, 2.095], [1.15, 2.3, .05], P.steel, false, .01);
      box([x, 2.42, 2.06], [.96, 2.08, .03], P.cream, false, .01);
    }
  } else if (module === 'wheels') {
    // Open annular bearing-service seats make the wheel line genuinely round
    // and hollow. They are fixed housings, not additional animated tooling.
    for (const x of [-1.05, 1.05]) {
      box([x, .5, 1.95], [1.1, .16, .5], P.steel);
      box([x, 1.07, 2.1], [.28, 1.14, .36], P.teal);
      box([x, 1.97, 2.1], [.92, .66, .48], P.teal, true, .025);
      b.tr([x, 2.6, 2.1], [Math.PI / 2, 0, 0], () => lathe(b,
        [[.16, -.225], [.36, -.225], [.36, .225], [.16, .225], [.16, -.225]], P.silver, { sides: 12, faceted: true, caps: false }));
    }
    for (const side of [-1, 1]) {
      box([side * 2.42, 2.25, 1.5], [.3, 2.4, 1.2], P.steel);
      for (const y of [1.13, 3.37]) box([side * 2.65, y, 1.5], [.18, .16, 1.2], P.teal);
      for (const z of [.98, 2.02]) box([side * 2.65, 2.25, z], [.18, 2.08, .16], P.teal);
      box([side * 2.605, 2.25, 1.5], [.035, 2.04, .88], P.cream, false, .01);
      box([side * 2.635, 2.35, 1.5], [.035, .18, .05], P.silver);
      solids.push({ at: [side * 2.48, 2.25, 1.5], size: [.52, 2.4, 1.2] });
    }
  } else {
    // Broad folded-enamel cheeks and two recessed rear leaves distinguish
    // shell forming. The open front still exposes the retained ram and bed.
    for (const x of [-2.55, 2.55]) for (const z of [-2.02, 2.02])
      box([x, 2.5, z], [.3, 3.2, .62], P.cream, false, .06);
    box([0, 2.525, 2.23], [4.4, 2.65, .18], P.steel, true);
    for (const y of [1.29, 3.76]) box([0, y, 2.02], [4.4, .18, .28], P.cream);
    for (const x of [-2.11, 2.11]) box([x, 2.525, 2.02], [.18, 2.29, .28], P.cream);
    for (const x of [-1.04, 1.04]) {
      box([x, 2.525, 2.11], [1.94, 2.18, .08], P.cream, false, .025);
      box([x - Math.sign(x) * .65, 2.6, 2.055], [.05, .28, .04], P.teal, false, .006);
    }
  }
  // A supported reservoir and two hard lines feed the fixed receiver. Pipes
  // pass ABOVE the ram's highest face, never through the rod or the guard.
  box([0, .36, 2.08], [1.5, .12, .52], P.steel);
  box([0, .65, 2.1], [1.2, .58, .42], P.teal, true, .025);
  for (const [x, endX, y] of [[.25, .18, 4.16], [-.25, -.18, 4.29]]) {
    const points: V3[] = [[x, .9, 2.33], [x, y, 2.33], [endX, y, 2.33], [endX, y, .31]];
    for (let i = 1; i < points.length; i++) bar(b, points[i - 1], points[i], .025, P.dark, 6);
    // Two bounded hex unions: one seats into the reservoir's unchamfered
    // rear face, the other intersects the receiver's actual annular wall.
    bar(b,[x,.9,2.28],[x,.9,2.39],.06,P.silver,6);
    bar(b,[endX,y,.28],[endX,y,.44],.06,P.silver,6);
  }
  const geometry = b.build();
  return { geometry, solids, triangles: b.triangles };
}

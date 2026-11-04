import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import type { thrillFrame } from './coaster-thrill-frame.ts';
import type { ThrillSupport } from './coaster-thrill-supports.ts';
import type { CoasterBatch } from './coaster-geometry.ts';

export type CoasterStructureSurface = 'runningSteel' | 'spineCoat' | 'tieCoat' | 'railSeat' | 'supportCoat' | 'connectionSteel' | 'grout';
export type CoasterStructureCraft = {
  scope?: 'full';
  detailed?: boolean;
  mark?: (geometry: BufferGeometry, surface: CoasterStructureSurface) => void;
};

// The lower run after the first loop. Both existing support LODs place one bent in this short span.
export const COASTER_CRAFT_BAY = { centre: .265, halfLength: 8 };
export const inCoasterCraftBay = (u: number) => Math.abs(u - COASTER_CRAFT_BAY.centre) * THRILL_LENGTH <= COASTER_CRAFT_BAY.halfLength;
type Frame = ReturnType<typeof thrillFrame>;

export function addCoasterCraftPart(batch: CoasterBatch, geometry: BufferGeometry, colour: string, surface: CoasterStructureSurface,
  craft: CoasterStructureCraft, matrix?: Matrix4) {
  batch.add(geometry, colour, matrix);
  // CoasterBatch converts indexed input before assigning lighting. Mark the actual batched part.
  const target = batch.parts[batch.parts.length - 1];
  target.userData.intentStructureRole = surface;
  craft.mark?.(target, surface);
}

export function addCoasterCraftTie(batch: CoasterBatch, frame: Frame, craft: CoasterStructureCraft, u?: number) {
  const simplified = craft.scope === 'full' && craft.detailed === false;
  // Narrower chord dimension where the transport frame changes quickly between adjacent ties.
  const tightRun = craft.scope === 'full' && u !== undefined && u >= .75 && u <= .81;
  const chord = tightRun ? .12 : .24;
  const size: [number, number, number] = simplified ? [chord, .22, 1.9] : [chord, .20, 1.9];
  const at = (side: number, up: number) => frame.point.clone().addScaledVector(frame.side, side).addScaledVector(frame.up, up);
  const box = (dimensions: typeof size, side: number, up: number, colour: string, surface: CoasterStructureSurface) => {
    addCoasterCraftPart(batch, new BoxGeometry(...dimensions), colour, surface, craft,
      new Matrix4().compose(at(side, up), frame.rotation, new Vector3(1,1,1)));
    batch.parts[batch.parts.length - 1].userData.structureAt = u;
  };
  // The original tie envelope remains; a separate steel seat closes the 15 mm gap to the rail underside.
  box(size, 0, simplified ? -.203 : -.21, '#536e80', 'tieCoat');
  if (simplified) return;
  for (const side of [-.78, .78]) box([tightRun ? .14 : .29, .035, .27], side, -.106, '#a6b7bf', 'railSeat');
}

export function addCoasterCraftSupportNode(batch: CoasterBatch, support: ThrillSupport, craft: CoasterStructureCraft, originalSample = true) {
  const first = batch.parts.length;
  const identify = () => { for (let i = first; i < batch.parts.length; i++) batch.parts[i].userData.structureAt = support.u; };
  const tint = '#9aabb3';
  const simplified = craft.scope === 'full' && craft.detailed === false;
  for (const [i, top] of [support.a, support.b].entries()) {
    const { a: foot, radius } = support.beams[i];
    const plate = originalSample ? 1.6 : Math.max(1.05, radius * 2.55);
    // Both plate variants rest on the existing footing at foot.y + 1.
    if (simplified) {
      addCoasterCraftPart(batch, new BoxGeometry(plate,.15,plate).translate(foot.x,foot.y+1.05,foot.z), tint, 'connectionSteel', craft);
    } else {
      addCoasterCraftPart(batch, new BoxGeometry(plate,.052,plate).translate(foot.x,foot.y+1.001,foot.z), '#a69d89', 'grout', craft);
      addCoasterCraftPart(batch, new BoxGeometry(plate-.06,.098,plate-.06).translate(foot.x,foot.y+1.076,foot.z), tint, 'connectionSteel', craft);
    }

    const width = originalSample ? .82 : radius + .14;
    const height = originalSample ? .7 : .58;
    if (simplified) {
      addCoasterCraftPart(batch, new CylinderGeometry(width,width-.04,height,8).translate(top.x,top.y-height/2,top.z), tint, 'connectionSteel', craft);
    } else {
      // The collar shares a boundary with the retained column and straddles the crossbeam centre.
      addCoasterCraftPart(batch, new CylinderGeometry(width-.01,width,.16,8).translate(top.x,top.y-.08,top.z), tint, 'connectionSteel', craft);
      addCoasterCraftPart(batch, new CylinderGeometry(width-.02,radius+.015,height-.16,8).translate(top.x,top.y-(height+.16)/2,top.z), '#526d80', 'supportCoat', craft);
    }
  }
  if (simplified) { identify(); return; }

  const axis = support.b.clone().sub(support.a).normalize();
  const across = new Vector3(-axis.z, 0, axis.x);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), axis);
  const railBeam = support.beams[2];
  for (const side of [-1,1]) {
    const at = support.top.clone().addScaledVector(across, side*(railBeam.radius-.06));
    at.y -= .19;
    addCoasterCraftPart(batch, new BoxGeometry(.12,.40,1.46), tint, 'connectionSteel', craft,
      new Matrix4().compose(at, rotation, new Vector3(1,1,1)));
  }
  identify();
}

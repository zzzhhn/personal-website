import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import type { thrillFrame } from './coaster-thrill-frame.ts';
import type { ThrillSupport } from './coaster-thrill-supports.ts';
import type { CoasterBatch } from './coaster-geometry.ts';

export type CoasterStructureSurface = 'runningSteel' | 'spineCoat' | 'tieCoat' | 'railSeat' | 'supportCoat' | 'connectionSteel' | 'grout';
export type CoasterStructureCraft = {
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

export function addCoasterCraftTie(batch: CoasterBatch, frame: Frame, craft: CoasterStructureCraft) {
  const size: [number, number, number] = [.24, .20, 1.9];
  const at = (side: number, up: number) => frame.point.clone().addScaledVector(frame.side, side).addScaledVector(frame.up, up);
  const box = (dimensions: typeof size, side: number, up: number, colour: string, surface: CoasterStructureSurface) =>
    addCoasterCraftPart(batch, new BoxGeometry(...dimensions), colour, surface, craft,
      new Matrix4().compose(at(side, up), frame.rotation, new Vector3(1,1,1)));
  // The original tie envelope remains; a separate steel seat closes the 15 mm gap to the rail underside.
  box(size, 0, -.21, '#536e80', 'tieCoat');
  for (const side of [-.78, .78]) box([.29, .035, .27], side, -.106, '#a6b7bf', 'railSeat');
}

export function addCoasterCraftSupportNode(batch: CoasterBatch, support: ThrillSupport, craft: CoasterStructureCraft) {
  const tint = '#9aabb3';
  for (const [i, top] of [support.a, support.b].entries()) {
    const foot = support.beams[i].a;
    // Grout and steel touch the existing footing at foot.y + 1 and encircle the retained column.
    addCoasterCraftPart(batch, new BoxGeometry(1.6,.052,1.6).translate(foot.x,foot.y+1.001,foot.z), '#a69d89', 'grout', craft);
    addCoasterCraftPart(batch, new BoxGeometry(1.54,.098,1.54).translate(foot.x,foot.y+1.076,foot.z), tint, 'connectionSteel', craft);
    // Same upper envelope as the old collar, with a fitted transition around the column.
    addCoasterCraftPart(batch, new CylinderGeometry(.81,.82,.16,8).translate(top.x,top.y-.08,top.z), tint, 'connectionSteel', craft);
    addCoasterCraftPart(batch, new CylinderGeometry(.80,.665,.54,8).translate(top.x,top.y-.43,top.z), '#526d80', 'supportCoat', craft);
  }

  const axis = support.b.clone().sub(support.a).normalize();
  const across = new Vector3(-axis.z, 0, axis.x);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), axis);
  for (const side of [-1,1]) {
    const at = support.top.clone().addScaledVector(across, side*.36);
    at.y -= .19;
    addCoasterCraftPart(batch, new BoxGeometry(.12,.40,1.46), tint, 'connectionSteel', craft,
      new Matrix4().compose(at, rotation, new Vector3(1,1,1)));
  }
}

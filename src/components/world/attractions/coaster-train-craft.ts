import { BufferAttribute, BufferGeometry, LatheGeometry, Matrix4, ShapeUtils, Vector2 } from 'three';
import type { Vec3 } from '../types';
import { COASTER_CAR_PANELS } from './coaster-access.ts';
import type { CoasterBatch } from './coaster-geometry.ts';
import { INTENT_CRAFT, markIntentCraft } from './intent-craft-surface.ts';

const pigment = {
  deck: '#c38c50', shoulder: '#dfac67', body: '#b57e48', return: '#805538',
  chassis: '#283e4e', guard: '#516b7c', guardLip: '#8095a0', liner: '#233849',
  backing: '#22394d', backPanel: '#324e63', upholstery: '#39546b', bolster: '#314b62',
  steel: '#c2ccd1', tread: '#273e4e', cyan: '#69dedb',
};
const { structuralCoat: coat, galvanized, runningSteel: steel, rubber } = INTENT_CRAFT;

type Section = Vec3[];
const around = (y: number, minX: number, maxX: number, halfZ: number, rearRadius: number, noseRadius = rearRadius): Section => {
  const corners = [
    [maxX - noseRadius, halfZ - noseRadius, noseRadius],
    [minX + rearRadius, halfZ - rearRadius, rearRadius],
    [minX + rearRadius, -halfZ + rearRadius, rearRadius],
    [maxX - noseRadius, -halfZ + noseRadius, noseRadius],
  ];
  return corners.flatMap(([x, z, radius], corner) => [0, 1, 2].map(step => {
    const angle = (corner * 2 + step) * Math.PI / 4;
    return [x + radius * Math.cos(angle), y, z + radius * Math.sin(angle)] as Vec3;
  }));
};

// A section winds counterclockwise in XZ. Upward lofts use the original
// coordinates. For a forward-facing part the same section maps to YZ.
const forward = ([u, depth, z]: Vec3): Vec3 => [depth, -u, z];

function loft(sections: Section[], capBottom = true, capTop = true, orient = (p: Vec3) => p) {
  const vertices: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => vertices.push(...orient(a), ...orient(b), ...orient(c));
  for (let level = 1; level < sections.length; level++) {
    const low = sections[level - 1], high = sections[level];
    for (let i = 0; i < low.length; i++) {
      const j = (i + 1) % low.length;
      triangle(low[i], high[i], high[j]);
      triangle(low[i], high[j], low[j]);
    }
  }
  const cap = (ring: Section, top: boolean) => {
    const contour = ring.map(([x, , z]) => new Vector2(x, z));
    for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) {
      triangle(ring[a], ring[top ? c : b], ring[top ? b : c]);
    }
  };
  if (capBottom) cap(sections[0], false);
  if (capTop) cap(sections[sections.length - 1], true);
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function addCoasterTrainCraft(batch: CoasterBatch): void {
  const add = (geometry: BufferGeometry, color: string, role: number, matrix?: Matrix4) => {
    batch.add(geometry, color, matrix);
    markIntentCraft(batch.parts[batch.parts.length - 1], role);
  };
  const beam = (a: Vec3, b: Vec3, radius: number, color: string, role: number, sides = 8) => {
    batch.beam(a, b, radius, color, sides);
    markIntentCraft(batch.parts[batch.parts.length - 1], role);
  };
  const [floor, bulkhead, seat, back, left, right] = COASTER_CAR_PANELS;
  const deckTop = floor.at[1] + floor.size[1] / 2;
  const seatTop = seat.at[1] + seat.size[1] / 2;
  const backFace = back.at[0] + back.size[0] / 2;
  const backTop = back.at[1] + back.size[1] / 2;

  // The belly tucks under the two rolled edges. The top ring reaches the
  // original sill at the boarding opening and the deck closes at its datum.
  const belly = around(.115, -1.25, 1.27, .72, .25, .27);
  const undercut = around(.202, -1.40, 1.40, .81, .17, .23);
  const lowerShoulder = around(.28, -1.445, 1.445, .879, .10, .195);
  const belt = around(.382, -1.45, 1.45, .925, .10, .17);
  const rolledTop = around(deckTop, -1.45, 1.45, floor.size[2] / 2, .15, .16);
  add(loft([belly, undercut]), pigment.chassis, coat);
  add(loft([around(.188, -1.32, 1.32, .785, .18, .23), lowerShoulder]), pigment.return, coat);
  add(loft([lowerShoulder, belt], false, false), pigment.body, coat);
  add(loft([belt, rolledTop], false), pigment.shoulder, coat);

  // The end cap rises out of the copper shell and leans into its end face.
  // The shallow cyan marker stays on the outside of the existing front stop.
  const nose = bulkhead.at[0] + bulkhead.size[0] / 2;
  const inner = bulkhead.at[0] - bulkhead.size[0] / 2;
  add(loft([
    around(.414, inner, nose - .028, .754, .035, .043),
    around(.54, inner, nose - .022, .894, .035, .056),
    around(.825, inner, nose - .022, .824, .037, .052),
    around(.925, inner + .029, nose - .033, .70, .025, .025),
  ]), pigment.guard, coat);
  add(loft([
    around(nose - .025, -.767, -.644, .59, .027),
    around(nose, -.743, -.668, .54, .026),
  ], true, true, forward), pigment.cyan, coat);

  for (const panel of [left, right]) {
    const [x, y, z] = panel.at;
    const halfLength = panel.size[0] / 2;
    const section = (height: number, tuck: number, halfDepth: number, endRadius: number) =>
      around(height, x - halfLength + tuck, x + halfLength - tuck, halfDepth, endRadius)
        .map(([px, py, pz]): Vec3 => [px, py, pz + z]);
    const wall = section(y + .119, .011, .072, .05);
    add(loft([section(deckTop - .006, .12, .055, .04), section(y - .109, .025, .073, .05), wall], true, false), pigment.guard, coat);
    add(loft([wall, section(y + .175, .024, .061, .045)], false), pigment.guardLip, galvanized);
  }

  // The rolled seat pan stays below its contact plane. The side rolls rise
  // beside the recessed join, still within the parked seat's original box.
  add(loft([
    around(deckTop - .006, -.425, .36, .426, .12),
    around(.575, -.455, .393, .472, .11),
  ]), pigment.backing, coat);
  add(loft([
    around(.56, -.48, .42, .535, .11, .16),
    around(.615, -.548, .533, .583, .125, .155),
    around(.678, -.548, .55, .575, .12, .158),
    around(seatTop, -.516, .482, .447, .093, .13),
  ]), pigment.upholstery, rubber);
  for (const side of [-1, 1]) {
    const roll = (y: number, minX: number, maxX: number, halfZ: number, radius: number, lateral: number) =>
      around(y, minX, maxX, halfZ, radius).map(([x, h, z]): Vec3 => [x, h, z + side * lateral]);
    add(loft([
      roll(.609, -.49, .48, .076, .062, .523),
      roll(.671, -.532, .517, .087, .077, .522),
      roll(.71, -.486, .442, .077, .071, .523),
      roll(seatTop, -.404, .344, .047, .046, .522),
    ]), pigment.bolster, rubber);
  }

  // A swept shoulder, pinched waist and separate inset foam panel leave
  // a curved wrap around the sitter. X on the foam face is the contact datum.
  const shoulder: [number, number][] = [
    [.628, -.30], [.628, .30], [.675, .44], [.82, .475], [1.01, .46],
    [1.16, .545], [1.28, .625], [1.378, .57], [1.444, .455], [backTop, .325],
    [backTop, -.325], [1.444, -.455], [1.378, -.57], [1.28, -.625],
    [1.16, -.545], [1.01, -.46], [.82, -.475], [.675, -.44],
  ];
  const backSection = (x: number, width: number, height: number) =>
    shoulder.map(([y, z]): Vec3 => [-(1.05 + (y - 1.05) * height), x, z * width]);
  const rearShoulder = backSection(-.626, .897, .951);
  add(loft([backSection(-.65, .57, .776), rearShoulder], true, false, forward), pigment.backPanel, coat);
  add(loft([
    rearShoulder, backSection(-.61, 1, 1), backSection(-.506, .994, .991), backSection(-.478, .86, .928),
  ], false, true, forward), pigment.backing, coat);
  add(loft([
    backSection(-.526, .75, .919), backSection(-.478, .734, .919),
    backSection(backFace, .601, .843),
  ], true, true, forward), pigment.upholstery, rubber);

  for (const side of [-1, 1]) {
    const wing: [number, number][] = [
      [.676, .426], [.691, .522], [.803, .567], [1.018, .54], [1.154, .588],
      [1.278, .622], [1.358, .56], [1.333, .454], [1.218, .406],
      [1.066, .363], [.87, .394], [.746, .373],
    ];
    const wingSection = (x: number, scale: number): Section => {
      const ring = wing.map(([y, z]): Vec3 => [-(1.036 + (y - 1.036) * scale), x, side * (.49 + (z - .49) * scale)]);
      return side > 0 ? ring : ring.reverse();
    };
    add(loft([
      wingSection(-.548, .80), wingSection(-.497, 1),
      wingSection(-.456, .85), wingSection(backFace, .57),
    ], true, true, forward), pigment.bolster, rubber);
  }

  // End-supported restraint, with a soft grip on a single continuous crossbar.
  for (const side of [-1, 1]) {
    const z = side * .85;
    beam([1.29, .5, z], [1.29, .64, z], .077, pigment.chassis, coat);
    beam([1.295, .57, z], [1.25, 1.22, z], .065, pigment.steel, steel);
    beam([1.25, 1.22, z], [1.25, 1.22, side * .55], .057, pigment.steel, steel);
  }
  beam([1.25, 1.22, -.56], [1.25, 1.22, .56], .065, pigment.tread, rubber);

  // Mirrored wheel ends share a stepped rolling section. Its outer tyre and
  // hub limits are the same as the earlier cylindrical running gear.
  for (const x of [-1, 1]) {
    beam([x, .08, -.87], [x, .08, .87], .069, pigment.chassis, steel);
    for (const side of [-1, 1]) {
      const z = side * .85;
      const wheel = new Matrix4().makeRotationX(side * Math.PI / 2).setPosition(x, .08, z);
      const revolved = (profile: [number, number][], color: string, role: number, sides: number) =>
        add(new LatheGeometry(profile.map(([r, axial]) => new Vector2(r, axial)), sides), color, role, wheel);
      revolved([[.113, -.15], [.225, -.15], [.26, -.115], [.26, .103],
        [.24, .133], [.202, .15], [.126, .15]], pigment.tread, rubber, 12);
      revolved([[.133, .124], [.147, .138], [.147, .149], [.127, .158], [.083, .158]],
        pigment.steel, galvanized, 8);
      beam([x, .08, z - side * .14], [x, .08, z + side * .155], .094, pigment.guard, steel, 6);
    }
  }
}

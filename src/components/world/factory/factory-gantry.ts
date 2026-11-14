import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Builder, bar, cbox, type Surf } from '../WorldStreetGeometry.ts';

/** Fixed rails surround the complete extraction envelope, including the hopper.
 * Shared with the static structure; tool coordinates stay in factory-local metres. */
export const FACTORY_GANTRY = {
  columnsX: [-44.35, -30.65], endsZ: [-24.35, -12.65],
  floorY: .12, railTop: 5.8, bridgeWheelRadius: .19,
  bridgeBeamY: 6.3, bridgeBeamHeight: .44, bridgeRailZ: .36,
  trolleyWheelRadius: .15, cableExitY: 5.96,
  magnetTop: .11, cableSocketTop: .24, cableSocketInset: .02,
} as const;
type GantryPalette = Record<'cream'|'teal'|'steel'|'amber'|'silver'|'dark', Surf>;

/** Bridge, transverse trolley, winch and two variable-length steel ropes.
 * The caller owns the magnet at toolPosition, whose top is +.11 m; this rig owns
 * only its own resources. Mount group beside that magnet, never inside it. */
export function buildFactoryGantry(palette: GantryPalette) {
  const G = FACTORY_GANTRY, group = new Group(), bridge = new Group(), trolley = new Group();
  group.name = 'factory-raw-gantry'; bridge.name = 'gantry-travelling-bridge';
  trolley.name = 'gantry-hoist-trolley'; group.add(bridge, trolley);
  const geometries = new Set<BufferGeometry>();
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .2 });
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .4 });
  const attach = (parent: Group, b: Builder, name: string, material = paint) => {
    const geometry = b.build(); geometries.add(geometry);
    const mesh = new Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const beams = new Builder(), wheelRadius = G.bridgeWheelRadius;
  const span = G.columnsX[1] - G.columnsX[0], centreX = (G.columnsX[0] + G.columnsX[1]) / 2;
  for (const z of [-G.bridgeRailZ, G.bridgeRailZ]) {
    cbox(beams, [centreX, G.bridgeBeamY, z], [span, .31, .13], palette.amber, .02);
    for (const y of [-1, 1]) cbox(beams,
      [centreX, G.bridgeBeamY + y * (G.bridgeBeamHeight / 2 - .04), z],
      [span, .08, .27], palette.amber, .012);
  }
  for (const x of G.columnsX) {
    cbox(beams, [x, 6.23, 0], [.62, .2, 1.42], palette.teal, .045);
    for (const z of [-.48, .48]) {
      // Z travel wheels have X axles and touch the fixed rail at railTop.
      bar(beams, [x-.17, G.railTop+wheelRadius, z], [x+.17, G.railTop+wheelRadius, z], wheelRadius, palette.steel, 12);
      bar(beams, [x-.22, G.railTop+wheelRadius, z], [x+.22, G.railTop+wheelRadius, z], .065, palette.silver, 8);
    }
    cbox(beams, [x, 6.43, .04], [.48, .25, .48], palette.cream, .04);
  }
  attach(bridge, beams, 'gantry-twin-bridge-and-end-trucks');

  const carriage = new Builder(), hoist = new Builder();
  const trolleyWheelY = G.bridgeBeamY + G.bridgeBeamHeight/2 + G.trolleyWheelRadius;
  cbox(carriage, [0, 6.86, 0], [1.28, .18, 1.14], palette.teal, .045);
  for (const x of [-.43, .43]) for (const z of [-G.bridgeRailZ, G.bridgeRailZ]) {
    // X travel wheels ride the bridge flanges, with Z axles.
    bar(carriage, [x, trolleyWheelY, z-.09], [x, trolleyWheelY, z+.09], G.trolleyWheelRadius, palette.steel, 12);
    bar(carriage, [x, trolleyWheelY, z-.13], [x, trolleyWheelY, z+.13], .045, palette.silver, 8);
  }
  cbox(carriage, [0, 7.07, 0], [.8, .28, .79], palette.cream, .045);
  cbox(carriage, [0, 7.23, 0], [.87, .06, .87], palette.teal, .015);
  // Hanging cheek plates, drum and gear casing form a real load path from
  // trolley deck to the two rope exits, rather than a floating wire stub.
  for (const x of [-.39, .39]) cbox(hoist, [x, 6.36, 0], [.1, .94, .58], palette.teal, .025);
  bar(hoist, [-.39, 6.19, 0], [.39, 6.19, 0], .25, palette.steel, 12);
  for (const x of [-.28, .28]) bar(hoist, [x-.035, 6.19, 0], [x+.035, 6.19, 0], .29, palette.amber, 12);
  cbox(hoist, [.55, 6.2, 0], [.26, .48, .47], palette.cream, .04);
  for (const x of [-.16, .16]) bar(hoist, [x, 5.91, 0], [x, 6.12, 0], .067, palette.silver, 8);
  attach(trolley, carriage, 'gantry-trolley-deck');
  attach(trolley, hoist, 'gantry-winch-and-rope-guides', metal);

  const ropeBuilder = new Builder(), sockets = new Builder();
  bar(ropeBuilder, [0, -.5, 0], [0, .5, 0], .023, palette.steel, 6);
  const ropeA = attach(group, ropeBuilder, 'gantry-rope-left', metal);
  // Share the unit rope geometry; no geometry or material is allocated in update.
  const ropeB = new Mesh(ropeA.geometry, metal); ropeB.name = 'gantry-rope-right';
  ropeB.castShadow = true; group.add(ropeB);
  for (const x of [-.16, .16]) {
    bar(sockets, [x, G.magnetTop, 0], [x, G.cableSocketTop, 0], .052, palette.silver, 8);
    bar(sockets, [x, G.magnetTop, 0], [x, G.magnetTop+.04, 0], .075, palette.amber, 8);
  }
  const socket = attach(group, sockets, 'gantry-magnet-rope-sockets', metal);
  let disposed = false;
  const update = (toolPosition: readonly number[]) => {
    if (disposed) return;
    const [x, y, z] = toolPosition;
    bridge.position.z = z; trolley.position.set(x, 0, z); socket.position.set(x, y, z);
    const bottom = y + G.cableSocketTop - G.cableSocketInset;
    const length = G.cableExitY - bottom, middle = (G.cableExitY + bottom) / 2;
    ropeA.position.set(x-.16, middle, z); ropeB.position.set(x+.16, middle, z);
    ropeA.scale.y = length; ropeB.scale.y = length;
  };
  update([-37, 3.4, -19]);
  return { group, update, dispose() {
    if (disposed) return;
    disposed = true;
    // External magnet children/materials and detached rig objects are not traversed.
    geometries.forEach(g => g.dispose()); paint.dispose(); metal.dispose();
  } };
}

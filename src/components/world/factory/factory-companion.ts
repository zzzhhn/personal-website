import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { Builder, S, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';

export interface FactoryCompanionOptions {
  configuration?: 'nimble' | 'steady';
  shell?: boolean;
}

const frame: Surf = { color: '#34484b', rough: .66, metal: .32 };
const teal: Surf = { color: '#527f7b', rough: .6, metal: .2 };
const amber: Surf = { color: '#f4ad42', rough: .34, metal: 0 };

function addDamper(b: Builder, from: V3, to: V3) {
  bar(b, from, to, .009, S.galv, 6);
  const a = new Vector3(...from), delta = new Vector3(...to).sub(a);
  const axis = delta.clone().normalize(), u = new Vector3(0, 0, 1).cross(axis).normalize();
  const v = axis.clone().cross(u);
  let previous: V3 | undefined;
  // Three actual coil turns, six straight spans per turn. No high-resolution tube.
  for (let i = 0; i <= 18; i++) {
    const angle = i * Math.PI / 3;
    const p = a.clone().addScaledVector(delta, .18 + .64 * i / 18)
      .addScaledVector(u, .017 * Math.cos(angle)).addScaledVector(v, .017 * Math.sin(angle));
    const next: V3 = [p.x, p.y, p.z];
    if (previous) bar(b, previous, next, .0035, S.galv, 4);
    previous = next;
  }
}

function addWheel(tire: Builder, hub: Builder, width: number, radius: number, steady: boolean) {
  tire.tr([0, 0, 0], [0, 0, Math.PI / 2], () => lathe(tire, [
    [.065, -width / 2], [radius * .86, -width / 2], [radius * .95, -width * .35],
    [radius * .95, width * .35], [radius * .86, width / 2], [.065, width / 2], [.065, -width / 2],
  ], S.rubber, { sides: 16, caps: false }));
  const count = steady ? 16 : 12;
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    tire.tr([0, (radius - .006) * Math.cos(angle), (radius - .006) * Math.sin(angle)], [angle, 0, 0], () =>
      cbox(tire, [0, 0, 0], [width * .96, .012, steady ? .042 : .032], S.rubber));
  }
  hub.tr([0, 0, 0], [0, 0, Math.PI / 2], () => lathe(hub, [
    [0, -width * .46], [.045, -width * .46], [.068, -width * .32],
    [.068, width * .32], [.045, width * .46], [0, width * .46],
  ], S.galv, { sides: 12, faceted: true }));
  for (const side of [-1, 1]) {
    bar(hub, [side * width * .46, 0, 0], [side * width * .49, 0, 0], .028, frame, 8);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2, y = .041 * Math.cos(angle), z = .041 * Math.sin(angle);
      bar(hub, [side * width * .45, y, z], [side * width * .49, y, z], .005, frame, 4);
    }
  }
}

/** Approved factory-v1 companion. Metres, +Z forward, origin on the tyre contact
 * plane. Detach wheelModule for assembly/rework: it owns the static axles,
 * suspension and ballast as well as the four wheels, which alone rotate about
 * local X. Detaching wheelModule and shell leaves a configuration-invariant frame.
 * Shell visibility never changes the chassis or wheel transforms. */
export function buildFactoryCompanion(options: FactoryCompanionOptions = {}) {
  const configuration = options.configuration ?? 'nimble', steady = configuration === 'steady';
  const radius = steady ? .14 : .13, width = steady ? .12 : .095, wheelX = .325 - width / 2;
  const group = new Group(), shell = new Group(), wheelModule = new Group(), wheels: Group[] = [];
  group.name = `factory-companion-${configuration}`;
  shell.name = 'companion-shell'; shell.visible = options.shell ?? true; group.add(shell);
  wheelModule.name = 'companion-wheel-module'; group.add(wheelModule);
  const geometries = new Set<BufferGeometry>(), materials = new Set<MeshStandardMaterial>();
  const material = (roughness: number, metalness: number, emissive?: string) => {
    const m = new MeshStandardMaterial({ vertexColors: true, roughness, metalness,
      ...(emissive ? { emissive, emissiveIntensity: .3 } : {}) });
    materials.add(m); return m;
  };
  const metal = material(.58, .38), paint = material(.62, .12), rubber = material(.92, 0);
  const optical = material(.3, .08, '#268f91'), tail = material(.34, 0, '#b77316');
  const build = (b: Builder) => { const g = b.build(); geometries.add(g); return g; };
  const attach = (parent: Group, geometry: BufferGeometry, m: MeshStandardMaterial, name: string) => {
    const mesh = new Mesh(geometry, m); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const chassis = new Builder(), bumpers = new Builder(), runningGear = new Builder();
  cbox(chassis, [0, .28, 0], [.41, .07, .62], frame, .012);
  for (const x of [-.185, .185]) cbox(chassis, [x, .32, 0], [.035, .075, .61], S.galv, .005);
  cbox(chassis, [0, .375, -.03], [.28, .13, .37], frame, .014);
  for (const x of [-.105, .105]) cbox(chassis, [x, .444, -.03], [.025, .012, .36], S.galv);
  cbox(chassis, [0, .463, -.03], [.34, .025, .42], teal, .006);
  for (const x of [-.18, .18]) for (const z of [-.23, .23])
    bar(chassis, [x, .3, z], [x, .54, z], .013, S.galv, 6);
  for (const x of [-.18, .18]) bar(chassis, [x, .54, -.23], [x, .54, .23], .012, frame, 6);
  for (const z of [-.23, .23]) bar(chassis, [-.18, .54, z], [.18, .54, z], .012, frame, 6);
  for (const z of [-.275, .275]) {
    bar(runningGear, [-wheelX, radius, z], [wheelX, radius, z], .023, frame, 8);
    cbox(runningGear, [0, radius, z], [.1, .075, .09], S.galv, .008);
    for (const side of [-1, 1]) {
      const joint: V3 = [side * (wheelX - width * .35), radius, z];
      for (const dz of [-.06, .06]) bar(runningGear, [side * .13, .275, z + dz], joint, .012, frame, 6);
      addDamper(runningGear, [side * .17, .32, z - .08], [joint[0], radius + .015, z]);
    }
  }
  for (const side of [-1, 1]) {
    cbox(bumpers, [0, .245, side * .4025], [.43, .065, .045], S.rubber, .009);
    for (const x of [-.15, .15]) bar(chassis, [x, .245, side * .29], [x, .245, side * .4], .012, frame, 6);
  }
  if (steady) {
    // Low ballast cassette travels with the steady wheel module during rework.
    cbox(runningGear, [0, .194, 0], [.32, .055, .3], S.galv, .006);
    for (const x of [-.11, .11]) cbox(runningGear, [x, .163, 0], [.035, .012, .3], teal);
  }
  attach(group, build(chassis), metal, 'companion-chassis');
  attach(group, build(bumpers), rubber, 'companion-bumpers');
  attach(wheelModule, build(runningGear), metal, 'companion-running-gear');
  const skin = new Builder(), eye = new Builder(), rearLamp = new Builder();
  for (const side of [-1, 1]) {
    cbox(skin, [side * .2325, .452, -.005], [.035, .264, .59], S.creamPaint, .012);
    cbox(skin, [0, .452, side > 0 ? .304 : -.314], [.49, .264, .035], S.creamPaint, .012);
    for (const z of [-.23, .23])
      bar(skin, [side * .247, .354, z], [side * .254, .354, z], .0055, frame, 6);
    for (const x of [-.2, .2]) {
      const z = side > 0 ? .32 : -.33;
      bar(skin, [x, .346, z], [x, .346, z + side * .007], .0055, frame, 6);
    }
  }
  // A recessed removable hatch and five roof pieces create real panel gaps.
  for (const x of [-.183, .183]) cbox(skin, [x, .62, -.005], [.134, .06, .65], S.creamPaint, .012);
  cbox(skin, [0, .62, .193], [.232, .06, .254], S.creamPaint, .008);
  cbox(skin, [0, .62, -.268], [.232, .06, .124], S.creamPaint, .008);
  cbox(skin, [0, .6185, -.07], [.22, .06, .26], S.creamPaint, .006);
  cbox(skin, [0, .485, .334], [.108, .108, .03], frame, .012);
  skin.tr([0, .485, .352], [Math.PI / 2, 0, 0], () => lathe(skin,
    [[.028, -.007], [.038, -.007], [.038, .007], [.028, .007], [.028, -.007]],
    S.black, { sides: 12, caps: false }));
  eye.tr([0, .485, .359], [Math.PI / 2, 0, 0], () => lathe(eye,
    [[0, -.002], [.028, -.002], [.028, .002], [0, .002]], S.cyan, { sides: 12 }));
  cbox(skin, [0, .49, -.34], [.105, .067, .025], frame, .006);
  cbox(rearLamp, [0, .49, -.355], [.08, .045, .01], amber, .003);
  for (const x of [-.11, .11]) for (const y of [.39, .412, .434])
    cbox(skin, [x, y, -.333], [.085, .008, .004], frame);
  attach(shell, build(skin), paint, 'companion-enamel-panels');
  attach(shell, build(eye), optical, 'companion-front-optic');
  attach(shell, build(rearLamp), tail, 'companion-rear-lamp');

  const tire = new Builder(), hub = new Builder();
  addWheel(tire, hub, width, radius, steady);
  const tireGeometry = build(tire), hubGeometry = build(hub);
  for (const z of [.275, -.275]) for (const side of [-1, 1]) {
    const wheel = new Group();
    wheel.name = `companion-wheel-${z > 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`;
    wheel.position.set(side * wheelX, radius, z);
    wheel.userData = { axle: 'x', radius, width };
    attach(wheel, tireGeometry, rubber, 'companion-tyre');
    attach(wheel, hubGeometry, metal, 'companion-wheel-hub');
    wheelModule.add(wheel); wheels.push(wheel);
  }
  let meshCount = 0, triangles = 0;
  group.traverse(object => {
    if (object instanceof Mesh) { meshCount++; triangles += object.geometry.index!.count / 3; }
  });
  group.userData.factoryCompanion = {
    reference: 'factory-v1', configuration, forward: '+Z', wheelAxis: 'X', wheelRadius: radius,
    metrics: { meshes: meshCount, triangles, geometries: geometries.size, materials: materials.size,
      uniqueTriangles: [...geometries].reduce((n, g) => n + g.index!.count / 3, 0) },
  };
  let disposed = false;
  return { group, wheels, wheelModule, shell, dispose() {
    if (disposed) return;
    disposed = true;
    // Never traverse consumer children: a detached wheel/shell still belongs to
    // this instance, whereas an externally attached tool or decal does not.
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  } };
}

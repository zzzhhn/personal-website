import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import {
  BackSide, BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Fog, InstancedMesh, MeshStandardMaterial,
  Object3D, Shape, Vector3, type DirectionalLight, type HemisphereLight, type PointLight,
} from 'three';
import {
  BOARDWALK_POINTS, BOARDWALK_WIDTH, BOOTHS, BUILDINGS, CAMP_CENTER,
  FOUNDATIONS, ISLAND_OUTLINE, PALETTE, ROAD_POINTS, ROAD_WIDTH, WATER_Y,
} from './layout';
import { useWorldStore } from './store';
import type { Vec3, WorldContent } from './types';
import WorldYears from './WorldYears';

type Block = { position: Vec3; size: Vec3; color: string; rotation?: Vec3 };
const V = (x: number, y: number, z: number): Vec3 => [x, y, z];
const block = (position: Vec3, size: Vec3, color: string, rotation?: Vec3): Block => ({ position, size, color, rotation });

/** All repeated greybox furniture shares a single geometry and draw call. */
function Blocks({ items, material, shadow = false, openTop = false }: { items: Block[]; material?: MeshStandardMaterial; shadow?: boolean; openTop?: boolean }) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    // Surface caps are rendered once by SurfaceTops, never by overlapping slabs.
    if (openTop) box.setIndex(Array.from(box.index!.array).filter((_, i) => i < 12 || i >= 18));
    return box;
  }, [openTop]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D();
    const color = new Color();
    items.forEach((item, index) => {
      dummy.position.set(...item.position);
      const rotation = item.rotation ?? [0, 0, 0];
      dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
      dummy.scale.set(...item.size);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(index, dummy.matrix);
      ref.current!.setColorAt(index, color.set(item.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadow} receiveShadow material={material} geometry={geometry}>
    {!material && <meshStandardMaterial roughness={1} />}
  </instancedMesh>;
}

type Point2 = [number, number];
const cross2 = (a: Point2, b: Point2, p: Point2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Convex half-plane clipping; each retained fragment remains convex. */
function clipHalfPlane(polygon: Point2[], a: Point2, b: Point2, inside: boolean): Point2[] {
  const result: Point2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const cp = cross2(a, b, p), cq = cross2(a, b, q);
    const pIn = inside ? cp >= -1e-8 : cp <= 1e-8;
    const qIn = inside ? cq >= -1e-8 : cq <= 1e-8;
    if (pIn) result.push(p);
    if (pIn !== qIn) {
      const t = cp / (cp - cq);
      result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return result;
}

function subtractFootprint(polygon: Point2[], footprint: Point2[]): Point2[][] {
  let remainder = polygon;
  const outside: Point2[][] = [];
  for (let i = 0; i < footprint.length && remainder.length >= 3; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    const fragment = clipHalfPlane(remainder, a, b, false);
    if (fragment.length >= 3) outside.push(fragment);
    remainder = clipHalfPlane(remainder, a, b, true);
  }
  return outside;
}

/** One cap per visible surface location. Earlier slabs own shared coplanar
 * patches, so road/plaza/deck joints have no coincident triangles to z-fight. */
function createSurfaceGeometry(items: Block[]): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const previous: { polygon: Point2[]; normal: Vector3; point: Vector3; bounds: number[] }[] = [];
  const transform = new Object3D();
  for (const item of items) {
    transform.position.set(...item.position);
    const r = item.rotation ?? [0, 0, 0];
    transform.rotation.set(r[0], r[1], r[2]);
    transform.scale.set(...item.size);
    transform.updateMatrix();
    const corners = [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]];
    const world = corners.map(([x, y, z]) => new Vector3(x, y, z).applyMatrix4(transform.matrix));
    const polygon: Point2[] = world.map(p => [p.x, p.z]);
    const normal = new Vector3(0, 1, 0).applyEuler(transform.rotation);
    const xs = polygon.map(p => p[0]), zs = polygon.map(p => p[1]);
    const bounds = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    let fragments: Point2[][] = [polygon];
    for (const earlier of previous) {
      const [x0, x1, z0, z1] = earlier.bounds;
      if (bounds[0] >= x1 || bounds[1] <= x0 || bounds[2] >= z1 || bounds[3] <= z0) continue;
      if (normal.dot(earlier.normal) < 1 - 1e-7 || Math.abs(normal.dot(world[0].clone().sub(earlier.point))) > 1e-6) continue;
      fragments = fragments.flatMap(fragment => subtractFootprint(fragment, earlier.polygon));
      if (!fragments.length) break;
    }
    const color = new Color(item.color);
    for (const fragment of fragments) for (let i = 1; i < fragment.length - 1; i++) {
      // XZ polygons are CCW; reverse each fan triangle so its face points up.
      for (const [x, z] of [fragment[0], fragment[i + 1], fragment[i]]) {
        const y = world[0].y - (normal.x * (x - world[0].x) + normal.z * (z - world[0].z)) / normal.y;
        positions.push(x, y, z); normals.push(normal.x, normal.y, normal.z); colors.push(color.r, color.g, color.b);
      }
    }
    previous.push({ polygon, normal, point: world[0], bounds });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function SurfaceTops({ items }: { items: Block[] }) {
  const geometry = useMemo(() => createSurfaceGeometry(items), [items]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>;
}

function StaticBlocks({ items, surface = false }: { items: Block[]; surface?: boolean }) {
  return <RigidBody type="fixed" colliders={false} userData={surface ? { surface: true } : { solid: true }}>
    {items.map((item, i) => <CuboidCollider key={i} position={item.position} rotation={item.rotation}
      args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
      friction={surface ? 0.95 : 0.65} restitution={surface ? 0 : 0.15}
      />)}
    <Blocks items={items} shadow={!surface} openTop={surface} />
    {surface && <SurfaceTops items={items} />}
  </RigidBody>;
}

function segment(a: Vec3, b: Vec3, width: number, color: string, height = 0.18): Block {
  const dx = b[0] - a[0], dz = b[2] - a[2], dy = b[1] - a[1];
  const horizontal = Math.hypot(dx, dz);
  const yaw = -Math.atan2(dz, dx), slope = Math.atan2(dy, horizontal);
  const normal = new Vector3(-Math.cos(yaw) * Math.sin(slope), Math.cos(slope), Math.sin(yaw) * Math.sin(slope));
  return block(V((a[0] + b[0]) / 2 - normal.x * height / 2,
    (a[1] + b[1]) / 2 - normal.y * height / 2, (a[2] + b[2]) / 2 - normal.z * height / 2),
    V(Math.hypot(horizontal, dy) + 0.28, height, width), color, V(0, yaw, slope));
}

function offsetSegment(a: Vec3, b: Vec3, offset: number, y = 0): [Vec3, Vec3] {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const x = -(b[2] - a[2]) / length * offset;
  const z = (b[0] - a[0]) / length * offset;
  return [V(a[0] + x, a[1] + y, a[2] + z), V(b[0] + x, b[1] + y, b[2] + z)];
}

function Island() {
  const geometry = useMemo(() => {
    const shape = new Shape();
    ISLAND_OUTLINE.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    return new ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, steps: 1 });
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <RigidBody type="fixed" colliders="trimesh" userData={{ surface: true }}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
    </RigidBody>
    {/* Low shelves make the island edge visibly layered, rather than a floating plane. */}
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]} scale={[1.035, 1.035, 1]}>
      <meshStandardMaterial color={PALETTE.beach} roughness={1} />
    </mesh>
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]} scale={[1.018, 1.018, 0.65]}>
      <meshStandardMaterial color="#8C8276" roughness={1} />
    </mesh>
    <RigidBody type="fixed" position={[-42, 2.9, 30]} colliders={false} userData={{ surface: true }}>
      <CylinderCollider args={[1.9, 24]} />
      <mesh receiveShadow><cylinderGeometry args={[24, 24.7, 3.8, 32]} /><meshStandardMaterial color={PALETTE.sand} roughness={1} /></mesh>
    </RigidBody>
    <RigidBody type="fixed" position={[45, -0.1, -45]} colliders={false} userData={{ surface: true }}>
      <CuboidCollider args={[9, 1.1, 9]} />
      <mesh receiveShadow><boxGeometry args={[18, 2.2, 18]} /><meshStandardMaterial color={PALETTE.sand} roughness={1} /></mesh>
    </RigidBody>
  </>;
}

function createLayout() {
  const surfaces: Block[] = [], solids: Block[] = [], decor: Block[] = [], warm: Block[] = [], cyan: Block[] = [];
  // Touchable greybox poles and signs use the same visible block and fixed collider.
  ROAD_POINTS.slice(1).forEach((b, i) => {
    const a = ROAD_POINTS[i];
    surfaces.push(segment(a, b, ROAD_WIDTH, PALETTE.road));
    // Outer edge is a drivable stone promenade; inland edge is a shallow curb.
    for (const side of [-1, 1]) {
      const [c, d] = offsetSegment(a, b, side * 4.6, 0);
      surfaces.push(segment(c, d, 1.5, PALETTE.edge));
    }
    // Bridge has continuous low barriers on both sides, with openings at each end.
    if (i === 7) for (const side of [-1, 1]) {
      const [c, d] = offsetSegment(a, b, side * 5.2, 0.68);
      solids.push(segment(c, d, 0.22, PALETTE.cream, 1.25));
    }
    if (i >= 3 && i <= 6) {
      // Seaward low guardrail, leaving the inland building forecourts open.
      const [c, d] = offsetSegment(a, b, 5.25, 0.52);
      solids.push(segment(c, d, 0.22, PALETTE.cream, 1));
      const p = V((c[0] + d[0]) / 2, 1.14, (c[2] + d[2]) / 2);
      solids.push(block(V(p[0], p[1] + 2, p[2]), V(0.18, 4, 0.18), PALETTE.slate));
      warm.push(block(V(p[0], p[1] + 4, p[2]), V(0.5, 0.35, 0.5), '#FFFFFF'));
    }
  });
  // Coastal parking bay connects without a raised curb.
  surfaces.push(block([20, 1.045, 12], [7, 0.19, 7], PALETTE.road));
  surfaces.push(block([45, 1.045, -45], [17, 0.19, 17], PALETTE.edge));
  BOARDWALK_POINTS.slice(1).forEach((b, i) => {
    const a = BOARDWALK_POINTS[i];
    surfaces.push(segment(a, b, BOARDWALK_WIDTH, PALETTE.wood, 0.3));
    // Short low rail runs leave broad side openings for the six landings.
    for (const side of [-1, 1]) {
      const c: Vec3 = [a[0] + (b[0] - a[0]) * 0.12, 1.14, a[2] + (b[2] - a[2]) * 0.12];
      const d: Vec3 = [a[0] + (b[0] - a[0]) * 0.35, 1.14, a[2] + (b[2] - a[2]) * 0.35];
      const [start, end] = offsetSegment(c, d, side * 2.85, 0.62);
      solids.push(segment(start, end, 0.16, PALETTE.wood, 0.95));
      solids.push(block([start[0], 2.3, start[2]], [0.2, 2.3, 0.2], PALETTE.wood));
      warm.push(block([start[0], 3.5, start[2]], [0.35, 0.2, 0.35], '#FFFFFF'));
    }
    // Plank seams are a single instanced batch; no per-plank collider seams.
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (let n = 1; n < length; n += 1.2) {
      const t = n / length;
      const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      if (i === 0 && x < 54.6 && z > -53.5 && z < -36.5) continue;
      decor.push(block(V(x, 1.148, z), V(0.035, 0.016, BOARDWALK_WIDTH - 0.1), '#65523F', V(0, -Math.atan2(b[2] - a[2], b[0] - a[0]), 0)));
    }
    for (let n = 0; n <= 1; n++) {
      const t = n ? 0.82 : 0.18;
      const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      decor.push(block([x, -0.1, z], [0.45, 2.5, 0.45], PALETTE.wood));
    }
  });
  // Every hut gets a continuous landing spur from the nearest boardwalk segment.
  BOOTHS.forEach(({ position: p }, i) => {
    let best = Infinity, nearest: Vec3 = [49, 1.14, -46];
    BOARDWALK_POINTS.slice(1).forEach((b, n) => {
      const a = BOARDWALK_POINTS[n], dx = b[0] - a[0], dz = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz)));
      const q: Vec3 = [a[0] + dx * t, 1.14, a[2] + dz * t];
      const distance = Math.hypot(q[0] - p[0], q[2] - p[2]);
      if (distance < best) { best = distance; nearest = q; }
    });
    surfaces.push(segment(nearest, p, 4.8, PALETTE.wood, 0.3));
    surfaces.push(block([p[0], 0.98, p[2]], [6.5, 0.32, 6.5], PALETTE.wood));
    // Deliberate single block for the future hut; usable landing stays in front.
    solids.push(block([p[0], 3.05, p[2] - 1.6], [5.6, 3.8, 2.6], PALETTE.slate));
    cyan.push(block([p[0], 4.8, p[2] - 0.27], [5.4, 0.03, 0.035], '#FFFFFF'));
    warm.push(block([p[0], 2.65, p[2] - 0.28], [3.7, 1.9, 0.035], '#FFFFFF'));
    decor.push(block([p[0], 1.7, p[2] + 1], [1.5, 1.1, 1], i % 2 ? PALETTE.cream : PALETTE.orange));
    decor.push(block([p[0] - 2.6, -0.05, p[2] + 2.6], [0.38, 2.4, 0.38], PALETTE.wood));
    decor.push(block([p[0] + 2.6, -0.05, p[2] + 2.6], [0.38, 2.4, 0.38], PALETTE.wood));
  });
  // Camp is an unmistakable ring with 3 tent blocks, 8 object pads and 4 benches.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const x = CAMP_CENTER[0] + Math.cos(angle) * 15, z = CAMP_CENTER[2] + Math.sin(angle) * 15;
    surfaces.push(block([x, 4.85, z], [3.1, 0.1, 2.5], PALETTE.edge, [0, -angle, 0]));
    solids.push(block([x, 5.35, z], [1.05, 0.9, 0.9], i === 2 ? PALETTE.orange : PALETTE.cream));
  }
  [-51, -42, -33].forEach((x) => solids.push(block([x, 6.25, 12.5], [5.5, 2.9, 4.2], PALETTE.orange)));
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    solids.push(block([-42 + Math.cos(angle) * 6, 5.1, 30 + Math.sin(angle) * 6], [4.8, 0.6, 0.8], PALETTE.wood, [0, -angle - Math.PI / 2, 0]));
  }
  for (let i = 0; i < 2; i++) {
    solids.push(block([-30, 6, 31 + i * 6], [0.25, 2.4, 0.25], PALETTE.slate));
    cyan.push(block([-30, 6.9, 31 + i * 6], [0.15, 0.6, 0.15], '#FFFFFF'));
  }
  BUILDINGS.forEach((building) => {
    const [x, y, z] = building.position, [w, h, d] = building.size;
    surfaces.push(block([x + w / 2 + 2.7, y + 0.035, z], [5.4, 0.07, d + 1], PALETTE.edge));
    const roadX = x + w / 2 + 5;
    solids.push(block([roadX, 2.1, z], [0.5, 2.2, 0.5], PALETTE.slate));
    cyan.push(block([roadX + 0.26, 2.4, z], [0.035, 1.2, 0.3], '#FFFFFF'));
    // Blank exhibit plaque: content lives in the shared UI, not duplicated here.
    solids.push(block([roadX - 2, 2, z + 2.7], [0.18, 1.6, 1.5], PALETTE.cream));
    // About sixty percent of the window cells illuminate at night.
    for (let row = 0; row < Math.floor(h / 2.7); row++) for (let col = 0; col < 3; col++) {
      if ((row * 3 + col) % 5 >= 3) continue;
      warm.push(block([x + w / 2 + 0.025, y + 1.9 + row * 2.7, z - 2.6 + col * 2.6], [0.045, 1.35, 1.3], '#FFFFFF'));
    }
  });
  // Four low, unoccupied blocks give the inland side a second row.
  [[-18, 4.4, 8], [-13, 3.6, -8], [-12, 4.8, -24], [-4, 3.2, -45]].forEach(([x, h, z]) => {
    solids.push(block([x, 1 + h / 2, z], [8, h, 7], '#A29A85'));
  });
  FOUNDATIONS.forEach(({ position: p, size }) => {
    surfaces.push(block(p, size, '#A39B89'));
    decor.push(block([p[0], 2.1, p[2]], [2.8, 1.2, 0.18], PALETTE.orange));
  });
  // Lightweight placeholder vegetation uses boxes: no formal tree asset work.
  const trees: Vec3[] = [[-61, 1, -4], [-51, 1, -26], [-36, 1, -32], [-28, 1, -8], [-26, 1, 7], [-52, 4.8, 45], [-59, 4.8, 34], [-40, 4.8, 9], [-29, 4.8, 17], [-30, 1, 52], [2, 1, 40], [-44, 1, -43]];
  trees.forEach(([x, y, z], i) => {
    solids.push(block([x, y + 1.4, z], [0.7, 2.8, 0.7], '#5A4634'));
    decor.push(block([x, y + 3.6, z], [3.8, 3.6, 3.8], i % 2 ? '#6F8A3A' : '#8AA24A'));
  });
  return { surfaces, solids, decor, warm, cyan };
}

function Lighting({ warm, cyan }: { warm: MeshStandardMaterial; cyan: MeshStandardMaterial }) {
  const light = useWorldStore((s) => s.light);
  const { scene } = useThree();
  const hemisphere = useRef<HemisphereLight>(null), sun = useRef<DirectionalLight>(null), fire = useRef<PointLight>(null);
  const sea = useRef<MeshStandardMaterial>(null);
  const parkFill = useRef<(PointLight | null)[]>([]);
  const parkFillPositions = useMemo<Vec3[]>(() => [[56, 5.4, -43], [69, 5.4, -29], [59, 5.4, -13]], []);
  const state = useRef({ value: 0, start: 0, target: 0, elapsed: 2 });
  const skyUniforms = useMemo(() => ({ top: { value: new Color('#6F86A8') }, horizon: { value: new Color('#F2B98A') } }), []);
  const colors = useMemo(() => ({ duskSea: new Color('#1E5A5E'), nightSea: new Color('#0E2A33'), duskTop: new Color('#6F86A8'), nightTop: new Color('#121A33'), duskHorizon: new Color('#F2B98A'), nightHorizon: new Color('#4A3A3A') }), []);
  useEffect(() => { state.current.start = state.current.value; state.current.target = light === 'night' ? 1 : 0; state.current.elapsed = 0; }, [light]);
  useEffect(() => {
    const oldFog = scene.fog;
    scene.fog = new Fog('#C49C83', 140, 360);
    return () => { scene.fog = oldFog; };
  }, [scene]);
  useFrame((clock, delta) => {
    const s = state.current;
    s.elapsed = Math.min(2, s.elapsed + delta);
    const t = s.elapsed / 2;
    s.value = s.start + (s.target - s.start) * (t * t * (3 - 2 * t));
    const n = s.value;
    if (sun.current) sun.current.intensity = 3.4 - n * 3.08;
    if (hemisphere.current) hemisphere.current.intensity = 1.5 - n * 0.85;
    if (fire.current) fire.current.intensity = (9 + n * 22) * (1 + Math.sin(clock.clock.elapsedTime * 5) * 0.065);
    warm.emissiveIntensity = 0.05 + n * 1.5;
    cyan.emissiveIntensity = 0.15 + n * 1.25;
    parkFill.current.forEach(lamp => { if (lamp) lamp.intensity = n * 26; });
    skyUniforms.top.value.copy(colors.duskTop).lerp(colors.nightTop, n);
    skyUniforms.horizon.value.copy(colors.duskHorizon).lerp(colors.nightHorizon, n);
    if (sea.current) {
      sea.current.color.copy(colors.duskSea).lerp(colors.nightSea, n);
      // A low teal floor preserves the water silhouette; local warm park lights
      // supply the nearby illumination rather than widening cyan emissive strips.
      sea.current.emissiveIntensity = n * 0.22;
    }
    if (scene.fog) scene.fog.color.copy(skyUniforms.horizon.value);
  });
  return <>
    <hemisphereLight ref={hemisphere} args={['#8FA6C4', '#695444', 1.5]} />
    <directionalLight ref={sun} position={[-90, 40, 65]} color="#FFD9A8" intensity={3.4} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-105} shadow-camera-right={105}
      shadow-camera-top={100} shadow-camera-bottom={-100} shadow-camera-near={1} shadow-camera-far={260} shadow-bias={-0.0008} />
    <pointLight ref={fire} position={[-42, 6.5, 30]} color="#FF8A3A" intensity={9} distance={26} decay={2} />
    {parkFillPositions.map((position, i) => <pointLight key={i} ref={lamp => { parkFill.current[i] = lamp; }}
      position={position} color="#FFD08A" intensity={0} distance={25} decay={2} castShadow={false} />)}
    <mesh position={[0, 0, 0]} renderOrder={-10}>
      <sphereGeometry args={[290, 24, 16]} />
      <shaderMaterial side={BackSide} depthWrite={false} uniforms={skyUniforms}
        vertexShader={'varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
        fragmentShader={'uniform vec3 top; uniform vec3 horizon; varying vec3 vDirection; void main(){float t=smoothstep(-0.08,0.7,vDirection.y);gl_FragColor=vec4(mix(horizon,top,t),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}'} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} receiveShadow>
      <planeGeometry args={[560, 560]} /><meshStandardMaterial ref={sea} color={PALETTE.sea} emissive="#17424A" emissiveIntensity={0} roughness={0.82} metalness={0} />
    </mesh>
  </>;
}

export default function WorldEnvironment({ experiences }: { experiences: WorldContent['experiences'] }) {
  const items = useMemo(createLayout, []);
  const warm = useMemo(() => new MeshStandardMaterial({ color: '#FFC978', emissive: '#FFC978', emissiveIntensity: 0.05, roughness: 1 }), []);
  const cyan = useMemo(() => new MeshStandardMaterial({ color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 0.15, roughness: 1 }), []);
  useEffect(() => () => { warm.dispose(); cyan.dispose(); }, [warm, cyan]);
  return <group name="world-greybox-environment">
    <Lighting warm={warm} cyan={cyan} />
    <Island />
    <WorldYears experiences={experiences.en} />
    <StaticBlocks items={items.surfaces} surface />
    <StaticBlocks items={items.solids} />
    <Blocks items={items.decor} shadow />
    <Blocks items={items.warm} material={warm} />
    <Blocks items={items.cyan} material={cyan} />
    {BUILDINGS.map(({ id, position: [x, y, z], size: [w, h, d], color }) => <RigidBody key={id} type="fixed" colliders={false} userData={{ solid: true }}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[x, y + h / 2, z]} restitution={0.15} />
      <mesh name={`greybox-building-${id}`} position={[x, y + h / 2, z]} castShadow receiveShadow userData={{ occluder: true }}>
        <boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} roughness={1} transparent />
      </mesh>
    </RigidBody>)}
    {/* One primitive ring and one block identify the camp fire, never a formal asset. */}
    <mesh position={[-42, 4.95, 30]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.15, 1.6, 12]} /><meshStandardMaterial color="#8C8276" roughness={1} />
    </mesh>
    <mesh position={[-42, 5.3, 30]}><boxGeometry args={[0.65, 0.9, 0.65]} /><meshStandardMaterial color={PALETTE.orange} emissive="#FF8A3A" emissiveIntensity={1.5} /></mesh>
    <mesh position={[-42, 4.815, 30]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[10.4, 12.4, 48]} /><meshStandardMaterial color="#AA875D" roughness={1} />
    </mesh>
    <mesh position={[11, 16.13, -43]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.5, 2.54, 32]} /><primitive object={cyan} attach="material" />
    </mesh>
  </group>;
}

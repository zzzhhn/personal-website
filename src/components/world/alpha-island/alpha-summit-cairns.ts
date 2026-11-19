import { Color, InstancedMesh, Mesh, Raycaster, SphereGeometry, Vector3, type Material } from 'three';
import { ALPHA_SOCKETS, alphaWorld } from './alpha-layout';
import { alphaGroundHeight } from './alpha-terrain';
import { ALPHA_VISITOR_PATH, ALPHA_VISITOR_SPURS } from './alpha-visitor-path';

const routes = [ALPHA_VISITOR_PATH, ...ALPHA_VISITOR_SPURS.map(s => s.path)];
function clearOfVisitorRoute(x: number, z: number) {
  const [wx, , wz] = alphaWorld([x, 0, z]);
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i-1], b = route[i], dx = b[0]-a[0], dz = b[1]-a[1];
    const t = Math.max(0, Math.min(1, ((wx-a[0])*dx + (wz-a[1])*dz) / (dx*dx + dz*dz || 1)));
    if (Math.hypot(wx-a[0]-dx*t, wz-a[1]-dz*t) < 2.2) return false;
  }
  return !Object.values(ALPHA_SOCKETS).some(s => Math.hypot(x-s.ground[0], z-s.ground[2]) < 9);
}

export function createSummitCairns(material: Material) {
  const geometry = new SphereGeometry(1, 10, 6);
  const field = new InstancedMesh(geometry, material, 520);
  const stone = new Mesh(geometry, material), ray = new Raycaster(), color = new Color();
  const down = new Vector3(0, -1, 0);
  let count = 0;
  for (let i = 0; i < 108; i++) {
    const angle = i * 2.399, r = 4.3 + Math.sqrt(i) * 1.6;
    const x = 2 + Math.cos(angle)*r, z = 39 + Math.sin(angle)*r;
    if (alphaGroundHeight(x,z) < 70 || Math.hypot(x+7,z-43) < 4 || Math.hypot(x-2,z-39) < 3 || !clearOfVisitorRoute(x,z)) continue;
    for (let j = 0; j < 3 + i%3; j++) {
      const radius = .28 - j*.035, cx = x + Math.sin(j+i)*.07;
      let support: number;
      if (j === 0) {
        support = alphaGroundHeight(cx,z);
      } else {
        // The previous stone has its actual scale, yaw and lateral offset. A
        // height from its bounding box would miss the sloping facet under cx.
        ray.ray.origin.set(cx, stone.position.y + stone.scale.y + .1, z);
        ray.ray.direction.copy(down);
        const hit = ray.intersectObject(stone, false)[0];
        if (!hit) throw new Error('Unsupported summit stone ' + i + '/' + j);
        support = hit.point.y;
      }
      stone.position.set(cx, support + radius*.48 - .012, z);
      stone.rotation.set(0, i+j*.3, 0);
      stone.scale.set(radius*1.4, radius*.48, radius);
      stone.updateMatrixWorld(true);
      field.setMatrixAt(count, stone.matrixWorld);
      field.setColorAt(count++, color.set(i%3 ? '#dddcd1' : '#c4c9c4'));
    }
  }
  field.count = count;
  field.name = 'alpha-summit-decorative-cairn-instances';
  field.userData = { worldCollision: 'none', collisionReason: 'Decorative stone stacks outside visitor routes' };
  field.computeBoundingSphere();
  field.castShadow = field.receiveShadow = true;
  return field;
}

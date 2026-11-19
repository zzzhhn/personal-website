import { useMemo } from 'react';
import { Matrix4, type Object3D } from 'three';
import { CampToolWall } from './WorldCampPropInteractions';
import { CampColliders, campColliderKey, campFixedBody } from './WorldCampPhysics';

function installedPart(root: Object3D, name: string, placement: Matrix4) {
  const source = root.getObjectByName(name);
  if (!source) throw new Error(`Camp workshop is missing ${name}`);
  source.updateWorldMatrix(true, false);
  const frame = new Matrix4().multiplyMatrices(placement, source.matrixWorld);
  const visual = source.clone(true);
  visual.position.set(0, 0, 0);
  visual.quaternion.identity();
  visual.scale.setScalar(1);
  visual.updateMatrix();
  return { frame, visual };
}

/** The board, fixed fittings and all five parking positions switch with the
 * selected GLB. Taking a tool moves only its own faces, never the board. */
export default function WorldCampToolWall({ root, placement, centres, crafted = false }: {
  root: Object3D; placement: Matrix4; centres: readonly number[]; crafted?: boolean;
}) {
  const { body, tools, shapes, matrices } = useMemo(() => {
    const body = installedPart(root, 'C11_body', placement);
    const tools = installedPart(root, 'C11_tools', placement);
    body.visual.name = crafted ? 'camp-workshop-C11_body' : 'camp-legacy-C11_body';
    tools.visual.name = crafted ? 'camp-workshop-C11_tools' : 'camp-legacy-C11_tools';
    const shapes = campFixedBody(body.visual);
    if (!shapes) throw new Error('Camp tool wall has no board triangles');
    return { body, tools, shapes, matrices: [body.frame] };
  }, [root, placement, crafted]);
  return <group name="camp-C11-contact">
    <group matrix={body.frame} matrixAutoUpdate={false}
      userData={{ assetId: 'C11', solid: true, worldCollision: 'solid',
        surfaceId: campColliderKey('C11', 'workshop', 0, 'body'), worldCollisionSharedSurface: true }}>
      <primitive object={body.visual} dispose={null} />
    </group>
    <CampColliders id="C11" label="workshop" shapes={shapes} matrices={matrices} />
    <CampToolWall art={tools.visual} frame={tools.frame} centres={centres} />
  </group>;
}

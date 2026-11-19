/** F04 uses the same exported wooden sign family as P05/P19, with text drawn at runtime. */
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { CanvasTexture, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { collisionInstancePartId, type InstanceCollisionSources } from './world-collision-inventory';
import { FOUNDATIONS_V4 } from './layout-v4';
import { gltfPieces, gltfTrimesh, mergeBatch, parkMaterial, parkUrl, withDraco, type GLTF } from './WorldParkKit';

export function constructionSignGeometry(root: Object3D) {
  const matrices = FOUNDATIONS_V4.map(f => new Matrix4().makeTranslation(f.position[0], f.position[1] + f.size[1]/2, f.position[2] + f.size[2]/2 - .7));
  const placements = matrices.map((matrix,i) => {
    const id='street-construction-F04-'+FOUNDATIONS_V4[i].id;
    return {id,matrix,surfaceIds:[collisionInstancePartId(id,'sign')]};
  });
  const pieces = gltfPieces(root,new Matrix4());
  let firstVertex = 0;
  const ranges = pieces.map((p,i)=>{
    const vertexCount=p.getAttribute('position').count;
    const range={id:p.name+'-'+i,firstVertex,vertexCount,collision:'solid',surfaceId:'sign'};
    firstVertex+=vertexCount;
    return range;
  });
  const geometry=mergeBatch(pieces);
  const colliders=matrices.map(matrix=>gltfTrimesh(root,matrix,()=>true));
  return {matrices,placements,geometry,ranges,colliders};
}
export default function StreetConstructionSigns() {
  const gltf = useLoader(GLTFLoader, parkUrl('signs'), withDraco) as GLTF;
  const built = useMemo(() => {
    const root = gltf.scene.getObjectByName('F04');
    if (!root) throw new Error('signs.glb has no F04 variant');
    const {matrices,placements,geometry,ranges,colliders}=constructionSignGeometry(root);
    const centers = matrices.map(m => new Vector3().setFromMatrixPosition(m));
    const face = new PlaneGeometry(.75, .43).translate(0, .78, .034);
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 608;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#E6DCCB'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#453B31'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 130px system-ui'; ctx.fillText('二期预留', 512, 232);
    ctx.font = '600 68px system-ui'; ctx.fillText('FUTURE SITE', 512, 397);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const material = new MeshStandardMaterial({ map: texture, roughness: .9 });
    const body = new InstancedMesh(geometry, parkMaterial(), matrices.length);
    const text = new InstancedMesh(face, material, matrices.length);
    body.name = 'street-construction-signs-F04'; text.name = 'street-construction-sign-text';
    body.castShadow = true; body.receiveShadow = text.receiveShadow = true;
    body.frustumCulled = text.frustumCulled = false;
    body.instanceMatrix.setUsage(DynamicDrawUsage); text.instanceMatrix.setUsage(DynamicDrawUsage);
    body.userData.assetId = 'F04'; body.userData.occluder = true;
    text.userData.noOcclusionFade = true;
    const sources: InstanceCollisionSources = {placements,slots:[]};
    Object.assign(body.userData,{worldCollision:'solid',worldCollisionSources:ranges,worldCollisionInstances:sources});
    // The print sits 1.5 mm in front of the board and relies on that same real surface.
    Object.assign(text.userData,{worldCollision:'solid',worldCollisionInstances:sources,
      worldCollisionSources:[{id:'printed-panel',firstIndex:0,indexCount:face.index!.count,collision:'solid',surfaceId:'sign'}]});
    body.count=text.count=0;
    return { matrices, centers, body, text, colliders, sources,
      dispose: () => { body.dispose(); text.dispose(); geometry.dispose(); face.dispose(); material.dispose(); texture.dispose(); } };
  }, [gltf]);
  useEffect(() => built.dispose, [built]);
  useFrame(({ camera }) => {
    let count = 0;
    built.matrices.forEach((matrix, i) => {
      if (camera.position.distanceTo(built.centers[i]) > 60) return;
      built.body.setMatrixAt(count, matrix); built.text.setMatrixAt(count, matrix); built.sources.slots[count++]=i;
    });
    built.sources.slots.length = built.body.count = built.text.count = count;
    built.body.instanceMatrix.needsUpdate = built.text.instanceMatrix.needsUpdate = true;
  });
  return <group name="street-construction-sign-family">
    <primitive object={built.body} /><primitive object={built.text} />
    {built.colliders.map((shape, i) => <RigidBody key={FOUNDATIONS_V4[i].id} name={`street-construction-F04-${FOUNDATIONS_V4[i].id}`} type="fixed" colliders={false} userData={{ solid: true, assetId: 'F04' }}>
      <TrimeshCollider name={built.sources.placements[i].surfaceIds![0]} args={[shape.vertices, shape.indices]} friction={.65} restitution={.05} />
    </RigidBody>)}
  </group>;
}

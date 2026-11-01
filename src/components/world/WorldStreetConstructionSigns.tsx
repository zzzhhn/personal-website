/** F04 uses the same exported wooden sign family as P05/P19, with text drawn at runtime. */
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { CanvasTexture, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FOUNDATIONS_V4 } from './layout-v4';
import { gltfPieces, gltfTrimesh, mergeBatch, parkMaterial, parkUrl, withDraco, type GLTF } from './WorldParkKit';

export default function StreetConstructionSigns() {
  const gltf = useLoader(GLTFLoader, parkUrl('signs'), withDraco) as GLTF;
  const built = useMemo(() => {
    const root = gltf.scene.getObjectByName('F04');
    if (!root) throw new Error('signs.glb has no F04 variant');
    const matrices = FOUNDATIONS_V4.map(f => new Matrix4().makeTranslation(f.position[0], f.position[1] + f.size[1] / 2, f.position[2] + f.size[2] / 2 - .7));
    const centers = matrices.map(m => new Vector3().setFromMatrixPosition(m));
    const geometry = mergeBatch(gltfPieces(root, new Matrix4()));
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
    const colliders = matrices.map(m => gltfTrimesh(root, m, () => true));
    return { matrices, centers, body, text, colliders,
      dispose: () => { body.dispose(); text.dispose(); geometry.dispose(); face.dispose(); material.dispose(); texture.dispose(); } };
  }, [gltf]);
  useEffect(() => built.dispose, [built]);
  useFrame(({ camera }) => {
    let count = 0;
    built.matrices.forEach((matrix, i) => {
      if (camera.position.distanceTo(built.centers[i]) > 60) return;
      built.body.setMatrixAt(count, matrix); built.text.setMatrixAt(count, matrix); count++;
    });
    built.body.count = built.text.count = count;
    built.body.instanceMatrix.needsUpdate = built.text.instanceMatrix.needsUpdate = true;
  });
  return <group name="street-construction-sign-family">
    <primitive object={built.body} /><primitive object={built.text} />
    {built.colliders.map((shape, i) => <RigidBody key={FOUNDATIONS_V4[i].id} name={`street-construction-F04-${FOUNDATIONS_V4[i].id}`} type="fixed" colliders={false} userData={{ solid: true, assetId: 'F04' }}>
      <TrimeshCollider name={`street-construction-F04-${FOUNDATIONS_V4[i].id}`} args={[shape.vertices, shape.indices]} friction={.65} restitution={.05} />
    </RigidBody>)}
  </group>;
}

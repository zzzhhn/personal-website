/** Fixed foundations and animated ridge windmill, deriving collision from the visual builders. */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Matrix4, Quaternion, Vector3 } from 'three';
import { FOUNDATIONS_V4, RIDGE_V4 } from './layout-v4';
import { windUniforms } from './WorldWind';
import StreetStatic, { StreetClaim, type StaticKind, type StaticPlacement } from './WorldStreetStatic';
import { StreetBatch } from './WorldStreetBatch';
import { createStreetDepthMaterial, createStreetMaterial } from './WorldStreetMaterial';
import * as A from './WorldStreetAssets';
const matrix = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320; const g = c.getContext('2d')!;
  g.fillStyle = '#B99469'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#453B31'; g.textAlign = 'center'; g.font = '600 96px system-ui'; g.fillText('二期预留', 512, 132);
  g.font = '600 49px system-ui'; g.fillText('FUTURE SITE', 512, 234);
  return new CanvasTexture(c);
}
export function StreetFoundations() {
  const built = useMemo(() => {
    const kinds: StaticKind[] = FOUNDATIONS_V4.map(f => ({ id: f.id, L0: A.foundationSlab(0, f.size[0], f.size[2]), L1: A.foundationSlab(1, f.size[0], f.size[2]), lodNear: 45, far: 140, collide: 'trimesh' }));
    const placements: StaticPlacement[] = FOUNDATIONS_V4.map(f => ({ kind: f.id, matrix: matrix(f.position[0], f.position[1] - f.size[1] / 2, f.position[2]), surface: true }));
    const signs: StaticPlacement[] = FOUNDATIONS_V4.map(f => ({ kind: 'sign', matrix: matrix(f.position[0], f.position[1] + f.size[1] / 2, f.position[2] + f.size[2] / 2 - .7) }));
    return { kinds, placements, signs, signKinds: [{ id: 'sign', L0: A.foundationSign(0), L1: A.foundationSign(1), lodNear: 40, far: 125 }] as StaticKind[], atlas: signTexture() };
  }, []);
  useEffect(() => () => built.atlas.dispose(), [built]);
  return <group name="street-foundations-group">
    <StreetStatic name="street-foundation-slabs" claims={[]} kinds={built.kinds} placements={built.placements} assetId="street-foundation" />
    <StreetStatic name="street-foundation-signs" claims={[]} kinds={built.signKinds} placements={built.signs} atlas={built.atlas} assetId="street-construction-sign" />
    <StreetClaim keys={['foundation']} />
  </group>;
}
export function StreetWindmill() {
  const built = useMemo(() => {
    const [x, z] = RIDGE_V4.center, y = RIDGE_V4.topY;
    const kinds: StaticKind[] = [{ id: 'tower', L0: A.windmillTower(0), L1: A.windmillTower(1), lodNear: 55, far: 195, collide: 'hull' }];
    const placements = [{ kind: 'tower', matrix: matrix(x, y, z) }];
    const material = createStreetMaterial(null, 'street-windmill-rotor');
    const rotor = new StreetBatch('street-windmill-rotor', [{ id: 'rotor', L0: A.windmillRotor(0).build(), L1: A.windmillRotor(1).build(), lodNear: 55, far: 195 }], [1], material);
    const id = rotor.add(0, matrix(x - 1.4, y + 11.7, z)); rotor.finish(1); rotor.mesh.castShadow = true; rotor.mesh.receiveShadow = true; rotor.mesh.customDepthMaterial = createStreetDepthMaterial();
    rotor.mesh.userData.noOcclusionFade = true; const last = { l0: 0, l1: 0 };
    rotor.mesh.userData.streetStats = () => ({ tris: last.l0 + last.l1, instances: 1 });
    return { kinds, placements, rotor, material, id, p: new Vector3(x - 1.4, y + 11.7, z), last };
  }, []);
  useEffect(() => () => { built.rotor.mesh.customDepthMaterial?.dispose(); built.rotor.dispose(); built.material.dispose(); }, [built]);
  useFrame(({ camera }) => { const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), windUniforms.uWindTime.value * .65); built.rotor.setMatrix(built.id, new Matrix4().compose(built.p, q, new Vector3(1, 1, 1))); Object.assign(built.last, built.rotor.update(camera)); });
  return <group name="street-windmill-group">
    <StreetStatic name="street-windmill-tower" claims={[]} kinds={built.kinds} placements={built.placements} assetId="street-windmill" occluder />
    <primitive object={built.rotor.mesh} />
    <StreetClaim keys={['windmill']} />
  </group>;
}

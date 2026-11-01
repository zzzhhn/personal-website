import { memo, Suspense, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { DoubleSide, Frustum, InstancedMesh, Matrix4, MeshStandardMaterial, Sphere, type BufferGeometry } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { attachNatureWind } from '../WorldNatureMotion';
import { COASTER_VEGETATION_BUDGET, coasterVegetationLayout, coasterTrunkCollider, mergeCoasterPlantGeometry, selectCoasterVegetation, updateCoasterVegetationInstances } from './coaster-vegetation-layout';

// Same useLoader key as WorldStreetTrees: reuse its resolved GLTFs. Only the bush is a separate key.
const treePaths = ['/assets/world/street/ST1.glb','/assets/world/street/ST2.glb'];
const configure = (loader: GLTFLoader) => {
  if (!loader.dracoLoader) loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/assets/world/draco/').setWorkerLimit(1));
};
function Vegetation() {
  const trees = useLoader(GLTFLoader,treePaths,configure) as GLTF[];
  const bush = useLoader(GLTFLoader,'/assets/world/camp/G19.glb',configure) as GLTF;
  const built = useMemo(() => {
    const plants = coasterVegetationLayout(), geometries: BufferGeometry[] = [], clean: (()=>void)[] = [];
    const trunks = trees.map(g=>mergeCoasterPlantGeometry(g.scene,['L0-trunk']));
    for (const tree of trees) for (const lod of [0,1]) geometries.push(mergeCoasterPlantGeometry(tree.scene,[`L${lod}-crown`,'L0-trunk']));
    geometries.push(mergeCoasterPlantGeometry(bush.scene,['crown']));
    const meshes = geometries.map((geo,i) => {
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: .93, metalness: 0, side: DoubleSide });
      const capacity = plants.filter(p=>p.kind === (i===4?2:Math.floor(i/2))).length;
      const mesh = new InstancedMesh(geo,mat,capacity);
      mesh.name = i === 4 ? 'coaster-G19' : `coaster-ST${Math.floor(i/2)+1}-L${i%2}`;
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.castShadow = i !== 4; mesh.receiveShadow = true;
      mesh.userData.occluder = true;
      mesh.userData.coasterVegetationStats = () => ({ visible: mesh.visible, instances: mesh.count, triangles: mesh.count*geo.getAttribute('position').count/3,
        matrixUploads: mesh.userData.matrixUploads ?? 0 });
      const detach = attachNatureWind(mesh);
      clean.push(()=>{ detach(); geo.dispose(); mat.dispose(); mesh.dispose(); });
      return mesh;
    });
    const colliders = plants.filter(p=>p.kind !== 2).map(p=>({ id:p.id,...coasterTrunkCollider(trunks[p.kind],p.matrix) }));
    trunks.forEach(g=>g.dispose());
    return { plants, meshes, colliders, clean, signatures: ['', '', '', '', ''], near: new Set<string>() };
  },[trees,bush]);
  useEffect(()=>()=>built.clean.forEach(dispose=>dispose()),[built]);
  const state = useMemo(()=>({ frustum:new Frustum(), view:new Matrix4(), last:new Matrix4().set(...Array(16).fill(NaN) as Parameters<Matrix4['set']>),
    sphere:new Sphere(), elapsed:Infinity }),[]);
  useFrame(({camera},dt) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    state.elapsed += dt;
    if (state.elapsed < COASTER_VEGETATION_BUDGET.updateSeconds) return;
    state.elapsed = 0;
    state.view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    if (state.last.equals(state.view)) return;
    state.last.copy(state.view); state.frustum.setFromProjectionMatrix(state.view);
    const result = selectCoasterVegetation(built.plants,camera.position,p=>{
      p.bounds.getBoundingSphere(state.sphere);
      state.sphere.radius += 4; // guard band for the bounded 10 Hz visibility check during a fast ride
      return state.frustum.intersectsSphere(state.sphere);
    },built.near);
    built.near = result.near;
    result.groups.forEach((group,i)=>{
      built.signatures[i] = updateCoasterVegetationInstances(built.meshes[i],group,built.signatures[i]);
    });
  });
  return <group name="coaster-vegetation" dispose={null}>
    {built.meshes.map(mesh=><primitive key={mesh.name} object={mesh} />)}
    <RigidBody type="fixed" colliders={false} userData={{ solid:true, assetId:'coaster-tree' }}>
      {built.colliders.map(c=><TrimeshCollider key={c.id} args={[c.pos,c.idx]} friction={.7} restitution={.02} />)}
    </RigidBody>
  </group>;
}
export default memo(function WorldCoasterVegetation() {
  return <Suspense fallback={null}><Vegetation /></Suspense>;
});

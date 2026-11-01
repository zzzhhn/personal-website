import { Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial, type Texture } from 'three';
import { CLUB_POOL } from './djc-club-layout';

export const DJC_POOL_LANTERN_ASSET='/assets/world/club/lantern/pool-lantern-v2.glb';
// The isolated build is promoted only after native and browser review.
export const DJC_POOL_LANTERN_ENABLED=true;
export const DJC_POOL_LANTERN_POSITIONS=Array.from({length:12},(_,i)=>{
  const angle=i*Math.PI*2/12+.15;
  if(Math.abs(Math.cos(angle))<.2)return [];
  const [x,z]=CLUB_POOL.boundary(angle,2.25);
  return [[x,1.4,z] as [number,number,number]];
}).flat();
export function djcPoolLanternCandidate(search:string){
  const params=new URLSearchParams(search);
  if(params.get('qa')==='1'&&params.get('djcLanterns')==='legacy')return false;
  return DJC_POOL_LANTERN_ENABLED||(params.get('qa')==='1'&&params.get('djcLanterns')==='candidate');
}

/** One mesh per native material batch, instanced at the ten existing bases.
 * Loader geometry/images and the private environment are borrowed; materials
 * and upgraded sampler objects belong only to this mounted asset group. */
export function createDjcPoolLanternVisual(source:Group,environment:Texture|null=null,maxAnisotropy=1){
  const root=new Group();root.name='djc-crafted-pool-lanterns';
  const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),textures=new Map<Texture,Texture>();
  const diffusers=new Map<MeshStandardMaterial,{day:number;night:number}>();
  const anisotropy=Math.min(4,Math.max(1,maxAnisotropy));
  const sample=(source:Texture|null)=>{
    if(!source||source.anisotropy===anisotropy)return source;
    let copy=textures.get(source);
    if(!copy){copy=source.clone();copy.anisotropy=anisotropy;copy.needsUpdate=true;textures.set(source,copy);}
    return copy;
  };
  const instances:InstancedMesh[]=[],translation=new Matrix4(),matrix=new Matrix4();
  source.updateMatrixWorld(true);
  source.traverse(object=>{
    const mesh=object as Mesh;if(!mesh.isMesh)return;
    const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const copied=originals.map(original=>{
      const material=original as MeshStandardMaterial;
      let copy=materials.get(material);
      if(!copy){
        copy=material.clone();copy.envMap=environment;copy.envMapIntensity=1;
        for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'] as const)copy[key]=sample(material[key]);
        materials.set(material,copy);
      }
      const role=material.userData.djcRole??mesh.userData.djcRole;
      if(role==='emissive-diffuser'||/diffuser/i.test(`${material.name} ${mesh.name}`)){
        copy.emissive.set(material.userData.nightEmissiveColor??'#ffc478');
        // Native daytime emission is zero; share its fiber map for textured night glow.
        copy.emissiveMap??=copy.map;
        const day=material.userData.dayEmissiveIntensity??0,night=material.userData.nightEmissiveIntensity??1.4;
        copy.emissiveIntensity=day;diffusers.set(copy,{day,night});
      }
      return copy;
    });
    const item=new InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?copied:copied[0],DJC_POOL_LANTERN_POSITIONS.length);
    item.name=`djc-pool-lantern-${mesh.name}`;item.castShadow=true;item.receiveShadow=true;
    DJC_POOL_LANTERN_POSITIONS.forEach((position,i)=>{
      translation.makeTranslation(...position);matrix.multiplyMatrices(translation,mesh.matrixWorld);item.setMatrixAt(i,matrix);
    });
    item.instanceMatrix.needsUpdate=true;item.computeBoundingBox();item.computeBoundingSphere();
    root.add(item);instances.push(item);
  });
  const ownedMaterials=[...materials.values()],lamps=[...diffusers].map(([material,levels])=>({material,...levels}));
  return {root,instances,materials:ownedMaterials,
    setNight(amount:number){
      for(let i=0;i<ownedMaterials.length;i++)ownedMaterials[i].envMapIntensity=1-.65*amount;
      for(let i=0;i<lamps.length;i++){const lamp=lamps[i];lamp.material.emissiveIntensity=lamp.day+(lamp.night-lamp.day)*amount;}
    },
    dispose(){for(const instance of instances)instance.dispose();for(const material of ownedMaterials)material.dispose();for(const texture of textures.values())texture.dispose();},
  };
}

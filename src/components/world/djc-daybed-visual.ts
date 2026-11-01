import { Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial, type Texture } from 'three';
import { CLUB_DAYBEDS } from './djc-club-layout';

export const DJC_DAYBED_ASSET='/assets/world/club/daybed/daybed-v1.glb';
export const DJC_DAYBED_ORIGIN_Y=1.5;
// The private outdoor map contains LDR radiance, not an HDR studio key. Keep
// enough indirect irradiance for shaded timber/cloth, including a dim night floor.
const DAYBED_ENVIRONMENT_DAY=1.5,DAYBED_ENVIRONMENT_NIGHT=.5;
export function djcDaybedLegacy(search:string) {
  const params=new URLSearchParams(search);
  return params.get('qa')==='1' && params.get('djcDaybeds')==='legacy';
}

/** Four placements share the loader's geometry and images, and one owned material
 * per source material. No duplicate geometry, per-bed lights or per-frame matrices. */
export function createDjcDaybedVisual(source:Group,environment:Texture|null=null,maxAnisotropy=1) {
  const root=new Group(); root.name='djc-crafted-daybeds';
  const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  const textures=new Map<Texture,Texture>();
  const anisotropy=Math.min(4,Math.max(1,maxAnisotropy));
  const sampledTexture=(source:Texture|null)=>{
    if(!source)return null;
    if(source.anisotropy===anisotropy)return source;
    let texture=textures.get(source);
    if(!texture){
      texture=source.clone();texture.anisotropy=anisotropy;texture.needsUpdate=true;
      textures.set(source,texture);
    }
    return texture;
  };
  const lamps:{material:MeshStandardMaterial;intensity:number}[]=[];
  const instances:InstancedMesh[]=[];
  const translation=new Matrix4(),matrix=new Matrix4();
  source.updateMatrixWorld(true);
  source.traverse(object=>{
    const mesh=object as Mesh;
    if(!mesh.isMesh)return;
    const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const copied=originals.map(original=>{
      const m=original as MeshStandardMaterial;
      if(!materials.has(m)){
        const copy=m.clone();copy.envMap=environment;copy.envMapIntensity=DAYBED_ENVIRONMENT_DAY;
        // Retain image sources, UV transforms, color spaces and all PBR factors.
        // Only the owned sampler changes, keeping oblique weave/grain mipmaps legible.
        for(const key of ['map','normalMap','roughnessMap','metalnessMap'] as const)copy[key]=sampledTexture(m[key]);
        materials.set(m,copy);
        if(copy.emissive?.getHex())lamps.push({material:copy,intensity:copy.emissiveIntensity});
      }
      return materials.get(m)!;
    });
    const item=new InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?copied:copied[0],CLUB_DAYBEDS.length);
    item.name=`djc-daybed-${mesh.name}`;item.castShadow=true;item.receiveShadow=true;
    CLUB_DAYBEDS.forEach(([x,z],i)=>{
      translation.makeTranslation(x,DJC_DAYBED_ORIGIN_Y,z);
      matrix.multiplyMatrices(translation,mesh.matrixWorld);item.setMatrixAt(i,matrix);
    });
    item.instanceMatrix.needsUpdate=true;item.computeBoundingBox();item.computeBoundingSphere();
    root.add(item);instances.push(item);
  });
  return {root,instances,materials:[...materials.values()],
    setNight(amount:number){
      const environmentIntensity=DAYBED_ENVIRONMENT_DAY+(DAYBED_ENVIRONMENT_NIGHT-DAYBED_ENVIRONMENT_DAY)*amount;
      for(const material of materials.values())material.envMapIntensity=environmentIntensity;
      for(const lamp of lamps)lamp.material.emissiveIntensity=lamp.intensity*(.15+.85*amount);
    },
    dispose(){for(const item of instances)item.dispose();for(const material of materials.values())material.dispose();for(const texture of textures.values())texture.dispose();},
  };
}

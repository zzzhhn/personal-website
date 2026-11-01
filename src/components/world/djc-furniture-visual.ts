import { Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial, type Texture } from 'three';

export const DJC_FURNITURE_ASSET='/assets/world/club/furniture/furniture-v1.glb';
export const DJC_FURNITURE_PLACEMENTS={
  lounger:[[74,1.4,47],[74,1.4,63]],
  console:[[32.8,2,55]],
  speaker:[[35.1,2,49.1],[35.1,2,60.9]],
} as const;
export function djcFurnitureLegacy(search:string){const p=new URLSearchParams(search);return p.get('qa')==='1'&&p.get('djcFurniture')==='legacy';}

/** Borrow loader geometry/images and the existing furniture environment cache.
 * The named family hierarchy is resolved recursively, including nested materials. */
export function createDjcFurnitureVisual(source:Group,environment:Texture|null=null,maxAnisotropy=1){
  for(const family of Object.keys(DJC_FURNITURE_PLACEMENTS)){
    const node=source.getObjectByName(`DJC_Furniture_${family}`);if(!node)throw Error(`DJC furniture missing family ${family}`);
    let count=0;node.traverse(object=>{if((object as Mesh).isMesh)count++;});if(!count)throw Error(`DJC furniture family ${family} has no meshes`);
  }
  const root=new Group();root.name='djc-crafted-furniture';source.updateMatrixWorld(true);
  const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),textures=new Map<Texture,Texture>();
  const instances:InstancedMesh[]=[],translation=new Matrix4(),matrix=new Matrix4();
  const anisotropy=Math.min(4,Math.max(1,maxAnisotropy));
  for(const family of Object.keys(DJC_FURNITURE_PLACEMENTS) as (keyof typeof DJC_FURNITURE_PLACEMENTS)[]){
    const node=source.getObjectByName(`DJC_Furniture_${family}`)!;
    const inverse=new Matrix4().copy(node.matrixWorld).invert(),group=new Group();group.name=`djc-furniture-${family}`;root.add(group);
    let count=0;
    node.traverse(object=>{
      const mesh=object as Mesh;if(!mesh.isMesh)return;count++;
      const copied=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(original=>{
        const material=original as MeshStandardMaterial;let copy=materials.get(material);
        if(!copy){copy=material.clone();copy.envMap=environment;copy.envMapIntensity=1.5;
          for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'] as const){
            const texture=material[key];if(!texture||texture.anisotropy===anisotropy)continue;
            let sampler=textures.get(texture);if(!sampler){sampler=texture.clone();sampler.anisotropy=anisotropy;sampler.needsUpdate=true;textures.set(texture,sampler);}copy[key]=sampler;
          }
          materials.set(material,copy);
        }return copy;
      });
      const placements=DJC_FURNITURE_PLACEMENTS[family],item=new InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?copied:copied[0],placements.length);
      item.name=`djc-${family}-${mesh.name}`;item.castShadow=true;item.receiveShadow=true;
      const local=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
      placements.forEach(([x,y,z],i)=>{translation.makeTranslation(x,y,z);matrix.multiplyMatrices(translation,local);item.setMatrixAt(i,matrix);});
      item.instanceMatrix.needsUpdate=true;item.computeBoundingBox();item.computeBoundingSphere();group.add(item);instances.push(item);
    });
    if(!count)throw Error(`DJC furniture family ${family} has no meshes`);
  }
  let disposed=false;
  return {root,instances,materials:[...materials.values()],setNight(amount:number){for(const material of materials.values())material.envMapIntensity=1.5-Math.max(0,Math.min(1,amount));},
    dispose(){if(disposed)return;disposed=true;instances.forEach(item=>item.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());}};
}

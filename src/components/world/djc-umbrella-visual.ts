import { Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial, type Texture } from 'three';

export const DJC_UMBRELLA_ASSET='/assets/world/club/umbrella/umbrella-v1.glb';
export const DJC_UMBRELLA_PLACEMENTS=[[74,1.4,47],[74,1.4,63]] as const;
export function djcUmbrellaLegacy(search:string){
  const params=new URLSearchParams(search);
  return params.get('qa')==='1'&&params.get('djcUmbrellas')==='legacy';
}

/** Borrow loader geometry/images and the shared private environment. Each source
 * material and sampler is copied once for both fixed placements. */
export function createDjcUmbrellaVisual(source:Group,environment:Texture|null=null,maxAnisotropy=1){
  const root=new Group();root.name='djc-crafted-umbrellas';
  const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),textures=new Map<Texture,Texture>();
  const instances:InstancedMesh[]=[],translation=new Matrix4(),matrix=new Matrix4();
  const anisotropy=Math.min(4,Math.max(1,maxAnisotropy));
  source.updateMatrixWorld(true);
  source.traverse(object=>{
    const mesh=object as Mesh;if(!mesh.isMesh)return;
    const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const copied=originals.map(original=>{
      const material=original as MeshStandardMaterial;
      let copy=materials.get(material);
      if(!copy){
        copy=material.clone();copy.envMap=environment;copy.envMapIntensity=1.5;
        for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'] as const){
          const texture=material[key];if(!texture||texture.anisotropy===anisotropy)continue;
          let sampler=textures.get(texture);
          if(!sampler){sampler=texture.clone();sampler.anisotropy=anisotropy;sampler.needsUpdate=true;textures.set(texture,sampler);}
          copy[key]=sampler;
        }
        materials.set(material,copy);
      }
      return copy;
    });
    const item=new InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?copied:copied[0],DJC_UMBRELLA_PLACEMENTS.length);
    item.name=`djc-umbrella-${mesh.name}`;item.castShadow=true;item.receiveShadow=true;
    DJC_UMBRELLA_PLACEMENTS.forEach(([x,y,z],i)=>{
      translation.makeTranslation(x,y,z);matrix.multiplyMatrices(translation,mesh.matrixWorld);item.setMatrixAt(i,matrix);
    });
    item.instanceMatrix.needsUpdate=true;item.computeBoundingBox();item.computeBoundingSphere();root.add(item);instances.push(item);
  });
  if(instances.length===0)throw new Error('DJC umbrella asset has no visible meshes');
  let disposed=false;
  return {root,instances,materials:[...materials.values()],
    setNight(amount:number){for(const material of materials.values())material.envMapIntensity=1.5-Math.max(0,Math.min(1,amount));},
    dispose(){if(disposed)return;disposed=true;instances.forEach(item=>item.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());},
  };
}

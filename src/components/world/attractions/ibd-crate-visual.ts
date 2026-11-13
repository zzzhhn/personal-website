import { Group, Quaternion, Vector3, type Mesh } from 'three';

export const IBD_CRATE_ASSET='/assets/world/ibd/crate/crate-v1.glb';
export const IBD_CRATE_LID_PIVOT:[number,number,number]=[0,1.08,-1.25];
export type IbdCratePart='Shell'|'Lid';
export function ibdCrateLegacy(search:string){
  const params=new URLSearchParams(search);
  return params.get('qa')==='1'&&params.get('ibdCrates')==='legacy';
}

/** All placements borrow immutable geometry, textures and PBR materials from the
 * loader cache. Only the scene nodes are cloned; R3F must not dispose shared data.
 * The hinge belongs to the existing mechanism, never to the exported asset. */
export function createIbdCratePart(source:Group,part:IbdCratePart){
  for(const required of ['Shell','Lid']){
    const group=source.children.find(child=>child.name===required);
    if(!group)throw new Error(`IBD crate asset requires top-level ${required}`);
    if(group.position.lengthSq()>1e-12||group.quaternion.angleTo(new Quaternion())>1e-6||group.scale.distanceTo(new Vector3(1,1,1))>1e-6)
      throw new Error(`IBD crate ${required} must retain its mechanism-local origin`);
    let meshes=0;group.traverse(child=>{if((child as Mesh).isMesh)meshes++;});
    if(!meshes)throw new Error(`IBD crate ${required} contains no meshes`);
  }
  const root=source.children.find(child=>child.name===part)!.clone(true);
  root.name=`ibd-crafted-crate-${part.toLowerCase()}`;
  root.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  return root;
}

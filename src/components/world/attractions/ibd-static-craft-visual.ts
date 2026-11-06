import { BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3, Quaternion, type Texture } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeIbdLight } from './ibd-yard-lighting.ts';

export const IBD_STATIC_CRAFT_ASSET='/assets/world/ibd/static-craft/static-craft-v1.glb';
export const IBD_STATIC_CRAFT_ROOTS=['InspectionBench','UtilityBench','ControlPedestal'] as const;
export const IBD_STATIC_CONTROL_PLACEMENTS=[[-6,0],[-8,-4],[-8,-9],[7,-12],[21,-12],[7.8,-6.5],[20.2,-6.5],[8,7.7],[8,17.3],[7,18]] as const;
export function ibdStaticCraftLegacy(search:string){const p=new URLSearchParams(search);return p.get('qa')==='1'&&p.get('ibdStatic')==='legacy';}

/** Retain exported PBR channels and any earlier hook. Only the clone owns this
 * fill; loader maps and the renderer's PMREM target remain borrowed. */
export function cloneIbdCraftMaterial(source:MeshStandardMaterial,nightUniform:{value:number},baked:boolean){
  const material=source.clone(),sourceKey=source.customProgramCacheKey();
  material.customProgramCacheKey=()=>`${sourceKey}|ibd-crafted-${baked?'static':'moving'}-v2`;
  material.onBeforeCompile=(shader,renderer)=>{
    source.onBeforeCompile.call(material,shader,renderer);
    shader.uniforms.uIbdNight=nightUniform;
    shader.vertexShader=`${baked?'attribute vec3 aIbdBake;':''} varying vec3 vIbdCraftFill;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvIbdCraftFill=${baked?'aIbdBake':'vec3(.075,.09,.12)*(.7+.3*max(normalize(mat3(modelMatrix)*objectNormal).y,0.))'};`);
    shader.fragmentShader=`uniform float uIbdNight; varying vec3 vIbdCraftFill;\n${shader.fragmentShader}`
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uIbdNight*diffuseColor.rgb*vIbdCraftFill;');
  };
  return material;
}

export function updateIbdCraftEnvironment(materials:readonly MeshStandardMaterial[],environment:Texture|null,nightAmount:number){
  const intensity=.55-.32*Math.max(0,Math.min(1,nightAmount));
  for(const material of materials){
    if(material.envMap!==environment){material.envMap=environment;material.needsUpdate=true;}
    material.envMapIntensity=intensity;
  }
}

/** Source-loader geometry, textures and materials are immutable and borrowed.
 * This pack owns merged geometry and material clones only, including night fill. */
export function createIbdStaticCraft(source:Group,nightUniform:{value:number}){
  let disposed=false;
  const roots=IBD_STATIC_CRAFT_ROOTS.map(name=>{
    const root=source.children.find(child=>child.name===name);
    if(!root)throw new Error(`IBD static craft requires top-level ${name}`);
    if(root.position.lengthSq()>1e-12||root.quaternion.angleTo(new Quaternion())>1e-6||root.scale.distanceTo(new Vector3(1,1,1))>1e-6)
      throw new Error(`IBD static craft ${name} must have identity transform`);
    return root;
  });
  const group=new Group();group.name='ibd-static-craft';
  const buckets=new Map<MeshStandardMaterial,BufferGeometry[]>();
  const ownMaterials:MeshStandardMaterial[]=[];
  const add=(object:typeof roots[number],x:number,z:number)=>{
    source.updateMatrixWorld(true);
    object.traverse(node=>{if(!(node instanceof Mesh))return;
      if(Array.isArray(node.material)||!(node.material instanceof MeshStandardMaterial))throw new Error('IBD static craft requires one PBR material per source primitive');
      if(!node.geometry.getAttribute('uv'))throw new Error('IBD static craft requires fabrication UVs');
      const geometry=node.geometry.clone().applyMatrix4(new Matrix4().makeTranslation(x,0,z).multiply(node.matrixWorld));
      // Keep a common set of actual glTF attributes when batching primitives.
      for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv','uv1','uv2','uv3','tangent','color'].includes(key))geometry.deleteAttribute(key);
      const list=buckets.get(node.material)||[];list.push(geometry);buckets.set(node.material,list);
    });
  };
  try{
    for(const x of [10,18])add(roots[0],x,-12);
    for(const [name,x,z] of [['Receiving',-3,26],['Tools',-6,19]] as const){const variant=roots[1].children.find(child=>child.name===name);if(!variant)throw new Error(`IBD utility bench missing ${name}`);add(variant,x,z);}
    for(const [x,z] of IBD_STATIC_CONTROL_PLACEMENTS){const variant=roots[2].children.find(child=>child.name===(x===-6?'Crane':'Standard'));if(!variant)throw new Error('IBD pedestal missing cabinet variant');add(variant,x,z);}
    for(const [sourceMaterial,geometries] of buckets){
      const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('IBD static craft material batch is incompatible');
      bakeIbdLight(merged);
      const material=cloneIbdCraftMaterial(sourceMaterial,nightUniform,true);ownMaterials.push(material);
      const mesh=new Mesh(merged,material);mesh.name=sourceMaterial.name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
  }catch(error){group.traverse(node=>{if(node instanceof Mesh)node.geometry.dispose();});for(const m of ownMaterials)m.dispose();throw error;}
  finally{for(const list of buckets.values())for(const geometry of list)geometry.dispose();}
  return {group,materials:ownMaterials,users:0,dispose(){if(disposed)return;disposed=true;group.traverse(node=>{if(node instanceof Mesh)node.geometry.dispose();});for(const m of ownMaterials)m.dispose();}};
}

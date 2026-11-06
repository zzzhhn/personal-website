import {RepeatWrapping,SRGBColorSpace,NoColorSpace,MeshStandardMaterial,type Texture,BufferAttribute,type BufferGeometry,type Mesh} from 'three';

export const TOWN_SURFACE_FAMILIES=['plaster','stone','wood','bark','metal','roof','cloth','brick','glazing'] as const;
export const TOWN_SURFACE_URLS=TOWN_SURFACE_FAMILIES.flatMap(f=>['color','normal','orm'].map(k=>`/assets/world/town-craft/surfaces/${f}-${k}.png`));
const families:Record<string,typeof TOWN_SURFACE_FAMILIES[number]>={
 town_stone:'stone',town_stone_dark:'stone',town_trim:'stone',town_cream:'plaster',town_sand:'plaster',town_brick:'brick',town_wood:'wood',palm_trunk:'bark',town_metal:'metal',town_slate:'metal',town_dark:'metal',town_roof:'roof',town_canvas:'cloth',town_canvas_cream:'cloth',town_canvas_blue:'cloth',town_glass_lit:'glazing',
};
/** Sampler state and lifetime are private; useLoader's cached textures remain borrowed. */
export function createTownSurfaceLibrary(loaded:Texture[]){
 const textures=loaded.map((original,i)=>{const t=original.clone();t.wrapS=t.wrapT=RepeatWrapping;t.flipY=false;t.colorSpace=i%3===0?SRGBColorSpace:NoColorSpace;t.anisotropy=4;t.needsUpdate=true;return t;});
 return {textures,apply(material:MeshStandardMaterial){
  const f=families[material.name];if(!f)return;
  const offset=TOWN_SURFACE_FAMILIES.indexOf(f)*3;
  material.map=textures[offset];material.normalMap=textures[offset+1];material.roughnessMap=textures[offset+2];material.roughness=1;
  material.normalScale.setScalar(1);
  if(f==='glazing')material.emissiveMap=material.map;
  if(material.name==='town_metal')material.metalness=.78;
  if(material.name==='town_slate')material.metalness=.3;
  if(material.name==='town_dark'){material.metalness=0;material.roughnessMap=null;material.roughness=.78;}
 },dispose(){textures.forEach(t=>t.dispose());}};
}
/** Normalized merge schema. UVs are construction-scale, never erased at batching.
 * The fallback only covers old cached GLBs during rolling preview replacement.
 */
export function preserveTownChannels(g:BufferGeometry,palm=false){
 const keep=new Set(['position','normal','uv',...(palm?['_wind']:[])]);
 for(const k of Object.keys(g.attributes))if(!keep.has(k))g.deleteAttribute(k);
 const position=g.getAttribute('position');
 if(!g.getAttribute('normal'))g.computeVertexNormals();
 if(!g.getAttribute('uv')){
  const uv=new Float32Array(position.count*2),normal=g.getAttribute('normal');
  for(let i=0;i<position.count;i++){
   const n=[Math.abs(normal.getX(i)),Math.abs(normal.getY(i)),Math.abs(normal.getZ(i))];const axis=n.indexOf(Math.max(...n));
   const p=[position.getX(i),position.getY(i),position.getZ(i)];const a=[0,1,2].filter(v=>v!==axis);
   uv[i*2]=p[a[0]]/2;uv[i*2+1]=p[a[1]]/2;
  }g.setAttribute('uv',new BufferAttribute(uv,2));
 }
 if(palm&&!g.getAttribute('_wind'))g.setAttribute('_wind',new BufferAttribute(new Float32Array(position.count*4),4));
}
export function updateTownEnvironment(materials:MeshStandardMaterial[],environment:Texture|null,night:number){
 for(const m of materials)updateTownMaterialEnvironment(m,environment,night);
}
function updateTownMaterialEnvironment(m:MeshStandardMaterial,environment:Texture|null,night:number){
 if(m.envMap!==environment){m.envMap=environment;m.needsUpdate=true;}
 m.envMapIntensity=(m.name.startsWith('town_glass')?.8:m.name==='town_metal'?.65:.28)*(1-.8*night);
}
/** Wind and camera fading install clones after asset construction. Synchronize
 * the material actually being drawn, with no scene traversal or new allocation.
 */
export function bindTownDrawEnvironment(meshes:Mesh[]){
 const state={map:null as Texture|null,night:0};
 for(const mesh of meshes)mesh.onBeforeRender=(_renderer,_scene,_camera,_geometry,material)=>{
  if(material instanceof MeshStandardMaterial)updateTownMaterialEnvironment(material,state.map,state.night);
 };
 return state;
}

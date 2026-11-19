import type { Mesh, Object3D } from 'three';
import { djcBarStructureSupply, djcBarStoolSupply, type ContactShape } from './club-north-bar-contact';
import bar from './club-north-bar-contact.generated.json';

function decode(words:string){
  const bytes=Uint8Array.from(atob(words),symbol=>symbol.charCodeAt(0));
  return new DataView(bytes.buffer);
}
export function buildClubNorthBarContact():Record<'surface'|'solid',ContactShape>{
  const shape=(data:{vertices:string;indices:string})=>{
    const points=decode(data.vertices), indices=decode(data.indices);
    return {
      vertices:Float32Array.from({length:points.byteLength/2},(_,i)=>points.getInt16(2*i,true)*bar.scale),
      indices:Uint32Array.from({length:indices.byteLength/2},(_,i)=>indices.getUint16(2*i,true)),
    };
  };
  return {surface:shape(bar.shapes.surface),solid:shape(bar.shapes.solid)};
}

/** The manifest uses the actual draw order of each existing GLB LOD. */
export function declareNorthBarContacts(root:Object3D,lod:'near'|'far'){
  const groups=new Map(Object.entries(bar.variants[lod].groups));
  root.traverse(object=>{
    const mesh=object as Mesh;
    if(!mesh.isMesh)return;
    if(Array.isArray(mesh.material))throw new Error(`Unexpected bar material groups on ${mesh.name}`);
    const material=mesh.material.name, runs=groups.get(material);
    if(!runs)throw new Error(`Unknown ${lod} bar contact material ${material}`);
    groups.delete(material);
    const index=mesh.geometry.index, expected=index?.count??mesh.geometry.getAttribute('position').count;
    let offset=0;
    mesh.userData.worldCollisionSources=runs.map(([kind,count],part)=>{
      if(typeof kind!=='string'||typeof count!=='number')throw new Error(`Invalid bar contact range for ${material}`);
      const range=index?{firstIndex:offset,indexCount:count}:{firstVertex:offset,vertexCount:count};
      offset+=count;
      const surfaceId=kind==='surface'||kind==='solid' ? djcBarStructureSupply(kind)
        : kind.startsWith('stool-') ? djcBarStoolSupply(Number(kind.slice(6))) : undefined;
      return {id:`${material}:${part}`,...range,collision:surfaceId?'solid':kind,
        ...(surfaceId&&{surfaceId})};
    });
    if(offset!==expected)throw new Error(`The ${lod} bar draw order changed for ${material}`);
  });
  if(groups.size)throw new Error(`Missing ${lod} bar contact materials: ${[...groups.keys()].join(', ')}`);
}

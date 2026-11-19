import { Matrix4, type BufferGeometry, type InstancedMesh } from 'three';

type AssetContact = { scale:number; materials:readonly {name:string}[]; vertices:readonly number[]; indices:readonly number[] };

export function clubFixedAssetContact(data:AssetContact) {
  return { vertices:Float32Array.from(data.vertices,n=>n*data.scale), indices:Uint32Array.from(data.indices) };
}

/** One fixed shape per authored placement; all material batches share its source. */
export function declareClubFixedInstances(instances:readonly InstancedMesh[], data:AssetContact, prefix:string, count:number) {
  const remaining=new Set(data.materials.map(m=>m.name));
  for(const item of instances){
    if(Array.isArray(item.material)||!remaining.delete(item.material.name)||item.count!==count)
      throw new Error(`Unexpected ${prefix} contact source: ${item.name}`);
    const placements=Array.from({length:count},(_,i)=>{
      const matrix=new Matrix4(), id=`${prefix}-${i}`;
      item.getMatrixAt(i,matrix);
      return { id,matrix,surfaceIds:[id] };
    });
    item.userData.worldCollision='solid';
    item.userData.worldCollisionInstances={placements,slots:placements.map((_,i)=>i)};
  }
  if(remaining.size)throw new Error(`Missing ${prefix} materials: ${[...remaining].join(', ')}`);
}

/** The procedural loading fallback owns its own drawn faces and collider. */
export function clubFallbackContact(geometries:readonly BufferGeometry[]) {
  const vertices:number[]=[],indices:number[]=[];
  for(const g of geometries){
    const p=g.getAttribute('position'), index=g.index, offset=vertices.length/3;
    for(let i=0;i<p.count;i++)vertices.push(p.getX(i),p.getY(i),p.getZ(i));
    for(let i=0;i<(index?.count??p.count);i++)indices.push(offset+(index?.getX(i)??i));
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}

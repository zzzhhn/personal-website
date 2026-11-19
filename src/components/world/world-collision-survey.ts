import { Matrix4, type Scene, type Object3D, type Mesh, type BufferGeometry, type InstancedMesh, type BatchedMesh } from 'three';
import type { Collider, World } from '@dimforge/rapier3d-compat';
import { ShapeType } from '@dimforge/rapier3d-compat';

/** On-demand QA inspection. Nothing here is evaluated on ordinary player frames.
 * Path + ordinal locates unnamed GLB parts even when siblings have the same name. */
export async function surveyCollisionSources(scene: Scene, world: World, nodeFor: (c: Collider)=>Object3D|undefined,
  submitted: Iterable<Object3D>, rootName?: string) {
  const pathCache = new Map<Object3D,string>([[scene,'']]);
  function path(node: Object3D): string {
    const cached=pathCache.get(node);
    if(cached!==undefined)return cached;
    const parent=node.parent, label=node.name || node.type;
    const peers=parent?.children.filter(sibling=>(sibling.name||sibling.type)===label);
    const value=(parent?path(parent):'')+'/'+label+(peers && peers.length>1?'['+peers.indexOf(node)+']':'');
    pathCache.set(node,value);
    return value;
  }
  function selected(node: Object3D | undefined) {
    if(!rootName)return true;
    for(let n: Object3D|null|undefined=node;n;n=n.parent)if(n.name===rootName)return true;
    return false;
  }
  const frame=new Set(submitted), meshes: Record<string,unknown>[]=[];
  const geometryIds=new Map<BufferGeometry,number>();
  const geometries: Record<string,unknown>[]=[];
  const digests: Promise<void>[]=[];
  function fingerprint(record: Record<string,unknown>, key: string, array: ArrayLike<number> & ArrayBufferView) {
    // Each GPU view can occupy just part of an underlying GLB buffer.
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    digests.push(crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)).then(hash=>{
      record[key]=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    }));
  }
  scene.updateMatrixWorld(true);
  const matrix=new Matrix4();
  scene.traverse(obj=>{
    const mesh=obj as Mesh;
    if(!mesh.isMesh || !selected(mesh))return;
    const geom=mesh.geometry;
    let id=geometryIds.get(geom);
    if(id===undefined){
      id=geometries.length;geometryIds.set(geom,id);
      const pos=geom.getAttribute('position');
      const record: Record<string,unknown>={name:geom.name,vertices:pos?.count??0,indices:geom.index?.count??0,
        positionType:pos?.array.constructor.name,groups:geom.groups,drawRange:[geom.drawRange.start,Number.isFinite(geom.drawRange.count)?geom.drawRange.count:null]};
      if(pos){
        record.positionStride='data' in pos?pos.data.stride:pos.itemSize;
        record.positionOffset='offset' in pos?pos.offset:0;
        fingerprint(record,'positionBufferSha256',pos.array);
      }
      if(geom.index)fingerprint(record,'indexBufferSha256',geom.index.array);
      geometries.push(record);
    }
    let owner: Object3D|null=mesh;
    while(owner && !Object.hasOwn(owner.userData,'worldCollision') && !owner.userData.worldCollisionSources
          && !owner.userData.worldCollisionInstances)owner=owner.parent;
    const data=owner?.userData;
    const row:Record<string,unknown>={path:path(mesh),geometry:id,matrixWorld:mesh.matrixWorld.toArray(),
      submitted:frame.has(mesh)&&(mesh as InstancedMesh).count!==0&&geom.drawRange.count!==0,
      declaration:data?{owner:path(owner!),policy:data.worldCollision,reason:data.worldCollisionReason,ranges:data.worldCollisionSources,
        partial:data.worldCollisionPartial===true,surface:data.surfaceId,partitions:data.worldCollisionPartitions}:null};
    const instanced=mesh as InstancedMesh,batched=mesh as unknown as BatchedMesh;
    if(instanced.isInstancedMesh){
      const sources=data?.worldCollisionInstances;
      row.instances=Array.from({length:instanced.count},(_,slot)=>{
        instanced.getMatrixAt(slot,matrix);
        const source=sources?.placements?.[sources.slots[slot]];
        return {slot,source:source?.id,localMatrix:matrix.toArray()};
      });
    }else if(batched.isBatchedMesh){
      // Three permits deleted instance IDs to leave holes before active IDs.
      const entries=[];
      for(let slot=0;entries.length<batched.instanceCount && slot<batched.maxInstanceCount;slot++){
        let geometryId;
        try{geometryId=batched.getGeometryIdAt(slot);}catch{continue;}
        const range=batched.getGeometryRangeAt(geometryId);
        batched.getMatrixAt(slot,matrix);
        entries.push({slot,geometryId,start:range?.start,count:range?.count,visible:batched.getVisibleAt(slot),localMatrix:matrix.toArray()});
      }
      row.batches=entries;
    }
    meshes.push(row);
  });
  const colliders: Record<string,unknown>[]=[];
  world.forEachCollider(c=>{
    const node=nodeFor(c);
    if(!selected(node))return;
    const type=c.shapeType(),body=c.parent();
    const shape:Record<string,unknown>={type:ShapeType[type]};
    if([ShapeType.TriMesh,ShapeType.ConvexPolyhedron,ShapeType.RoundConvexPolyhedron,ShapeType.Polyline].includes(type)){
      const vertices=c.vertices(), indices=c.indices();
      shape.vertices=vertices.length/3;fingerprint(shape,'positionBufferSha256',vertices);
      if(indices){shape.indices=indices.length;fingerprint(shape,'indexBufferSha256',indices);}
    }else if(type===ShapeType.Cuboid || type===ShapeType.RoundCuboid){shape.halfExtents=c.halfExtents();}
    else if([ShapeType.Ball,ShapeType.Capsule,ShapeType.Cylinder,ShapeType.Cone,ShapeType.RoundCylinder,ShapeType.RoundCone].includes(type)){
      shape.radius=c.radius();
      if(type!==ShapeType.Ball)shape.halfHeight=c.halfHeight();
    }else{shape.parameters=c.shape;}
    if([ShapeType.RoundCuboid,ShapeType.RoundConvexPolyhedron,ShapeType.RoundCylinder,ShapeType.RoundCone].includes(type))shape.roundRadius=c.roundRadius();
    colliders.push({path:node?path(node):null,name:node?.name,bodyType:body?.bodyType(),enabled:c.isEnabled(),sensor:c.isSensor(),
      groups:c.collisionGroups(),translation:c.translation(),rotation:c.rotation(),shape});
  });
  await Promise.all(digests);
  return {root:rootName??null,meshes,geometries,colliders};
}

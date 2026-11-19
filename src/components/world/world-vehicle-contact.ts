import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { vehicleDoorQuaternion, type DoorSide, type VehicleDoorState } from './WorldVehicleDoors';
import type { VehicleHullEntry } from './WorldVehicleAssets';
import type { Vec3, VehicleId } from './types';

export const vehicleContactRoot = (id: VehicleId) => `world-vehicle-${id}-contact`;
export const vehicleHullId = (id: VehicleId, part: string) => `vehicle-${id}-hull-${part}`;
export const vehicleTyreId = (id: VehicleId, wheel: number) => `vehicle-${id}-tyre-${wheel}`;
export const vehicleDoorId = (id: VehicleId, side: DoorSide) => `vehicle-${id}-${side < 0 ? 'left' : 'right'}-door-leaf`;
export const vanBeaconId = 'vehicle-van-roof-beacon';
export const VEHICLE_HULL_FRICTION=.1, VEHICLE_HULL_RESTITUTION=.1;

type VehicleBodySource = { id: string; firstVertex: number; vertexCount: number;
  collision: 'solid' | 'none'; surfaceId?: string; reason?: string };

// The body draw combines the original exterior, fitted seats and small fittings. Follow the
// actual authored compound hull planes at both LODs, while leaving unreachable trim uncovered.
const HULL_SOURCE_MARGIN = .08;
const roofFootAxes={offroad:[-1.64,-.64,.36],van:[-1.95,-.65,.6]};
const roofRungAxes={offroad:[-1.24,-.84,-.44,-.04],van:[-1.85,-1.45,-1.05,-.65,-.25,.15,.55]};

const roofRackPart=(id:VehicleId,part:string)=>vehicleHullId(id,`rack-${part}`);
const ROOF_RINGS=8;

function roofSurface(id:VehicleId,points:BufferGeometry['attributes']['position'],vertex:number) {
  if(id==='coupe')return;
  const all=(predicate:(x:number,y:number,z:number)=>boolean)=>{
    for(let i=vertex;i<vertex+3;i++)if(!predicate(points.getX(i),points.getY(i),points.getZ(i)))return false;
    return true;
  };
  // Authored tube seats, cross bars and beacon from build_vehicle.py, in the GLB ground frame.
  const x=(points.getX(vertex)+points.getX(vertex+1)+points.getX(vertex+2))/3;
  const z=(points.getZ(vertex)+points.getZ(vertex+1)+points.getZ(vertex+2))/3;
  const offroad=id==='offroad',footY=offroad?1.872:2.437,railY=offroad?1.945:2.552,track=offroad?.8:.86;
  const side=z<0?'left':'right';
  const foot=roofFootAxes[id].findIndex(axis=>all((x,y,z)=>
    y>=footY&&Math.abs(x-axis)<.024&&Math.abs(Math.abs(z)-track)<.024));
  if(foot>=0 && !all((_x,y)=>y>railY))return roofRackPart(id,`foot-${side}-${foot}`);
  if(all((_x,y)=>y>railY)){
    // The source tyre sits above the frame. Segment the rubber annulus so its
    // interior cannot turn into another invisible lid over the rack.
    if(offroad&&all((x,y,z)=>y>1.984&&x>-1.11&&x<-.29&&Math.abs(z)<.42)){
      if(all((x,_y,z)=>Math.hypot(x+.7,z)>.219)){
        const angle=Math.atan2(z,x+.7)+Math.PI;
        return roofRackPart(id,`spare-rubber-${Math.min(ROOF_RINGS-1,Math.floor(angle*ROOF_RINGS/(2*Math.PI)))}`);
      }
      return roofRackPart(id,'spare-rim');
    }
    const rung=roofRungAxes[id].findIndex(axis=>all(x=>Math.abs(x-axis)<.024));
    if(rung>=0)return roofRackPart(id,`rung-${rung}`);
    if(offroad&&Math.min(Math.abs(x+1.64),Math.abs(x-.36))<Math.abs(Math.abs(z)-track))return roofRackPart(id,x<-.64?'rear':'front');
    return roofRackPart(id,`rail-${side}`);
  }
  if(id==='van'&&all((x,y,z)=>y>2.016&&Math.abs(x-1.25)<.104&&Math.abs(z)<.104))return vanBeaconId;
}
export function vehicleBodySources(id: VehicleId, geometry: BufferGeometry, hull: VehicleHullEntry): VehicleBodySource[] {
  const parts = hull.hulls.filter(part=>part.part!=='rack').map(part => {
    const points = Array.from({length:part.points.length / 3}, (_,i) => new Vector3().fromArray(part.points,i*3));
    const faces = new ConvexHull().setFromPoints(points).faces;
    return {name:vehicleHullId(id,part.part), faces};
  });
  const positions=geometry.getAttribute('position'), centre=new Vector3();
  const results: VehicleBodySource[]=[];
  for(let i=0;i<positions.count;i+=3){
    centre.set((positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3,
      (positions.getY(i)+positions.getY(i+1)+positions.getY(i+2))/3,
      (positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3);
    let nearest=roofSurface(id,positions,i);
    if(!nearest){
      let distance=HULL_SOURCE_MARGIN;
      for(const part of parts){
        let offset=-Infinity;
        for(const face of part.faces){
          offset=Math.max(offset,face.normal.dot(centre)-face.constant);
          if(offset>distance)break;
        }
        if(offset<distance){nearest=part.name;distance=offset;}
      }
    }
    const previous=results.at(-1);
    if(previous?.surfaceId===nearest && previous){previous.vertexCount+=3;continue;}
    results.push({id:`${id}-body-range-${i}`,firstVertex:i,vertexCount:3,
      ...(nearest?{collision:'solid',surfaceId:nearest}:{collision:'none',reason:'Visual fittings outside the authored contact hulls'})});
  }
  return results;
}

export function vehicleRoofContactMesh(geometry:BufferGeometry,ranges:VehicleBodySource[],surfaceId:string) {
  const points=geometry.getAttribute('position'), vertices:number[]=[];
  for(const range of ranges){
    if(range.surfaceId!==surfaceId&&!range.surfaceId?.startsWith(`${surfaceId}-`))continue;
    for(let i=range.firstVertex;i<range.firstVertex+range.vertexCount;i++)vertices.push(points.getX(i),points.getY(i),points.getZ(i));
  }
  if(!vertices.length)return null;
  return {vertices:Float32Array.from(vertices),indices:Uint32Array.from({length:vertices.length/3},(_,i)=>i)};
}

export function vehicleRoofContactBlocks(geometry:BufferGeometry,ranges:VehicleBodySource[],surfaceId:string) {
  const names=new Set(ranges.map(range=>range.surfaceId).filter((id):id is string=>!!id&&(id===surfaceId||id.startsWith(`${surfaceId}-`))));
  return [...names].sort().map(id=>{
    const shape=vehicleRoofContactMesh(geometry,ranges,id)!;
    return {id,points:contactHull(Array.from({length:shape.vertices.length/3},(_,i)=>new Vector3().fromArray(shape.vertices,i*3)))};
  });
}

/** Physically persistent roof details omitted by the far GLB keep the exact
 * near triangles resident for the collision survey, without submitting a draw. */
export function retainedVehicleRoofSource(id:VehicleId,near:BufferGeometry,nearRanges:VehicleBodySource[],farRanges:VehicleBodySource[]) {
  const farIds=new Set(farRanges.map(({surfaceId})=>surfaceId));
  const root=vehicleHullId(id,'rack');
  const ids=[...new Set(nearRanges.flatMap(({surfaceId})=>surfaceId?.startsWith(`${root}-`)&&!farIds.has(surfaceId)?[surfaceId]:[]))];
  if(!ids.length)return null;
  const vertices:number[]=[],ranges:VehicleBodySource[]=[];
  for(const surfaceId of ids){
    const part=vehicleRoofContactMesh(near,nearRanges,surfaceId)!;
    ranges.push({id:`${surfaceId}-retained`,firstVertex:vertices.length/3,vertexCount:part.vertices.length/3,collision:'solid',surfaceId});
    for(const value of part.vertices)vertices.push(value);
  }
  const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(Float32Array.from(vertices),3));
  return {geometry,ranges};
}

export function vehicleDoorContactMesh(geometry: BufferGeometry) {
  const points=geometry.getAttribute('position');
  const vertices=new Float32Array(points.count*3);
  for(let i=0;i<points.count;i++)vertices.set([points.getX(i),points.getY(i),points.getZ(i)],i*3);
  return {vertices,indices:geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:points.count},(_,i)=>i)};
}

function contactHull(source:Vector3[]) {
  const unique=new Map<string,Vector3>();
  for(const point of source){
    const key=`${point.x},${point.y},${point.z}`;
    if(!unique.has(key))unique.set(key,point);
  }
  const vertices=[...unique.values()],origin=vertices[0],span=vertices[1]?.clone().sub(origin),normal=new Vector3();
  if(span){
    for(const point of vertices.slice(2)){
      normal.crossVectors(span,point.clone().sub(origin));
      if(normal.lengthSq()>.000000000001)break;
    }
  }
  normal.normalize();
  const points=vertices.every(v=>Math.abs(normal.dot(v.clone().sub(origin)))<.000001)
    ? vertices.flatMap(v=>[v.clone().addScaledVector(normal,.0005),v.clone().addScaledVector(normal,-.0005)]) : vertices;
  const hull=new ConvexHull().setFromPoints(points),corners=new Set<Vector3>();
  for(const face of hull.faces){
    let edge=face.edge;
    do{corners.add(edge.head().point);edge=edge.next;}while(edge!==face.edge);
  }
  return Float32Array.from([...corners].flatMap(p=>p.toArray()));
}

export function vehicleContactHull(geometry: BufferGeometry) {
  const positions=geometry.getAttribute('position');
  return contactHull(Array.from({length:positions.count},(_,i)=>new Vector3().fromBufferAttribute(positions,i)));
}
export const vehicleTyreContactHull=vehicleContactHull;

const yawAxis=new Vector3(0,1,0), axle=new Vector3(0,0,1);
const roll=new Quaternion(), flip=new Quaternion().setFromAxisAngle(yawAxis,Math.PI);
export function vehicleTyrePose(point:Vec3,suspension:number,steering:number,spin:number,position:Vector3,rotation:Quaternion) {
  position.set(point[0],point[1]-suspension,point[2]);
  rotation.setFromAxisAngle(yawAxis,steering).multiply(roll.setFromAxisAngle(axle,-spin));
  // The instanced asset mirrors the authored left-side wheel about the wheel-local vertical axis.
  if(point[2]>0)rotation.multiply(flip);
}

export function vehicleLeafPose(id:VehicleId,side:DoorSide,state:VehicleDoorState,rotation:Quaternion) {
  return vehicleDoorQuaternion(id,side,state.side===side?state.openness:0,rotation);
}

export function vehicleWheelSource(id:VehicleId,matrices: Matrix4[], physical:boolean) {
  return {placements:matrices.map((matrix,i)=>({id:`vehicle-${id}-wheel-${i}`,matrix,
    ...(physical?{surfaceIds:[vehicleTyreId(id,i)]}:{})})),slots:[0,1,2,3]};
}

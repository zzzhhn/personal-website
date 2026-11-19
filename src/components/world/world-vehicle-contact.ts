import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
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

function roofSurface(id:VehicleId,points:BufferGeometry['attributes']['position'],vertex:number) {
  if(id==='coupe')return;
  const all=(predicate:(x:number,y:number,z:number)=>boolean)=>{
    for(let i=vertex;i<vertex+3;i++)if(!predicate(points.getX(i),points.getY(i),points.getZ(i)))return false;
    return true;
  };
  // Authored tube seats, cross bars and beacon from build_vehicle.py, in the GLB ground frame.
  const offroad=id==='offroad',footY=offroad?1.872:2.437,railY=offroad?1.945:2.552,track=offroad?.8:.86;
  const onRack=all((_x,y)=>y>railY)||roofFootAxes[id].some(axis=>all((x,y,z)=>
    y>=footY&&Math.abs(x-axis)<.024&&Math.abs(Math.abs(z)-track)<.024));
  if(onRack)return vehicleHullId(id,'rack');
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
    if(range.surfaceId!==surfaceId)continue;
    for(let i=range.firstVertex;i<range.firstVertex+range.vertexCount;i++)vertices.push(points.getX(i),points.getY(i),points.getZ(i));
  }
  if(!vertices.length)return null;
  return {vertices:Float32Array.from(vertices),indices:Uint32Array.from({length:vertices.length/3},(_,i)=>i)};
}

export function vehicleDoorContactMesh(geometry: BufferGeometry) {
  const points=geometry.getAttribute('position');
  const vertices=new Float32Array(points.count*3);
  for(let i=0;i<points.count;i++)vertices.set([points.getX(i),points.getY(i),points.getZ(i)],i*3);
  return {vertices,indices:geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:points.count},(_,i)=>i)};
}

export function vehicleTyreContactHull(geometry: BufferGeometry) {
  const positions=geometry.getAttribute('position'), unique=new Map<string,Vector3>();
  for(let i=0;i<positions.count;i++){
    const point=new Vector3().fromBufferAttribute(positions,i);
    const key=`${point.x},${point.y},${point.z}`;
    if(!unique.has(key))unique.set(key,point);
  }
  const hull=new ConvexHull().setFromPoints([...unique.values()]), corners=new Set<Vector3>();
  for(const face of hull.faces){
    let edge=face.edge;
    do{corners.add(edge.head().point);edge=edge.next;}while(edge!==face.edge);
  }
  return Float32Array.from([...corners].flatMap(p=>p.toArray()));
}

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

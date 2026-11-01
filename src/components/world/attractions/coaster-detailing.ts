import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { ThrillBeam } from './coaster-thrill-supports.ts';
import { bakeIntentNight } from './intent-lighting.ts';
import { COASTER_STATION_EDGE_LIGHTS, lightCoasterCliffs } from './coaster-landscape-lighting.ts';
import { coasterWorld } from './coaster-track.ts';
import type { Vec3 } from '../types';

/** Split the existing tube surface into short end connections and a continuous web.
 * All vertices retain the original cylinder radius and endpoints, including both caps. */
export function createSupportMemberDetail(beam: ThrillBeam) {
  const d=beam.b.clone().sub(beam.a),length=d.length(),band=Math.min(.34,length*.12);
  const source=new CylinderGeometry(beam.radius,beam.radius,length,8,3);
  const p=source.attributes.position;
  for(let i=0;i<p.count;i++) {
    const t=p.getY(i)/length+.5;
    p.setY(i,t>.99999?length/2:t>.5?length/2-band:t>.00001?-length/2+band:-length/2);
  }
  const geometry=source.toNonIndexed();source.dispose();geometry.deleteAttribute('uv');geometry.clearGroups();
  const position=geometry.attributes.position,colours=new Float32Array(position.count*3);
  const body=new Color('#526b79'),joint=new Color('#aa9173'),cap=new Color('#98a7aa');
  for(let i=0;i<position.count;i+=3) {
    const y=(position.getY(i)+position.getY(i+1)+position.getY(i+2))/3;
    const colour=Math.abs(y)>length/2-1e-5?cap:Math.abs(y)>length/2-band?joint:body;
    for(let j=0;j<3;j++)colours.set(colour.toArray(),(i+j)*3);
  }
  geometry.setAttribute('color',new BufferAttribute(colours,3));
  geometry.applyMatrix4(new Matrix4().compose(beam.a.clone().add(beam.b).multiplyScalar(.5),
    new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1)));
  bakeIntentNight(geometry);lightCoasterCliffs(geometry);
  return geometry;
}

export function stationStructureMembers() {
  const members: {position:Vec3;size:Vec3;rotation?:Vec3;colour:string}[]=[];
  for(const x of [-10,6]) {
    members.push({position:coasterWorld([x,5.8,41.5]),size:[.32,.52,22.6],colour:'#526b79'});
    for(const z of [31,x<0?43:51]) {
      const end=z<40?z+1.3:z-1.3,a=new Vector3(...coasterWorld([x,4.78,z])),b=new Vector3(...coasterWorld([x,5.77,end]));
      const d=b.clone().sub(a),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
      const e=new Euler().setFromQuaternion(q);
      members.push({position:a.add(b).multiplyScalar(.5).toArray() as Vec3,size:[.18,d.length(),.24],rotation:[e.x,e.y,e.z],colour:'#9d8970'});
    }
  }
  return members;
}

/** Load-bearing station members share their exact box transform with physical contacts. */
export function addStationStructureDetail(steel:CoasterBatch,glow:CoasterBatch,colliders:CoasterCollider[]) {
  for(const s of stationStructureMembers()) {
    const q=new Quaternion().setFromEuler(new Euler(...(s.rotation??[0,0,0])));
    steel.add(new BoxGeometry(...s.size),s.colour,new Matrix4().compose(new Vector3(...s.position),q,new Vector3(1,1,1)));
    colliders.push({position:s.position,half:s.size.map(v=>v/2) as Vec3,...(s.rotation?{rotation:s.rotation}:{})});
  }
  for(const p of COASTER_STATION_EDGE_LIGHTS)glow.box(coasterWorld(p),[.23,.045,.7],'#ffd092');
}

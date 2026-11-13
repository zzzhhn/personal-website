import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../types';
import type { TransportRoute, TransportTransform, TransportSample } from './ride-contract';
export const tuple = (v: Vector3): Vec3 => v.toArray() as Vec3;
export function transportWorld(p: Vec3, t: TransportTransform): Vec3 {
  return tuple(new Vector3(...p).applyAxisAngle(new Vector3(0,1,0),t.yaw).add(new Vector3(...t.origin)));
}
export function transportCurve(route: TransportRoute) {
  if (route.path.length < 2 || !(route.duration > 0) || route.path.some(p=>p.some(v=>!Number.isFinite(v)))) throw new Error(`Invalid transport route ${route.id}`);
  return new CatmullRomCurve3(route.path.map(p=>new Vector3(...p)),false,'centripetal');
}
export function sampleTransport(route: TransportRoute, u: number, curve = transportCurve(route), direction = 1): TransportSample {
  u = Math.max(0,Math.min(1,u));
  const local = curve.getPointAt(u), tangent = curve.getTangentAt(u).multiplyScalar(direction);
  // Gondola floor and ferry deck stay level; sled pitches along its actual runner support, never rolls.
  if (route.kind !== 'sled') tangent.y = 0;
  tangent.normalize().applyAxisAngle(new Vector3(0,1,0),route.transform.yaw);
  const yaw = Math.atan2(-tangent.z,tangent.x);
  const orientation = route.kind === 'sled'
    ? new Quaternion().setFromUnitVectors(new Vector3(1,0,0),tangent)
    : new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw);
  const vehicle = transportWorld(tuple(local),route.transform);
  const seatOffset = new Vector3(...route.terminals[0].seat).applyQuaternion(orientation);
  const seat = tuple(new Vector3(...vehicle).add(seatOffset));
  const target = new Vector3(...seat).add(new Vector3(0,.8,0));
  const camera = new Vector3(...vehicle).addScaledVector(tangent,-6.8).add(new Vector3(0,3.8,0));
  return { vehicle, yaw, orientation: orientation.toArray() as [number,number,number,number],
    pose: {seat,yaw,orientation:orientation.toArray() as [number,number,number,number],cameraPosition:tuple(camera),cameraTarget:tuple(target),cameraUp:[0,1,0],firstPerson:false,fov:55} };
}
export function pathLength(path: Vec3[]) { return path.slice(1).reduce((sum,p,i)=>sum+new Vector3(...p).distanceTo(new Vector3(...path[i])),0); }
export function alongPath(path: Vec3[], u: number): Vec3 {
  let d = Math.max(0,Math.min(1,u))*pathLength(path);
  for(let i=1;i<path.length;i++){const a=new Vector3(...path[i-1]),b=new Vector3(...path[i]),n=a.distanceTo(b);if(d<=n)return tuple(a.lerp(b,n?d/n:1));d-=n;}
  return [...path[path.length-1]];
}

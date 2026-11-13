import { Quaternion, Vector3 } from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import type { AttractionRidePose } from './attraction-ride.ts';
import { attractionCameraSweepOrigin, attractionLookRevision } from './attraction-camera.ts';
import { sweepCamera } from '../camera-collision.ts';

/** Metres/second regained after an obstacle releases the third-person orbit. */
export const ATTRACTION_CAMERA_RECOVERY_SPEED = 6;

/** Radial state belongs to the current train-relative orbit, never a world-space
 * point lagging behind the moving train. Yaw/pitch and authored framing stay live.
 * New hard contacts shorten immediately; release restores distance at a bounded
 * rate. Every returned smoothed point gets its own near-plane sphere sweep. */
export class AttractionCameraObstruction {
  private previous: { fraction: number; key: string; seat: Vector3 } | null = null;

  private readout: {firstLegHit:number|null;firstLegDegenerate:boolean;eyeOverlapping:boolean;validOrigin:boolean;origin:number[];visibilityHit:number|null;visibilityLimited:boolean}|null=null;
  debug(){return this.readout;}
  clear() { this.previous = null; this.readout=null; }

  step(world: World, rapier: Pick<typeof Rapier, 'Ball'>, pose: AttractionRidePose,
    radius: number, delta: number, lifecycle: string, exclude?: RigidBody) {
    const desired = new Vector3(...pose.cameraPosition);
    let origin = attractionCameraSweepOrigin(pose);
    let eye:Vector3|null=null;
    const solid = (collider: Rapier.Collider) => !collider.isSensor();
    this.readout=null;
    if(pose.cameraSweepOrigin){
      const up=new Vector3(0,1,0);if(pose.orientation)up.applyQuaternion(new Quaternion(...pose.orientation));
      eye=new Vector3(...pose.seat).addScaledVector(up,1.02);
      const eyeOverlapping=!!world.intersectionWithShape(eye,{x:0,y:0,z:0,w:1},new rapier.Ball(radius),undefined,undefined,undefined,exclude,solid),degenerate=eye.distanceTo(origin)<1e-5;
      const door=sweepCamera(world,rapier,eye,origin,radius,exclude,solid);
      origin=new Vector3(door.position.x,door.position.y,door.position.z);
      this.readout={firstLegHit:door.hit,firstLegDegenerate:degenerate,eyeOverlapping,validOrigin:!eyeOverlapping&&!degenerate,origin:origin.toArray(),visibilityHit:null,visibilityLimited:false};
      if(eyeOverlapping||degenerate){this.previous=null;return {position:eye,distance:0,limit:0,hit:0,recovering:false,forcedCompression:true};}
    }
    const offset = desired.clone().sub(origin), length = offset.length();
    if (pose.firstPerson || !pose.orientation) {
      this.clear(); return { position: desired, distance: length, limit: length, hit: null,
        recovering: false, forcedCompression: false };
    }
    const raw = sweepCamera(world, rapier, origin, desired, radius, exclude, solid);
    const key = `${lifecycle}:${pose.fov}:${attractionLookRevision}`, seat = new Vector3(...pose.seat);
    const previous = this.previous;
    // A seek/teleport, new ride/phase/view or stale frame must not inherit an old
    // obstacle. Normal pause holds this state because the caller does not step it.
    const continuous = previous && previous.key === key && Number.isFinite(delta) && delta > 0 && delta <= .25
      && previous.seat.distanceTo(seat) <= Math.max(4, delta * 100);
    const limit = length > 1e-5 ? raw.distance / length : 1;
    const fraction = continuous ? Math.min(limit,
      previous.fraction + ATTRACTION_CAMERA_RECOVERY_SPEED * delta / Math.max(length, 1e-5)) : limit;
    const target = origin.clone().addScaledVector(offset, fraction);
    let final = sweepCamera(world, rapier, origin, target, radius, exclude, solid);
    if(eye&&this.readout){
      const view=sweepCamera(world,rapier,eye,final.position,.02,exclude,solid);this.readout.visibilityHit=view.hit;
      if(view.hit!==null){
        const end=new Vector3(final.position.x,final.position.y,final.position.z);let low=0,high=1;
        for(let i=0;i<9;i++){const mid=(low+high)/2,p=origin.clone().lerp(end,mid);if(sweepCamera(world,rapier,eye!,p,.02,exclude,solid).hit===null)low=mid;else high=mid;}
        final=sweepCamera(world,rapier,origin,origin.clone().lerp(end,low),radius,exclude,solid);this.readout.visibilityLimited=true;
      }
    }
    this.previous = { fraction: length > 1e-5 ? final.distance / length : 1, key, seat };
    return { ...final, limit: raw.distance, hit: raw.hit,
      recovering: fraction < limit - 1e-6,
      forcedCompression: !!continuous && limit < previous.fraction - 1e-6 };
  }
}

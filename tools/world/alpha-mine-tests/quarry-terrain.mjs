import {RAPIER} from './quarry-walk.mjs';
import {ALPHA_MINE_ORIGIN} from '../../../src/components/world/alpha-mine-layout.ts';

/** Local collision patch sampled from the production island height function, beneath the mine. */
export function addQuarryTerrain(world,heightAt,{minX=-2,maxX=8,minZ=-38,maxZ=2,step=.5}={}){
  const vertices=[],indices=[],nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=minX+i*step,z=minZ+j*step;
    vertices.push(x,heightAt(x+ALPHA_MINE_ORIGIN[0],z+ALPHA_MINE_ORIGIN[2])-ALPHA_MINE_ORIGIN[1],z);
  }
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const a=j*nx+i,b=a+1,d=a+nx,c=d+1;indices.push(a,d,b,b,d,c);
  }
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());body.userData={kind:'island-terrain'};
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setFriction(.9),body);
}

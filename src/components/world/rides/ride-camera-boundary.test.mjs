import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as shared from './ride-camera.ts';
import * as legacy from '../attractions/attraction-camera.ts';
import { RideCameraObstruction } from './ride-camera-obstruction.ts';
import { AttractionCameraObstruction } from '../attractions/attraction-camera-obstruction.ts';
import { RideCabinCamera } from './ride-camera-cabin.ts';
import { AttractionCabinCamera } from '../attractions/attraction-camera-cabin.ts';

test('scene compatibility exports share one camera state and lifecycle revision with core',()=>{
  assert.equal(shared.rideLook,legacy.attractionLook);
  assert.equal(shared.RideCameraOrientation,legacy.AttractionCameraOrientation);
  assert.equal(RideCameraObstruction,AttractionCameraObstruction);assert.equal(RideCabinCamera,AttractionCabinCamera);
  legacy.resetAttractionLook();const before=shared.rideLookRevision;
  shared.turnRideLook(.3,.2);assert.equal(legacy.attractionLook.yaw,shared.rideLook.yaw);
  legacy.zoomAttractionLook(.2);assert.equal(shared.rideLook.zoom,legacy.attractionLook.zoom);
  shared.resetRideLook();assert.equal(legacy.attractionLookRevision,before+1);
  assert.deepEqual(legacy.attractionLook,{yaw:0,pitch:0,zoom:1});
});

test('generic ride camera bundle has no venue, terrain-authoring or legacy transition dependency',async()=>{
  const result=await build({entryPoints:[new URL('./ride-camera.ts',import.meta.url).pathname,
    new URL('./ride-camera-obstruction.ts',import.meta.url).pathname,
    new URL('./ride-camera-cabin.ts',import.meta.url).pathname],
    bundle:true,write:false,outdir:'unused',format:'esm',packages:'external',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(p=>p.endsWith('/camera-collision.ts')),'actual collision code belongs in the bundle');
  assert.deepEqual(inputs.filter(p=>/(?:\/attractions\/|\/alpha-island\/|\/factory\/|WorldLandform|coaster-transition)/.test(p)),[]);
});

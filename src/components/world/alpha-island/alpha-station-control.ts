import { LatheGeometry, Vector2 } from 'three';
import { AlphaBuilder } from './alpha-art';
import { ALPHA_WIND_GATE_Y } from './alpha-layout';
import { surfaceColliderBuffers } from '../static-surface-asset';
import type { Vec3 } from '../types';

export type StationControl = 'bell' | 'wind';
export const stationControlPivots:Record<StationControl, Vec3> = {
  bell:[-61.3,6.6,-36.35],
  wind:[16.8,ALPHA_WIND_GATE_Y+1.05,-44],
};

function bellParts(){const b=new AlphaBuilder();b.beam('metal',[0,0,0],[0,.35,0],.04);b.add(new LatheGeometry([[.04,0],[.11,-.06],[.15,-.32],[.28,-.49],[.27,-.53],[.23,-.5],[.12,-.3],[.08,-.07]].map(p=>new Vector2(p[0],p[1])),20),'metal');b.beam('rope',[0,-.35,0],[0,-1.3,0],.022);b.cyl('wood',[0,-1.3,0],.075,.2);b.cyl('metal',[0,-.43,0],.055,.19);const parts=b.finish();parts.forEach(p=>p.geometry.translate(0,-.35,0));return parts;}
function handleParts(){const b=new AlphaBuilder();b.beam('metal',[0,0,0],[.6,0,0],.06);b.beam('wood',[.6,0,0],[.6,0,.4],.08);b.cyl('metal',[0,0,0],.1,.12);return b.finish();}

export function buildStationControl(kind:StationControl) {
  const parts = kind==='bell' ? bellParts() : handleParts();
  return parts.map(part=>{
    const id = 'alpha-'+kind+'-control-'+part.finish;
    const rope = part.finish === 'rope';
    const contact = rope ? null : surfaceColliderBuffers({id,space:'alpha-island',role:'enclosure',
      reason:'Fitted control member on the moving pivot',collision:'solid',geometry:part.geometry});
    return {...part,id,contact};
  });
}

export function stationControlAngle(kind:StationControl, previous:number, dt:number, bellAge:number, wind:number) {
  if (kind==='bell') return bellAge>=0 && bellAge<4 ? Math.sin(bellAge*14)*Math.exp(-bellAge)*.28 : 0;
  const target = wind*.7;
  return Math.abs(target-previous)<.000001 ? target : previous+(target-previous)*Math.min(1,dt*8);
}

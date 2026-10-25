import { useWorldStore } from './store';
import { exchangeEquity, useAlphaExchange } from './alpha-exchange-state';
import { readDrivingTelemetry } from './vehicle-telemetry';
import { grassDebug } from './WorldGrass';
import { mineActor } from './alpha-mine-state';

/** Visible, read-only diagnostics. Reuses actor publication; never polls or changes play state. */
export default function WorldPlaytestReadout() {
  const world=useWorldStore(),exchange=useAlphaExchange();
  if(world.paused||world.shot)return null;
  return <output data-world-playtest style={{position:'fixed',left:16,top:110,width:255,maxHeight:'35vh',overflow:'auto',font:'10px/1.25 monospace',whiteSpace:'pre-wrap',background:'#17231dcc',color:'#e7eddf',padding:8,pointerEvents:'none'}}>
    {JSON.stringify({position:world.position.map(v=>+v.toFixed(2)),yaw:+mineActor.yaw.toFixed(2),grounded:mineActor.grounded,
      nearby:world.nearbyInteract?.id,vehicle:world.activeVehicle,drive:readDrivingTelemetry(),
      grass:{instances:grassDebug.instances,disturbers:grassDebug.disturbers,trampled:grassDebug.trampleActive,strength:grassDebug.maxTrample},
      exchange:{phase:exchange.phase,date:exchange.history[exchange.day]?.date,days:exchange.history.length,day:exchange.day,
        cash:exchange.cash,units:exchange.units,equity:exchangeEquity(exchange),message:exchange.message,ledger:exchange.ledger}},null,1)}
  </output>;
}

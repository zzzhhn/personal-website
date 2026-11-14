import type { FactoryModule } from './factory-game.ts';
import type { FactoryPoint } from './factory-layout.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z, FACTORY_RAW_HALF_HEIGHT, FACTORY_RAW_TRANSFER_TOP, factoryRawDrop } from './factory-operation.ts';

/** Separate staging pockets keep a dispatched blank clear of the two waiting ones. */
export const FACTORY_BATCH_Z:Record<FactoryModule,number>={frame:-22.8,wheels:-22,shell:-21.2};
export const FACTORY_TRANSFER_X=-21;
export function factoryBatchPosition(module:FactoryModule):FactoryPoint {
  return [-24,FACTORY_CONVEYOR_TOP+FACTORY_RAW_HALF_HEIGHT[module],FACTORY_BATCH_Z[module]];
}
export function factoryIntakePath(module:FactoryModule):FactoryPoint[]{
  const h=FACTORY_RAW_HALF_HEIGHT[module],batch=factoryBatchPosition(module);
  return [factoryRawDrop(module),[-33.7,FACTORY_RAW_TRANSFER_TOP+h,-22],
    [-26,FACTORY_CONVEYOR_TOP+h,-22],[-26,batch[1],batch[2]],batch];
}
/** A reversible orthogonal transfer table connects batching to each actual press bed.
 * Returning a wrong-line blank uses its recorded line, never its module's intended line. */
export function factoryRoutingPath(module:FactoryModule,line:FactoryModule):FactoryPoint[]{
  const start=factoryBatchPosition(module),y=start[1],z=FACTORY_LINE_Z[line];
  return [start,[FACTORY_TRANSFER_X,y,start[2]],[FACTORY_TRANSFER_X,y,z],[-27,y,z]];
}
/** Arc-length sampling avoids speed changes at corners. Reuses the caller's vector. */
export function sampleFactoryRoute(path:readonly FactoryPoint[],progress:number,out:FactoryPoint){
  if(progress<=0||progress>=1){
    const end=progress<=0?path[0]:path[path.length-1];out[0]=end[0];out[1]=end[1];out[2]=end[2];return out;
  }
  let total=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];total+=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  }
  let remaining=Math.max(0,Math.min(1,progress))*total;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    if(remaining<=length||i===path.length-1){
      const t=length?Math.min(1,remaining/length):1;
      out[0]=a[0]+(b[0]-a[0])*t;out[1]=a[1]+(b[1]-a[1])*t;out[2]=a[2]+(b[2]-a[2])*t;return out;
    }
    remaining-=length;
  }
  return out;
}

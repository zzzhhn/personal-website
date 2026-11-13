import { Box3, BufferGeometry, Sphere, Vector3 } from 'three';

/** Share one vertex allocation while letting Three sort each separate window bay.
 * A single transparent mesh has only one depth key, so opposing walls previously
 * blended in a fixed, incorrect order as the player crossed the hall. */
export function exchangeGlassBays(source:BufferGeometry,ranges:readonly {start:number;count:number}[]){
  const p=source.getAttribute('position'),point=new Vector3();
  return ranges.map(range=>{
    const g=new BufferGeometry();
    for(const [name,attribute] of Object.entries(source.attributes))g.setAttribute(name,attribute);
    g.setDrawRange(range.start,range.count);
    const box=new Box3();
    for(let i=range.start;i<range.start+range.count;i++)box.expandByPoint(point.fromBufferAttribute(p,i));
    g.boundingBox=box;g.boundingSphere=box.getBoundingSphere(new Sphere());
    return g;
  });
}

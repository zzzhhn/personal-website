/** Rows follow Three's unflipped DataTexture/equirectangular convention:
 * v=0 looks down, v=1 looks up. Image-file top-down row order does not apply. */
export function createDjcEnvironmentRadiance(width:number,height:number,keyDirection:{x:number;y:number;z:number}) {
  const pixels=new Float32Array(width*height*4);
  const length=Math.hypot(keyDirection.x,keyDirection.y,keyDirection.z);
  const keyU=Math.atan2(keyDirection.z,keyDirection.x)/(Math.PI*2)+.5;
  const keyV=Math.asin(keyDirection.y/length)/Math.PI+.5;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    // Retain the established coastal palette, with sky and key above the horizon.
    const fromTop=height-1-y;
    const sky=Math.max(0,1-fromTop/(height/2)),ground=fromTop>height/2;
    const dx=Math.abs((x+.5)/width-keyU),wrappedDx=Math.min(dx,1-dx);
    const key=Math.exp(-((wrappedDx/.07)**2+(((y+.5)/height-keyV)/.094)**2));
    const i=(y*width+x)*4;
    pixels[i]=(ground?.16:.7-sky*.32)+key*1.3;
    pixels[i+1]=(ground?.145:.76-sky*.23)+key*1.1;
    pixels[i+2]=(ground?.11:.82-sky*.08)+key*.8;
    pixels[i+3]=1;
  }
  return pixels;
}

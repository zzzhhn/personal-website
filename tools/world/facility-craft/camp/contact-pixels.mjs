// Compile and sample the actual tire-patch shaders in WebGL. No world startup or GPU timing.
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { CHROME, loadPlaywright } from '../../playtest/lib.mjs';
import { contact, contactPatch, pack } from './contact-fixture.mjs';
const {mesh} = contactPatch(new Scene(),contact.createSuitcaseContactSlot());
const samples = [
  {uv:[.5,.5],strength:1,alpha:.32}, {uv:[.5,.5],strength:.5,alpha:.16},
  {uv:[.5,.5],strength:0,alpha:0}, {uv:[1,.5],strength:1,alpha:0},
];
for(const wheel of contact.suitcaseContactWheels(pack.scene.getObjectByName('C15'))) {
  for (const [axis,radius,expected] of [[0,wheel.radiusX,[.136494,.055905,0]],[2,wheel.radiusZ,[.188408,.081834,0]]]) {
    const values=Array.from(wheel.vertices).filter((_,i)=>i%3===axis);
    const half=(Math.max(...values)-Math.min(...values))/2;
    for (const [j,alpha] of expected.entries()) {
      const uv=[.5,.5]; uv[axis===0?0:1]+=(half+.01*(j+1))/(2*radius);
      samples.push({uv,strength:1,alpha});
    }
  }
}
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
try {
  const page=await browser.newPage();
  const rgba=await page.evaluate(({vs,fs,samples})=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const gl=canvas.getContext('webgl',{antialias:false,alpha:true,premultipliedAlpha:false});
    if(!gl)throw new Error('WebGL unavailable');
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const prog=gl.createProgram(),prefix='precision highp float;\n';
    gl.attachShader(prog,compile(gl.VERTEX_SHADER,prefix+'attribute vec3 position; attribute vec2 uv; uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;\n'+vs));
    gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,prefix+fs));gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for(const name of ['projectionMatrix','modelViewMatrix'])gl.uniformMatrix4fv(gl.getUniformLocation(prog,name),false,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(prog,'position'),uv=gl.getAttribLocation(prog,'uv'),strength=gl.getAttribLocation(prog,'strength');
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    return samples.map(s=>{
      gl.vertexAttrib2f(uv,...s.uv); gl.vertexAttrib1f(strength,s.strength); gl.drawArrays(gl.TRIANGLES,0,3);
      const out=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);
      if(gl.getError()!==gl.NO_ERROR)throw new Error('GL error during readback');
      return [...out];
    });
  },{vs:mesh.material.vertexShader,fs:mesh.material.fragmentShader,samples});
  for(const [i,pixel] of rgba.entries()){
    assert.deepEqual(pixel.slice(0,3),[0,0,0]); assert.ok(Math.abs(pixel[3]/255-samples[i].alpha)<=1/255);
  }
  console.log(JSON.stringify({browser:browser.version(),wheelSamples:rgba.length,peakOpacity:rgba[0][3]/255,errors:0}));
} finally {mesh.geometry.dispose();mesh.material.dispose();await browser.close();}

import { Camera, Color, DepthTexture, Matrix4, Mesh, Object3D, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedIntType, Vector2, Vector4, WebGLRenderer, WebGLRenderTarget, type MeshStandardMaterial } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CLUB_POOL } from './djc-club-layout';
import { CLUB_WATER_GLSL, createClubCausticMaterial, type ClubWaterUniforms } from './WorldClubWaterShader';

const CAPTURE_LAYER=29;
export const clubWaterDebug={enabled:true,captures:0,reflections:0,caustics:0,passes:0,calls:0,triangles:0,size:[0,0],selected:0};
export const waterCaptureSize=(aspect:number,high:boolean):[number,number]=>{
  const width=high?1024:768;return[width,Math.max(128,Math.min(1024,Math.round(width/Math.max(.5,aspect))))];
};
export const waterCaptureDue=(time:number,last:number,changed:boolean,high:boolean)=>changed||time-last>=1/(high?30:20);

/** One visible pool only. Captures club architecture and actors, not the whole island.
 * Uses Three's maintained Reflector for its oblique clipping, with no extra shadow render. */
export class ClubWaterCapture {
  private refraction=new WebGLRenderTarget(512,320,{depthBuffer:true});
  private mirrorGeometry=new PlaneGeometry(1,1);
  private mirror=new Reflector(this.mirrorGeometry,{textureWidth:512,textureHeight:512,multisample:0});
  private causticTarget=new WebGLRenderTarget(256,256,{depthBuffer:false});
  private causticGeometry=new PlaneGeometry(2,2,128,128);
  private causticScene=new Scene();
  private causticCamera=new Camera();
  private causticMaterial:ShaderMaterial;
  private camera=new PerspectiveCamera();
  private previousCamera=new Matrix4();
  private previousProjection=new Matrix4();
  private inverseMirror=new Matrix4();
  private viewport=new Vector4();
  private scissor=new Vector4();
  private clearColor=new Color();
  private size=new Vector2();
  private last=-Infinity;
  private lastReflection=-Infinity;
  private previousNight=-1;
  private previousAspect=0;
  private previousHigh=false;
  private active=false;
  private selected:Object3D[]=[];
  private masks:number[]=[];

  constructor(private uniforms:ClubWaterUniforms){
    this.refraction.depthTexture=new DepthTexture(512,320,UnsignedIntType);
    this.mirror.rotation.x=-Math.PI/2;this.mirror.position.y=CLUB_POOL.waterY;this.mirror.updateMatrixWorld();
    this.inverseMirror.copy(this.mirror.matrixWorld).invert();
    this.causticMaterial=createClubCausticMaterial(uniforms);
    const mesh=new Mesh(this.causticGeometry,this.causticMaterial);mesh.frustumCulled=false;this.causticScene.add(mesh);
    Object.assign(uniforms.uRefraction,{value:this.refraction.texture});Object.assign(uniforms.uDepth,{value:this.refraction.depthTexture});
    Object.assign(uniforms.uReflection,{value:this.mirror.getRenderTarget().texture});Object.assign(uniforms.uCaustics,{value:this.causticTarget.texture});
  }
  render(renderer:WebGLRenderer,scene:Scene,camera:Camera,water:Mesh,time:number,high:boolean){
    if(this.active)return;
    const near=Math.hypot(camera.position.x-CLUB_POOL.center[0],camera.position.z-CLUB_POOL.center[2])<80;
    if(!clubWaterDebug.enabled||!near||camera.position.y<CLUB_POOL.waterY+.04){this.uniforms.uOptics.value=0;return;}
    renderer.getSize(this.size);const aspect=this.size.x/Math.max(1,this.size.y);
    const changed=!camera.matrixWorld.equals(this.previousCamera)||!camera.projectionMatrix.equals(this.previousProjection)||this.previousNight!==this.uniforms.uNight.value||aspect!==this.previousAspect||high!==this.previousHigh||this.uniforms.uOptics.value===0;
    // Camera changes while paused still produce one correct demand frame; ordinary motion is capped.
    const due=waterCaptureDue(time,this.last,changed&&time===this.last,high)||this.uniforms.uOptics.value===0||aspect!==this.previousAspect||high!==this.previousHigh;
    if(!due)return;
    this.active=true;
    const target=renderer.getRenderTarget(),background=scene.background,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,xr=renderer.xr.enabled;
    const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha();
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);renderer.getClearColor(this.clearColor);
    const waterVisible=water.visible,infoAuto=renderer.info.autoReset;
    const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
    try {
      const [w,h]=waterCaptureSize(aspect,high);
      if(this.refraction.width!==w||this.refraction.height!==h)this.refraction.setSize(w,h);
      const mirrorSize=high?512:384;if(this.mirror.getRenderTarget().width!==mirrorSize)this.mirror.getRenderTarget().setSize(mirrorSize,mirrorSize);
      clubWaterDebug.size=[w,h];
      this.selected.length=0;this.masks.length=0;
      const visit=(node:Object3D,inside=false)=>{
        const local=inside||node.name==='djc-beach-club'||node.name==='world-guide-G24';
        if((node as Object3D&{isLight?:boolean}).isLight||local&&(node as Mesh).isMesh&&node!==water){
          this.selected.push(node);this.masks.push(node.layers.mask);node.layers.enable(CAPTURE_LAYER);
        }
        for(const child of node.children)visit(child,local);
      };
      visit(scene);clubWaterDebug.selected=this.selected.length;
      water.visible=false;scene.background=null;renderer.setClearColor(0x000000,0);renderer.autoClear=true;renderer.xr.enabled=false;
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.info.autoReset=false;
      renderer.setScissorTest(false);
      renderer.setRenderTarget(this.causticTarget);renderer.render(this.causticScene,this.causticCamera);clubWaterDebug.caustics++;
      this.camera.copy(camera as PerspectiveCamera);this.camera.layers.set(CAPTURE_LAYER);this.camera.updateMatrixWorld();
      this.uniforms.uCaptureVP.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
      this.uniforms.uCaptureInverse.value.copy(this.uniforms.uCaptureVP.value).invert();this.uniforms.uCaptureEye.value.copy(this.camera.position);
      renderer.setRenderTarget(this.refraction);renderer.render(scene,this.camera);clubWaterDebug.captures++;
      const reflectDue=time-this.lastReflection>=1/(high?20:10)||changed&&time===this.last||this.uniforms.uOptics.value===0;
      if(reflectDue){
        this.mirror.getReflectionCamera(camera).layers.set(CAPTURE_LAYER);
        const mirrorMaterial=this.mirror.material as ShaderMaterial;
        this.mirror.onBeforeRender(renderer,scene,camera,this.mirrorGeometry,mirrorMaterial,null!);
        this.uniforms.uReflectionMatrix.value.copy(mirrorMaterial.uniforms.textureMatrix.value).multiply(this.inverseMirror);
        this.lastReflection=time;clubWaterDebug.reflections++;
      }
      this.uniforms.uOptics.value=1;this.last=time;this.previousCamera.copy(camera.matrixWorld);this.previousProjection.copy(camera.projectionMatrix);this.previousNight=this.uniforms.uNight.value;
      this.previousAspect=aspect;this.previousHigh=high;clubWaterDebug.passes=reflectDue?3:2;
      clubWaterDebug.calls=renderer.info.render.calls-calls;clubWaterDebug.triangles=renderer.info.render.triangles-triangles;
    }finally{
      this.selected.forEach((o,i)=>o.layers.mask=this.masks[i]);water.visible=waterVisible;scene.background=background;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.xr.enabled=xr;renderer.autoClear=autoClear;renderer.info.autoReset=infoAuto;
      renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.clearColor,alpha);this.active=false;
    }
  }
  dispose(){this.refraction.dispose();this.refraction.depthTexture?.dispose();this.mirror.dispose();this.mirrorGeometry.dispose();this.causticTarget.dispose();this.causticGeometry.dispose();this.causticMaterial.dispose();this.uniforms.uOptics.value=0;}
}

/** Apply only below the waterline of the actual basin; paving and furniture keep their material. */
export function applyPoolCaustics(material:MeshStandardMaterial,uniforms:ClubWaterUniforms){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vPoolReceiver;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPoolReceiver=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=CLUB_WATER_GLSL+'\nuniform sampler2D uCaustics;uniform float uCausticExtent,uOptics;varying vec3 vPoolReceiver;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(vPoolReceiver.y<uSurfaceY-.025 && poolDistance(vPoolReceiver.xz)<0.){
        vec2 uv=(vPoolReceiver.xz-uPoolCenter)/(2.*uCausticExtent)+.5;
        float focus=texture2D(uCaustics,uv).r*5.;
        vec2 tile=abs(fract(vPoolReceiver.xz*1.4)-.5);
        float joint=smoothstep(.47,.495,max(tile.x,tile.y));
        diffuseColor.rgb*=mix(1.,.87,joint);
        diffuseColor.rgb*=1.+uOptics*clamp(focus-1.,-.3,2.)*.65*(1.-uNight*.7);
      }`);
  };
  material.customProgramCacheKey=()=> 'club-basin-caustics-v1';material.needsUpdate=true;
  return ()=>{material.onBeforeCompile=previous;material.customProgramCacheKey=key;material.needsUpdate=true;};
}

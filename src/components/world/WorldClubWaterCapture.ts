import { Box3, Camera, Color, DepthTexture, Material, Matrix4, Mesh, Object3D, PerspectiveCamera, Plane, PlaneGeometry, Scene, ShaderMaterial, UnsignedIntType, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget, type MeshStandardMaterial } from 'three';
import { CLUB_POOL } from './djc-club-layout';
import { CLUB_WATER_GLSL, createClubCausticMaterial, type ClubWaterUniforms } from './WorldClubWaterShader';
import { budgetWaterSize,planClubWater,waterHistory } from './WorldClubWaterBudget';

const CAPTURE_LAYER=29;
const totals=()=>({captures:0,reflections:0,caustics:0,passes:0,calls:0,triangles:0,visits:0});
export const clubWaterDebug={enabled:true,budgeted:true,captures:0,reflections:0,caustics:0,passes:0,calls:0,triangles:0,size:[0,0],selected:0,
  skippedSmall:0,liveCaptures:0,coverage:1,totals:{baseline:totals(),budgeted:totals()}};
export const clubWaterSnapshot=()=>({...clubWaterDebug,totals:{baseline:{...clubWaterDebug.totals.baseline},budgeted:{...clubWaterDebug.totals.budgeted}}});
export const waterCaptureSize=(aspect:number,high:boolean):[number,number]=>{
  const width=high?1024:768;return[width,Math.max(128,Math.min(1024,Math.round(width/Math.max(.5,aspect))))];
};
export const waterCaptureDue=(time:number,last:number,changed:boolean,high:boolean)=>changed||time-last>=1/(high?30:20);

/** One visible pool only. Captures underwater colour/depth and caustics.
 * Scene reflections are intentionally absent: low-rate mirrors visibly stutter. */
export class ClubWaterCapture {
  private refraction=new WebGLRenderTarget(512,320,{depthBuffer:true});
  private causticTarget=new WebGLRenderTarget(256,256,{depthBuffer:false});
  private causticGeometry=new PlaneGeometry(2,2,128,128);
  private balancedCausticGeometry=new PlaneGeometry(2,2,64,64);
  private causticMesh:Mesh;
  private causticScene=new Scene();
  private causticCamera=new Camera();
  private causticMaterial:ShaderMaterial;
  private camera=new PerspectiveCamera();
  private previousCamera=new Matrix4();
  private previousProjection=new Matrix4();
  private viewport=new Vector4();
  private scissor=new Vector4();
  private clearColor=new Color();
  private size=new Vector2();
  private last=-Infinity;
  private previousNight=-1;
  private previousSky=new Color();
  private previousHorizon=new Color();
  private previousGlint=new Color();
  private previousSun=new Vector3();
  private previousWind=-1;
  private previousAspect=0;
  private previousHigh=false;
  private active=false;
  private disposed=false;
  private previousBudgeted=clubWaterDebug.budgeted;
  private history=waterHistory();
  private roots:Object3D[]=[];
  private lights:Object3D[]=[];
  private scannedScene:Scene|null=null;
  private scannedChildren=-1;
  private lastScan=-Infinity;
  private guide:Object3D|null=null;
  private above:Mesh[]=[];
  private box=new Box3();
  private point=new Vector3();
  private plane=new Plane();
  private clip=new Vector4();
  private q=new Vector4();
  private selected:Object3D[]=[];
  private selectedSet=new Set<Object3D>();
  private masks:number[]=[];

  constructor(private uniforms:ClubWaterUniforms){
    this.refraction.depthTexture=new DepthTexture(512,320,UnsignedIntType);
    this.causticMaterial=createClubCausticMaterial(uniforms);
    this.causticMesh=new Mesh(this.causticGeometry,this.causticMaterial);this.causticMesh.frustumCulled=false;this.causticScene.add(this.causticMesh);
    Object.assign(uniforms.uRefraction,{value:this.refraction.texture});Object.assign(uniforms.uDepth,{value:this.refraction.depthTexture});
    Object.assign(uniforms.uCaustics,{value:this.causticTarget.texture});
    clubWaterDebug.liveCaptures++;
  }
  connect(){if(this.disposed){this.disposed=false;this.history=waterHistory();this.last=-Infinity;this.uniforms.uOptics.value=0;clubWaterDebug.liveCaptures++;}}
  render(renderer:WebGLRenderer,scene:Scene,camera:Camera,water:Mesh,time:number,high:boolean,frame:{now?:number;paused?:boolean;hidden?:boolean;lightingSettled?:boolean}={}){
    if(this.active||this.disposed||frame.hidden)return;
    clubWaterDebug.passes=0;clubWaterDebug.calls=0;clubWaterDebug.triangles=0;
    const budgeted=clubWaterDebug.budgeted,now=frame.now??performance.now()/1000,paused=frame.paused??false;
    if(budgeted!==this.previousBudgeted){this.uniforms.uOptics.value=0;this.history=waterHistory();this.last=-Infinity;this.previousBudgeted=budgeted;}
    const distance=Math.hypot(camera.position.x-CLUB_POOL.center[0],camera.position.z-CLUB_POOL.center[2]);
    const near=distance<80;
    if(!clubWaterDebug.enabled||!near||camera.position.y<CLUB_POOL.waterY+.04){this.uniforms.uOptics.value=0;return;}
    renderer.getSize(this.size);const aspect=this.size.x/Math.max(1,this.size.y);
    const viewChanged=!camera.matrixWorld.equals(this.previousCamera)||!camera.projectionMatrix.equals(this.previousProjection);
    const nightChanged=this.previousNight!==this.uniforms.uNight.value||(budgeted&&(!this.previousSky.equals(this.uniforms.uWaterSkyTop.value)
      ||!this.previousHorizon.equals(this.uniforms.uWaterSkyHorizon.value)||!this.previousGlint.equals(this.uniforms.uGlint.value)
      ||!this.previousSun.equals(this.uniforms.uSunDir.value)||this.previousWind!==this.uniforms.uWind.value));
    const force=aspect!==this.previousAspect||high!==this.previousHigh||this.uniforms.uOptics.value===0;
    const changed=viewChanged||nightChanged||force;
    // Camera changes while paused still produce one correct demand frame; ordinary motion is capped.
    const legacyDue=waterCaptureDue(time,this.last,changed&&time===this.last,high)||force;
    const coverage=budgeted?this.projectedCoverage(water,camera):1;clubWaterDebug.coverage=coverage;
    if(budgeted&&coverage<.001){clubWaterDebug.skippedSmall++;return;}
    const dynamic=this.uniforms.uNight.value>.01||this.guideInWater();
    const plan=budgeted?planClubWater({now,time,high,distance,coverage,visible:true,paused,force,viewChanged,nightChanged,night:this.uniforms.uNight.value,dynamic,lightingSettled:frame.lightingSettled},this.history)
      :{refraction:legacyDue,caustic:legacyDue};
    if(!plan.refraction&&!plan.caustic)return;
    this.active=true;
    const target=renderer.getRenderTarget(),background=scene.background,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,xr=renderer.xr.enabled;
    const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha();
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);renderer.getClearColor(this.clearColor);
    const waterVisible=water.visible,infoAuto=renderer.info.autoReset;
    const before=scene.onBeforeRender,after=scene.onAfterRender;
    const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
    const count=clubWaterDebug.totals[budgeted?'budgeted':'baseline'];
    try {
      const [w,h]=budgeted?budgetWaterSize(aspect,high):waterCaptureSize(aspect,high);
      if(this.refraction.width!==w||this.refraction.height!==h)this.refraction.setSize(w,h);
      clubWaterDebug.size=[w,h];
      this.selected.length=0;this.masks.length=0;this.above.length=0;
      const visit=(node:Object3D,inside=false)=>{
        count.visits++;
        const local=inside||node.name==='djc-beach-club'||node.name==='world-guide-G24';
        if((node as Object3D&{isLight?:boolean}).isLight||local&&(node as Mesh).isMesh&&node!==water){
          this.selected.push(node);this.masks.push(node.layers.mask);node.layers.enable(CAPTURE_LAYER);
        }
        for(const child of node.children)visit(child,local);
      };
      if(budgeted)this.selectLocal(scene,water,now,count);else visit(scene);
      clubWaterDebug.selected=this.selected.length;
      water.visible=false;scene.background=null;renderer.setClearColor(0x000000,0);renderer.autoClear=true;renderer.xr.enabled=false;
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.info.autoReset=false;
      renderer.setScissorTest(false);
      // Main-scene hooks perform grass/shadow/QA work for the main camera; they must not
      // compact/upload unrelated instances again for these local auxiliary cameras.
      if(budgeted){scene.onBeforeRender=()=>{};scene.onAfterRender=()=>{};}
      if(plan.caustic){
        this.causticMesh.geometry=budgeted&&!high?this.balancedCausticGeometry:this.causticGeometry;
        renderer.setRenderTarget(this.causticTarget);renderer.render(this.causticScene,this.causticCamera);
        clubWaterDebug.caustics++;count.caustics++;count.passes++;this.history.caustic=now;this.history.causticTime=time;
      }
      if(plan.refraction){
        this.camera.copy(camera as PerspectiveCamera);this.camera.layers.set(CAPTURE_LAYER);this.camera.updateMatrixWorld();
        if(budgeted){this.clipBelowWater();for(const node of this.above)node.layers.disable(CAPTURE_LAYER);}
        this.uniforms.uCaptureVP.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
        this.uniforms.uCaptureInverse.value.copy(this.uniforms.uCaptureVP.value).invert();this.uniforms.uCaptureEye.value.copy(this.camera.position);
        renderer.setRenderTarget(this.refraction);renderer.render(scene,this.camera);
        for(const node of this.above)node.layers.enable(CAPTURE_LAYER);
        clubWaterDebug.captures++;count.captures++;count.passes++;this.history.refraction=now;
        this.previousCamera.copy(camera.matrixWorld);this.previousProjection.copy(camera.projectionMatrix);this.previousNight=this.uniforms.uNight.value;
        this.previousSky.copy(this.uniforms.uWaterSkyTop.value);this.previousHorizon.copy(this.uniforms.uWaterSkyHorizon.value);
        this.previousGlint.copy(this.uniforms.uGlint.value);this.previousSun.copy(this.uniforms.uSunDir.value);this.previousWind=this.uniforms.uWind.value;
      }
      this.uniforms.uOptics.value=1;this.last=time;
      this.previousAspect=aspect;this.previousHigh=high;clubWaterDebug.passes=Number(plan.caustic)+Number(plan.refraction);
    }finally{
      scene.onBeforeRender=before;scene.onAfterRender=after;
      clubWaterDebug.calls=Math.max(0,renderer.info.render.calls-calls);clubWaterDebug.triangles=Math.max(0,renderer.info.render.triangles-triangles);
      count.calls+=clubWaterDebug.calls;count.triangles+=clubWaterDebug.triangles;
      this.selected.forEach((o,i)=>o.layers.mask=this.masks[i]);water.visible=waterVisible;scene.background=background;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.xr.enabled=xr;renderer.autoClear=autoClear;renderer.info.autoReset=infoAuto;
      renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.clearColor,alpha);this.active=false;
    }
  }
  private projectedCoverage(water:Mesh,camera:Camera){
    const geometry=water.geometry;if(!geometry.attributes.position)return 1;
    if(!geometry.boundingBox)geometry.computeBoundingBox();const box=geometry.boundingBox;if(!box)return 1;
    let x0=1,y0=1,x1=-1,y1=-1;
    for(let i=0;i<8;i++){
      this.point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)
        .applyMatrix4(water.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      // A bound crossing the near plane cannot safely be treated as tiny.
      if(this.point.z>=-(camera as PerspectiveCamera).near)return 1;
      this.point.applyMatrix4(camera.projectionMatrix);
      x0=Math.min(x0,this.point.x);x1=Math.max(x1,this.point.x);y0=Math.min(y0,this.point.y);y1=Math.max(y1,this.point.y);
    }
    return Math.max(0,Math.min(1,x1)-Math.max(-1,x0))*Math.max(0,Math.min(1,y1)-Math.max(-1,y0))/4;
  }
  private guideInWater(){
    if(!this.guide)return false;this.guide.getWorldPosition(this.point);
    return Math.hypot((this.point.x-CLUB_POOL.center[0])/CLUB_POOL.radii[0],(this.point.z-CLUB_POOL.center[2])/CLUB_POOL.radii[1])<1.15
      &&this.point.y<CLUB_POOL.waterY+.1;
  }
  private selectLocal(scene:Scene,water:Mesh,now:number,count:ReturnType<typeof totals>){
    if(scene!==this.scannedScene||scene.children.length!==this.scannedChildren||now-this.lastScan>=1||this.roots.some(root=>!root.parent)){
      this.roots.length=0;this.lights.length=0;this.guide=null;
      scene.traverse(node=>{
        count.visits++;
        if(node.name==='djc-beach-club'||node.name==='world-guide-G24'){
          this.roots.push(node);if(node.name==='world-guide-G24')this.guide=node;
        }
        if((node as Object3D&{isLight?:boolean}).isLight)this.lights.push(node);
      });
      this.scannedScene=scene;this.scannedChildren=scene.children.length;this.lastScan=now;
    }
    this.selectedSet.clear();
    const select=(node:Object3D)=>{
      if(this.selectedSet.has(node))return;this.selectedSet.add(node);
      this.selected.push(node);this.masks.push(node.layers.mask);node.layers.enable(CAPTURE_LAYER);
    };
    for(const root of this.roots)root.traverse(node=>{
      count.visits++;
      const mesh=node as Mesh;if(!mesh.isMesh||mesh===water)return;select(mesh);
      // Only rigid, unmodified geometry can be excluded using its static bounds.
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if((mesh as Mesh&{isSkinnedMesh?:boolean}).isSkinnedMesh||(mesh as Mesh&{isInstancedMesh?:boolean}).isInstancedMesh||mesh.morphTargetInfluences?.length
        ||materials.some(m=>(m as ShaderMaterial).isShaderMaterial||m.onBeforeCompile!==Material.prototype.onBeforeCompile))return;
      if(!mesh.geometry.attributes.position)return;
      if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
      if(mesh.geometry.boundingBox&&this.box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).min.y>CLUB_POOL.waterY+.025)this.above.push(mesh);
    });
    for(const light of this.lights){
      count.visits++;
      const range=(light as Object3D&{distance?:number}).distance;
      if(range&&range>0){light.getWorldPosition(this.point);this.point.x-=CLUB_POOL.center[0];this.point.y-=CLUB_POOL.waterY;this.point.z-=CLUB_POOL.center[2];if(this.point.length()>range+29)continue;}
      select(light);
    }
  }
  private clipBelowWater(){
    this.plane.normal.set(0,-1,0);this.plane.constant=CLUB_POOL.waterY+.025;this.plane.applyMatrix4(this.camera.matrixWorldInverse);
    this.clip.set(this.plane.normal.x,this.plane.normal.y,this.plane.normal.z,this.plane.constant);
    const e=this.camera.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x)+e[8])/e[0],(Math.sign(this.clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
    const denominator=this.clip.dot(this.q);if(Math.abs(denominator)<1e-8)return;
    this.clip.multiplyScalar(2/denominator);e[2]=this.clip.x;e[6]=this.clip.y;e[10]=this.clip.z+1;e[14]=this.clip.w;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;clubWaterDebug.liveCaptures--;
    this.refraction.dispose();this.refraction.depthTexture?.dispose();
    this.causticTarget.dispose();this.causticGeometry.dispose();this.balancedCausticGeometry.dispose();this.causticMaterial.dispose();
    this.selected.length=0;this.masks.length=0;this.above.length=0;this.selectedSet.clear();this.roots.length=0;this.lights.length=0;this.guide=null;this.scannedScene=null;
    this.uniforms.uOptics.value=0;
  }
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

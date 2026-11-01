import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AnimationMixer, Bone, BufferGeometry, Float32BufferAttribute, Group, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { refineGuideBoots } from './WorldGuideShape.ts';

test('boot refinement preserves source geometry, sole Y and upper shaft attachment',()=>{
  const scene=new Group(),foot=new Bone();foot.name='footL';scene.add(foot);
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([.2,0,.1, -.1,0,-.1, .1,.14,.1],3));
  g.setAttribute('skinIndex',new Float32BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));
  g.setAttribute('skinWeight',new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const mesh=new SkinnedMesh(g);scene.add(mesh);mesh.bind(new Skeleton([foot]));
  const dispose=refineGuideBoots(scene),p=mesh.geometry.getAttribute('position');
  assert.notEqual(mesh.geometry,g);assert.equal(g.getAttribute('position').getX(0),Math.fround(.2));
  assert.ok(p.getX(0)<.19);assert.ok(p.getZ(0)<.095);assert.equal(p.getY(0),0);
  assert.equal(p.getX(2),g.getAttribute('position').getX(2));assert.equal(p.getZ(2),g.getAttribute('position').getZ(2));dispose();
});

const source=new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url);
test('local uncompressed G24 source: boot silhouette shrinks without changing the rig, within 5 mm stance drift',
  {skip:!existsSync(source)&&'the local authoring companion is optional; final production visual check remains required'},async()=>{
    const b=readFileSync(source),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');
    const original=clone(g.scene),refined=clone(g.scene),dispose=refineGuideBoots(refined);
    const points=root=>{const out=[];root.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
      const ids=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight');
      for(let i=0;i<ids.count;i++){const weights=[0,0];for(let k=0;k<4;k++){
        const name=o.skeleton.bones[ids.getComponent(i,k)]?.name;
        if(/^foot[._]?L$/.test(name))weights[0]+=w.getComponent(i,k);if(/^foot[._]?R$/.test(name))weights[1]+=w.getComponent(i,k);}
        if(Math.max(...weights)>.98)out.push({mesh:o,index:i,side:weights[0]>weights[1]?0:1});}});return out;};
    const a=points(original),c=points(refined);assert.ok(a.length>100);assert.equal(a.length,c.length);
    const min=(root,pts)=>{root.updateMatrixWorld(true);const y=[Infinity,Infinity],v=new Vector3();
      for(const {mesh,index,side}of pts){mesh.skeleton.update();v.fromBufferAttribute(mesh.geometry.getAttribute('position'),index);
        mesh.applyBoneTransform(index,v);v.applyMatrix4(mesh.matrixWorld);y[side]=Math.min(y[side],v.y);}return y;};
    for(const name of ['Idle','Walk','Run','Sprint']){
      const clip=g.animations.find(c=>c.name===name),am=new AnimationMixer(original),cm=new AnimationMixer(refined);
      am.clipAction(clip).play();cm.clipAction(clip).play();let samples=0,maxDrift=0;
      for(let i=0;i<72;i++){am.setTime(clip.duration*i/72);cm.setTime(clip.duration*i/72);const x=min(original,a),y=min(refined,c);
        for(let k=0;k<2;k++)if(x[k]<.003){samples++;maxDrift=Math.max(maxDrift,Math.abs(y[k]-x[k]));}}
      assert.ok(samples>0,`${name}: actual stance samples`);assert.ok(maxDrift<.005,`${name}: ${maxDrift} m`);
      am.stopAllAction();am.uncacheRoot(original);cm.stopAllAction();cm.uncacheRoot(refined);
    }
    dispose();
  });

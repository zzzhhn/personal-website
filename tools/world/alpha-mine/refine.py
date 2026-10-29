"""One serialized Blender process: native/fresh exchange, then two small previews.
Preview-only flora uses the runtime banks; wind/trample still need game acceptance.
"""
import sys,json,math,hashlib,subprocess
from array import array
from pathlib import Path
import bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import build,veins
from layout import OUT,VEINS

def grass():
    points=[]
    for k in range(5):
        a=k/5*math.tau+.7*(k%2);r=.03+.05*((k*7)%3)/2;lean=.16+.1*((k*3)%2)
        h=.42*(.7+.3*((k*5)%4)/3);w=.035
        bx,bz=math.cos(a)*r,math.sin(a)*r;dx,dz=math.cos(a)*lean,math.sin(a)*lean;tx,tz=-math.sin(a)*w,math.cos(a)*w
        p0=(bx-tx,0,bz-tz);p1=(bx+tx,0,bz+tz);m0=(bx-tx*.7+dx*.35,h*.55,bz-tz*.7+dz*.35);m1=(bx+tx*.7+dx*.35,h*.55,bz+tz*.7+dz*.35);tip=(bx+dx,h,bz+dz)
        points.extend([p0,p1,m1,p0,m1,m0,m0,m1,tip])
    return points

def preview_flora(layout):
    banks=json.loads((HERE/'evidence/flora-banks.json').read_text());positions=[];colors=[];counts=[0,0,0]
    prepared=json.loads((HERE/'evidence/flora-preview-instances.json').read_text())
    assert prepared['anchors']==layout['vegetation'],'Preview must use this exact manifest'
    for v in prepared['instances']:
        x,y,z=v['position'];size=v['scale'];kind=v['kind'];counts[kind]+=1;c,s=math.cos(v['yaw']),math.sin(v['yaw'])
        flat=banks['leaf'] if kind==1 else banks['bloom'] if kind==2 else banks.get('tuft') if v.get('style')==3 else None
        pts=[flat[k:k+3] for k in range(0,len(flat),3)] if flat else grass()
        for k,p in enumerate(pts):
            px,py,pz=p;positions.append(build.v3((x+size*(c*px+s*pz),y+size*py-.02,z+size*(-s*px+c*pz))))
            colors.append(tuple(banks['colour'][3*k:3*k+3])+(1,) if kind==2 else build.linear('#748044' if kind==1 else '#899344'))
    me=bpy.data.meshes.new('PREVIEW_reactive_flora');me.from_pydata(positions,[],[list(range(i,i+3)) for i in range(0,len(positions),3)]);me.update()
    m=bpy.data.materials.new('PREVIEW_flora');m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.95
    vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Col';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
    layer=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
    for p in me.polygons:
        for i in p.loop_indices:layer.data[i].color=colors[me.loops[i].vertex_index]
    me.materials.append(m);ob=bpy.data.objects.new('PREVIEW_reactive_flora',me);bpy.context.scene.collection.objects.link(ob)
    return {'grass':counts[0],'rosettes':counts[1],'flowers':counts[2],'scope':'static pose of runtime banks for composition only; not wind or trample verification'}

def composition(layout,static_path,vein_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(static_path));bpy.ops.import_scene.gltf(filepath=str(vein_path))
    for v in layout['veins']:
        root=bpy.data.objects[v['id']];root.location=build.v3(v['socket'])
        for state in ['intact','cracked','open']:
            group=bpy.data.objects[v['id']+'_'+state]
            for ob in [group]+list(group.children_recursive):ob.hide_render=state!='intact'
    # Overall preview represents undiscovered seams, as in the normal game entry.
    for m in bpy.data.materials:
        if m.name.startswith('AM_mineral_'):
            slot,route=veins.colour_factor_socket(m);original=tuple(slot.default_value)
            muted=build.linear('#92917e');slot.default_value=tuple(original[k]*.1+muted[k]*.9 for k in range(4))
    return preview_flora(layout)

def run(dynamic_only=False):
    if not dynamic_only:build.run(preview=False)
    veins.run(preview=False)
    subprocess.run(['node',str(HERE/'prepare_preview.mjs')],cwd=HERE.parents[2],check=True)
    layout=json.loads((OUT/'layout.json').read_text())
    flora=composition(layout,OUT/'quarry-static.glb',OUT/'veins.glb')
    previews=build.render_views(bpy.data.objects['alpha_mine'],views=[
        ('alpha-quarry-v3-overall',(43,34,29),(0,3,-25)),
        ('alpha-quarry-v3-seam',(-3.4,2.0,-16.5),(-7.0,1.7,-21.0))],folder=Path('/tmp'))
    previews.update({'staticSha256':hashlib.sha256((OUT/'quarry-static.glb').read_bytes()).hexdigest(),
        'veinsSha256':hashlib.sha256((OUT/'veins.glb').read_bytes()).hexdigest(),'flora':flora,
        'scope':'exact fresh GLBs; temporary flat host ground/lights/water and flora pose; no browser or creative approval claim'})
    (HERE/'evidence/quarry-v3-preview.json').write_text(json.dumps(previews,indent=1)+'\n')
    print('AM_REFINEMENT_PASS',previews['images'],flush=True)

def side_by_side(left,right,target):
    a=bpy.data.images.load(str(left),check_existing=False);b=bpy.data.images.load(str(right),check_existing=False)
    w,h=a.size;assert list(b.size)==[w,h]
    pa=array('f',[0])*(w*h*4);pb=array('f',[0])*(w*h*4);a.pixels.foreach_get(pa);b.pixels.foreach_get(pb)
    combined=array('f');stride=w*4
    for row in range(h):combined.extend(pa[row*stride:(row+1)*stride]);combined.extend(pb[row*stride:(row+1)*stride])
    out=bpy.data.images.new(target.stem,width=w*2,height=h,alpha=True)
    out.colorspace_settings.name=a.colorspace_settings.name;out.pixels.foreach_set(combined)
    out.filepath_raw=str(target);out.file_format='PNG';out.save()
    for im in [a,b,out]:bpy.data.images.remove(im)

def comparison_run():
    baseline=Path('/tmp/quarry-layered-baseline')
    assert all((baseline/name).exists() for name in ['layout.json','quarry-static.glb','veins.glb'])
    build.run(preview=False);veins.run(preview=False)
    views=[('entrance',(2.8,1.55,-7.0),(-5.5,3.0,-24.0)),
           ('seam',(-3.4,1.55,-16.5),(-7.0,1.65,-21.0))]
    receipts={}
    for label,folder in [('before',baseline),('after',OUT)]:
        path=folder/'layout.json';layout=json.loads(path.read_text())
        subprocess.run(['node',str(HERE/'prepare_preview.mjs'),str(path)],cwd=HERE.parents[2],check=True)
        flora=composition(layout,folder/'quarry-static.glb',folder/'veins.glb')
        receipts[label]=build.render_views(bpy.data.objects['alpha_mine'],
            views=[(f'quarry-v4-{label}-{name}',p,t) for name,p,t in views],folder=Path('/tmp'),resolution=(640,640))
        receipts[label].update(flora=flora,staticSha256=hashlib.sha256((folder/'quarry-static.glb').read_bytes()).hexdigest(),
            veinsSha256=hashlib.sha256((folder/'veins.glb').read_bytes()).hexdigest())
    results=[]
    for name,_,_ in views:
        target=Path('/tmp')/f'quarry-v4-{name}-comparison.png'
        side_by_side(Path('/tmp')/f'quarry-v4-before-{name}.png',Path('/tmp')/f'quarry-v4-after-{name}.png',target);results.append(str(target))
    report={'baseline':'3870aef','panes':{'left':'baseline','right':'candidate'},'images':results,'resolution':[1280,640],
        'runs':receipts,'sameLightingAndColorManagement':True,'floraSource':'same current runtime bank in both panes',
        'limits':'exact GLB asset comparison; not browser, wind/trample, long-running performance or user acceptance'}
    (HERE/'evidence/layered-comparison.json').write_text(json.dumps(report,indent=1)+'\n')
    print('AM_LAYERED_COMPARISON_PASS',results,flush=True)

def detail_run():
    build.run(preview=False)
    qa=json.loads((HERE/'evidence/batch1-qa.json').read_text())
    assert qa['freshGLB']['triangles']<=70513*1.2 and qa['freshGLB']['meshCount']==6,'Agreed asset budget'
    veins.run(preview=False)
    subprocess.run(['node',str(HERE/'prepare_preview.mjs')],cwd=HERE.parents[2],check=True)
    layout=json.loads((OUT/'layout.json').read_text())
    flora=composition(layout,OUT/'quarry-static.glb',OUT/'veins.glb')
    result=build.render_views(bpy.data.objects['alpha_mine'],views=[
        ('quarry-v4-fracture-detail',(-3.4,1.55,-16.5),(-7.0,1.65,-21.0))],folder=Path('/tmp'),resolution=(960,760))
    result.update(staticSha256=qa['glbSha256'],veinsSha256=hashlib.sha256((OUT/'veins.glb').read_bytes()).hexdigest(),flora=flora,
        supersedes='layered-comparison candidate; comparison panes remain historical evidence of the first pass')
    (HERE/'evidence/layered-detail-preview.json').write_text(json.dumps(result,indent=1)+'\n')
    print('AM_FRACTURE_DETAIL_PASS',result['images'],flush=True)

if __name__=='__main__':
    if 'detail' in sys.argv:detail_run()
    elif 'comparison' in sys.argv:comparison_run()
    else:run(dynamic_only='dynamic-only' in sys.argv)

"""Prove that r2 changes only wood factor and AO, with the original UV atlas."""
from pathlib import Path
from io import BytesIO
import json,struct,hashlib
from PIL import Image,ImageDraw,ImageFilter
import numpy as np

TOOLS=Path(__file__).resolve().parent
BASE=TOOLS.parents[2]/'docs/world/phase-2-playground/djc-pool-lantern-craft-20261101'
OUT=BASE/'r2'

def load(path):
    blob=path.read_bytes();n=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+n]);off=20+n
    return g,blob[off+8:],blob

def accessor(g,b,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    size={5121:1,5123:2,5125:4,5126:4}[a['componentType']]*n;stride=v.get('byteStride',size)
    start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return b''.join(b[start+j*stride:start+j*stride+size] for j in range(a['count']))

def geometry(g,b):
    result={}
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            name=g['materials'][p['material']]['name'];item={}
            for key in ['POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1']:
                item[key]=hashlib.sha256(accessor(g,b,p['attributes'][key])).hexdigest()
            item['indices']=hashlib.sha256(accessor(g,b,p['indices'])).hexdigest();result[name]=item
    return result

def image(g,b,ref):
    src=g['textures'][ref['index']]['source'];im=g['images'][src];v=g['bufferViews'][im['bufferView']]
    return Image.open(BytesIO(b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')

def cloth_ao_stats(g,b):
    mi=next(i for i,m in enumerate(g['materials']) if 'Diffuser' in m['name'])
    p=next(p for mesh in g['meshes'] for p in mesh['primitives'] if p['material']==mi)
    def floats(key,n):return np.frombuffer(accessor(g,b,p['attributes'][key]),dtype='<f4').reshape(-1,n)
    pos=floats('POSITION',3);no=floats('NORMAL',3);uv=floats('TEXCOORD_1',2)
    component=g['accessors'][p['indices']]['componentType'];indices=np.frombuffer(accessor(g,b,p['indices']),dtype={5123:'<u2',5125:'<u4'}[component]).reshape(-1,3)
    im=image(g,b,g['materials'][mi]['occlusionTexture']).getchannel('R');mask=Image.new('L',im.size);draw=ImageDraw.Draw(mask)
    for t in indices:
        center=pos[t].mean(axis=0);normal=no[t].mean(axis=0)
        if normal[2]>.9 and center[2]>.0938 and abs(center[0])<.065 and .475<center[1]<.665:
            draw.polygon([(float(uv[j,0]*im.width),float(uv[j,1]*im.height)) for j in t],fill=255)
    select=np.array(mask)>0;a=np.array(im,dtype=float);median=np.array(im.filter(ImageFilter.MedianFilter(5)),dtype=float)
    return dict(pixels=int(select.sum()),mean_rgb255=float(a[select].mean()),std_rgb255=float(a[select].std()),percentiles=np.percentile(a[select],[1,10,50,90,99]).tolist(),high_frequency_residual_std_5pxmedian_rgb255=float((a-median)[select].std()))

old,ob,old_blob=load(BASE/'r1-archive/pool-lantern-v1.glb')
new,nb,blob=load(OUT/'pool-lantern-r2.glb')
old_geom=geometry(old,ob);new_geom=geometry(new,nb);assert old_geom==new_geom,'Geometry or UV changed'
assert len(new['materials'])==4 and len(new_geom)==4
assert all(m['occlusionTexture'].get('texCoord',0)==1 and m.get('alphaMode','OPAQUE')=='OPAQUE' for m in new['materials'])
assert not {'KHR_materials_transmission','KHR_lights_punctual'}.intersection(new.get('extensionsUsed',[]))
unchanged=[]
for mat in new['materials']:
    previous=next(m for m in old['materials'] if m['name']==mat['name'])
    for key in ['normalTexture']:
        if key in previous:
            assert previous[key].get('scale',1)==mat[key].get('scale',1)
            assert image(old,ob,previous[key]).tobytes()==image(new,nb,mat[key]).tobytes()
            unchanged.append(mat['name']+' '+key)
    pm=previous['pbrMetallicRoughness'];nm=mat['pbrMetallicRoughness']
    if 'baseColorTexture' in pm:
        assert image(old,ob,pm['baseColorTexture']).tobytes()==image(new,nb,nm['baseColorTexture']).tobytes()
        unchanged.append(mat['name']+' baseColor image')
    if 'metallicRoughnessTexture' in pm:
        a=image(old,ob,pm['metallicRoughnessTexture']);b=image(new,nb,nm['metallicRoughnessTexture'])
        assert a.getchannel('G').tobytes()==b.getchannel('G').tobytes()
        unchanged.append(mat['name']+' roughness pixels')
    assert pm.get('roughnessFactor',1)==nm.get('roughnessFactor',1)
    assert pm.get('metallicFactor',1)==nm.get('metallicFactor',1)
    if 'Timber' not in mat['name']:assert pm.get('baseColorFactor',[1,1,1,1])==nm.get('baseColorFactor',[1,1,1,1])
    assert previous.get('extras',{})==mat.get('extras',{})
    assert previous['occlusionTexture'].get('strength',1)==mat['occlusionTexture'].get('strength',1)==1
wood=next(m for m in new['materials'] if 'Timber' in m['name']);assert wood['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1])==[1,1,1,1]
diffuser=next(m for m in new['materials'] if 'Diffuser' in m['name']);assert diffuser['extras']['djcRole']=='emissive-diffuser'
assert diffuser['normalTexture']['scale']==next(m for m in old['materials'] if 'Diffuser' in m['name'])['normalTexture']['scale']
image_bytes=sum(new['bufferViews'][im['bufferView']]['byteLength'] for im in new.get('images',[]))
report=dict(geometry_and_indices_and_UV0_UV1_byte_identical=True,attribute_hashes=new_geom,unchanged_maps=unchanged,wood_baseColorFactor=[1,1,1,1],triangles=sum(new['accessors'][p['indices']]['count']//3 for mesh in new['meshes'] for p in mesh['primitives']),materials=4,primitives=4,glb_bytes=len(blob),image_bytes=image_bytes,glb_sha256=hashlib.sha256(blob).hexdigest(),parent_sha256=hashlib.sha256(old_blob).hexdigest())
report['cloth_ao_same_pixel_region']={'r1':cloth_ao_stats(old,ob),'r2':cloth_ao_stats(new,nb)}
assert report['triangles']==11304
(OUT/'r2-contract-validation.json').write_text(json.dumps(report,indent=2)+'\n')
info=json.loads((OUT/'r2-validation.json').read_text());info['binary_contract']=report
info['scripts']={f:hashlib.sha256((TOOLS/f).read_bytes()).hexdigest() for f in ['build-r2.py','verify-r2.py','run.py']}
(OUT/'r2-validation.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['geometry_and_indices_and_UV0_UV1_byte_identical','triangles','materials','glb_bytes','image_bytes','glb_sha256']}))
print(json.dumps(report['cloth_ao_same_pixel_region']))

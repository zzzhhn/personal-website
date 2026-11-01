"""Read-only GLB/PBR/mipmap evidence. No Blender, render, or asset mutation."""
import argparse, hashlib, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

def load(path):
    raw=Path(path).read_bytes()
    assert raw[:4]==b'glTF'
    size=struct.unpack_from('<I',raw,12)[0]
    data=json.loads(raw[20:20+size])
    binary=raw[28+size:]
    return raw,data,binary

def embedded_image(data,binary,index):
    item=data['images'][index];view=data['bufferViews'][item['bufferView']]
    payload=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    return Image.open(io.BytesIO(payload)).convert('RGB')

def mip_evidence(im,srgb):
    rgb=np.asarray(im,dtype=np.float32)/255
    if srgb:rgb=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    channel=rgb[:,:,1]
    original_std=float(channel.std())
    result=[]
    for width in (2048,1024,512,256,128,64):
        reduced=np.asarray(Image.fromarray(channel).resize((width,width),Image.Resampling.BOX))
        result.append(dict(size=width,mean=float(reduced.mean()),std=float(reduced.std()),std_retained=float(reduced.std()/original_std)))
    return result

def inspect(path,public=None):
    raw,data,binary=load(path)
    result=dict(file=str(path),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),materials=[],images=[],primitives=[],cloth_mips={})
    if public:result['public_bytes_identical']=Path(public).read_bytes()==raw
    for i,im in enumerate(data['images']):
        decoded=embedded_image(data,binary,i)
        result['images'].append(dict(index=i,name=im.get('name'),size=list(decoded.size)))
    for material in data['materials']:
        pbr=material.get('pbrMetallicRoughness',{})
        result['materials'].append(dict(name=material.get('name'),has_ao='occlusionTexture' in material,ao=material.get('occlusionTexture'),base_factor=pbr.get('baseColorFactor',[1,1,1,1]),base_texture=pbr.get('baseColorTexture'),normal_texture=material.get('normalTexture'),roughness_texture=pbr.get('metallicRoughnessTexture')))
        if material.get('name','').startswith('03 '):
            for name,ref,srgb in [('color',pbr['baseColorTexture'],True),('roughness',pbr['metallicRoughnessTexture'],False)]:
                index=data['textures'][ref['index']]['source']
                result['cloth_mips'][name]=mip_evidence(embedded_image(data,binary,index),srgb)
    for mesh in data['meshes']:
        for primitive in mesh['primitives']:
            attrs=primitive['attributes'];result['primitives'].append(dict(material=primitive['material'],vertices=data['accessors'][attrs['POSITION']]['count'],uv_sets=sorted(k for k in attrs if k.startswith('TEXCOORD_'))))
    result['total_vertices']=sum(p['vertices'] for p in result['primitives'])
    result['estimated_uv1_attribute_bytes_without_new_seams']=result['total_vertices']*8
    result['authored_cloth']=dict(tile_m=.75,thread_cycles_per_tile=384,thread_pitch_mm=.75/384*1000,projected_pillow_width_px_estimate=[140,180],pillow_width_m=.66,pixels_per_thread_estimate=[140/.66*.75/384,180/.66*.75/384],fractional_mip_level_estimate=[float(np.log2((.66/.75*2048)/180)),float(np.log2((.66/.75*2048)/140))])
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('glb',type=Path);parser.add_argument('--public',type=Path);parser.add_argument('--out',type=Path)
    args=parser.parse_args();result=inspect(args.glb,args.public)
    encoded=json.dumps(result,indent=2)
    if args.out:args.out.write_text(encoded)
    else:print(encoded)

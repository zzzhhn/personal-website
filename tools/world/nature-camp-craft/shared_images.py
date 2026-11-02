"""Externalize GLB image bytes under content-addressed shared URLs, preserving all mesh data."""
import hashlib
import json
from pathlib import Path
import struct


def externalize(path):
    path=Path(path);raw=path.read_bytes();assert raw[:4]==b'glTF'
    length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);offset=20+length
    binary=raw[offset+8:offset+8+struct.unpack_from('<I',raw,offset)[0]]
    views=doc.get('bufferViews',[]);removed=set();records=[]
    folder=path.parent/'textures';folder.mkdir(exist_ok=True)
    for im in doc.get('images',[]):
        if 'bufferView' not in im:continue
        old=im.pop('bufferView');view=views[old];removed.add(old)
        start=view.get('byteOffset',0);data=binary[start:start+view['byteLength']]
        digest=hashlib.sha256(data).hexdigest();extension='jpg' if im.get('mimeType')=='image/jpeg' else 'png'
        uri='textures/'+digest[:24]+'.'+extension;target=path.parent/uri
        if target.exists():assert target.read_bytes()==data
        else:target.write_bytes(data)
        im['uri']=uri;records.append({'name':im.get('name'),'uri':uri,'sha256':digest,'bytes':len(data)})
    mapping={};newviews=[];newbin=bytearray()
    for old,view in enumerate(views):
        if old in removed:continue
        mapping[old]=len(newviews);v=dict(view);start=v.get('byteOffset',0)
        newbin.extend(b'\0'*(-len(newbin)%4));v['byteOffset']=len(newbin)
        newbin.extend(binary[start:start+v['byteLength']]);newviews.append(v)
    def remap(value):
        if isinstance(value,dict):
            for key,child in value.items():
                if key=='bufferView':value[key]=mapping[child]
                else:remap(child)
        elif isinstance(value,list):
            for child in value:remap(child)
    doc['bufferViews']=newviews;remap(doc);doc['buffers'][0]['byteLength']=len(newbin)
    # Blender can emit one identical texture/sampler record per material even
    # though image bytes are shared. Canonicalize those handles too; per-material
    # normal scale and texture transforms remain on the material textureInfo.
    unique=[];by_signature={};texture_indices={}
    for old,texture in enumerate(doc.get('textures',[])):
        signature=json.dumps(texture,sort_keys=True,separators=(',',':'))
        if signature not in by_signature:
            by_signature[signature]=len(unique);unique.append(texture)
        texture_indices[old]=by_signature[signature]
    def texture_infos(value):
        if isinstance(value,dict):
            for key,child in value.items():
                if key.endswith('Texture') and isinstance(child,dict) and 'index' in child:
                    child['index']=texture_indices[child['index']]
                else:texture_infos(child)
        elif isinstance(value,list):
            for child in value:texture_infos(child)
    texture_infos(doc.get('materials',[]));doc['textures']=unique
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*(-len(encoded)%4)
    newbin.extend(b'\0'*(-len(newbin)%4))
    total=12+8+len(encoded)+8+len(newbin)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(newbin),0x004E4942)+newbin)
    return records

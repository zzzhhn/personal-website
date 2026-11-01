"""C05-only real mineral/bark response. No geometry, bounds or other families change.
Read-only, already licensed local Poly Haven 1K scans; no network/download.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np

PBR=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-bruno/static/bay/assets/coast-natural/pbr')

def photo(family,role,size):
 manifest=json.loads((PBR/'SOURCES.json').read_text());asset=next(a for a in manifest['assets'] if a['family']==family)
 filename=f'{family}-{role}.jpg';entry=next(m for m in asset['maps'] if m['file']==filename);path=PBR/filename
 assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],'Licensed local scan hash mismatch'
 im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='sRGB' if role=='color' else 'Non-Color'
 if tuple(im.size)!=(size,size):im.scale(size,size)
 im.pack()
 provenance=dict(file=str(path),sha256=entry['sha256'],url=entry['url'],asset=asset['source'],authors=asset['authors'],license=manifest['license'],license_url=manifest['license_url'],original_dimensions=[1024,1024],color_space=im.colorspace_settings.name,usage_dimensions=[size,size])
 return im,provenance

def pixels(im):
 data=np.empty(im.size[0]*im.size[1]*4,np.float32);im.pixels.foreach_get(data);return data.reshape(im.size[1],im.size[0],4)[:,:,:3]

def roughness(build,material,arm,name,minimum,span):
 # Use the scan's linear roughness G only. AO R is intentionally not baked in.
 rough=np.clip(minimum+span*pixels(arm)[:,:,1],0,1)
 build.connect(material,build.image(name,np.repeat(rough[:,:,None],3,2),True),'Roughness')

def refine_materials(original,build):
 M=dict(original);sources=json.loads((build.OUT/'texture-sources.json').read_text())
 M['stone']=build.material('C05 Rock Face 03 | photographed mineral and chipped face','ffffff',.85)
 for role,size in [('color',1024),('normal',512),('arm',512)]:
  im,record=photo('stone',role,size);record['derivative']='Read-only scan; no base-color tint. Normal GL at strength .55; roughness = .67 + .28 * linear ARM G; AO R unused.';sources.append(record)
  if role=='color':build.connect(M['stone'],im,'Base Color')
  elif role=='normal':build.normal(M['stone'],im,.55)
  else:roughness(build,M['stone'],im,'C05 scanned mineral roughness 512',.67,.28)
 M['char']=build.material('C05 charcoal | adapted photographed willow fissures','ffffff',.94)
 for role,size in [('color',512),('normal',512),('arm',512)]:
  im,record=photo('bark',role,size);record['derivative']='Photographed bark morphology adapted to charred firewood; not a charcoal scan. Authored charcoal pigment uses luminance normalization, warm near-black .018..088; normal .68; roughness .78+.20*ARM G.';sources.append(record)
  if role=='color':
   values=pixels(im);luma=values@np.array([.2126,.7152,.0722]);lo,hi=np.percentile(luma,[2,98]);variation=np.clip((luma-lo)/max(hi-lo,1e-6),0,1)
   values=(.018+.07*variation**.9)[:,:,None]*np.array([1.05,1,.9]);build.connect(M['char'],build.image('C05 adapted scanned bark charcoal pigment 512',values),'Base Color')
  elif role=='normal':build.normal(M['char'],im,.68)
  else:roughness(build,M['char'],im,'C05 scanned bark charcoal roughness 512',.78,.20)
 # Separate the soft, powdery ash bed from the long fissured charred logs.
 M['ash']=build.material('C05 pale granular ash | authored powder response','ffffff',.98)
 rng=np.random.default_rng(110105);grain=rng.random((256,256))
 # Nonperiodic submillimeter powder, rather than two interference frequencies
 # that produced an implausible diagonal grid in the first C05-only render.
 build.authored(M['ash'],'C05 authored pale ash','a6a198',grain,.0002,contrast=.15)
 rough=.94+.06*grain;build.connect(M['ash'],build.image('C05 authored powder roughness 256',np.repeat(rough[:,:,None],3,2),True),'Roughness')
 sources.append(dict(source='c05_surface.py',license='original task output',usage='256px authored ash color/normal/roughness, no photographed source and no AO'))
 M['c05_photo']=True
 (build.OUT/'texture-sources.json').write_text(json.dumps(sources,indent=2));return M

def stone_uv(o,index):
 """Select the true face projection on every wall, including diagonal walls.
 The previous XY-only diagonal faces stretched the map along the full height.
 """
 layer=o.data.uv_layers.new(name='UVMap');tile=.65;offset=(index*.137%1,index*.231%1)
 for face in o.data.polygons:
  dominant=max(range(3),key=lambda k:abs(face.normal[k]));axes=[k for k in range(3) if k!=dominant]
  for li in face.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;layer.data[li].uv=(co[axes[0]]/tile+offset[0],co[axes[1]]/tile+offset[1])

def log_uv(o,a,b,r,index):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0));u=axis.cross(ref).normalized();w=axis.cross(u)
 layer=o.data.uv_layers.active;tile=.45
 for face in o.data.polygons:
  middle=sum((o.data.vertices[k].co for k in face.vertices),Vector())/len(face.vertices)-a
  angle=math.atan2(middle.dot(w),middle.dot(u))
  for li in face.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co-a
   if abs(face.normal.dot(axis))>.9:pair=(co.dot(u)/tile+.5,co.dot(w)/tile+.5)
   else:
    theta=angle+math.atan2(math.sin(math.atan2(co.dot(w),co.dot(u))-angle),math.cos(math.atan2(co.dot(w),co.dot(u))-angle));pair=(theta*r/tile+index*.17,co.dot(axis)/tile+.23)
   layer.data[li].uv=pair

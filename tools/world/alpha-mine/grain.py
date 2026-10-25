"""One small, generated, portable surface-grain tile. No external assets or 4K maps."""
import bpy, math

def hash2(x,y):return (math.sin(x*127.1+y*311.7)*43758.5453)%1

def image():
    existing=bpy.data.images.get('AM_surface_grain')
    if existing:return existing
    size=512;pixels=[]
    for y in range(size):
        for x in range(size):
            cx=x//9;cy=y//9;nearest=100
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    gx=cx+dx;gy=cy+dy
                    px=(gx+.15+.7*hash2(gx%57,gy%57))*9
                    py=(gy+.15+.7*hash2((gx+19)%57,(gy+7)%57))*9
                    nearest=min(nearest,math.hypot(x-px,y-py))
            fine=hash2(x,y);grain=max(0,1-nearest/4.8)
            value=.72+.14*fine+.14*grain
            pixels.extend((value,value,value,1))
    im=bpy.data.images.new('AM_surface_grain',width=size,height=size,alpha=False)
    im.colorspace_settings.name='sRGB';im.pixels.foreach_set(pixels);im.file_format='PNG';im.pack()
    return im

def link(material,vertex_color,bsdf):
    nodes=material.node_tree.nodes;links=material.node_tree.links
    tex=nodes.new('ShaderNodeTexImage');tex.image=image();tex.interpolation='Linear';tex.extension='REPEAT'
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    links.new(vertex_color.outputs['Color'],mix.inputs[1]);links.new(tex.outputs['Color'],mix.inputs[2]);links.new(mix.outputs['Color'],bsdf.inputs['Base Color'])

def uv(mesh):
    layer=mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        normal=p.normal;axis=max(range(3),key=lambda k:abs(normal[k]))
        for i in p.loop_indices:
            v=mesh.vertices[mesh.loops[i].vertex_index].co
            pair=(v.x,-v.y) if axis==2 else ((v.x,v.z) if axis==1 else (-v.y,v.z))
            layer.data[i].uv=(pair[0]/.95,pair[1]/.95)

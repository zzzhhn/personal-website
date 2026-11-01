"""Product views from the actual fresh-imported far GLBs; keeps the original L0 sources untouched."""
import bpy,os,sys
sys.path.insert(0,os.path.join(os.getcwd(),'tools/world/vehicles'))
import vehlib as V
V.EVID_DIR='/Users/bobby/Desktop/3D-personal-world/evidence/vehicles-integration/lod-renders'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for asset in (args[:1] if args and args[0] in ('G25','G26','G27') else ['G25','G26','G27']):
 V.reset_scene();bpy.ops.import_scene.gltf(filepath=os.path.join(V.GLB_DIR,asset+'-lod1.glb'))
 root=bpy.data.objects[asset];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 V.render_views(asset+'-lod1',root,meshes)

"""Headless Blender probe: prints the version and glTF exporter availability (used to verify blender-run.sh)."""
import bpy, addon_utils
print('BLENDER', bpy.app.version_string)
print('GLTF', any(m.__name__ == 'io_scene_gltf2' for m in addon_utils.modules()))


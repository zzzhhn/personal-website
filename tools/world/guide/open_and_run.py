"""blender-run.sh helper: open tools/world/guide/blend/G24.blend, then run another guide script in it.
Usage: blender-run.sh character tools/world/guide/open_and_run.py <script.py in tools/world/guide> [args...]
(sys.argv after '--' is passed through, so export_guide.py still sees e.g. 'candidate')."""
import bpy, os, sys, runpy
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
script = os.path.join(HERE, os.path.basename(args[0]))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'blend', 'G24.blend'))
sys.argv = [script, '--'] + args[1:]
runpy.run_path(script, run_name='__main__')

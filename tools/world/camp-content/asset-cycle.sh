#!/bin/sh
# build -> QA (native vs fresh GLB import) -> six-view renders -> contact sheet, for one asset.
# usage: asset-cycle.sh <ID> <round-suffix>
set -e
B=/Users/bobby/Desktop/3D-personal-world/tools/blender-run.sh
R=/Users/bobby/Desktop/3D-personal-world/wt/camp
E=/Users/bobby/Desktop/3D-personal-world/evidence/camp/assets
mkdir -p $E
$B camp tools/world/camp-content/build_assets.py "$1" 2>&1 | grep -E 'Error|Traceback|wrote|line [0-9]' || true
$B camp tools/world/camp-content/qa_assets.py $R $E/qa_$1.json "$1" 2>&1 | grep -E '\[qa\]|Error|Traceback' || true
$B camp tools/world/camp-content/render_views.py $R $E "$1" 2>&1 | grep -E 'Error|Traceback' || true
cd $R/tools/world/camp-content && python3 compose_sheets.py $E "$2" "$1"

#!/bin/sh
# Download the CMU takes used by G24 into ~/.cache/g24-cmu and verify SHA-256 (see SOURCES.sha256).
# Data: CMU Graphics Lab Motion Capture Database, http://mocap.cs.cmu.edu/ (free for all uses;
# may be included in products, may not be resold directly, even converted). Not committed.
set -e
H=$(cd "$(dirname "$0")" && pwd); D="${1:-$HOME/.cache/g24-cmu}"; mkdir -p "$D"; cd "$D"
for f in 35/35.asf 35/35_01.amc 35/35_02.amc 35/35_03.amc 9/09.asf 9/09_01.amc 9/09_02.amc 9/09_03.amc 9/09_04.amc 9/09_05.amc 9/09_06.amc 9/09_07.amc 9/09_08.amc 9/09_09.amc 9/09_11.amc \
         143/143.asf 143/143_01.amc 141/141.asf 141/141_01.amc 16/16.asf 16/16_01.amc 16/16_02.amc \
         75/75.asf 75/75_02.amc 75/75_03.amc; do
  b=$(basename "$f"); s=$(dirname "$f"); [ ${#s} -eq 1 ] && s="0$s"
  [ -s "$b" ] || curl -sfL -o "$b" "http://mocap.cs.cmu.edu/subjects/$s/$b"
done
shasum -a 256 -c "$H/SOURCES.sha256"

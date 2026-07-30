#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
session="evalforge-preview-capture"
capture_dir="$(mktemp -d)"

cleanup() {
  agent-browser --session "$session" close >/dev/null 2>&1 || true
  rm -rf "$capture_dir"
}
trap cleanup EXIT

command -v agent-browser >/dev/null
command -v cwebp >/dev/null

agent-browser --session "$session" close >/dev/null 2>&1 || true
agent-browser --session "$session" set viewport 1280 800
agent-browser --session "$session" set media dark
agent-browser --session "$session" open "https://evaluation.bobbyzhong.com"
agent-browser --session "$session" wait --load networkidle
agent-browser --session "$session" screenshot "$capture_dir/evalforge-dark.png"

agent-browser --session "$session" find role button click --name "切换明暗主题"
agent-browser --session "$session" wait 500
agent-browser --session "$session" screenshot "$capture_dir/evalforge-light.png"

cwebp -quiet -q 88 -resize 640 400 "$capture_dir/evalforge-dark.png" \
  -o "$repo_root/public/projects/evalforge.webp"
cwebp -quiet -q 88 -resize 640 400 "$capture_dir/evalforge-light.png" \
  -o "$repo_root/public/projects/evalforge-light.webp"

echo "Captured matching 640x400 EvalForge dark/light site snapshots."

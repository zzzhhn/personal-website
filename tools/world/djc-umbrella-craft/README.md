# Club umbrella reproducibility

Only this tool directory and `docs/world/phase-2-playground/djc-umbrella-craft-20261101/` are owned by this task. Do not change runtime, public assets or the shared material Skill.

The three `baseline-*` sources were frozen from release revision `34754d2`. `capture-baseline.mjs` instruments the frozen exact `add` path and captures the first pole and canopy only. It does not reconstruct the old geometry or include the lounger. Its result is a source-faithful offline before, not a browser screenshot.

After explicit coordinator permission for heavy work, from the release root:

```sh
node tools/world/djc-umbrella-craft/capture-baseline.mjs
/usr/bin/python3 tools/world/djc-umbrella-craft/run.py --allow-heavy --preview
```

Read `umbrella-before.png` and `umbrella-after.png`; fix the largest construction or material issue in `build.py`, repeat the affected phase. Keep reference images and final file identities clear. Then:

```sh
/usr/bin/python3 tools/world/djc-umbrella-craft/run.py --allow-heavy --finish
```

Read actual fresh import close/top and clay images, including reverse fabric and hinge supports. For an existing final GLB, with the same heavy permission:

```sh
/usr/bin/python3 tools/world/djc-umbrella-craft/run.py --allow-heavy --verify
```

`run.py` performs resource preflight and acquires the shared heavy FILE lock using `O_CREAT | O_EXCL`. It never removes another owner's lock, and it caps one Blender job at 600 seconds and four CPU threads. No automatic wait or competing heavy process is started when the lock is held.

Preview saves editable independent named parts. Finish copies and batches by four physical materials, applies transforms, exports GLB with one Y-up conversion, fresh-imports into an empty scene and validates dimensions, root identity, triangles, materials and embedded images. The baseline and presentation collections are excluded. Images and native asset are hashed in the manifest. Numerical checks and offline visual review do not establish browser cost, daylight/night appearance, collisions or user acceptance.

Current state: capture, preview and finish completed; final fresh underside/top/clay were actually read. Native and final export checks passed. The sloped pocket repair is present in the final native asset and GLB. The heavy window is closed and its FILE lock was released. Runtime browser validation remains with the coordinator.

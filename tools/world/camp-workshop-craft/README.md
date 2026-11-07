# Camp study and tool wall

C08 changes the old block-shaped stack into a small reading station with separate covers, recessed page blocks, bound spines, an open ruled journal, a closed index and a pencil. The lower cover sits at the original desk datum. The open right leaf spans the existing page-flip rectangle, and its top at 0.333 m leaves 2 mm under the animated paper. The front of the notebook case extends 3 cm past the old book envelope, onto the same tabletop.

C11 keeps the five category icons in the original order and preserves the label metadata byte for byte. The upright, skids and rear braces still meet the same support datums. Ash icon cards, pegboard rails, cap boards and tray joinery separate the upper display from the lower hand tools. Hammer, wrench, screwdriver, handsaw and pliers use shaped steel, timber and molded/dipped grips. The fixed pegs line up with the original C11_tools translation, so the legacy wobble continues on the same axis.

## Inputs and outputs

- `baseline/C08.glb` and `baseline/C11.glb` are the unchanged input blobs from revision `3c66e8da538e83a9bbc56aa65592251b87764cca`. `manifest.json` records their SHA-256 hashes.
- `workshop.blend` is the editable source in meters, Z up, +X facing forward. Original input geometry and the review rig have separate collections.
- `maps/` contains original procedural images from `surfaces.py`, created for this project. Shared 128 px bookcloth normals are Non-Color. 256 px oak, ash, paper edge and the two ruled leaf images are sRGB. The runtime GLB embeds the six source maps and a shared 32 px ORM palette. The palette uses 8×8 constant swatches with 4 texels of padding around each sample.
- `public/assets/world/camp-workshop-craft/camp-workshop.glb` contains seven batches for C08, five for C11_body and three for C11_tools. Compatible flat surfaces and the three cloth colors use linear COLOR_0 and a shared metallic-roughness texture on TEXCOORD_1. Wood, paper and cloth retain UV0, their original texture response and the cast-shadow categories. C11_tools retains its authored pivot in the pack. The runtime adapter strips only that selected root's transform because the existing animation parent supplies it.
- `first-export.json` preserves the hashes of the first native and runtime files produced by the generator. `manifest.json` records the checked files, Blender version, bounds, UV and triangle audit, and the matched offline review rig. `manifest-prebatch.json` and `evidence/prebatch/` preserve the checked 26-batch comparison. Runtime screenshots and input acceptance live with the integrated camp batch.

Run from the worktree root.

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --threads 2 --python-exit-code 1 -P tools/world/camp-workshop-craft/build.py
```

Pass `-- --skip-review` for source, GLB and audits without offline rendering. The generator compares freshly reimported triangles, UV coverage, material assignments, bounds and fixed art datums. The existing game colliders, label canvas, page flip and tool feedback are supplied by the parent scene. The adapter keeps UV0 and exported PBR channels, borrows the established outdoor reflection cache, and adjusts its private material copies with the existing world night factor.

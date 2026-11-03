# Intake roller supports

The accepted material baseline is `7789327`, with matched captures and runtime readbacks at `fba5d04`. Style follows the approved coaster v4 direction. The fixed encounter camera remains position `[31.1, 3.55, -115.6]`, target `[34, 2.25, -122]`, FOV 50°.

| Part | Construction | Read at encounter distance |
| --- | --- | --- |
| Rollers | The original nine 140 mm drums on 150 mm centers | The existing dark steel feed bed |
| Shaft and bearing | 58 mm shaft meets a 106 mm bearing seat at each end. The bearing seat lands on the channel web. | A repeatable step from barrel to exposed shaft to seated bearing |
| Side channel | Copper-coated inward-facing C profile with two 32 mm flanges | A continuous folded edge and the recess behind the bearing |

The side channels keep their full original walkable top, base footprint, and outside silhouette. The original two solid collision proxies are still used. Their interior-facing vertical contact planes bridge the visual recess, while the remaining contact surface follows the original geometry. The whole contact mesh matches the frozen vertex and index buffers byte for byte. The nine roller vertices, all other body channels outside the two former solid rails, and the glow geometry also match.

## Local verification

- The approved v4 reference checker passed against the tracked reference files.
- 24 workshop contact, night material, runtime and coaster building tests passed.
- The [assembly checker](../../../../../../../tools/world/coaster-craft-rework/check-intake-roller-supports.mjs) compares with the actual frozen generator at `fba5d04`. The workshop body changes from 7,924 to 9,108 triangles, and from 1,164,828 to 1,338,876 attribute bytes. It remains one material batch with zero geometry groups. These figures measure geometry and buffers. Frame timing still needs runtime measurement.

## Editable asset and next capture

The runtime TypeScript generator is the geometry source. To extract the nine rollers and 38 support parts as separately named editable meshes, run from the repository root:

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs \
  tools/world/coaster-craft-rework/extract-intake-roller-assembly.mjs /tmp/intake-assembly.json
blender --background --python tools/world/coaster-craft-rework/export-intake-roller-assembly.py \
  -- /tmp/intake-assembly.json /tmp/intake-assembly-assets
```

Extraction produced 47 named parts and 1,496 triangles. The Blender script passed a Python syntax check. Blender output uses editable PBR approximations of the runtime materials and local metric coordinates with +Y toward the front. The following section records the completed serial QA.

## Runtime and export review

| Fixed view | Baseline `7789327` | Sample `e96e02f` |
| --- | --- | --- |
| Noon | [Original](runtime/day-before.jpg) | [Original](runtime/day-after.jpg) |
| Midnight | [Original](runtime/night-before.jpg) | [Original](runtime/night-after.jpg) |
| Bearing and channel close-up | | [Original](runtime/connection-close.jpg) |

The single QA build selects the frozen baseline generator or the candidate at the actual workshop entry point. Both use the approved night shader. All five captures used the same 1710 × 875 screenshot and framebuffer size, DPR 1, balanced quality, exposure 1, clear weather, and a fully settled climate blend. Each had one compiled craft program, 864 roller-role vertices, no console errors, and an idle shadow queue before and after the capture. The local server logs show successful observed scene asset responses and a favicon 404. This verifies the local workshop views using the frozen shared public asset root. [Receipt](receipt.json)

At noon the foremost shaft and seated bearing read clearly. The far channel shows the repeating supports. At midnight the first shaft remains visible, but the darker rear bearings mostly read as a line along the recess. In the close view the bearings meet the far channel web, with no obvious clipping across the visible roller barrels. The near channel hides the connections behind its outer face in that view.

The stable ordinary-view counter stayed at 101 draw calls. The displayed renderer triangle count rose from 557,185 to 560,737 in each pair. The runtime geometry itself adds 1,184 triangles and 174,048 attribute bytes. The displayed count includes the renderer's passes. These are capture-time counters, with no whole-island FPS claim. [Contact fingerprints](contacts.json)

Blender 5.1.2 reopened the [editable Blend](assets/intake-roller-assembly.blend) and freshly imported the [GLB](assets/intake-roller-assembly.glb) into an empty scene. Each read back as 47 mesh objects, four materials, 1,496 triangles, and the same metric bounds. The TypeScript path remains authoritative for runtime day and night materials. [Blend readback](assets/blend.json) · [GLB readback](assets/glb.json)

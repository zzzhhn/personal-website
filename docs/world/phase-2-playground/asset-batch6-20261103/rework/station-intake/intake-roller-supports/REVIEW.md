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

Extraction produced 47 named parts and 1,496 triangles. The Blender script passed a Python syntax check. Blender output uses editable PBR approximations of the runtime materials and local metric coordinates with +Y toward the front. The export, reimport, same-view noon and midnight captures, connection close-up and runtime cost review await the serial QA window.

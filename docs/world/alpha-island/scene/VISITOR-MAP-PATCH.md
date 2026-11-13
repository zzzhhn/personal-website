# Integration-owned WorldMap consumer patch

Scene intentionally does not edit public WorldMap.tsx. Only change its Alpha guide consumer; preserve shore geometry, other regions, map input and existing markers.

1. Remove ALPHA_MAIN_PATH and ALPHA_BYPASS_PATH from the alpha-layout import. Retain the other imported exports. Add:

```tsx
import {ALPHA_VISITOR_PATH,ALPHA_VISITOR_SPURS} from './alpha-island/alpha-visitor-path';
```

2. Allow the existing string formatter to read immutable point arrays (function body unchanged):

```tsx
const path = (points: readonly (readonly number[])[]) => points.map(p => `${p[0]},${p.length === 3 ? p[2] : p[1]}`).join(' ');
```

3. In the `<g data-alpha-island='batch1'>` block, replace only the two old ALPHA_MAIN_PATH/ALPHA_BYPASS_PATH polylines with:

```tsx
<polyline data-alpha-route="visitor" points={path(ALPHA_VISITOR_PATH)} fill="none" stroke="#e0d4b4" strokeWidth="2.4" strokeLinejoin="round" />
{ALPHA_VISITOR_SPURS.map(spur => <polyline key={spur.id} data-alpha-route={spur.id} points={path(spur.path)} fill="none" stroke="#d0bd91" strokeWidth="1.7" strokeDasharray="2 1" strokeLinejoin="round" />)}
```

The existing mainland pier/approach and dock/tree/wind/summit markers stay. Label the two short spurs with their exported labels so the lodge entrance and sled boarding point are clear; these are already-approved stops1/12:

```tsx
{ALPHA_VISITOR_SPURS.map(spur => {
  const [x,z] = spur.path[spur.path.length-1];
  return <g key={`visitor-${spur.id}`}><circle cx={x} cy={z} r="2" fill="#e7c587" /><text x={x+4} y={z+2} fontSize={full?'4':'5'} fill="#fff4da" paintOrder="stroke" stroke="#23343d" strokeWidth="1">{spur.label[lang]}</text></g>;
})}
```

This module imports only existing layout data and math, so the map import does not eagerly load Three, terrain generation or textures. Do not substitute ALPHA_VISITOR_PATH into the authored height/rail/ride pipeline.

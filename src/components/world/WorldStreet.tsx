import { Component, memo, Suspense, useEffect, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { LAYOUT_V4 } from './layout-v4-flag.ts';
import StreetKnockables, { awakeKnockQa, knockQa } from './WorldStreetKnock';
import StreetFixed from './WorldStreetFixed';
import StreetRails from './WorldStreetRails';
import StreetTrees from './WorldStreetTrees';
import { StreetFoundations, StreetWindmill } from './WorldStreetLandmarks';

/**
 * Street and global props mount point (owner: street session). Design: docs/world/street/DESIGN.md.
 * Each group renders inside its own error boundary + Suspense and claims its greybox key only after its
 * visual AND colliders mounted (useGreyboxClaim inside the group), so a failed group leaves the greybox
 * (visual + collision) in place. v3 entry (?layout=v3): nothing is rendered or claimed.
 */
class GroupBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn(`[world-street] ${this.props.name} failed; greybox kept`, error); }
  render() { return this.state.failed ? null : this.props.children; }
}
const group = (name: string, node: ReactNode) => <GroupBoundary key={name} name={name}><Suspense fallback={null}>{node}</Suspense></GroupBoundary>;

/** QA (?qa=1): street stats / kinds / visibility, and the knockable queries merged into __worldDistricts
 * (WorldDistricts replaces that object on mount, so the merge is repeated every 0.5 s). */
function StreetQa() {
  const { scene, gl } = useThree();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const w = window as unknown as Record<string, unknown>;
    const groups = () => { const out: Record<string, unknown> = {}; scene.getObjectByName('world-street')?.children.forEach(c => { out[c.name] = c; }); return out; };
    const merge = () => { const d = (w.__worldDistricts ??= {}) as Record<string, unknown>; if (d.knockables !== knockQa) Object.assign(d, { knockables: knockQa, awakeKnockables: awakeKnockQa }); };
    merge();
    const timer = window.setInterval(merge, 500);
    w.__worldStreet = {
      kinds: () => { const out: Record<string, unknown> = {}; scene.getObjectByName('world-street')?.traverse(o => { if (o.userData.streetKinds) out[o.name] = o.userData.streetKinds; }); return out; },
      stats: () => {
        let tris = 0, draws = 0; const per: Record<string, unknown> = {};
        scene.getObjectByName('world-street')?.traverse(o => {
          const m = o as unknown as { isMesh?: boolean; visible: boolean; userData: Record<string, unknown>; name: string };
          if (m.isMesh && m.userData.streetStats) { const s = (m.userData.streetStats as () => { tris: number })(); per[m.name] = s; tris += s.tris; draws++; }
        });
        return { groups: Object.keys(groups()), meshes: per, estimatedTriangles: tris, frame: { calls: gl.info.render.calls, triangles: gl.info.render.triangles } };
      },
      setVisible: (name: string | null, on: boolean) => { const g = groups(); let n = 0; for (const [k, o] of Object.entries(g)) if (!name || k === name) { (o as { visible: boolean }).visible = on; n++; } return n; },
    };
    return () => { window.clearInterval(timer); delete w.__worldStreet; };
  }, [scene, gl]);
  return null;
}

export default memo(function WorldStreet() {
  if (!LAYOUT_V4) return <group name="world-street" />;
  return <group name="world-street">
    {group('street-knockables', <StreetKnockables set="knock" />)}
    {group('street-roadblocks', <StreetKnockables set="roadblock" />)}
    {group('street-fixed', <StreetFixed />)}
    {group('street-rails', <StreetRails />)}
    {group('street-trees', <StreetTrees />)}
    {group('street-foundations', <StreetFoundations />)}
    {group('street-windmill', <StreetWindmill />)}
    <StreetQa />
  </group>;
});

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import { ISLAND_OUTLINE, LAYOUT_V4, ROAD_POINTS, BOARDWALK_POINTS, BUILDINGS, BOOTHS, FOUNDATIONS, CAMP_CENTER } from './layout';

type MapRoad = { pts: number[][]; width: number; color: string; dash?: string };
type Landmark = { id: string; p: [number, number]; label: string };
type MapGeometry = { shore: number[][]; camp: number[][]; viewBox: [number, number, number, number]; roads?: MapRoad[]; landmarks: Landmark[] };
let mapGeometryPromise: Promise<MapGeometry> | null = null;
/** Shares the terrain's waterline and the v4 road hierarchy, loaded lazily with the runtime chunk so the
 * loading screen never pulls Three / terrain generation into the initial bundle. */
export function loadMapGeometry() {
  const v4 = LAYOUT_V4 ? import('./layout-v4').then(({ ROADS_V4, CONNECTORS_V4, paveHalf, LANDMARKS_V4 }) => ({
    roads: [...ROADS_V4, ...CONNECTORS_V4]
      .map(r => ({ pts: r.pts, width: r.cls === 'foot' ? 2 : r.cls === 'dirt' ? 3 : paveHalf(r.cls) * .9, color: r.cls === 'dirt' ? '#B08A5E' : r.cls === 'foot' ? '#C9A978' : r.cls === 'avenue' ? '#F3EBDD' : '#D9D2C2', dash: r.cls === 'dirt' ? '3 2' : undefined }))
      .sort((a, b) => b.width - a.width),
    landmarks: LANDMARKS_V4.map(l => ({ id: l.id, p: [l.p[0], l.p[1]] as [number, number], label: l.label })),
  })) : Promise.resolve({ roads: undefined, landmarks: [] as Landmark[] });
  return mapGeometryPromise ??= Promise.all([import('./WorldLandform'), v4]).then(([{ islandShoreline, campRadius }, { roads, landmarks }]) => {
    const shore = islandShoreline().filter((_, i) => i % 2 === 0);
    const camp = Array.from({ length: 72 }, (_, i) => { const a = i / 72 * Math.PI * 2, r = campRadius(a) * .7; return [-42 + Math.cos(a) * r, 30 + Math.sin(a) * r]; });
    const xs = [-77, 85, ...shore.map(p => p[0])], zs = [-62, 62, ...shore.map(p => p[1])];
    const x = Math.min(...xs) - 7, z = Math.min(...zs) - 7;
    return { shore, camp, roads, landmarks, viewBox: [x, z, Math.max(...xs) - x + 7, Math.max(...zs) - z + 7] as [number, number, number, number] };
  });
}
function useMapGeometry() {
  const [geometry, setGeometry] = useState<MapGeometry | null>(null);
  useEffect(() => { let live = true; loadMapGeometry().then(g => { if (live) setGeometry(g); }).catch(() => {}); return () => { live = false; }; }, []);
  return geometry;
}

const path = (points: number[][]) => points.map(p => `${p[0]},${p.length === 3 ? p[2] : p[1]}`).join(' ');
/** Heading of travel (radians, map space) from successive published positions; holds while standing still. */
function useHeading(x: number, z: number) {
  const last = useRef<[number, number] | null>(null), heading = useRef(-Math.PI / 2);
  if (last.current) { const dx = x - last.current[0], dz = z - last.current[1]; if (Math.hypot(dx, dz) > .25) { heading.current = Math.atan2(dz, dx); last.current = [x, z]; } }
  else last.current = [x, z];
  return heading.current;
}

/** Minimap (follows the player, north up, a GTA-style radar window) and the full map used by the Esc menu and
 * the loading cover. The full map sets / clears the waypoint on click when `interactive`. */
export default function WorldMap({ mode = 'mini', interactive = false }: { mode?: 'mini' | 'full'; interactive?: boolean }) {
  const geometry = useMapGeometry();
  const position = useWorldStore(s => s.position);
  const lang = useWorldStore(s => s.lang);
  const waypoint = useWorldStore(s => s.waypoint);
  const zone = useWorldStore(s => s.zone);
  const [px, , pz] = position;
  const heading = useHeading(px, pz);
  const t = worldText[lang];
  const svg = useRef<SVGSVGElement>(null);
  const full = mode === 'full';
  const R = 46; // minimap half-window in metres
  const vb = full ? (geometry?.viewBox ?? [-85, -70, 180, 145]) : [px - R, pz - R, R * 2, R * 2];
  const s = full ? 1 : .8; // marker scale
  const click = (e: MouseEvent<SVGSVGElement>) => {
    if (!interactive || !svg.current) return;
    const m = svg.current.getScreenCTM(); if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (waypoint && Math.hypot(p.x - waypoint[0], p.y - waypoint[1]) < 7) useWorldStore.setState({ waypoint: null });
    else useWorldStore.setState({ waypoint: [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10] });
  };
  // The minimap waypoint clamps to the radar rim when it lies outside the window.
  let wp: [number, number] | null = waypoint, wpEdge = false;
  if (waypoint && !full) {
    const dx = waypoint[0] - px, dz = waypoint[1] - pz, d = Math.hypot(dx, dz);
    if (d > R - 6) { wp = [px + dx / d * (R - 6), pz + dz / d * (R - 6)]; wpEdge = true; }
  }
  const k = full ? 1.1 : 1;
  const landmarkName: Record<string, string> = { windmill: t.ridge, lifeguard: t.shore };
  const seaId = `world-sea-${mode}`;
  return <svg ref={svg} className={`world-map world-map-${mode}${interactive ? ' world-map-interactive' : ''}`} viewBox={vb.join(' ')} role='img'
    aria-label={interactive ? `${t.map}. ${t.waypointSet}` : `${t.map} · ${t[zone]}`} onClick={click}>
    <defs>
      <pattern id={seaId} width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(35)'><rect width='5' height='5' fill='#1E5A5E' /><line x1='0' y1='0' x2='0' y2='5' stroke='#3C8A8A' strokeWidth='.7' opacity='.5' /></pattern>
    </defs>
    <rect x={vb[0] - 300} y={vb[1] - 300} width={vb[2] + 600} height={vb[3] + 600} fill={`url(#${seaId})`} />
    <polygon points={path(geometry?.shore ?? ISLAND_OUTLINE)} fill='#E3D3B4' stroke='#F4ECDB' strokeWidth={full ? 1.4 : 1.1} strokeOpacity='.7' />
    <polygon points={path(geometry?.shore ?? ISLAND_OUTLINE)} fill='#7E8C3E' className='world-map-grass' />
    {geometry?.roads ? geometry.roads.map((r, i) => <polyline key={i} points={path(r.pts)} fill='none' stroke={r.color} strokeWidth={r.width} strokeDasharray={r.dash} strokeLinejoin='round' strokeLinecap='round' />)
      : !LAYOUT_V4 && <polyline points={path(ROAD_POINTS)} fill='none' stroke='#D9D2C2' strokeWidth='4' strokeLinejoin='round' />}
    <polyline points={path(BOARDWALK_POINTS)} fill='none' stroke='#B99469' strokeWidth='3' strokeLinecap='round' />
    {geometry ? <polygon points={path(geometry.camp)} fill='#D2B98A' stroke='#E8803A' strokeWidth={full ? 1.2 : 1} /> : <circle cx={CAMP_CENTER[0]} cy={CAMP_CENTER[2]} r='15' fill='#D2B98A' stroke='#E8803A' strokeWidth='1.2' />}
    {FOUNDATIONS.map(f => <rect key={f.id} x={f.position[0] - f.size[0] / 2} y={f.position[2] - f.size[2] / 2} width={f.size[0]} height={f.size[2]} fill='none' stroke='#F4ECDB' strokeWidth='.8' strokeDasharray='2 1.6' opacity='.8' />)}
    {/* Six internship buildings, numbered in startDate order (oldest -> newest). */}
    {BUILDINGS.map((b, i) => <g key={b.id} transform={`translate(${b.position[0]} ${b.position[2]})`}>
      <rect x={-b.size[0] / 2} y={-b.size[2] / 2} width={b.size[0]} height={b.size[2]} fill={b.color} stroke='#23343D' strokeWidth='.6' rx='.6' />
      <text className='world-map-num' y={1.9} fontSize={5.4} textAnchor='middle' fill={b.color === '#E6DCCB' ? '#23343D' : '#F4ECDB'}>{i + 1}</text>
    </g>)}
    {BOOTHS.map(b => <rect key={b.id} x={b.position[0] - 2.4 * s} y={b.position[2] - 2.4 * s} width={4.8 * s} height={4.8 * s} transform={`rotate(45 ${b.position[0]} ${b.position[2]})`} fill='#23343D' stroke='#4FD1C5' strokeWidth='.9' />)}
    <circle cx={CAMP_CENTER[0]} cy={CAMP_CENTER[2]} r={2.3 * s} fill='#E8803A' /><circle cx={CAMP_CENTER[0]} cy={CAMP_CENTER[2]} r={4.4 * s} fill='none' stroke='#E8803A' strokeWidth='.7' />
    {geometry?.landmarks.filter(l => landmarkName[l.label]).map(l => <g key={l.id} transform={`translate(${l.p[0]} ${l.p[1]})`}>
      {l.label === 'windmill' ? <path d={`M0 ${-4.4 * s}L${1.3 * s} 0L0 ${4.4 * s}L${-1.3 * s} 0Z M${-4.4 * s} 0L0 ${1.3 * s}L${4.4 * s} 0L0 ${-1.3 * s}Z`} fill='#F4ECDB' stroke='#23343D' strokeWidth='.5' />
        : <rect x={-2 * s} y={-2 * s} width={4 * s} height={4 * s} fill='#B9602A' stroke='#F4ECDB' strokeWidth='.6' />}
    </g>)}
    {waypoint && !full && !wpEdge && <line x1={px} y1={pz} x2={waypoint[0]} y2={waypoint[1]} stroke='#F2B98A' strokeWidth='1.2' strokeDasharray='2.5 2' />}
    {wp && <g className='world-map-waypoint' transform={`translate(${wp[0]} ${wp[1]})`}>
      <path d={`M0 0 L${-3.1 * s} ${-5.4 * s} A${3.6 * s} ${3.6 * s} 0 1 1 ${3.1 * s} ${-5.4 * s} Z`} fill='#F2B98A' stroke='#23343D' strokeWidth='.7' strokeLinejoin='round' />
      <circle cy={-7.6 * s} r={1.25 * s} fill='#23343D' />
    </g>}
    {full && <g className='world-map-labels'>
      {(['camp', 'town', 'park'] as const).map(z => { const at = z === 'camp' ? [CAMP_CENTER[0], CAMP_CENTER[2] + 24] : z === 'town' ? [-15, -4] : [64, -62]; return <text key={z} x={at[0]} y={at[1]} textAnchor='middle' fontSize='6'>{t[z]}</text>; })}
      {geometry?.landmarks.filter(l => landmarkName[l.label]).map(l => <text key={l.id} x={l.p[0]} y={l.p[1] + 10} textAnchor='middle' fontSize='4.6'>{landmarkName[l.label]}</text>)}
    </g>}
    {/* Player: travel-direction arrow, white with a dark rim so it reads on grass, sand and road. */}
    {/* Invisible r=2.6 anchor kept for the normal-entry bots, which steer by `aside.world-location svg circle[r="2.6"]`. */}
    <circle className='world-map-anchor' cx={px} cy={pz} r='2.6' fill='none' stroke='none' />
    <g className='world-map-player' transform={`translate(${px} ${pz}) rotate(${heading * 180 / Math.PI + 90})`}>
      <circle r={4.6 * k} fill='#F4ECDB' opacity='.25' />
      <path d={`M0 ${-3.8 * k} L${2.7 * k} ${2.7 * k} L0 ${1.3 * k} L${-2.7 * k} ${2.7 * k} Z`} fill='#fff' stroke='#23343d' strokeWidth='.8' strokeLinejoin='round' />
    </g>
  </svg>;
}

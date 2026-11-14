type MapPoints = readonly (readonly number[])[];
type MapLoops = readonly MapPoints[];

/** Only explicitly registered, immutable map geometry is cached. Dynamic arrays
 * keep their original serialization behavior, including in-place coordinate edits. */
export function createMapPathCache() {
  const staticPoints = new WeakSet<MapPoints>();
  const staticLoops = new WeakSet<MapLoops>();
  const paths = new WeakMap<MapPoints, string>();
  const shores = new WeakMap<MapLoops, string>();
  const register = (points: MapPoints) => { staticPoints.add(points); };
  const registerShore = (loops: MapLoops) => {
    staticLoops.add(loops);
    loops.forEach(register);
  };
  const path = (points: MapPoints) => {
    const cached = paths.get(points);
    if (cached !== undefined) return cached;
    const value = points.map(p => `${p[0]},${p.length === 3 ? p[2] : p[1]}`).join(' ');
    if (staticPoints.has(points)) paths.set(points, value);
    return value;
  };
  const shorePath = (loops: MapLoops) => {
    const cached = shores.get(loops);
    if (cached !== undefined) return cached;
    const value = loops.map(points => `M${path(points)}Z`).join(' ');
    if (staticLoops.has(loops)) shores.set(loops, value);
    return value;
  };
  return { register, registerShore, path, shorePath };
}

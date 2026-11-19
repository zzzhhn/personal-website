export const IBD_WORKSTATION_FIXTURES_ROOT = 'ibd-workstation-fixtures';

export const IBD_INSPECTION_BENCHES = [
  { id: 'inspection-a', x: 10, z: -12 },
  { id: 'inspection-b', x: 18, z: -12 },
] as const;

export const IBD_UTILITY_BENCHES = [
  { id: 'receiving', variant: 'Receiving', x: -3, z: 26, top: .8 },
  { id: 'tools', variant: 'Tools', x: -6, z: 19, top: 1.1 },
] as const;

export const IBD_CONTROL_PEDESTALS = [
  { id: 'crane', kind: 'crane', x: -6, z: 0 },
  { id: 'turn-front', kind: 'turn', x: -8, z: -4 },
  { id: 'turn-rear', kind: 'turn', x: -8, z: -9 },
  { id: 'scale-a', kind: 'scale', x: 7, z: -12 },
  { id: 'scale-b', kind: 'scale', x: 21, z: -12 },
  { id: 'load-a', kind: 'load', x: 7.8, z: -6.5 },
  { id: 'load-b', kind: 'load', x: 20.2, z: -6.5 },
  { id: 'truck-south', kind: 'load', x: 8, z: 7.7 },
  { id: 'truck-north', kind: 'load', x: 8, z: 17.3 },
  { id: 'dispatch', kind: 'dispatch', x: 7, z: 18 },
] as const;

export const workstationSurfaceId = (id: string) => 'ibd-workstation-' + id;

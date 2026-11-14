import type { Vec3 } from '../types.ts';
import { factoryStation, factoryWorld, type FactoryStationId } from './factory-layout.ts';

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** World-space operator grip on the waist-height console deck once the guide has
 * settled at `station.at` facing the machine. `release` stands clear of the open
 * report-card throat (0.72 m ahead) and intentionally keeps hands clear of the tray. */
export function factoryConsoleHandTarget(
  stationId: FactoryStationId | null,
  position: readonly [number, number, number],
  facing: number,
  speedMps: number,
): Vec3 | null {
  if (!stationId || stationId === 'release') return null;
  if (!Number.isFinite(speedMps) || speedMps > 0.16) return null;
  const station = factoryStation(stationId);
  const stand = factoryWorld(station.at);
  if (Math.hypot(position[0] - stand[0], position[2] - stand[2]) > 0.12) return null;
  const desiredFacing = station.yaw - Math.PI / 2;
  if (Math.abs(wrapAngle(facing - desiredFacing)) > 0.25) return null;
  const dx = Math.sin(station.yaw), dz = Math.cos(station.yaw);
  const rx = -dz, rz = dx;
  return factoryWorld([
    station.at[0] + dx * 0.60 + rx * 0.14,
    station.at[1] + 1.005,
    station.at[2] + dz * 0.60 + rz * 0.14,
  ]);
}

// Error boundaries publish only their own lease. Cleanup of an obsolete boundary
// must leave a newer failure for that region in place.
const failures = new Map<string, Set<object>>();

export function reportRegionLoadFailure(id: string) {
  const leases = failures.get(id) ?? new Set<object>();
  failures.set(id, leases);
  const token = {};
  leases.add(token);
  return () => {
    if (leases.delete(token) && !leases.size) failures.delete(id);
  };
}

export const regionLoadFailed = (id: string) => failures.has(id);

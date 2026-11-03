/** The preview and its geometry fixture must select the same accepted craft.
 * Explicit QA URLs retain the frozen baseline and individual sample switches. */
export function ibdCraftOptions(query: URLSearchParams | null) {
  if (query?.get('qa') !== '1') return {
    coilBaySample: false, shedExpansion: true, rackMode: 'family' as const,
    bridgeSample: true, crateSample: 'grain' as const,
  };
  const rack = query.get('ibdRack'), crate = query.get('ibdStockCrate');
  return {
    coilBaySample: query.get('ibdCoilBay') === 'candidate',
    shedExpansion: query.get('ibdSheds') === 'candidate',
    rackMode: rack === 'sample-v2' ? 'sample' as const : rack === 'family-v2' ? 'family' as const : undefined,
    bridgeSample: query.get('ibdBridge') === 'candidate',
    crateSample: crate === 'grain-v2' ? 'grain' as const : crate === 'candidate' ? 'reference' as const : undefined,
  };
}

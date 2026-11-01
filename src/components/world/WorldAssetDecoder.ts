import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let decoder: DRACOLoader | null = null;
/** Character and quarry assets share the same bounded decoder pool. */
export function withWorldAssetDecoder(loader: GLTFLoader) {
  decoder ??= new DRACOLoader().setDecoderPath('/assets/world/draco/').setWorkerLimit(2);
  loader.setDRACOLoader(decoder);
}

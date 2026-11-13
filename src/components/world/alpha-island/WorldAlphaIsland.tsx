import { Suspense,useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { ALPHA_ORIGIN } from './alpha-layout';
import { alphaMaterialUniforms } from './alpha-materials';
import { alphaMotion,cancelAlphaHand } from './alpha-state';
import { night } from '../WorldNight';
import AlphaTerrain from './AlphaTerrain';
import AlphaScenery from './AlphaScenery';
import AlphaInteractions from './AlphaInteractions';
import AlphaNature from './AlphaNature';
import AlphaCloudSea from './AlphaCloudSea';
export default function WorldAlphaIsland(){useFrame(()=>{alphaMaterialUniforms.night.value=night.value;alphaMaterialUniforms.time.value=alphaMotion.time;});useEffect(()=>()=>{cancelAlphaHand();},[]);return <group name="alpha-island-batch1" position={ALPHA_ORIGIN}><AlphaTerrain/><AlphaScenery/><AlphaNature/><AlphaInteractions/><AlphaCloudSea/></group>;}

import {useEffect,useMemo} from 'react';
import {createAlphaVisitorMarkings} from './alpha-visitor-markings';
/** Small static direction paint on the already verified outdoor detours. */
export default function AlphaVisitorWayfinding(){const built=useMemo(createAlphaVisitorMarkings,[]);useEffect(()=>()=>built.geometry.dispose(),[built]);return <mesh name="alpha-visitor-direction-paint" geometry={built.geometry} userData={{navigationOnly:true}}><meshBasicMaterial vertexColors transparent opacity={.86} depthWrite={false} toneMapped={false}/></mesh>;}

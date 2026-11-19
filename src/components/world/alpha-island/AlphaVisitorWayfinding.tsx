import {useEffect,useMemo} from 'react';
import {createAlphaVisitorMarkings} from './alpha-visitor-markings';
/** Small static direction paint on the already verified outdoor detours. */
export default function AlphaVisitorWayfinding(){const built=useMemo(createAlphaVisitorMarkings,[]);useEffect(()=>()=>built.geometry.dispose(),[built]);return <mesh name="alpha-visitor-direction-paint" geometry={built.geometry} userData={{navigationOnly:true,worldCollision:"none",collisionReason:"Paint clipped to the existing walkable terrain triangles"}}><meshBasicMaterial vertexColors transparent opacity={.86} depthWrite={false} toneMapped={false}/></mesh>;}

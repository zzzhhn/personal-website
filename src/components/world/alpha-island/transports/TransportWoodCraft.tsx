import {createContext,useContext,useEffect,useMemo,type ReactNode} from 'react';
import {create} from 'zustand';
import type {BufferGeometry,MeshStandardMaterial} from 'three';
import {alphaMaterial} from '../alpha-materials';
import {boardingPlanks,snowAndShell,troughPlanks} from './transport-plank-geometry';
import type {Vec3} from '../../types';
const useCraft=create(()=>({enabled:true})),Wood=createContext<MeshStandardMaterial|null>(null);
const owned={geometries:0,materials:0,created:0,disposed:0};
function own(resource:BufferGeometry|MeshStandardMaterial,kind:'geometries'|'materials'){owned[kind]++;owned.created++;let live=true;resource.addEventListener('dispose',()=>{if(live){live=false;owned[kind]--;owned.disposed++;}});}
export const transportCraftDebug={resources:()=>({...owned}),setEnabled:(enabled:boolean)=>{if(!import.meta.env.DEV||new URLSearchParams(location.search).get('qa')!=='1')return false;useCraft.setState({enabled});return true;}};
export function TransportWoodFinish({children}:{children:ReactNode}){const enabled=useCraft(s=>s.enabled),material=useMemo(()=>enabled?alphaMaterial('wood'):null,[enabled]);useEffect(()=>{if(!material)return;own(material,'materials');return()=>material.dispose();},[material]);return <Wood.Provider value={material}>{children}</Wood.Provider>;}
export const useTransportWood=()=>useContext(Wood);
export function WoodBoarding({source,segments,material}:{source:BufferGeometry;segments:{a:Vec3;b:Vec3}[];material:MeshStandardMaterial}){const geometry=useMemo(()=>boardingPlanks(source,segments),[source,segments]);useEffect(()=>{own(geometry,'geometries');return()=>geometry.dispose();},[geometry]);return <mesh name="alpha-transport-longitudinal-boarding-boards" geometry={geometry} material={material} castShadow receiveShadow dispose={null}/>;}
export function WoodTrough({source,vertices,indices,length,snowCut,material}:{source:BufferGeometry;vertices:Float32Array;indices:Uint32Array;length:number;snowCut:number;material:MeshStandardMaterial}){const pack=useMemo(()=>({wood:troughPlanks(vertices,indices,length,snowCut),shell:snowAndShell(source,indices.length,snowCut)}),[source,vertices,indices,length,snowCut]);useEffect(()=>{own(pack.wood,'geometries');own(pack.shell,'geometries');return()=>{pack.wood.dispose();pack.shell.dispose();};},[pack]);return <><mesh name="alpha-transport-longitudinal-trough-boards" geometry={pack.wood} material={material} receiveShadow castShadow dispose={null}/><mesh name="alpha-transport-original-snow-and-shell" geometry={pack.shell} receiveShadow><meshStandardMaterial vertexColors color="#ffffff" roughness={.78}/></mesh></>;}

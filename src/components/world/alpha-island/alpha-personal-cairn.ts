import { SphereGeometry } from 'three';
import type { Vec3 } from '../types';

export const ALPHA_CAIRN_STANCE_RADIUS = .04;
const SUMMIT_Y = 83;

// Centre x/z, height above the summit, yaw, and the next operator's x/z.
// Each authored pose is checked against the same earlier stone hulls, physical
// summit and G24 reach that the player will encounter at that count.
const STONE_POSES: readonly (readonly [number,number,number,number,number,number])[] = [
  [1,39.35,0.099301,0,1.485,39.7],
  [1.548925,39.157947,0.098351,2.19045,1.517909,39.767158],
  [1.387094,39.74224,0.097439,1.236606,1.923645,39.863123],
  [0.952031,39.118817,0.27053,2.886317,1.090528,38.524747],
  [0.667232,38.62924,0.095501,2.228319,1.125312,38.324834],
  [1.212518,38.655474,0.094551,3.110602,1.01654,38.141575],
  [0.919569,39.165888,0.455281,1.956463,0.362508,39.41445],
  [0.419081,39.148644,0.092651,1.093563,0.287015,39.713409],
  [0.493548,39.532306,0.198031,0.674216,0.118476,40.038489],
  [1.365583,39.042198,0.369108,1.828013,1.919212,38.741541],
  [0.986967,38.364808,0.202853,0.158655,1.611862,38.185908],
  [1.471833,38.526924,0.240036,1.530847,1.718386,37.947173],
  [0.391814,38.760523,0.223877,2.560822,0.247125,38.167931],
  [0.951746,39.692073,0.214246,2.517464,0.902135,40.269947],
  [1.363078,39.751664,0.279045,0.917722,1.0409,40.3162],
  [0.29783,39.162847,0.259537,3.123495,-0.126344,39.628654],
  [0.595533,39.756944,0.344418,2.436322,-0.039854,39.893998],
  [0.660678,38.508005,0.307333,1.723016,0.139933,38.190319],
  [0.412709,38.745967,0.391921,2.237163,0.128469,38.183732],
  [1.203102,38.380823,0.352711,1.571389,1.66407,37.922556],
  [1.071214,39.636504,0.373687,0.943248,0.992037,40.281664],
  [1.55504,39.465162,0.379003,3.072568,1.977817,39.904889],
  [1.555417,38.632731,0.394237,0.250438,2.082809,38.977342],
  [0.406829,39.385663,0.379633,1.098114,-0.087468,39.776266],
  [0.865825,38.371119,0.424148,1.460577,0.473507,37.904014],
  [0.60253,38.565207,0.495422,1.645055,0.134316,38.174215],
  [1.375284,39.754387,0.453232,3.13516,1.689527,40.277217],
  [0.79935,39.718287,0.473679,1.744424,0.917485,40.316738],
  [0.451962,39.616245,0.493225,2.267501,0.115999,40.125391],
  [0.328371,39.265882,0.513559,2.492777,-0.128932,39.669582],
  [1.549168,39.24347,0.490232,0.750554,2.128191,39.209822],
  [1.584822,38.881838,0.486332,0.015577,2.122564,39.099172],
];

const firstGrip:Vec3=[1,83.35,40];
export const alphaPersonalStones=STONE_POSES.map(([x,z,y,yaw,standX,standZ],i)=>{
  const scale:Vec3=[.32-i*.0045,.10-i*.00095,.25-i*.003];
  const position:Vec3=[x,SUMMIT_Y+y,z],stand:Vec3=[standX,SUMMIT_Y,standZ];
  const toward=Math.min(.45,.20/Math.hypot(x-standX,z-standZ));
  const grab:Vec3=i?[standX+(x-standX)*toward,SUMMIT_Y+.55,standZ+(z-standZ)*toward]:firstGrip;
  return {id:`alpha-personal-cairn-stone-${i+1}`,position,stand,grab,scale,yaw,gripLift:scale[1]-.02,
    arcHeight:i?.40:.55,color:i%2?'#a6aba3':'#8c9693'};
});
export const ALPHA_PERSONAL_CAIRN_CAP=alphaPersonalStones.length;

export function alphaPersonalStone(stones:number) {
  const index=Math.min(alphaPersonalStones.length-1,Math.max(0,Math.floor(stones)));
  return alphaPersonalStones[index];
}

export function createPersonalCairnGeometry() {
  const geometry=new SphereGeometry(1,10,6),position=geometry.getAttribute('position');
  const hulls=alphaPersonalStones.map(({scale})=>{
    const points=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){
      points[i*3]=position.getX(i)*scale[0];
      points[i*3+1]=position.getY(i)*scale[1];
      points[i*3+2]=position.getZ(i)*scale[2];
    }
    return points;
  });
  return {geometry,hulls,dispose:()=>geometry.dispose()};
}

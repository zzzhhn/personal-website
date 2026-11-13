import { create } from 'zustand';
import type { TransportRoute } from '../../rides/ride-contract';
export const useTransportStatus=create<{id:string|null;kind:TransportRoute['kind']|null;phase:string;progress:number;cancelled:boolean;blocked:boolean}>(()=>({id:null,kind:null,phase:'',progress:0,cancelled:false,blocked:false}));
export const transportNames={cable:{zh:'四季缆车',en:'Seasons cable car'},sled:{zh:'雪橇滑道',en:'Mountain sled'},ferry:{zh:'渡船',en:'Island ferry'}};

/** The 3D owner attaches commands; the HTML HUD imports no renderer or legacy coaster. */
export const transportActions={requestExit:()=>{},resetView:()=>{}};

import type { Vec3 } from './types';

/** All coordinates are local. `stand` is the player's sole, `contact` a hand target.
 * `yaw` is the WorldActors heading: [cos(yaw), 0, -sin(yaw)]. It is
 * atan2(-(contact.z - stand.z), contact.x - stand.x), not a Three mesh yaw. */
export interface ExchangePlayStation {
  stand:Vec3; yaw:number; contact:Vec3; slideStart?:Vec3; slideEnd?:Vec3;
}
export const EXCHANGE_PLAY_STATIONS = {
  archive:{stand:[-11.7,.45,-18.2],yaw:Math.PI/2,contact:[-11.7,1.48,-18.66]},
  desk:{stand:[-1.35,0,-14.98],yaw:Math.PI/2,contact:[-1.35,1.05,-15.44],
    slideStart:[-1.54,1.1,-15.40],slideEnd:[-1.16,1.1,-15.40]},
  bell:{stand:[0,.45,-36.2],yaw:Math.PI/2,contact:[0,1.48,-36.66]},
  clearing:{stand:[11.7,.45,-25.34],yaw:Math.PI/2,contact:[11.7,1.49,-25.8]},
  review:{stand:[-3,5.2,-38.26],yaw:Math.PI/2,contact:[-3,6.26,-38.72]},
} as const satisfies Record<string,ExchangePlayStation>;

/** The second working position shares the same circular island; it is not another desk. */
export const EXCHANGE_SECOND_DESK = {stand:[1.35,0,-14.98] as Vec3,contact:[1.35,1.05,-15.44] as Vec3,yaw:Math.PI/2};
/** Static supports and dynamic parts consume the same anchors. Sizes are metres. */
export const EXCHANGE_PLAY_PROPS = {
  review:{counter:[-3,6.15,-39.04] as Vec3,counterSize:[1.5,.15,.65] as Vec3,
    selector:[-3,6.26,-38.72] as Vec3},
  archive:{counter:[-11.7,1.22,-19.31] as Vec3,counterSize:[3.4,.16,1.3] as Vec3,
    ticketSlot:[-11.7,1.48,-18.72] as Vec3,slotSize:[.68,.11,.16] as Vec3,
    ticketRest:[-11.7,1.47,-18.61] as Vec3,ticketSize:[.27,.015,.18] as Vec3},
  desk:{center:[0,0,-20] as Vec3,innerRadius:3.7,outerRadius:4.8,top:1.05,
    ticketSlot:[-1.35,1.05,-15.48] as Vec3,slotSize:[.4,.055,.14] as Vec3,
    sliderPivot:[-1.35,1.1,-15.40] as Vec3,sliderGripSize:[.14,.2,.12] as Vec3,
    ticketRest:[-1.35,1.08,-15.53] as Vec3},
  bell:{base:[0,.45,-37.16] as Vec3,frameTop:[0,2.77,-37.16] as Vec3,
    pivot:[0,2.52,-37.16] as Vec3,clapperPivot:[0,2.42,-37.16] as Vec3,
    pullRest:[0,1.48,-36.66] as Vec3,pullTravel:.22,bellRadius:.39},
  clearing:{counter:[11.7,1.22,-26.45] as Vec3,counterSize:[3.4,.16,1.3] as Vec3,
    machineBase:[11.7,1.39,-26.38] as Vec3,machineSize:[1.15,.18,.94] as Vec3,
    stampPivot:[11.7,2.16,-26.38] as Vec3,stampRest:[11.7,1.86,-26.38] as Vec3,
    stampTravel:.33,stampSize:[.42,.16,.34] as Vec3,
    receiptTray:[11.7,1.48,-25.88] as Vec3,receiptRest:[11.7,1.49,-25.8] as Vec3,
    receiptSize:[.29,.015,.21] as Vec3},
} as const;

import { clubFixedAssetContact } from './club-fixed-contact';
import source from './club-daybed-contact.generated.json';

// The flat edge of the shipped mattress, shared by its approach arc.
export const CLUB_DAYBED_FLAT_RADIUS = 1.425;
export const CLUB_DAYBED_MATTRESS_SIDES = 192;
export const CLUB_DAYBED_SOURCE = source;
export function clubDaybedContact(){return clubFixedAssetContact(CLUB_DAYBED_SOURCE);}

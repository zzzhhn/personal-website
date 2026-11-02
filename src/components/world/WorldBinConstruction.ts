/** Bin-only R2: pressed painted cover, rolled bare edges and a deep liner.
 * Existing drum/hinge, outer envelope, distant geometry and physics are retained. */
import { Builder, S, cyl, lathe, type Surf } from './WorldStreetGeometry';
import { benchBinSurfacesEnabled } from './WorldBenchBinSurface';

export const binR2Enabled = () => benchBinSurfacesEnabled() && (typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('benchBin') !== 'r1');
const linerUpper: Surf = { color: '#555F67', rough: .84, metal: 0 };
const linerLower: Surf = { color: '#303A43', rough: .9, metal: 0 };
const part = (B: Builder, name: string, draw: () => void) => { B.part(name, false); draw(); };
const revolve = (B: Builder, profile: [number, number][], surface: Surf, smooth = 40) =>
  lathe(B, profile, surface, { sides: 24, caps: false, smooth });

export function buildBinR2Details(B: Builder) {
  part(B, 'neck.lid-seat', () => revolve(B,
    [[.274, .812], [.287, .818], [.29, .831], [.284, .839], [.274, .833], [.274, .812]], S.galv));
  part(B, 'neck.compressed-gasket', () => revolve(B,
    [[.281, .836], [.291, .838], [.294, .847], [.291, .855], [.282, .853], [.281, .836]], S.rubber));
  part(B, 'lid.pressed-painted-shell', () => revolve(B,
    [[.297, .866], [.296, .89], [.282, .919], [.218, .969], [.184, .984],
      [.177, .977], [.216, .958], [.275, .907], [.286, .881], [.287, .866], [.297, .866]], S.creamPaint));
  part(B, 'lid.outer-rolled-hem', () => revolve(B,
    [[.294, .851], [.303, .855], [.305, .866], [.301, .877], [.292, .88],
      [.286, .872], [.287, .86], [.294, .851]], S.galv));
  part(B, 'mouth.rolled-metal-lip', () => revolve(B,
    [[.187, .98], [.183, .991], [.174, .995], [.163, .991], [.158, .982],
      [.16, .972], [.169, .97], [.173, .98], [.181, .981], [.187, .98]], S.galv));
  // The visible upper throat catches direct light; the lower wall and floor
  // recede through real geometry, without a black disk close to the opening.
  part(B, 'mouth.inner-liner-upper', () => revolve(B,
    [[.159, .979], [.159, .935], [.177, .859], [.183, .86], [.165, .936], [.165, .979], [.159, .979]], linerUpper));
  part(B, 'mouth.inner-liner-lower', () => revolve(B,
    [[.177, .86], [.214, .72], [.216, .546], [.222, .546], [.22, .721], [.183, .86], [.177, .86]], linerLower));
  part(B, 'mouth.inner-baffle', () => cyl(B, .217, .217, .532, .546, linerLower, 24));
  part(B, 'base.rolled-shoe', () => revolve(B,
    [[.237, .029], [.25, .037], [.256, .063], [.25, .086], [.24, .091],
      [.235, .077], [.239, .044], [.237, .029]], S.iron));
  part(B, 'base.contact-pad', () => revolve(B,
    [[.205, 0], [.224, 0], [.24, .016], [.239, .029], [.227, .033],
      [.217, .017], [.205, .016], [.205, 0]], S.rubber));
}

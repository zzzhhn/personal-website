/** Small synthesized bronze-bell partials. Bounded voices, no asset/model/download claim. */
let context:AudioContext|null=null;const nodes=new Set<OscillatorNode>();
export function primeAlphaAudio(){try{context??=new AudioContext();if(context.state==='suspended')void context.resume();}catch{/* Audio unavailable: visible mechanics remain. */}}
export function ringAlphaBell(){if(!context||context.state!=='running')return;for(const [i,hz] of [510,1035,1410,2160,3040].entries()){const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055/(i+1),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+1.8-i*.19);o.connect(g);g.connect(context.destination);nodes.add(o);o.onended=()=>{nodes.delete(o);o.disconnect();g.disconnect();};o.start();o.stop(t+1.9-i*.19);}}
export function stopAlphaAudio(){for(const n of nodes){try{n.stop();}catch{}}nodes.clear();}

import type { ExchangeActionKind } from './alpha-exchange-motion.ts';

export const EXCHANGE_SOUND_RATE = 24000;
export const EXCHANGE_SOUND_SECONDS = { paper:.28,slot:.34,detent:.18,stamp:.28,bell:1.6,receipt:.45 } as const;
export type ExchangeSound = keyof typeof EXCHANGE_SOUND_SECONDS;
export const EXCHANGE_CONTACT_SOUND: Record<ExchangeActionKind,{kind:ExchangeSound;level:number}> = {
  pickup:{kind:'paper',level:.75},insert:{kind:'slot',level:.82},adjust:{kind:'detent',level:.75},
  seal:{kind:'stamp',level:.9},ring:{kind:'bell',level:.85},collect:{kind:'receipt',level:.78},review:{kind:'detent',level:.65},
};

/** Authored material synthesis, not recorded Foley or motion-capture audio.
 * Rendered lazily once per variant into the shared bounded PCM cache. No live oscillators or reverbs. */
export function renderExchangeSound(kind:ExchangeSound,variant=0) {
  const rate=EXCHANGE_SOUND_RATE, length=EXCHANGE_SOUND_SECONDS[kind];
  if(!length||!Number.isInteger(variant))throw new RangeError('Unknown exchange sound or variant');
  const v=((variant%3)+3)%3,pitch=1+(v-1)*(kind==='bell'?.006:.023),data=new Float32Array(Math.round(length*rate));
  const bellDry=kind==='bell'?new Float32Array(data.length):null;
  const reflectionA=Math.round(.027*rate),reflectionB=Math.round(.061*rate);
  let seed=6271+v*107+Object.keys(EXCHANGE_SOUND_SECONDS).indexOf(kind)*379,low=0,body=0;
  for(let i=0;i<data.length;i++){
    const t=i/rate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const n=seed/2147483648-1;low+=(n-low)*.24;body+=(n-body)*.045;
    const pulse=(at:number,decay:number,attack=.002)=>t<at?0:Math.min(1,(t-at)/attack)*Math.exp(-(t-at)/decay);
    const tone=(frequency:number,decay:number,at=0)=>Math.sin(2*Math.PI*frequency*pitch*Math.max(0,t-at))*pulse(at,decay);
    const rustle=(at:number,decay:number)=>((low-body)*.8+body*.3)*pulse(at,decay,.009);
    let value=0;
    if(kind==='paper')value=1.45*rustle(0,.045)+1.05*rustle(.07,.035)+.6*rustle(.14,.027)+.075*tone(175,.018,.02);
    else if(kind==='slot')value=1.1*rustle(0,.055)+.8*rustle(.07,.045)+.19*tone(260,.021,.15)
      +.12*tone(735,.032,.16)+.3*low*pulse(.155,.009);
    else if(kind==='detent')value=.20*tone(620,.025)+.13*tone(1093,.021)+.22*low*pulse(0,.009)
      +.10*tone(340,.018,.045); // Small bronze spring, then a cushioned mechanical stop.
    else if(kind==='stamp')value=.37*tone(116,.035)+.18*tone(237,.023)+.6*body*pulse(0,.035)
      +.5*low*pulse(.004,.012)+.12*tone(410,.021,.075); // Felt, wood body and return spring.
    else if(kind==='receipt')value=.26*tone(130,.033)+.45*low*pulse(0,.011)+.16*tone(312,.022,.065)
      +1.2*rustle(.12,.058)+.9*rustle(.22,.047)+.4*rustle(.31,.025);
    else {
      // Inharmonic bronze modes and subtle beating. Two baked early reflections give
      // the large room some depth without opening a convolution bus or a feedback loop.
      const dry=.23*tone(278,.46)+.17*tone(584,.39)+.105*tone(837,.28)
        +.055*tone(1162,.22)+.045*tone(586.7,.36)+.035*tone(1507,.15);
      bellDry![i]=dry;
      value=dry+.13*(bellDry![i-reflectionA]??0)+.07*(bellDry![i-reflectionB]??0)+.18*low*pulse(0,.008);
    }
    data[i]=value*Math.min(1,i/(rate*.0015),(data.length-1-i)/(rate*.03));
  }
  let peak=0;for(const sample of data)peak=Math.max(peak,Math.abs(sample));
  if(peak>.58)for(let i=0;i<data.length;i++)data[i]*=.58/peak;
  return data;
}

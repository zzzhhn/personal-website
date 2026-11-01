import type { exchangeReview } from './alpha-exchange-review.ts';

/** The gallery uses the existing atlas allocation and changes only after a confirmed selector contact. */
export function drawExchangeReview(c: CanvasRenderingContext2D, review: NonNullable<ReturnType<typeof exchangeReview>>, zh: boolean) {
  const t = (a: string,b: string) => zh ? a : b;
  const number = (value: number) => value.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${number(value)}`;
  const text = (value: string,x: number,y: number,size=22,color='#e6dccb',width=950) => {
    c.font=`500 ${size}px "Avenir Next","PingFang SC",sans-serif`;c.fillStyle=color;c.fillText(value,x,y,width);
  };
  c.fillStyle='#253e39';c.fillRect(0,0,1024,288);
  text(t(`第 ${review.index+1} 段 · 选择留下的轨迹`,`INTERVAL ${review.index+1} · YOUR DECISION`),28,34,25,'#ccb88b',640);
  text(`${review.from} → ${review.through}`,28,67,23);
  text(t(`持仓 ${review.fromUnits} → ${review.units} 份`,`POSITION ${review.fromUnits} → ${review.units} UNITS`),700,35,21,'#ccb88b',295);
  text(t('本段盈亏','INTERVAL P/L'),700,76,18,'#b3c0ad',295);
  text(signed(review.pnl),700,112,34,'#f0e5cf',295);
  text(`${review.returnPct.toFixed(2)}%`,700,143,23,'#dccba6',295);
  const values=[...review.marks,...review.previous??[]].map(mark=>mark.equity);
  const lo=Math.min(...values),hi=Math.max(...values),span=Math.max(1,hi-lo);
  c.strokeStyle='#536a5b';c.lineWidth=1;
  for(const y of [95,150,205]){c.beginPath();c.moveTo(28,y);c.lineTo(650,y);c.stroke();}
  const line=(marks:typeof review.marks,color:string,dashed=false)=>{
    c.strokeStyle=color;c.lineWidth=3;c.setLineDash(dashed?[8,6]:[]);c.beginPath();
    marks.forEach((mark,i)=>{const x=32+i/Math.max(1,marks.length-1)*612,y=203-(mark.equity-lo)/span*105;
      if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();c.setLineDash([]);
    if(marks.length===1){c.fillStyle=color;c.beginPath();c.arc(32,203-(marks[0].equity-lo)/span*105,4,0,Math.PI*2);c.fill();}
  };
  if(review.previous)line(review.previous,'#9dc2c3',true);
  line(review.marks,'#e3c576');
  text(t('实线：本轮权益','SOLID: THIS RUN EQUITY'),28,234,18,'#e3c576',300);
  text(review.previous?t('虚线：上一轮同期权益','DASH: PRIOR RUN, SAME DATES'):t('首次回放，尚无上一轮','FIRST REPLAY: NO PRIOR RUN'),345,234,18,'#9dc2c3',310);
  text(review.previousPnl===null?t('尚无同段对照','NO MATCHING PRIOR INTERVAL'):
    `${t('上轮同期','PRIOR P/L')} ${signed(review.previousPnl)}`,700,181,19,'#9dc2c3',295);
  if(review.difference!==null)text(`${t('收益差额','P/L DIFFERENCE')} ${signed(review.difference)}`,700,215,20,'#dccba6',295);
  text(t('E 拨动复盘台，切换已走过的历史段落','E AT SELECTOR: CYCLE COMPLETED INTERVALS'),28,263,20,'#dccba6',950);
  text(t('Alpha Agent API · 历史 SPY · 虚拟积分，不计手续费或滑点','ALPHA AGENT API · HISTORICAL SPY · VIRTUAL POINTS; NO FEES OR SLIPPAGE'),28,282,13,'#91a295');
}

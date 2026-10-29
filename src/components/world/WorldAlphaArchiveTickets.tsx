import { useEffect, useMemo } from 'react';
import { CanvasTexture, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { EXCHANGE_ARCHIVE_DRAWERS } from './alpha-exchange-play-layout';
import { exchangeWorld } from './alpha-exchange-layout';
import { canRequestExchangeArchiveTicket, requestExchangeArchiveTicket, useExchangePlay } from './alpha-exchange-play';

function Drawer({ index, paper, ticket }: { index:number; paper:MeshStandardMaterial; ticket:BufferGeometry }) {
  const state = useExchangePlay(), entry = state.catalog[index+1], station = EXCHANGE_ARCHIVE_DRAWERS[index];
  useInteractable(entry ? { id:`alpha-archive-${entry.id}`, kind:'exhibit', position:exchangeWorld(station.stand), radius:.8,
    label:{zh:`取出 ${entry.label} 年档案票`,en:`Take the ${entry.label} archive ticket`},
    enabled:()=>canRequestExchangeArchiveTicket(entry.id), onInteract:()=>{requestExchangeArchiveTicket(entry.id);} } : null);
  const used = entry?.id === state.ticketId && !!state.round && state.round.phase !== 'complete' && !state.ticketReturned;
  return <mesh name={`exchange-drawer-ticket-${index}`} geometry={ticket} material={paper}
    position={station.contact} visible={!!entry && !used}
    onClick={event=>{event.stopPropagation();if(entry)requestExchangeArchiveTicket(entry.id);}}/>;
}

/** Four physical labels share a single small atlas. No polling or new lights. */
export default function WorldAlphaArchiveTickets({paper,ticket}:{paper:MeshStandardMaterial;ticket:BufferGeometry}) {
  const catalog=useExchangePlay(s=>s.catalog), zh=useWorldStore(s=>s.lang==='zh');
  const labels=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    const material=new MeshStandardMaterial({map:texture,roughness:.85,emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:.3});
    const planes=EXCHANGE_ARCHIVE_DRAWERS.map((station,i)=>{
      const g=new PlaneGeometry(.7,.31),uv=g.getAttribute('uv');
      for(let k=0;k<uv.count;k++)uv.setXY(k,(i%2+uv.getX(k))/2,(1-Math.floor(i/2)+uv.getY(k))/2);
      g.translate(station.contact[0],1.96,-23.035);return g;
    });
    const geometry=mergeGeometries(planes)!;planes.forEach(g=>g.dispose());
    return{canvas,texture,material,geometry};
  },[]);
  useEffect(()=>{
    const c=labels.canvas.getContext('2d')!;c.textAlign='center';c.textBaseline='middle';
    for(let i=0;i<4;i++){
      const x=(i%2)*256,y=Math.floor(i/2)*128,entry=catalog[i+1];
      c.fillStyle='#dfd2b6';c.fillRect(x,y,256,128);c.strokeStyle='#a78b56';c.lineWidth=3;c.strokeRect(x+5,y+5,246,118);
      c.fillStyle='#354d43';c.font='600 45px Georgia';c.fillText(entry?.label??'—',x+128,y+39);
      c.font='500 16px "Avenir Next","PingFang SC",sans-serif';
      c.fillText(entry?`${entry.history[0].date} →`:(zh?'先到档案台读取历史':'LOAD AT THE COUNTER'),x+128,y+77);
      c.fillText(entry?entry.history.at(-1)!.date:'SPY',x+128,y+102);
    }
    labels.texture.needsUpdate=true;
  },[catalog,zh,labels]);
  useEffect(()=>()=>{labels.texture.dispose();labels.material.dispose();labels.geometry.dispose();},[labels]);
  return <group name="exchange-archive-catalog">
    <mesh geometry={labels.geometry} material={labels.material}/>
    {EXCHANGE_ARCHIVE_DRAWERS.map((_,i)=><Drawer key={i} index={i} paper={paper} ticket={ticket}/>)}
  </group>;
}

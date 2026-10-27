import { useEffect, useMemo } from 'react';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { useWorldStore } from '../store';
import { IBD_STATIONS, ibdStation } from './ibd-yard-layout.ts';
import { useIbdYardStore } from './ibd-yard-store.ts';
import type { Vec3 } from '../types';

/** One local canvas atlas and one draw for every physical sign; no font fetch or DOM in the canvas. */
export default function WorldIbdSigns() {
  const lang = useWorldStore(s => s.lang);
  const moved = useIbdYardStore(s => s.game.core.moved);
  const data = useMemo(() => {
    const zh = lang === 'zh';
    const signs: { at: Vec3; w: number; h: number; title: string; sub: string }[] = [
      { at: [0, 3.4, 21.3], w: 7.4, h: 1.5, title: zh ? '物资清点场' : 'INVENTORY YARD', sub: zh ? '国投证券经历改编 · 模拟资料' : 'SDIC EXPERIENCE · FICTIONAL CARGO' },
      { at: [-14, 6.1, 3.3], w: 8, h: 1.3, title: zh ? '钢卷检验棚' : 'COIL INSPECTION', sub: zh ? '地面吊运 ／ 西侧高廊' : 'CRANE FLOOR / WEST GALLERY' },
      { at: [14, 4.7, -2.7], w: 8, h: 1.3, title: zh ? '五金拆检棚' : 'PARTS INSPECTION', sub: zh ? '称重是线索 · 开箱才有证据' : 'WEIGH FOR A CLUE · OPEN TO VERIFY' },
      { at: [14, 5.3, 20.3], w: 8, h: 1.3, title: zh ? '物流发货仓' : 'DISPATCH DEPOT', sub: zh ? '发货目标：M8 五金 8 件' : 'MANIFEST: 8 M8 PIECES' },
      { at: [-20.6, 1.6, 4.03], w: 2.6, h: .7, title: zh ? '缓坡上高廊' : 'GALLERY RAMP', sub: zh ? '换个角度看后排' : 'A DIFFERENT VIEW' },
      { at: [14, 2.1, -15.4], w: 5, h: .8, title: zh ? '隔离记录 ／ 备件' : 'QUARANTINE / SPARES', sub: zh ? '原始差异保留，新货须再验' : 'KEEP FINDINGS · RECHECK REPLACEMENTS' },
      { at: [-17, 1.3, 14.2], w: 4, h: .8, title: zh ? '钢卷退换位' : 'COIL EXCHANGE', sub: zh ? '隔离原货与新供货分开' : 'RETURNED CARGO IS SEPARATE' },
      ...IBD_STATIONS.map(original => { const s = ibdStation(original.id, moved); return ({ at: [s.at[0], s.at[1] + .95, s.at[2] - .35] as Vec3,
        w: s.id.startsWith('gallery') ? 2 : 1.8, h: .65, title: s.title[lang], sub: s.id === 'manifest' ? '2 COILS / 8 M8' : 'E / Y' }); }),
    ];
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
    signs.forEach((s, i) => {
      const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 128;
      ctx.fillStyle = '#243740'; ctx.fillRect(cx, cy, 256, 128);
      ctx.fillStyle = '#e8ac39'; ctx.fillRect(cx + 10, cy + 10, 236, 5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4f1e6';
      ctx.font = `600 ${zh ? 28 : 25}px ${zh ? '"Songti SC", serif' : 'sans-serif'}`;
      ctx.fillText(s.title, cx + 128, cy + 53, 235);
      ctx.font = '500 15px sans-serif'; ctx.fillStyle = '#dfd8c4'; ctx.fillText(s.sub, cx + 128, cy + 95, 233);
      const [x, y, z] = s.at, n = positions.length / 3;
      positions.push(x - s.w / 2, y - s.h / 2, z, x + s.w / 2, y - s.h / 2, z, x + s.w / 2, y + s.h / 2, z, x - s.w / 2, y + s.h / 2, z);
      normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      const u = cx / 1024, v = 1 - (cy + 128) / 1024;
      uv.push(u, v, u + .25, v, u + .25, v + .125, u, v + .125); indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    });
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 2;
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
    return { geometry, material, texture };
  }, [lang, moved]);
  useEffect(() => () => { data.geometry.dispose(); data.material.dispose(); data.texture.dispose(); }, [data]);
  return <mesh name="ibd-physical-sign-atlas" geometry={data.geometry} material={data.material} dispose={null} />;
}

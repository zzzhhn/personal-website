"""Copy the captured evidence into a lightweight, no-WebGL comparison page."""
from pathlib import Path
import argparse
import html
import json
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[3]
evidence = repo / 'docs/world/phase-2-playground/ibd-full-craft-20261106/evidence'
args.destination.mkdir(parents=True, exist_ok=True)
views = [
    ('stock-day', '仓储与拆检'), ('loading-day', '货车与装卸'),
    ('cab-day', '驾驶室与轮组'), ('tools-day', '实际工具材质'),
    ('entrance-day', '入口'), ('overview-day', '全景'),
    ('stock-night', '夜间仓储'), ('loading-night', '夜间装卸'),
    ('overview-night', '夜间全景'),
]
for image in evidence.glob('*.png'):
    shutil.copy2(image, args.destination / image.name)
buttons = ''.join(f'<button data-view="{key}">{html.escape(label)}</button>' for key, label in views)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>国投场景 · 精修对照</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#142127;color:#e8e5dc;font:15px system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:24px}header{display:flex;align-items:baseline;justify-content:space-between;gap:24px}h1{font-size:26px;font-weight:550;margin:0 0 10px}a{color:#e5bd68}p{color:#b9c3c2;margin:0 0 18px}nav{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}button{cursor:pointer;background:#23363e;border:1px solid #526067;color:inherit;border-radius:6px;padding:9px 14px}button[aria-pressed=true]{background:#d3ac61;color:#142127;border-color:#d3ac61}.compare{position:relative;line-height:0;background:#071014;overflow:hidden;border-radius:9px}.compare img{width:100%;display:block}.compare .old{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}.divider{position:absolute;inset:0 auto 0 50%;width:2px;background:#f7d78c;pointer-events:none}.badge{position:absolute;top:14px;line-height:1;background:#142127df;padding:8px 12px;border-radius:5px}.before{left:14px}.after{right:14px}.range{width:100%;margin:15px 0 26px;accent-color:#d3ac61}.extras{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}figure img{width:100%;border-radius:9px}figcaption{padding:8px 0;color:#c6cecb}@media(max-width:680px){main{padding:15px}header{display:block}.extras{grid-template-columns:1fr}}
</style><main><header><h1>国投场景 · 精修对照</h1><a href="/world/?start=ibd&quality=balanced&paused=1">进入试玩</a></header>
<p>同机位、同时间、同画质。左侧为本轮前，右侧为本轮后；拖动滑杆对照。</p><nav>BUTTONS</nav>
<div class="compare"><img id="new" alt="精修后"><img id="old" class="old" alt="精修前"><span class="badge before">本轮前</span><span class="badge after">本轮后</span><div class="divider"></div></div>
<input class="range" type="range" min="0" max="100" value="50" aria-label="前后对照分界">
<div class="extras"><figure><img src="after-service-day.png" alt="精修后的检修区" loading="lazy"><figcaption>检修区：箱盖、锁扣、支脚、设备门及场地构件</figcaption></figure><figure><img src="after-gallery-day.png" alt="精修后的高廊" loading="lazy"><figcaption>高廊：原有踏面上的防滑钢板，不叠加共面装饰层</figcaption></figure></div>
<script>const select=k=>{document.querySelector('#new').src='after-'+k+'.png';document.querySelector('#old').src='before-'+k+'.png';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===k)))};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>select(b.dataset.view));document.querySelector('.range').oninput=e=>{document.querySelector('.old').style.clipPath='inset(0 '+(100-e.target.value)+'% 0 0)';document.querySelector('.divider').style.left=e.target.value+'%'};select('stock-day');</script></main></html>'''
(args.destination / 'index.html').write_text(page.replace('BUTTONS', buttons))
print(json.dumps({'destination': str(args.destination), 'matchedViews': len(views), 'extraViews': 2}))

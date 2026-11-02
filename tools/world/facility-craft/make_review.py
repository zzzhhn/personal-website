"""Assemble bounded local evidence, without changing or compositing screenshots."""
import argparse
import html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/world/phase-2-playground/asset-batch5-20261102'
STREET = [('bench', '街道长椅'), ('shelter', '候车亭'), ('lamp', '路灯'),
          ('signal', '交通信号机'), ('bin', '垃圾箱'), ('roadblock', '施工路障'),
          ('seawallBay', '海堤栏杆'), ('timberRail', '山路木栏')]
CAMP = [('C12', '吉他'), ('C13', '哑铃'), ('C14', '炉灶与炒锅'),
        ('C15', '行李箱'), ('C16', '桌上提灯')]
NATURE = [('tree-medium', '代表树中距'), ('tree-close', '代表树近距'),
          ('patches-medium', '草土过渡中距'), ('patches-close', '草土过渡近距')]

parser = argparse.ArgumentParser()
parser.add_argument('--require-all', action='store_true')
args = parser.parse_args()
missing, linked = [], []


def panel(file, label):
    p = OUT / file
    if not p.exists():
        missing.append(file)
        return ''
    linked.append(file)
    return (f'<figure><figcaption>{html.escape(label)}</figcaption>'
            f'<a href="{file}"><img loading="lazy" src="{file}" '
            f'alt="{html.escape(label)}"></a></figure>')


def web(name, label):
    sections = []
    for time, title in [('noon', '正午'), ('night', '深夜')]:
        a = panel(f'runtime/legacy-v-{name}-{time}.png', '第四批基线')
        current = {
            'c13': f'camp-revision-r2/runtime/r7-v-c13-{time}.png',
            'c15': f'camp-contact-r9/runtime/r9-v-c15-{time}.png',
        }.get(name, f'runtime/candidate-v-{name}-{time}.png')
        b = panel(current, '第五批已审版本')
        if a and b:
            sections.append(f'<h3>{title}</h3><div class="pair">{a}{b}</div>')
    return f'<section><h2>{html.escape(label)}</h2>{"".join(sections)}</section>' if sections else ''


def offline(stem, label, camp=False):
    if camp:
        files = [(f'camp-review/{stem}_rest_overview_{stage}.png', title)
                 for stage, title in [('baseline', '原始 GLB'), ('native', '可编辑原生'), ('fresh', '重新导入 GLB')]]
    else:
        files = [(f'street-review/{stem}-{stage}.png', title)
                 for stage, title in [('baseline', '原始 Builder'), ('native', '可编辑原生'), ('fresh', '重新导入 GLB')]]
    images = ''.join(panel(file, title) for file, title in files)
    return f'<h3>{html.escape(label)}</h3><div class="triple">{images}</div>'


content = '<h2>G17 R3样板</h2>' + ''.join(web(name, label) for name, label in NATURE[:2])
content += '<h2>街道八件设施</h2>' + ''.join(web(name, label) for name, label in STREET)
content += '<h2>营地五件近景道具</h2>' + ''.join(web(name.lower(), label) for name, label in CAMP)
content += panel('camp-contact-r9/runtime/r9-v-c15-low-noon.png', '行李箱R9低角度接触')
content += '<h2>R10候车亭原生E坐立回归</h2><div class="pair">'
content += panel('runtime-r10/r10-shelter-sit-visible.png', '开放侧普通相机，实际坐姿')
content += panel('runtime-r10/r10-shelter-stand-visible.png', '再次E起身，原座位不变')
content += '</div>'
content += '<details><summary>最初构造阶段的同灯架原始／原生／fresh记录</summary><p>C13后续滚花返修以R7实际网页与新原生源／GLB为准；这些离线图保留最初构造版本，不冒充后续重新渲染。</p>'
content += ''.join(offline(name, label) for name, label in STREET)
content += ''.join(offline(name, label, camp=True) for name, label in CAMP)
content += '</details>'
content += '<details><summary>被否决地表R4，仅历史证据</summary>'
content += ''.join(web(name, label) for name, label in NATURE[2:]) + '</details>'
if args.require_all and missing:
    raise SystemExit('Missing review artifacts: ' + ', '.join(missing))
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>第五批资产审阅</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#23383c;background:#f6f8f7;max-width:1800px;margin:32px auto;padding:0 24px}h1{font-size:28px}h2{font-size:23px;margin-top:42px}h3{font-size:17px;margin:24px 0 10px}p{max-width:1050px}a{color:#216a70}figure{margin:0}figcaption{font-size:14px;margin:0 0 6px}.pair,.triple{display:grid;gap:14px}.pair{grid-template-columns:1fr 1fr}.triple{grid-template-columns:repeat(3,1fr)}img{display:block;width:100%;height:auto}summary{cursor:pointer;font-size:21px;margin:40px 0}section{padding-bottom:8px;border-bottom:1px solid #d2dcd9}@media(max-width:700px){.pair,.triple{grid-template-columns:1fr}}</style>
<h1>第五批十四项：十三件设施与G17</h1>
<p>G17与十三件设施已获主协调在指定机位的视觉接受。下方采用实际已审版本：C13为R7，C15为R9，其余为R4；没有把历史截图改成新包身份。候车亭坐姿镜头与性能另行留证，详见交接。默认地表仍为批四；被否决地表R4仅保留在历史折叠区，独立新地表不混入十四项。</p>
<p>网页图为实际 Chrome 截图，点击可看原图。左为第四批回退分支，右为第五批候选；相机、缓冲、天气、质量与时间记录见 <a href="views.json">机位</a> 与相邻原始 JSON。原生渲染、网页行为、性能与主协调视觉验收分别留证。</p>
<p><a href="RESULT.md">交接与限制</a> · <a href="NATURE.md">自然样板</a> · <a href="STREET.md">街道设施</a> · <a href="CAMP.md">营地道具</a> · <a href="asset-costs.json">资源清单</a></p>
''' + content + '</html>'
(OUT / 'review.html').write_text(page)
print(f'Review references {len(set(linked))} images; missing {len(missing)}; no screenshots altered.')

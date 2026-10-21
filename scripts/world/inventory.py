"""Build the review inventory and non-destructive reference crop viewer (no models)."""
import html, json, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/world'
rows = []
def add(id, zone, name, source, count, tris, roles, physics, ref, crop, note=''):
    rows.append(dict(id=id, zone=zone, name=name, source=source, count=count, triangles=tris,
        materialRole=roles, physics=physics, reference=ref, crop=crop, note=note,
        status='待 Fable 审；未建模'))
P='程序化'; L='L1 coding'; H='L1 能力测试 → L2 Hy3D（预判）'
# Crop = normalized x,y,width,height in [0,1], never a claimed orthographic asset view.
add('G01','全局','岛体分层崖壁',P,1,'≤12k','stone / ground','静态','layout',[.04,.05,.64,.89],'程序化连通陆地；不是三座孤岛')
add('G02','全局','沙滩与浅滩',P,1,'≤3k','sand','静态','layout',[.04,.60,.56,.35])
add('G03','全局','海面及浅水层',P,1,'≤4k','water','无碰撞，水域检测','park',[.32,.55,.63,.43])
add('G04','全局','主路和营地下降坡',P,1,'≤5k','road / edge','静态','layout',[.35,.25,.44,.51],'时间轴由西南至东北')
add('G05','全局','内陆支路',P,1,'≤2k','ground','静态','layout',[.15,.19,.51,.23])
add('G06','全局','连接桥',P,1,'≤2k','stone','静态','layout',[.61,.19,.11,.12],'恰好一座，连接城区与入口广场')
add('G07','全局','路缘石模块',P,'按路长','≤120/段','stone','静态','town',[.03,.57,.72,.38])
add('G08','全局','海堤与步道',P,1,'≤6k','stone','静态','town',[.49,.46,.51,.54])
add('G09','全局','海堤护栏模块',P,'按路长','≤240/段','stone / metal','动态，30s复位','town',[.51,.59,.49,.41],'海堤基础固定，栏杆可撞倒；外侧水域兜底')
add('G10','全局','路灯',L,'约18','≤700/件','metal / light_front','动态，30s复位','town',[.68,.69,.09,.20],'轻科技仅灯头；自然暖白路灯光')
add('G11','全局','年份灯柱',L,6,'≤500/件','metal / light','动态，30s复位','town',[.13,.67,.04,.14],'经过触发青色微亮与年份；年份文字运行时生成')
add('G12','全局','路障',L,'约6','≤500/件','paint / accent','动态，30s复位','town',[.43,.54,.15,.16],'参考图未独立展示，待补正侧细节图')
add('G13','全局','垃圾桶',L,'约4','≤600/件','metal / paint','动态，30s复位','town',[.43,.54,.15,.16],'参考图未独立展示，待补图')
add('G14','全局','街边长椅',L,'约4','≤800/件','wood / metal','静态','town',[.72,.39,.18,.20],'参考图未独立展示，待补图')
add('G15','全局','广告牌',L,'约3','≤700/件','wood / paint','动态，30s复位','town',[.57,.43,.05,.07],'复用自然材质牌架；不做发光广告面')
for id,name,crop in [('G16','阔叶团簇树',[.30,0,.18,.26]),('G17','矮团簇树',[.12,.13,.16,.30]),('G18','高团簇树',[.59,0,.15,.26])]:
    add(id,'全局',name,L,'实例复用','≤900/件','foliage / wood','静态树干','camp',crop,'树冠3–5团，每团60–120三角；三阶橄榄色')
for id,name,crop in [('G19','单团灌木',[.18,.48,.06,.10]),('G20','双团灌木',[.76,.57,.10,.10])]:
    add(id,'全局',name,L,'实例复用','≤300/件','foliage','无碰撞','camp',crop)
for id,name,crop in [('G21','大岩石',[.65,.69,.08,.10]),('G22','中岩石',[.61,.75,.07,.09]),('G23','小岩石',[.69,.76,.07,.10])]:
    add(id,'全局',name,L,'实例复用','≤100/件','stone','大件静态，其余无碰撞','camp',crop,'8–14面多面体，底大顶小，三块成组')
add('G24','全局','向导B及骨骼',H,1,'4–6k','paint / accent / glass / metal / light','动态胶囊','guide',[0,0,1,1],'Mixamo待机/走/跑/跳/坐起/上下车；先测绑骨；右头盔青点按v3特例')
add('G25','全局','方正4×4',H,1,'6–8k','paint / accent / rubber / glass / metal / light_front / light_brake','动态底盘＋四射线轮','offroad',[0,0,1,1],'先做一辆L1能力测试，最多三轮；营地出口')
add('G26','全局','Fastback轿跑',H,1,'7–10k','paint / accent / rubber / glass / metal / light_front / light_brake','动态底盘＋四射线轮','coupe',[0,0,1,1],'海岸路边；尾灯宽青条')
add('G27','全局','方盒厢式小货车',H,1,'6–8k','paint / accent / rubber / glass / metal / light_front / light_brake','动态底盘＋四射线轮','van',[0,0,1,1],'栈道入口硬地广场，非栈道深处')
add('G28','全局','传送门入口',L,1,'≤1k','stone / light','无碰撞，入口触发','layout',[.19,.41,.23,.32],'无单体锁定参考，待补图；上线阶段实现')
add('G29','全局','远景风车或天线',L,1,'≤1k','wood / metal','静态底座','town',[.54,.14,.11,.11],'只选其一，参考局部不足；待补图，不擅自加科技')
# Camp, eight exact pads.
add('C01','营地','篝火环形广场与土路',P,1,'≤2k','ground / stone','静态','camp',[.30,.35,.40,.30])
add('C02','营地','八块物件石板',P,8,'≤120/块','stone','静态','camp',[.24,.41,.55,.34])
add('C03','营地','大帐篷',L,1,'≤1k','canvas / wood','静态','camp',[.44,.14,.13,.21],'北侧中央；身份内容入口')
add('C04','营地','小帐篷',L,2,'≤1k/件','canvas / wood','静态','camp',[.28,.20,.15,.22],'同资产左右复用，三顶总数')
add('C05','营地','石砌篝火坑及柴',L,1,'≤1k','stone / wood','静态','camp',[.46,.46,.10,.09],'火焰独立运行时动效，不靠密集粒子')
add('C06','营地','原木长凳',L,4,'≤500/件','wood','静态','camp',[.42,.41,.09,.09])
add('C07','营地','书桌',L,1,'≤850','wood','静态','camp',[.25,.43,.06,.10],'石板1')
add('C08','营地','书堆',L,1,'≤500','paper / accent','无碰撞','camp',[.26,.41,.04,.08],'石板1，书脊文字独立生成双语')
add('C09','营地','奖杯架',L,1,'≤900','wood / metal','静态','camp',[.25,.31,.05,.12],'石板2，奖杯简化无高反金属')
add('C10','营地','旗杆及四面旗',L,1,'≤900','wood / canvas','静态杆','camp',[.34,.42,.05,.24],'石板3，旗子运行时风动')
add('C11','营地','工具墙',L,1,'≤1k','wood / metal','静态','camp',[.73,.32,.06,.21],'石板4，五类技能映射在内容层，不复制事实')
add('C12','营地','吉他',L,1,'≤1k','wood / accent','无碰撞','camp',[.69,.38,.04,.09],'石板5')
add('C13','营地','哑铃',L,1,'≤600','metal / rubber','无碰撞','camp',[.41,.66,.10,.06],'石板6')
add('C14','营地','炒锅及炉',L,1,'≤1k','metal / stone','静态','camp',[.56,.62,.08,.11],'石板7')
add('C15','营地','行李箱',L,1,'≤800','canvas / metal','无碰撞','camp',[.71,.56,.05,.06],'石板8')
add('C16','营地','桌上小灯',L,1,'≤500','metal / glass','无碰撞','camp',[.25,.43,.06,.10],'夜档明确要求；自然暖光灯，不做科技条')
# Buildings with distinct silhouettes, exact natural and restricted accent materials.
for id,name,tris,role,crop,note in [
('T01','国投证券楼','4–6k','stone / glass / metal',[.015,.405,.22,.33],'方柱与旋转门；抽象文字，不用logo'),
('T02','WorldQuant楼','3–5k','paint / glass',[.176,.295,.18,.34],'玻璃盒子，玻璃不透明；屏幕墙空白'),
('T03','MoE Capital楼','2–4k','stone / glass',[.344,.369,.15,.21],'两层加州平顶'),
('T04','ByteDance楼','3–5k','paint / glass',[.434,.204,.14,.28],'蓝白体块，留空招牌板'),
('T05','Video Rebirth楼','4–6k','stone / glass / metal',[.533,.156,.14,.29],'窄阳台、招牌框不亮'),
('T06','腾讯混元楼','4–6k','paint / glass / light',[.617,.041,.129,.36],'楼顶环只微亮，禁止大片霓虹')]:
    add(id,'城区',name,L,1,tris,role,'静态','town',crop,note)
add('T07','城区','内陆第二排矮楼',L,'3–4','2–3k/件','paint / stone / glass','静态','layout',[.22,.19,.33,.20],'仅背景无内容；布局锁明确要求，但缺单体图，待补图')
add('T08','城区','楼前广场铺装',P,6,'≤240/处','stone','静态','town',[.12,.48,.52,.30])
add('T09','城区','楼前展板',L,6,'≤600/件','wood / paint','静态','town',[.24,.65,.024,.065],'与广告牌区分；文字读取现站数据')
add('T10','城区','楼顶或立面招牌板',L,6,'≤400/件','paint / metal','附着建筑','town',[.5,.36,.05,.07],'动态文字与经过提示，不新增科技发光位置')
add('T11','城区','混元楼顶发光环',L,1,'≤600','metal / light','附着建筑','town',[.649,.046,.068,.04],'单独材质槽，两档亮度受控')
add('T12','城区','棕榈树',L,2,'≤1k/件','foliage / wood','静态树干','town',[.341,.27,.092,.126],'MoE局部专用，不能把全部团簇树换成棕榈')
# Park structures and six interactive props are independently replaceable.
add('P01','园区','桥头硬地入口广场',P,1,'≤1k','stone','静态','park',[.04,.16,.20,.17])
add('P02','园区','之字栈道面与支柱',P,1,'≤8k','wood','静态','park',[.10,.40,.82,.41],'六屋各有连通入口，不允许跨水跳跃才能到')
add('P03','园区','栈道矮栏',P,'按路径','≤240/段','wood','动态，30s复位','park',[0,.065,.13,.13],'参照桥栏自然材质；六屋开口不能挡住')
add('P04','园区','栈道暖光灯柱',L,'约10','≤500/件','wood / light_front','动态，30s复位','park',[0,.065,.13,.13],'夜档详见night-and-ground；此局部仅形制参照，待细节')
add('P05','园区','园区总牌',L,1,'≤700','wood / paint','静态','park',[.04,.16,.20,.17],'参考未独立展示，待补图')
for i,(name,crop) in enumerate([
('Alpha Agent',[.11,.31,.15,.29]),('EvalForge',[.24,.22,.155,.278]),('DJC',[.42,.217,.12,.249]),
('Hepai',[.51,.27,.15,.29]),('Accompany',[.637,.334,.15,.297]),('Interactive Learning',[.766,.407,.18,.31])],1):
    add(f'P{5+i:02}','园区',f'{name}展位小屋',L,1,'2–3k','paint / wood / light','静态','park',crop,'一面朝栈道开口；檐下青条≤3cm等效，共用结构允许宽度变体')
for id,name,source,tris,role,crop,note in [
('P12','研究台：竖屏＋实体拨杆',L,'≤1k','wood / glass / metal',[.166,.379,.082,.164],'E：拨杆、回测曲线、通过/拒绝章，≤10秒'),
('P13','评审亭：双屏＋大按钮',L,'≤1k','wood / glass / paint',[.30,.326,.065,.109],'E：两段3秒抽象片，切票，票数柱变化'),
('P14','DJ台：双唱盘＋横推子','L1 coding → L2 Hy3D（复杂件预判）','≤1k','wood / metal / rubber',[.438,.34,.07,.092],'E：推子一档，两音轨交叉淡入淡出；音频许可单独核对'),
('P15','九格唱片墙','L1 coding → L2 Hy3D（复杂件预判）','≤1k','wood / accent',[.559,.326,.063,.146],'E：换位和连线粗细；连线不使用全息科技效果'),
('P16','两张露营椅',L,'≤900/椅','wood / canvas',[.653,.467,.094,.132],'E：坐下、三句气泡、灯亮；再按起身'),
('P17','椅间小灯及桌',L,'≤600','wood / metal / glass',[.69,.487,.03,.073],'自然暖光，不扩大轻科技范围'),
('P18','黑板及讲台',L,'≤1k','wood / paint',[.792,.491,.095,.191],'E：翻页、课程缩略图、粉笔划线；课程数量按内容源核对'),
]: add(id,'园区',name,source,1,tris,role,'主体静态，小件动态30s复位','park',crop,note)
add('P19','园区','项目小牌',L,6,'≤400/件','wood / paint','静态','park',[.766,.407,.18,.31],'无独立局部图，待补图；名称/定位/状态从projects读取')
for id,name,crop in [('F01','影像地基（北）',[.415,.117,.116,.125]),('F02','社团地基（西）',[.191,.227,.104,.14]),('F03','联系地基（南）',[.388,.74,.099,.114])]:
    add(id,'二期',name,P,1,'≤300','stone','静态','layout',crop,'仅地基不扩建')
add('F04','二期','建设中牌',L,3,'≤400/件','wood / paint','静态','layout',[.388,.74,.099,.114],'共用一个资产＋双语运行时文字，形制细节待补')
(OUT/'assets-v1.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
intro='''# 资产清单 v1 · 待 Fable 审

2026-10-20。依据 PRD v1（含 v1.1）、Art Lock v1/v2/v3、制作管线 v1 与 Codex 总指令；冻结文件未改动。**本表是正式资产的制作计划，不是已完成模型清单。灰盒只使用占位几何。**

## 审阅入口

打开 [参考图裁切索引](reference-crops.html)。每件均有稳定 ID、原图链接、归一化裁切矩形 `x,y,w,h`；HTML 用 SVG viewBox 展示原图区域，不重绘、不生成新美术。原图按已有签字版本原样复制至 references/。不清楚或图中没有的部件明确标「待补图」，不能凭表格开模。机器可读清单在 [assets-v1.json](assets-v1.json)。

来源：程序化＝运行时地形／道路／水面等；L1 coding＝输出独立GLB；L2 Hy3D＝L1不通过后回退。角色和车预判L2，先用一车完成L1能力测试；未得到Bobby直接L2许可前不跳过门。每件L1最多三轮，剪影／分件／曲面／比例偏差<10%由视觉模型留下差异清单。

面数均指三角数上限或区间，实例数量是初始摆放估算，非额外产品范围。同屏≤500k三角、≤300 draw calls；首包≤15MB。场景重复物件需实例化或按材质合批，碰撞体不跟随渲染高面网格。角色4–6k、车辆6–10k、楼2–6k、小件≤1k。灰盒不消耗Hy3D额度。

材质槽：自然材质为ground/sand/stone/wood/canvas/foliage/paper/water；paint/accent/glass/metal/rubber按契约。light仅允许六处，向导头盔青点按v3已签字特例；篝火、窗格、小灯用自然照明。所有玻璃不透明；六个科技位置以Art Lock为上限。正式资产无贴图优先，若有则≤1024，GLB用Meshopt或Draco。

## 逐件清单

| ID | 区域 | 资产及数量 | 来源 | 目标三角数 | materialRole | 物理 | 参考裁切 | 制作备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
'''
lines=[]
for r in rows:
    lines.append('| '+ ' | '.join([r['id'],r['zone'],f"{r['name']} × {r['count']}",r['source'],r['triangles'],r['materialRole'],r['physics'],f"[{r['reference']} #{r['id']}](reference-crops.html#{r['id']})",r['note'] or '待Fable审'])+' |')
end='''

## 可复用件与总量

共 %s 个制作条目，数量包含复用实例；不是 %s 件独立 Hy3D 生成。楼前展板、项目牌、灯柱、栏杆、树石、三个帐篷和六个小屋优先复用。营地八块石板逐一覆盖八类物件；城区六栋按时间单侧排列，外加3–4栋无交互背景矮楼；园区六屋沿之字栈道，车在入口广场；二期仅三基座与牌。

## 共同导出与验收契约

- GLB +X前/+Y上/+Z右，尺寸从包围盒读取；车底盘原点与四轮独立节点按v3，wheel-front-right/front-left/rear-right/rear-left的枢轴在轴心、局部Z转轴。三个碰撞盒（底盘/座舱/整体）从节点包围盒派生。
- 角色测试抬手、弯腿、转身后再适配Mixamo待机/走/跑/跳/坐起/上下车。不在灰盒阶段制作动作。
- 每件固定正、侧、后、顶、两个3/4六机位，在黄昏和夜档检查。视觉模型必须输出可追踪差异表；三轮失败转L2。
- 动态路灯/护栏/路障/垃圾桶/广告牌/展位旁小件受撞后30秒原位重生，静态楼与大树仅回弹/震镜头。灰盒先用可撞路障验证机制，其余正式道具留到组装门。
- Hy3D第一批须实测导出格式、面数控制、绑骨能力，当前全部「未实测」。只上传公开参考图，不带公司资料；产物入库前再次确认许可范围。

## 待澄清与后续门

1. 清单门：Fable审阅本表与裁切索引，Bobby过目，尚未签字。图中缺少的路障、垃圾桶、背景楼、总牌等在L1前补局部多视图，不把裁切缺失冒充已锁定单体。
2. 灰盒门：Bobby亲手玩5分钟，确认连通、镜头和三车手感。未签字不开始任何正式建模或Hy3D。
3. 资产契约疑点：v3同时写「底盘原点在地面中心」与「车轮中心y为负轮径」，在+Y向上时存在轮子落地平面下的歧义。灰盒无GLB导出，不据此修改锁。正式车辆制作前请Fable明确轮心高度的参考原点。
4. 内容差异：main experiences集合仅四条旧记录，现站六条双语数据在i18n.ts；不迁移或复制事实。六栋保留，驾驶履历完整联动在数据源确认后实现。Interactive Learning锁文称三个平台，现站内容描述四套，交互翻页数需由Fable确认，灰盒不实施该展位动作。
5. 未来交付：L1/L2结果、实测三项、许可复核、文件尺寸、三角数、材质槽与视觉差异按资产ID追加；当前均未完成。

## 审批记录

| 门 | 状态 | 证据 |
| --- | --- | --- |
| Fable资产清单审阅 | 待审 | 本文与reference-crops.html |
| Bobby灰盒5分钟试玩 | 待试玩 | 后续PR预览与8机位截图 |
| 正式建模 | 未开始 | 本阶段禁止生成模型 |
'''%(len(rows),len(rows))
(OUT/'资产清单-v1.md').write_text(intro+'\n'.join(lines)+end)
parts=[]
for r in rows:
    png=OUT/'references'/f"{r['reference']}.png"
    with png.open('rb') as f:
        f.read(16); width,height=struct.unpack('>II',f.read(8))
    x,y,w,h=r['crop']; box=f'{x*width:g} {y*height:g} {w*width:g} {h*height:g}'
    parts.append(f'''<article id="{r['id']}"><header><b>{r['id']} · {html.escape(r['name'])}</b><small>{r['zone']} · {r['source']}</small></header><a href="references/{r['reference']}.png"><svg preserveAspectRatio="xMidYMid meet" viewBox="{box}" role="img" aria-label="{html.escape(r['name'])}参考区域"><defs><clipPath id="clip-{r['id']}"><rect x="{x*width}" y="{y*height}" width="{w*width}" height="{h*height}" /></clipPath></defs><image clip-path="url(#clip-{r['id']})" href="references/{r['reference']}.png" width="{width}" height="{height}" /></svg></a><p>{html.escape(r['note'] or '待Fable审阅')}<br><code>{r['reference']} {r['crop']}</code></p></article>''')
(OUT/'reference-crops.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>资产清单 v1 · 参考裁切索引</title><style>body{margin:0;background:#172b34;color:#eee6d8;font:15px system-ui}main{max-width:1400px;margin:auto;padding:40px}h1{font-weight:500}p{line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px}article{background:#263d46;border:1px solid #49616a;border-radius:8px;overflow:hidden;scroll-margin:25px}header,p{padding:14px;margin:0}small{display:block;margin-top:7px;color:#b0c5c9}svg{width:100%;height:220px;background:#101e26}code{font-size:11px;color:#a0b7bd}article:target{outline:3px solid #4fd1c5}a{color:#4fd1c5}</style><main><h1>资产清单 v1 · 参考裁切索引</h1><p>只裁取已有锁定图区域，不生成或改画原图。点击图片查看原图。矩形按原图左上角归一化 x,y,w,h。缺单体图的条目明确标注待补图。<a href="资产清单-v1.md">清单</a> · <a href="references/night-and-ground.jpg">夜档与地面参考</a></p><section class="grid">'''+''.join(parts)+'</section></main></html>')
print(f'Wrote {len(rows)} asset entries and review crop index.')

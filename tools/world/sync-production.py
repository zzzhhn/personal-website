#!/usr/bin/env python3
"""Refresh the 80 stable-ID production archive from current files and existing reports.

Default: read-only summary. --write writes ONLY docs/world/assets-v1.json and
 docs/world/资产清单-v1.md. Does not run check-inventory, Blender, bots, or acceptance tests.
The Markdown table is generated from the exact same in-memory JSON rows.
GLB accessor/index metadata is file inspection, NEVER a fresh Blender reimport.
"""
import argparse
import copy
import hashlib
import json
import re
import struct
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / 'docs/world/assets-v1.json'
MD_PATH = ROOT / 'docs/world/资产清单-v1.md'
DATE = '2026-10-24'
FROZEN = '/Users/bobby/WorkBuddy/personal-website/bobby-3d-world'
AUTH = {'scope': 'existing-80-IDs-all-island-L1-or-procedural', 'hy3dEnabled': False,
        'basis': ['PRD v1.13', 'Art Lock v3.6', '制作管线 v1.6', '规格-quality-v3 §15'],
        'userAcceptance': 'Bobby未验收；开工授权不追认几何、运行时、审美或预算全过'}


def read_json(path):
    p = Path(path) if str(path).startswith('/') else ROOT / path
    return json.loads(p.read_text()) if p.exists() else None


def source(path):
    p = ROOT / path
    return p.read_text() if p.exists() else ''


FILES = {}


def glb(path, roots=None, exclude_collision=False):
    if path not in FILES:
        p = ROOT / path
        if not p.exists():
            raise FileNotFoundError(path)
        data = p.read_bytes()
        magic, version, size = struct.unpack_from('<III', data)
        if magic != 0x46546C67 or version != 2 or size != len(data):
            raise ValueError('Invalid GLB header: ' + path)
        length, kind = struct.unpack_from('<II', data, 12)
        if kind != 0x4E4F534A:
            raise ValueError('Missing GLB JSON: ' + path)
        doc = json.loads(data[20:20 + length])
        def mesh_tri(mesh):
            out = 0
            for primitive in mesh.get('primitives', []):
                if primitive.get('mode', 4) != 4:
                    continue
                accessor = primitive.get('indices', primitive['attributes']['POSITION'])
                out += doc['accessors'][accessor]['count'] // 3
            return out
        mesh_counts = [mesh_tri(m) for m in doc.get('meshes', [])]
        node_counts = {n.get('name', 'node-' + str(i)): mesh_counts[n['mesh']]
                       for i, n in enumerate(doc.get('nodes', [])) if 'mesh' in n}
        FILES[path] = {'path': path, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                       'serializedUniqueMeshTriangles': sum(mesh_counts),
                       'serializedNodeExpandedTriangles': sum(node_counts.values()),
                       'nodeTriangles': node_counts, 'extensions': doc.get('extensionsUsed', []),
                       'animationClips': [a.get('name', '') for a in doc.get('animations', [])],
                       'skinJointCounts': [len(s.get('joints', [])) for s in doc.get('skins', [])],
                       'measurement': 'current GLB bytes/SHA256/accessor counts read; not Blender reimport',
                       '_doc': doc}
    full = FILES[path]
    result = {k: copy.deepcopy(v) for k, v in full.items() if k != '_doc'}
    if roots:
        doc = full['_doc']; nodes = doc.get('nodes', [])
        selected = set()
        def visit(i):
            if i in selected:
                return
            selected.add(i)
            for child in nodes[i].get('children', []):
                visit(child)
        for i, n in enumerate(nodes):
            if n.get('name') in roots:
                visit(i)
        if not selected:
            raise ValueError(f'{path}: missing semantic roots {roots}')
        result['semanticRoots'] = roots
        result['semanticNodeTriangles'] = sum(full['nodeTriangles'].get(nodes[i].get('name'), 0)
                                              for i in selected)
    elif exclude_collision:
        result['semanticNodeTriangles'] = sum(v for k, v in full['nodeTriangles'].items()
                                              if not k.startswith('col_'))
        result['semanticFilter'] = 'all visible nodes excluding col_ collision proxy nodes'
    return result


def proof(asset, evaluated, imported, evidence, sha=None, file=None, note=''):
    target = file or asset['production'].get('glb')
    actual = glb(target) if target else None
    binding = 'not-applicable' if not actual else ('sha256-match' if sha and sha == actual['sha256']
                                                else 'sha256-mismatch' if sha else 'report-does-not-store-sha256')
    if binding == 'sha256-mismatch':
        asset['production']['knownLimits'].append('报告SHA与当前文件不一致；旧回读数字不作当前通过证据')
        evaluated = imported = None
    asset['triangleBudget'].update(evaluatedTriangles=evaluated, glbReimportTriangles=imported)
    asset['production']['measurementEvidence'] = {'path': evidence, 'fileIdentityBinding': binding,
                                                'note': note or 'Existing report read; no tests rerun in this archival task'}
    if binding == 'report-does-not-store-sha256':
        asset['production']['knownLimits'].append('该回读报告未存SHA；引用其原测数值，不等同本次重新回读当前GLB')


def attach(asset, paths, roots=None, visible=False):
    records = [glb(p, roots=roots if len(paths) == 1 else None, exclude_collision=visible) for p in paths]
    prod = asset['production']; prod['files'] = records
    prod.update(glb=paths[0], sha256=records[0]['sha256'], bytes=records[0]['bytes'],
                compression=', '.join(records[0]['extensions']),
                serializedTriangles=records[0].get('semanticNodeTriangles', records[0]['serializedNodeExpandedTriangles']))
    return records


def build():
    rows = read_json('docs/world/assets-v1.json')
    # Preserve a future G28 record only after main explicitly archives a real GLB;
    # mere file discovery must never change its production/acceptance status.
    prior_g28 = next((copy.deepcopy(a) for a in rows if a['id'] == 'G28' and a.get('production', {}).get('glb')), None)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    for a in rows:
        if 'historicalInventory' not in a:
            a['historicalInventory'] = {'label': '2026-10-22 inventory; PRD1.6/camp-only authority is superseded',
                'data': {k: copy.deepcopy(v) for k, v in a.items() if k not in ['crop', 'id', 'name', 'zone', 'reference']}}
        a['source'] = 'L1 coding'
        a['status'] = '已制作并接入候选；证据按项记录，非整体验收'
        a['acceptanceStatus'] = '仅记录当前实现和既有证据；Bobby未验收，未验证项不追认通过'
        a['productionAuthorization'] = copy.deepcopy(AUTH)
        a['triangleBudget'] = {'hardCap': False, 'status': '实测/文件元数据/未验证分开记账',
            'evaluatedTriangles': None, 'glbReimportTriangles': None, 'baselineMultiplier': None,
            'basis': '不存在的GLB不填写回读；当前GLB索引元数据不等同新场景回读'}
        a['production'] = {'method': 'L1-scripted-GLB', 'scope': 'all-island-existing-inventory',
            'implementationStatus': 'integrated-candidate', 'glb': None, 'sha256': None, 'bytes': None,
            'snapshotGitCommit': head, 'readDate': DATE, 'runtimeFiles': [], 'sourceFiles': [],
            'evidence': [], 'knownLimits': [], 'userAccepted': False,
            'geometryReviewStatus': '未验证；按下列报告及其版本绑定说明读取',
            'runtimeReviewStatus': '未验证到全实例/全情境；存在实现不等于体验通过',
            'visualReviewStatus': '制作线程局部看图可引用；不等于Bobby审美验收',
            'finalAcceptance': 'not-accepted'}
        a['acceptancePlan'] = ['核对同一最终集成版本的实现与碰撞语义', '只对受影响集合补充机器、真实运行与看图证据', 'Bobby真实体验接受单列，不从文件存在或开工许可推断']
    by_id = {a['id']: a for a in rows}
    def setrow(aid, *, runtime=(), src=(), evidence=(), physics='', note='', procedural=False, count=None):
        a = by_id[aid]; p = a['production']
        p['runtimeFiles'] = list(runtime); p['sourceFiles'] = list(src); p['evidence'] = list(evidence)
        p['physicalMapping'] = physics; a['physics'] = physics
        a['note'] = note
        if count is not None:
            a['count'] = count
        if procedural:
            a['source'] = '程序化'; p['method'] = 'runtime-procedural'
            a['acceptanceProfile'] = 'runtime-procedural'
        return a

    terrain_src = ['src/components/world/WorldLandform.ts', 'src/components/world/WorldTerrain.tsx']
    terrain_ev = ['docs/world/terrain/README.md', 'docs/world/terrain/detail-checks.json']
    for aid in ['G01', 'G02', 'G04', 'G05', 'G06', 'G07', 'G08', 'T08', 'C01', 'C02']:
        a = setrow(aid, runtime=terrain_src + ['src/components/world/WorldTerrainRoads.tsx', 'src/components/world/WorldSurfaceColliders.tsx'],
            src=['src/components/world/WorldTerrainPaving.ts', 'src/components/world/layout-v4.ts'], evidence=terrain_ev,
            physics='fixed：当前地形/铺装同源顶点与变换的trimesh；视觉草/毫米级细节非阻挡',
            note='已接入程序化地形/铺装；共享区域统计不拆造单ID面数；最终全岛预算/路线验收未完成', procedural=True)
        a['triangles'] = '运行时共享区域实测；单ID未独立拆算（GLB不适用）'
        a['production']['runtimeReviewStatus'] = 'terrain报告含普通入口9/9步行与草扰动等局部验证；不代表逐ID/全车路线验收'
    by_id['G01']['note'] += '；原“分层崖壁”名保留，实际为不规则沙滩岸线+局部岩台'
    by_id['T08']['note'] += '；稳定ID=T08广场铺装；私有town/T08.glb是已撤旧年份柱，不属于此ID'
    for aid in ['C01', 'C02']:
        by_id[aid]['production']['runtimeFiles'] += ['src/components/world/WorldEnvironment.tsx']
        by_id[aid]['note'] += '；营地环/石板布局由WorldEnvironment与当前地面接口派生'
    a = setrow('G03', runtime=['src/components/world/WorldSea.tsx', 'src/components/world/WorldWater.ts'],
        src=['src/components/world/WorldLandform.ts'], evidence=['docs/world/render/budget.md', 'docs/world/render/review-request.md', 'docs/world/terrain/README.md'],
        physics='水面无硬碰撞；独立水域/湿身检测及2s恢复；海底/岸由fixed地形支持', procedural=True,
        note='格斯特纳海浪、岸线泡沫/湿沙与两档颜色已接入；并非整片水面可行走；最终恢复全矩阵未在本归档重跑')
    a['triangles'] = '程序化海网格；当前单ID三角未独立拆算'

    street_qa = read_json('docs/world/street/qa-runtime.json')
    kinds = {'G09': 'seawallBay', 'G10': 'lamp', 'G11': 'yearPillar', 'G12': 'roadblock',
             'G13': 'bin', 'G14': 'bench', 'G15': 'billboard', 'F01': 'foundationSlab', 'F02': 'foundationSlab', 'F03': 'foundationSlab'}
    for aid, kind in kinds.items():
        static = aid in ['G14', 'F01', 'F02', 'F03']
        a = setrow(aid, runtime=['src/components/world/WorldStreet.tsx', 'src/components/world/WorldStreetKnock.tsx', 'src/components/world/WorldStreetStatic.tsx'],
            src=['src/components/world/WorldStreetAssets.ts', 'src/components/world/WorldStreetGeometry.ts', 'src/components/world/layout-v4.ts'],
            evidence=['docs/world/street/qa-runtime.json', 'docs/world/street/COMPLETION.md', 'docs/world/street/runtime-summary.json'],
            physics='fixed同源部件hull/表面trimesh；保留座位/可走地基语义' if static else 'Rapier sleeping dynamic+CCD；同源部件hull，合理质量，撞后30s淡出复位；人/车语义按种类',
            procedural=True, note='已接入程序化资产；没有独立GLB/虚构回读；碰撞/座位仅抽测，不代表全组合验收')
        q = street_qa[kind]; a['triangles'] = f"运行时L0/L1 {q['L0']}/{q['L1']}（每件/代表模块）"
        a['production']['runtimeGeometry'] = {'kind': kind, 'L0': q['L0'], 'L1': q['L1'], 'ratio': q['ratio'], 'degenerate': q['degenerate'], 'evidence': 'docs/world/street/qa-runtime.json'}
        a['production']['geometryReviewStatus'] = '纯运行时生成器QA已报告三角/退化；不是GLB回读'
    for aid, count in [('G10', 26), ('G11', 6), ('G12', 4), ('G13', 3), ('G14', 13), ('G15', 3)]:
        by_id[aid]['count'] = count
    by_id['G09']['physics'] = by_id['G09']['production']['physicalMapping'] = '混合：海堤/桥结构与柱fixed；环路guard panel、山路timber beam为sleeping dynamic/30s复位；同源几何'
    by_id['G09']['note'] += '；海堤/环路/桥栏有局部人车证据，山路beam默认起点未触达目标，未验证'
    for aid in ['G11', 'G15']:
        by_id[aid]['production']['evidence'] += ['docs/world/street/G11-G15.md', 'docs/world/street/g11-g15-summary.json']
        by_id[aid]['production']['runtimeReviewStatus'] = '新项代表性人车接触和30s复位已有记录；非逐实例全车速矩阵'
    by_id['G11']['production']['runtimeFiles'] += ['src/components/world/WorldStreetYears.tsx']
    by_id['G15']['production']['runtimeFiles'] += ['src/components/world/WorldStreetBillboards.tsx']
    by_id['G11']['note'] += '；同lampGeometry，年月由WorldContent.experiences prop驱动，Canvas/灯头随同一动态实例；6日期对照/高亮通过'
    by_id['G10']['generator'] = by_id['G11']['generator'] = 'src/components/world/WorldStreetAssets.ts#lampGeometry'
    by_id['G14']['note'] += '；14座点含候车亭，抽测5座；起身后E按当前最近提示处理'
    extra = glb('public/assets/world/camp/L01.glb')
    by_id['G10']['production']['auxiliaryFiles'] = [extra]
    by_id['G10']['production']['knownLimits'].append('营地出口L01×2是camp-content独立GLB/fixed门柱例外，不等同26根动态街灯；见camp-content DESIGN')
    a = setrow('G29', procedural=True, runtime=['src/components/world/WorldStreetLandmarks.tsx'], src=['src/components/world/WorldStreetAssets.ts'],
        evidence=['docs/world/street/qa-runtime.json', 'docs/world/street/COMPLETION.md'],
        physics='塔/机舱fixed同源compound hull；高空转子沿原契约仅视觉，共享可暂停风钟',
        note='程序化成型塔、机舱、门、三片渐窄叶片；人/车碰塔和风钟冻结有局部记录；Bobby未验收')
    a['triangles'] = '运行时塔1492/84＋转子538/82（L0/L1）；无GLB'

    nature = read_json('docs/world/quality-v3/nature-v4/manifest.json')['assets']
    for aid, q in nature.items():
        soft = aid in ['G19', 'G20']
        a = setrow(aid, runtime=['src/components/world/WorldCamp.tsx', 'src/components/world/WorldCampPhysics.tsx', 'src/components/world/WorldNatureMotion.tsx'],
            src=['tools/world/camp/nature-v4/build_nature_v4.py'], evidence=['docs/world/quality-v3/nature-v4/manifest.json', 'docs/world/quality-v3/nature-v4/README.md'],
            physics='软：同源crown sensor hull＋水平阻力；无硬核，叶/枝共享风钟' if soft else '硬：同源GLB trunk/rock fixed trimesh；植被风动不改变静态接触面',
            note='nature-v4当前实测取代旧v2数字；文件哈希与报告绑定后引用几何门，运行时/美术/Bobby接受仍分开')
        attach(a, [f'public/assets/world/camp/{aid}.glb'])
        proof(a, q['trianglesEvaluated'], q['trianglesGLBReimport'], 'docs/world/quality-v3/nature-v4/manifest.json', sha=q['sha256'])
        a['triangleBudget'].update(baselineTriangles=q['baselineTriangles'], baselineMultiplier=q['multiplier'], baselineFile=q['baselineGLB'])
        a['production']['geometryReviewStatus'] = 'nature-v4 manifest机检已记录；与当前SHA绑定结果见measurementEvidence'
        a['triangles'] = f"回读报告 {q['trianglesGLBReimport']}；pre-v4 {q['baselineTriangles']}，×{q['multiplier']}"
        a['production']['blend'] = f'tools/world/camp/nature-v4/blend/{aid}.blend'
        a['production']['knownLimits'].append('历史quality-v2全项/视觉审阅不自动追认nature-v4；仅记录现有当前版本证据')
    for aid, tree in [('G17', 'ST1'), ('G18', 'ST2')]:
        by_id[aid]['production']['auxiliaryFiles'] = [glb(f'public/assets/world/street/{tree}.glb')]
        by_id[aid]['production']['evidence'] += ['docs/world/street/trees-qa.json', 'docs/world/street/COMPLETION.md']
        by_id[aid]['note'] += f'；另有低地同族{tree}的独立近/远GLB，未新增稳定ID；其LOD/三角另记，不冒充营地原件'
        by_id[aid]['production']['runtimeFiles'] += ['src/components/world/WorldStreetTrees.tsx']
    a = setrow('G24', runtime=['src/components/world/WorldGuide.tsx', 'src/components/world/WorldGuidePhase.ts', 'src/components/world/WorldGuideStop.ts', 'src/components/world/WorldActors.tsx'],
        src=['tools/world/guide/build_guide.py', 'tools/world/guide/mocap/prepare_extra.py'],
        evidence=['docs/world/THIRD_PARTY.md', 'tools/world/guide/out/build_report.json', 'docs/world/character/transition-ab.json', 'docs/world/character/slope-v3d.json', 'docs/world/quality-v3/guide/RELEASE-v3c.md'],
        physics='动态角色胶囊；蒙皮/自制18骨视觉；停步与坡地IK/惯性化为已有许可范围',
        note='以当前GLB实读的动作/哈希为准，旧73aa与0fa1 release仅历史；来源CMU/100STYLE按THIRD_PARTY标注，不冒称Mixamo')
    rec = attach(a, ['public/assets/world/guide/G24.glb'])[0]
    a['triangles'] = f"当前GLB索引实读 {rec['serializedNodeExpandedTriangles']}；{len(rec['animationClips'])} clips（非本次回读）"
    a['production']['rig'] = 'custom-L1'; a['production']['currentClipNames'] = rec['animationClips']
    a['production']['auxiliaryFiles'] = [glb('tools/world/guide/out/G24_uncompressed.glb')]
    a['production']['geometryReviewStatus'] = '当前SHA/索引/skin/clip元数据已实读；旧v3c回读数不作为新动作全量复验'
    a['production']['releaseIdentityDocumented'] = rec['sha256'] in source('docs/world/THIRD_PARTY.md')
    a['production']['knownLimits'] += ['当前v3d新增六段动作，旧release-v3c只覆盖其当时哈希；过渡滑移/坡地浮空等既有结果不得全追认', 'Bobby未接受人物外形、动作或全情境手感']
    vehicles = read_json('docs/world/vehicles/fresh-import.json')['assets']
    for aid in ['G25', 'G26', 'G27']:
        q = next(v for v in vehicles if v['asset'] == aid)
        a = setrow(aid, runtime=['src/components/world/WorldVehicleVisual.tsx', 'src/components/world/WorldVehicleAssets.ts', 'src/components/world/WorldActors.tsx'],
            src=['tools/world/vehicles/build_vehicle.py', 'src/components/world/WorldVehicleHulls.json'],
            evidence=[f'docs/world/vehicles/{aid}-report.json', 'docs/world/vehicles/fresh-import.json', 'docs/world/vehicles/runtime-summary.json', 'docs/world/vehicles/FINAL-STATUS.md'],
            physics='可驾驶dynamic；GLB派生车身/轮胎凸包＋射线悬挂；动态道具不作轮胎支撑；同源hull映射',
            note='三车均L1，Hy3D关闭；轮胎/路障/路线仅已报告受影响集合，不等于所有街物全速度无穿模')
        attach(a, [f'public/assets/world/vehicles/{aid}.glb'])
        proof(a, q['totalTris'], q['totalTris'], 'docs/world/vehicles/fresh-import.json', sha=q['sha256'])
        a['triangles'] = f"新场景回读报告 {q['totalTris']}（当前SHA绑定）"
        a['exportContract'] = {'frame': 'glTF +X front / +Y up / +Z right; tyre ground origin', 'physics': 'GLB-derived compound hull JSON; no longer legacy three manual boxes', 'wheels': 'independent wheel pivots; same source transforms'}
        a['production']['runtimeReviewStatus'] = 'vehicles FINAL-STATUS/runtime-summary报告轮胎27/27、路障正侧碰、路线4/4等局部集合；最终集成另验'
        a['production']['knownLimits'] += ['三车近到同处L0主pass38074tris高于原30k分项；60m远档现已补齐，不用远档通过抹去近档分项超额', 'G27轮胎理想圆柱诊断仍有2.11cm穿入；最终总预算/M1/Bobby手感未验收']
    for aid in ['G25', 'G26', 'G27']:
        a = by_id[aid]; q = read_json(f'docs/world/vehicles/{aid}-lod1-report.json')
        path = f'public/assets/world/vehicles/{aid}-lod1.glb'; rec = glb(path)
        a['production']['auxiliaryFiles'] = [rec]
        a['production']['lod1'] = {'path': path, 'sha256': rec['sha256'], 'report': f'docs/world/vehicles/{aid}-lod1-report.json',
            'reportShaMatchesCurrentFile': q['sha256'] == rec['sha256'], 'L0ShaMatchesReportSource': q['sourceSha256'] == a['production']['sha256'],
            'reportedEvaluatedTriangles': q['totalTris'], 'reportedFreshReimportTriangles': q['totalTris'],
            'serializedNodeExpandedTriangles': rec['serializedNodeExpandedTriangles'], 'ratio': q['ratio'],
            'runtimeDistance': 'camera-to-body 3D: >=60m outward, <58m inward; same objects/matrices/collision'}
        a['production']['evidence'] += ['docs/world/vehicles/LOD-STATUS.md', 'docs/world/vehicles/lod-summary.json', f'docs/world/vehicles/{aid}-lod1-report.json']
        a['triangles'] += f"；LOD1 {q['totalTris']}（{q['ratio']:.2%}）"
        a['note'] += '；60m远档及原矩阵/轮组阴影18/18距离交接已有定向报告，L0 SHA不变；旧LOD未做描述已被LOD-STATUS覆盖'
    a = setrow('G28', runtime=[], src=[], evidence=['docs/world/references/codex-native-v2/README.md'], physics='未制作实体/碰撞/传送逻辑',
        note='仅历史参考方向；当前无GLB/实体/接入；WorkBuddy审阅全球额度耗尽未给本次语义裁决，不能标完成')
    a['status'] = '未制作、未接入；待语义裁决'; a['triangles'] = '未制作；无当前GLB/实测'
    a['production']['method'] = 'planned-L1-no-asset'; a['production']['implementationStatus'] = 'not-produced'
    a['production']['visualReviewStatus'] = '历史候选参考方向不等于实体美术/运行时验收'

    if prior_g28:
        a.clear(); a.update(prior_g28)
        a['productionAuthorization'] = copy.deepcopy(AUTH)
        a['production'].update(snapshotGitCommit=head, readDate=DATE, userAccepted=False)
        paths = [f['path'] for f in a['production'].get('files', [])] or [a['production']['glb']]
        attach(a, paths)

    shelter = {v['id']: v for v in read_json('docs/world/camp-slice/shelters/manifest.json')['assets']}
    tents = {v['id']: v for v in read_json('docs/world/quality-v2/shelters/manifest.json')['assets']}
    props = read_json('docs/world/camp-slice/props/manifest.json')['assets']
    for aid in [f'C{i:02}' for i in range(3, 11)]:
        a = setrow(aid, runtime=['src/components/world/WorldCamp.tsx', 'src/components/world/WorldCampPhysics.tsx', 'src/components/world/WorldCampContent.tsx'],
            src=['tools/world/camp/shelters-v2/build_shelters.py'] if aid in tents else ['tools/world/camp/props/build_props.py'] if aid in props else ['tools/world/camp/shelters/build_shelters.py'],
            evidence=['docs/world/quality-v2/README.md', 'docs/world/quality-v2/playtest/acceptance-r3/report.json'],
            physics='同源fixed：帐篷保留门洞shell mesh；桌/长凳/架/物件用同GLB和放置矩阵的trimesh；旗/反馈细件动画另计',
            note='旧营地已报告局部机器/审阅/复合案例；保留历史门，Bobby未接受；本次归档未重跑')
        attach(a, [f'public/assets/world/camp/{aid}.glb'])
        q = tents.get(aid) or props.get(aid) or shelter[aid]
        if aid in tents:
            ev = 'docs/world/quality-v2/shelters/manifest.json'; n = q['triangles']; rb = n; sha = q['sha256']
            a['production']['sourceFiles'] = ['tools/world/camp/shelters-v2/build_shelters.py']
        elif aid in props:
            ev = 'docs/world/camp-slice/props/manifest.json'; n = q['trianglesEvaluatedNative']; rb = q['trianglesGLBReimport']; sha = q['sha256']
        else:
            ev = 'docs/world/camp-slice/shelters/manifest.json'; n = q['triangles_evaluated']; rb = q['triangles_glb_reimport']; sha = q['glb_sha256']
        proof(a, n, rb, ev, sha=sha); a['production']['evidence'].append(ev)
        a['triangles'] = f'既有回读报告 {rb}；当前文件SHA绑定见JSON'
        a['production']['geometryReviewStatus'] = '既有报告与当前SHA绑定；历史Fable营地门不外推到本次全岛'
    for aid in [f'C{i:02}' for i in range(11, 17)]:
        physics = {'C11': 'hard fixed：完整GLB同源trimesh；工具反馈视觉转动',
                   'C12': 'pushable dynamic convex hull 4kg；吉他/架同体、30s复位',
                   'C13': 'pushable dynamic convex hull；当前runtime两件各16kg、scale1.7；30s复位',
                   'C14': 'hard fixed GLB同源trimesh、scale1.3；炒锅抛动为视觉反馈',
                   'C15': 'pushable dynamic hull 12kg；30s复位，拉杆反馈',
                   'C16': '小灯无独立碰撞，位于既有桌碰撞覆盖内；不是软传感器'}[aid]
        a = setrow(aid, runtime=['src/components/world/WorldCampContent.tsx', 'src/components/world/WorldCampContentAssets.ts', 'src/components/world/WorldCampContentLayout.ts'],
            src=['tools/world/camp-content/build_assets.py'], evidence=['docs/world/camp-content/DESIGN.md', f'docs/world/camp-content/sheets/{aid}_sixview.jpg'],
            physics=physics, note='营地余项已制作/挂载与About反馈；机器QA原报告在仓库外，交互/碰撞全矩阵未验收')
        attach(a, [f'public/assets/world/camp/{aid}.glb'])
        qa_path = f'/Users/bobby/Desktop/3D-personal-world/evidence/camp/assets/qa_{aid}.json'
        q = read_json(qa_path)
        if q:
            q = q['assets'][aid]
            proof(a, q['native']['triangles'], q['glbImport']['triangles'], qa_path)
            a['production']['reportedMachineChecks'] = q['checks']
            a['triangles'] = f"已有native/回读报告 {q['native']['triangles']}/{q['glbImport']['triangles']}（报告未存SHA）"
            a['production']['evidence'].append(qa_path)
        else:
            a['triangles'] = f"当前GLB索引实读 {a['production']['serializedTriangles']}；独立回读未验证"
        a['production']['runtimeReviewStatus'] = '当前源/放置/物理已读；probe2有504 Outdated Optimize Dep，不能称纯净运行验收'
        a['production']['evidence'].append('/Users/bobby/Desktop/3D-personal-world/evidence/camp/probe2/probe.json')
    by_id['C13']['count'] = 2

    for aid in [f'T{i:02}' for i in range(1, 8)] + ['T09', 'T12']:
        a = setrow(aid, runtime=['src/components/world/WorldTown.tsx', 'src/components/world/WorldTownAssets.tsx', 'src/components/world/WorldTownCanvas.ts'],
            src=['tools/world/town/build_town.py'], evidence=['docs/world/town/DESIGN.md', 'docs/world/town/MAIN-THREAD-NOTES.md'],
            physics='fixed：GLB col_节点hull与视觉共用放置变换；门廊/骑楼空洞保留；棕榈只硬树干',
            note='当前GLB已挂载；本库存只实读文件/SHA/索引，不冒称缺少绑定报告的完整几何/碰撞/两档审美通过')
        rec = attach(a, [f'public/assets/world/town/{aid}.glb'], visible=True)[0]
        a['triangles'] = f"GLB可见节点索引 {rec['semanticNodeTriangles']}；另含碰撞代理，回读未绑定"
        a['production']['geometryReviewStatus'] = '当前文件/SHA/accessor已读；未找到仓库内绑定该SHA的新场景回读报告'
    by_id['T07']['count'] = '内陆4＋西岸3（7实例）'
    a = setrow('T10', runtime=['src/components/world/WorldTownAssets.tsx', 'src/components/world/WorldTownCanvas.ts'], src=['tools/world/town/build_town.py'],
        evidence=['docs/world/town/DESIGN.md'], physics='附着六楼；牌框内嵌GLB body、Canvas由anchor_sign驱动；不另造实体碰撞',
        note='稳定ID=T10六楼招牌；实际内嵌T01–T06及运行时Canvas，不是私有town/T10.glb（海滩kiosk）')
    attach(a, [f'public/assets/world/town/T{i:02}.glb' for i in range(1, 7)])
    a['production']['storageRole'] = 'embedded across T01-T06 containers; no independent sign GLB; do not charge whole buildings twice'
    a['production']['serializedTriangles'] = None; a['triangles'] = '内嵌六楼body＋Canvas；未独立拆面，不重复计整栋'
    a = setrow('T11', runtime=['src/components/world/WorldTownAssets.tsx'], src=['tools/world/town/build_town.py'], evidence=['docs/world/town/DESIGN.md'],
        physics='附着T06屋顶的视觉发光环；非另一个地面碰撞体',
        note='稳定ID=T11混元环；实际T06.glb/T06_ring，不是私有town/T11.glb（海滩救生塔）')
    rec = attach(a, ['public/assets/world/town/T06.glb'], roots=['T06_ring'])[0]
    a['triangles'] = f"T06_ring索引 {rec['semanticNodeTriangles']}；包含在T06，勿重复计整文件"
    # Preserve implementation aliases with real hashes, without inventing new stable IDs.
    by_id['T07']['production']['auxiliaryFiles'] = [glb('public/assets/world/town/T10.glb'), glb('public/assets/world/town/T11.glb')]
    by_id['T07']['production']['implementationAliases'] = {'town/T10.glb': 'two south-beach kiosks', 'town/T11.glb': 'south-beach lifeguard tower; neither equals stable T10/T11'}
    by_id['T08']['production']['retiredPrivateFiles'] = [dict(glb('public/assets/world/town/T08.glb'), active=False, reason='retired year pillar; stable T08 is plaza paving')]

    for aid in ['P01', 'P02', 'P03', 'P04']:
        a = setrow(aid, runtime=['src/components/world/WorldParkWalk.tsx', 'src/components/world/WorldParkLOD.tsx'], src=['src/components/world/WorldParkLayout.ts'],
            evidence=['docs/world/park/DELIVERY.md', 'docs/world/park/DELIVERY-LOD.md', 'docs/world/park/qa-lod.json', 'docs/world/park/qa-runtime.json'],
            physics='fixed同源生成几何/布局（广场、栈道、桩）' if aid in ['P01', 'P02'] else 'sleeping dynamic，同源近档碰撞代理；30s复位；LOD只换视觉不撤碰撞', procedural=True,
            note='程序化园区结构已接入；LOD与局部人车/支撑证据见park交付；不是不存在GLB的回读')
        a['triangles'] = {'P01': '区域近8300/远110（报告分组，非独立GLB）', 'P02': '三段近1417/2087/2155，远362/474/518', 'P03': '木栏单段近84/远24', 'P04': '旧近324/远36；若换共享生成器须以新报告更新'}[aid]
    park_walk = source('src/components/world/WorldParkWalk.tsx')
    park_lamp = source('src/components/world/WorldParkLamp.ts')
    shared_lamp = 'WorldParkLamp' in park_walk and 'WorldStreetAssets' in park_lamp and 'lampGeometry' in park_lamp
    by_id['P04']['generator'] = 'src/components/world/WorldStreetAssets.ts#lampGeometry (target common generator with G10/G11)'
    by_id['P04']['production']['sharedGeneratorPresent'] = shared_lamp
    if not shared_lamp:
        by_id['P04']['status'] = '已制作接入；共享lampGeometry纠偏待合入'
        by_id['P04']['production']['implementationStatus'] = 'integrated-shared-generator-pending'
        by_id['P04']['production']['knownLimits'].append('本快照仍使用park私有lampGeometry；共享G10/G11生成器由park收尾，不能提前记已统一')
    else:
        q = read_json('docs/world/park/qa-P04-shared.json'); p04 = by_id['P04']
        p04['count'] = 9
        p04['triangles'] = f"共享程序生成器近{q['nearTriangles']}/远{q['farTriangles']}（{q['ratio']:.2%}）；GLB不适用"
        p04['physics'] = p04['production']['physicalMapping'] = 'sleeping dynamic；共享LOD0 Builder四凸壳各11.25kg/总45kg；30s复位；LOD不撤碰撞'
        p04['production']['runtimeFiles'].append('src/components/world/WorldParkLamp.ts')
        p04['production']['sourceFiles'].append('src/components/world/WorldStreetAssets.ts')
        p04['production']['evidence'] += ['docs/world/park/DELIVERY-P04.md', 'docs/world/park/qa-P04-shared.json', 'docs/world/park/qa-P04-runtime.json']
        p04['production']['runtimeGeometry'] = {'near': q['nearTriangles'], 'far': q['farTriangles'], 'ratio': q['ratio'], 'hullCount': 4, 'massKg': 45}
        p04['production']['runtimeReviewStatus'] = 'P04专门报告记录人/van撞倒、真实30s复位、四凸壳与45kg读回；非全岛矩阵'
        p04['note'] += '；G10/G11/P04现直接共用lampGeometry；旧私有lamp已删；人/van撞倒与真实30s复位有新报告'

    hut_variants = {'P06': 'A', 'P07': 'A', 'P08': 'B', 'P09': 'B', 'P10': 'A', 'P11': 'B'}
    hutqa = read_json('docs/world/park/qa-hut.json')
    for aid, variant in hut_variants.items():
        a = setrow(aid, runtime=['src/components/world/WorldPark.tsx', 'src/components/world/WorldParkKit.ts', 'src/components/world/WorldParkLOD.tsx'], src=['tools/world/park/build_huts.py'],
            evidence=['docs/world/park/qa-hut.json', 'docs/world/park/qa-topology-diagnostic.json', 'docs/world/park/DELIVERY-LOD.md', 'docs/world/park/qa-runtime.json'],
            physics='硬：同根GLB几何/实际矩阵派生fixed shell与floor；开口保持；LOD不撤碰撞',
            note=f'六屋共享hut.glb，使用hut_{variant}根及同族平台；GLB回读接触壳整体焊接警告另有诊断，不删原警告')
        attach(a, ['public/assets/world/park/hut.glb'], roots=['hut_' + variant])
        n = hutqa['evaluated'][variant]['triangles']
        proof(a, n, n, 'docs/world/park/qa-hut.json', note='Report stores whole-file readback6064; variant count from evaluated groups; not a new reimport')
        a['triangleBudget']['glbReimportTriangles'] = None
        a['production']['reportedWholeFileReimportTriangles'] = hutqa['glbReadback']['triangles']
        a['triangles'] = f"变体{variant}评估 {n}；整文件回读6064；单屋含平台LOD见park报告"
        a['production']['knownLimits'].append('shell_A/B整体焊接诊断各61非流形边，原生同法复现；见定向诊断，不冒称零自交')
    for aid in [f'P{i:02}' for i in range(12, 19)]:
        q = read_json(f'docs/world/park/qa-{aid}.json')
        a = setrow(aid, runtime=['src/components/world/WorldParkExhibits.tsx', 'src/components/world/WorldParkLOD.tsx'], src=['tools/world/park/build_exhibits.py'],
            evidence=[f'docs/world/park/qa-{aid}.json', 'docs/world/park/qa-runtime.json', 'docs/world/park/DELIVERY.md', 'docs/world/park/DELIVERY-LOD.md'],
            physics='GLB body同源fixed trimesh；标记小件dynamic/30s复位；机构/屏幕反馈另由节点变换驱动',
            note='六展品交互按park已报告局部集合；DEMO曲线/投票不是线上服务；60m外剔视觉保留碰撞')
        attach(a, [f'public/assets/world/park/{aid}.glb'])
        proof(a, q['evaluatedTriangles'], q['glbReadbackTriangles'], f'docs/world/park/qa-{aid}.json')
        a['triangles'] = f"评估/回读报告 {q['evaluatedTriangles']}/{q['glbReadbackTriangles']}（报告未存SHA）"
        a['production']['reportedReadbackProblems'] = q['readbackProblems']
        if aid in ['P14', 'P15', 'P18']:
            a['production']['evidence'].append('docs/world/park/qa-topology-diagnostic.json')
            a['production']['knownLimits'].append('原回读整体焊接警告保留；新定向诊断与原生接触壳复现相同，非无依据记0')
    by_id['P16']['physics'] = by_id['P16']['production']['physicalMapping'] = '两张椅GLB同源fixed；座点同矩阵、E/W起身；不靠关闭椅子碰撞实现坐姿'
    signsqa = read_json('docs/world/park/qa-signs.json')
    street_sources = '\n'.join(p.read_text() for p in (ROOT / 'src/components/world').glob('WorldStreet*.tsx'))
    f04_live = bool(re.search(r"getObjectByName\(['\"]F04['\"]\)", street_sources))
    for aid in ['P05', 'P19', 'F04']:
        a = setrow(aid, runtime=['src/components/world/WorldParkSigns.tsx'] if aid != 'F04' else ['src/components/world/WorldStreetLandmarks.tsx'],
            src=['tools/world/park/build_signs.py'], evidence=['docs/world/park/qa-signs.json', 'docs/world/park/F04-interface.md', 'docs/world/park/DELIVERY-LOD.md'],
            physics='浅木框/板/支撑来自同GLB根和同一矩阵的fixed trimesh；文字Canvas无额外硬体',
            note=f'light-wood-standing-sign共同资产族；signs.glb取{aid}根，不能整文件三款叠放；原生木件嵌接，不声称焊成单壳')
        rec = attach(a, ['public/assets/world/park/signs.glb'], roots=[aid])[0]
        n = next(x['triangles'] for x in signsqa['parts'] if x['name'] == 'body_' + aid)
        proof(a, n, n, 'docs/world/park/qa-signs.json', note='Shared file2160 reimported; each of three roots720 in report/node metadata')
        a['assetFamily'] = 'light-wood-standing-sign'; a['variant'] = {'P05': 'large', 'P19': 'medium', 'F04': 'small'}[aid]
        a['triangles'] = f"每根{n}；三尺寸整GLB评估/回读{signsqa['evaluatedTriangles']}/{signsqa['glbReadbackTriangles']}"
        if aid == 'F04' and f04_live:
            a['production']['runtimeFiles'].append('src/components/world/WorldStreetConstructionSigns.tsx')
            a['production']['evidence'].append('docs/world/integration/shared-input-and-signs.md')
            a['production']['runtimeReviewStatus'] = '共享小款已挂载；特定F04接触名下人/van命中并阻挡，车升约5.1cm/0err；不是全牌全车矩阵'
            a['note'] += '；street已替换旧程序牌，60m外只剔视觉，同GLB/矩阵fixed trimesh；人/van定向验证见integration报告'
        if aid == 'F04' and not f04_live:
            a['status'] = '共族GLB已制作；street替换接入待主线程合入'
            a['production']['implementationStatus'] = 'asset-ready-integration-pending'
            a['production']['knownLimits'].append('当前WorldStreetLandmarks仍用旧232tri程序牌；旧牌人车证据不代证新720tri F04接入')
            a['physics'] = '共族F04设计为同源fixed；当前旧程序牌仍fixed，替换/碰撞新证据待主线程'
    for a in rows:
        if a['id'].startswith('P'):
            a['production']['knownLimits'].append('P04共享件替换后每根766/146；旧园区58125tris等总量属换件前历史，当前最终区/全岛预算待主线程')
        if not a['note'].startswith(a['status'] + '；'):
            a['note'] = a['status'] + '；' + a['note']
    for aid in ['P11', 'P18']:
        by_id[aid]['contentSource'] = {'runtime': 'WorldContent.projects[].courses', 'slug': 'interactive-learning-platforms', 'fixedCourseCount': False, 'note': '现站内容源驱动；课程/页数不在清单重抄成第二套事实'}
    return rows


def esc(value):
    return str(value).replace('|', r'\|').replace('\n', ' ')


def markdown(rows):
    snapshots = {a['production']['snapshotGitCommit'] for a in rows}
    snapshot = next(iter(snapshots))
    g28_state = next(a for a in rows if a['id'] == 'G28')['status']
    guide_clips = len(next(a for a in rows if a['id'] == 'G24')['production']['currentClipNames'])
    text = [f'# 资产清单 v1 · 当前全岛制作归档（{DATE}）', '',
        f'快照提交 `{snapshot}`。80个稳定ID保留；本文件九列表与 assets-v1.json 由 `tools/world/sync-production.py --write` 同源生成。',
        '**当前依据：PRD v1.13、Art Lock v3.6、制作管线 v1.6、规格 §15。全岛既有清单可L1/程序化，Hy3D关闭；不推main、不合并PR、不部署。开工许可、机检、运行时、美术看图、Bobby接受分别记录；Bobby尚未验收。**', '',
        '本次只读取实现、现有QA与当前GLB字节：所有列出的SHA256均重新实读；GLB accessor索引计数不是Blender回读。没有运行check-inventory、Blender、bot或最终全岛验收；主线程待最终版本合入后只运行一次既有一致性脚本。', '',
        '## 当前映射与证据边界', '',
        '- G19/G20为sensor hull＋水平阻力，无旧硬核；G16–G23以nature-v4 manifest的当前哈希/回读及pre-v4倍率为准。ST1/ST2为低地同族扩展，不新增稳定ID。',
        f'- G24当前文件/{guide_clips}段动作以实读及THIRD_PARTY v3d为准；旧73aa、v3c的0fa1报告保留历史，不移植为新动作全通过。三车均L1；车辆报告保留超分项预算、G27轮胎诊断残余与未测范围。',
        '- 稳定T08=广场铺装。私有town/T08.glb是已撤旧年柱；G11现为lampGeometry程序柱。稳定T10=六楼内嵌牌框/Canvas；稳定T11=T06_ring。私有town/T10.glb、T11.glb分别是海滩kiosk/tower，不能按文件名冒认稳定ID。',
        '- P05/P19/F04共用signs.glb三尺寸（每根720/整文件2160）。F04已经街道实际挂载，并有特定接触名的人/van验证；G10/G11/P04共享lampGeometry已接入。P04新为766/146tri、4凸壳45kg，原园区58125tri等总量属换件前历史。',
        f'- 营地L01出口门柱仍是独立GLB/fixed例外。G28当前状态：{g28_state}；详见本行实际映射/证据，历史参考方向不作当前实体通过。',
        '- 园区原回读焊接警告保留；DELIVERY-LOD定向诊断解释接触壳，不能简写成全局无自交。camp-content仓库外QA不存SHA，引用原测值并单列身份绑定限制。', '',
        '## 80个稳定ID', '',
        '| ID | 区域 | 资产及数量 | 来源 | 三角数预算／实测 | materialRole | 物理 | 参考裁切 | 当前实现／证据状态 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for a in rows:
        values = [a['id'], a['zone'], f"{a['name']} × {a['count']}", a['source'], a['triangles'], a['materialRole'], a['physics'],
                  f"[{a['reference']} #{a['id']}](reference-crops.html#{a['id']})", a['note']]
        text.append('| ' + ' | '.join(esc(v) for v in values) + ' |')
    text += ['', '## 当前文件指纹（完整容器，不重复分摊整文件三角）', '',
        '同一个GLB可承载多个稳定ID或多尺寸；此处列整容器SHA，JSON另列semanticRoots/visible-node计数、报告回读与绑定程度。共享/内嵌ID不能再各加一次容器面数。', '',
        '| 当前文件 | bytes | SHA256 | 文件节点展开索引三角 |', '| --- | ---: | --- | ---: |']
    active = {}
    for a in rows:
        for group in ['files', 'auxiliaryFiles']:
            for rec in a['production'].get(group, []):
                active[rec['path']] = rec
    for path, r in sorted(active.items()):
        text.append(f"| [{path}](../../{path}) | {r['bytes']} | `{r['sha256']}` | {r['serializedNodeExpandedTriangles']} |")
    text += ['', '## 分区证据入口', '',
        '- 地形/海/铺装：[terrain README](terrain/README.md)、[detail-checks](terrain/detail-checks.json)、[render budget](render/budget.md)。区域抽样不代证最终全岛峰值、首包、8s可操作或M1硬件。',
        '- 自然：[nature-v4 manifest](quality-v3/nature-v4/manifest.json)；当前文件哈希绑定后引用报告倍率；v2回合只保留历史。',
        '- 人物：[THIRD_PARTY v3d](THIRD_PARTY.md)、[transition A/B](character/transition-ab.json)、[slope-v3d](character/slope-v3d.json)、[历史v3c release](quality-v3/guide/RELEASE-v3c.md)。新动画全量回读/接触验收未在本归档伪造。',
        '- 三车：[FINAL-STATUS](vehicles/FINAL-STATUS.md)、[fresh-import](vehicles/fresh-import.json)、[runtime-summary](vehicles/runtime-summary.json)、[LOD-STATUS](vehicles/LOD-STATUS.md)、[LOD summary](vehicles/lod-summary.json)。当前60m远档已补齐；runtime-summary里旧knownLimits的“未做LOD”不得盖过新follow-up。',
        '- 街道：[COMPLETION](street/COMPLETION.md)、[G11-G15](street/G11-G15.md)、[runtime-summary](street/runtime-summary.json)、[g11-g15-summary](street/g11-g15-summary.json)。山路beam某次未触达目标等限制原样保留。',
        '- 园区：[DELIVERY](park/DELIVERY.md)、[DELIVERY-LOD](park/DELIVERY-LOD.md)、[qa-runtime](park/qa-runtime.json)、[qa-lod](park/qa-lod.json)、[topology diagnostic](park/qa-topology-diagnostic.json)、[F04 interface](park/F04-interface.md)。',
        '- 营地余项：[DESIGN](camp-content/DESIGN.md)及`sheets/`；原始QA为`evidence/camp/assets/qa_C11...C16.json`；probe2含504资源错误，不能写全项运行通过。',
        '- 城区：[DESIGN](town/DESIGN.md)、[MAIN-THREAD-NOTES](town/MAIN-THREAD-NOTES.md)与当前GLB/col_节点；未找到绑定报告的单体门标未验证。', '',
        '## 历史审阅（明确不是本次全岛验收）', '',
        '2026-10-21 Fable清单门“小改后通过”、G28/G29/T07参考候选方向审阅，以及营地quality-v2 A–D/acceptance-r3，仍是各自当时版本与范围的历史记录。见[quality-v2](quality-v2/README.md)、[参考候选](references/codex-native-v2/README.md)。旧逐件字段完整保存在JSON的historicalInventory.data及Git历史；不把camp-only、G26/G27直接Hy3D、G19/G20硬核或旧哈希继续作为当前执行状态。', '',
        '全岛L1已授权；旧“灰盒未签字不得开模／三轮失败自动L2”失效。Hy3D仍关闭，只有当前明确受影响证据可关闭相应失败。Bobby未接受全岛审美、动作、物理或手感，本清单不是全岛通过证书。', '',
        '## 同步与最终核对', '',
        '`python tools/world/sync-production.py`只读取并打印快照；加`--write`仅同步本Markdown与assets-v1.json，不修改运行时/GLB/冻结文档，也不运行一致性或验收脚本。最终GLB/F04/P04合入后主线程可再同步，并按其既定安排仅运行一次`tools/world/check-inventory.py`。',
        'G28默认保持未制作；主线程后续明确在该JSON行登记真实GLB和制作/验收状态后，同步脚本会保留该人工归档并重读其文件哈希，不靠扫描到文件自动判完成。',
        '若当前文件SHA与既有报告不匹配，脚本不沿用其回读数作当前通过证据；没有报告SHA则明确记未绑定。纯runtime的glb/sha256/glbReimportTriangles为空，不伪造GLB回读。', '']
    return '\n'.join(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    rows = build()
    if args.write:
        JSON_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
        MD_PATH.write_text(markdown(rows))
    print(json.dumps({'assetCount': len(rows), 'states': dict(Counter(a['production']['implementationStatus'] for a in rows)),
                      'currentGlbFilesRead': len(FILES), 'written': args.write,
                      'checkInventoryRun': False, 'acceptanceTestsRun': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()

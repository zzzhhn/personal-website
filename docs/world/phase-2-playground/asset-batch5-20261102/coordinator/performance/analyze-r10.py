"""Independent bounded raw-window audit. No browser, server or test execution."""
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import hashlib, json, math

root = Path(__file__).resolve().parent
runtime = root / 'runtime'
protocol = json.loads((root / 'protocol-frozen.json').read_text())
executor = json.loads((runtime / 'executor-six-window-audit-r10.json').read_text())
expected = [(run, mode, point, serial) for run, mode in [('r10-old-a','legacy'),('r10-new','candidate'),('r10-old-b','legacy')] for point, serial in [('camp',1),('street',2)]]
names = [f'{run}-{mode}-{point}-sample-{serial}.json' for run, mode, point, serial in expected]
executor_hashes = {row['name'] + '.json': row['sha256'] for row in executor['samples']}
errors, windows, raw_objects = [], [], {}
drift = lambda a,b: max(abs(x-y) for x,y in zip(a,b))
keys = ['calls','triangles','geometries','textures','programs']
for (run, mode, point, serial), name in zip(expected, names):
    path = runtime / name
    raw = json.loads(path.read_text())
    raw_objects[(run,point)] = raw
    samples, before, after, settled = raw['samples'], raw['before'], raw['after'], raw['settled']
    checks = {}
    def check(key, condition):
        checks[key] = bool(condition)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    check('executorSHA', sha == executor_hashes[name])
    check('valid', raw['valid'] is True)
    check('300UniqueConsecutive', len(samples)==300 and len({s['frame'] for s in samples})==300 and all(b['frame']==a['frame']+1 for a,b in zip(samples,samples[1:])))
    check('frameBoundaries', samples[0]['frame']==before['loop']['frame'] and samples[-1]['frame']==after['loop']['frame'])
    check('90Warm', samples[0]['frame']-settled['loop']['frame']==91 and raw['summary']['warmupFrames']==90)
    check('settle10to20sStable60', 10000<=raw['settleElapsedMs']<=20000 and raw['stableFrames']>=60 and abs(settled['at']-raw['arrival']['at']-raw['settleElapsedMs'])<.01)
    for label in ['arrival','settled','before','after']:
        row = raw[label]
        s,c,ri = row['settings'],row['camera'],row['renderInfo']
        check(label+'Identity', row['run']==run and row['mode']==mode and row['active']==point and row['stage']=='normal' and ('facilityCraft=legacy' in row['url'])==(mode=='legacy'))
        check(label+'Normal', not s['paused'] and not s['hidden'] and row['grounded'] and row['loop']['mode']=='always' and all(s[k] is None for k in ['shot','seat','card','clubMode','activeVehicle']))
        check(label+'Settings', s['quality']=='balanced' and s['weather']=='clear' and s['light']=='noon' and s['worldMinutes']==720 and not s['timeRunning'] and abs(row['loop']['night'])<=.001)
        check(label+'Buffer', ri['drawingBuffer']==ri['cssSize']==[1710,931] and ri['pixelRatio']==1 and ri['antialias'] and ri['msaaSamples']==4 and ri['shadowMapSize']==1254)
        check(label+'Camera', abs(c['yaw']-.9272952180016123)<=.003 and abs(c['pitch']-.7853981633974483)<=.003 and abs(c['distance']-12)<=.01 and c['fov']==50 and not c['firstPerson'] and not c['guideHidden'] and not c['nearPlaneOverlaps'])
    level = tuple(before['stats'][k] for k in keys)
    levels = {tuple(s[k] for k in keys) for s in samples}
    check('stableSettledMeasuredCounters', levels=={level} and all(tuple(raw[label]['stats'][k] for k in keys)==level for label in ['settled','after']))
    check('shadowIdleDuringSettleAndMeasurement', all(raw[label]['shadowWork']['pending'] is False and not raw[label]['shadowWork']['error'] for label in ['settled','before','after']) and all(s['shadowPending'] is False for s in samples))
    cam_drift = max(drift(s['camera'],before['stats']['camera']) for s in samples)
    player_drift = max([drift(s['player'],before['player']) for s in samples]+[drift(after['player'],before['player'])])
    check('driftUnder01mm', cam_drift<=.0001 and player_drift<=.0001)
    check('finitePositiveDeltas', all(math.isfinite(s['dt']) and s['dt']>0 for s in samples))
    dt = sorted(s['dt'] for s in samples)
    recomputed = dict(frames=300,warmupFrames=90,fps=300000/sum(dt),p50=dt[149],p95=dt[284],max=dt[-1],over33_4ms=sum(t>33.4 for t in dt),gpuMs=None)
    check('summaryMatches', all(abs(v-raw['summary'][k])<1e-8 if isinstance(v,float) else v==raw['summary'][k] for k,v in recomputed.items()))
    check('under30s', sum(dt)<30000 and after['at']-before['at']<30000)
    assets = raw['assets']
    check('assetModeAndNoFallback', not assets['fallbacks'] and ((bool(assets['campRoots']) and bool(assets['treeRoots'])) if mode=='candidate' else (not assets['campRoots'] and not assets['treeRoots'])))
    errors.extend(name+':'+k for k,v in checks.items() if not v)
    windows.append(dict(name=name,sha256=sha,savedAtUTC=datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),valid=all(checks.values()),checks=checks,summary=recomputed,constantCounters=dict(zip(keys,level)),cameraMaxDriftM=cam_drift,playerMaxDriftM=player_drift,settleMs=raw['settleElapsedMs'],reportedStableFrames=raw['stableFrames'],arrivalCounters={k:raw['arrival']['stats'][k] for k in keys},measuredCamera=before['stats']['camera'],measuredPlayer=before['player']))

sample_files = sorted(p.name for p in runtime.glob('r10-*-sample-*.json'))
failed_files = sorted(p.name for p in runtime.glob('r10-*failed*.json'))
if sample_files != sorted(names) or failed_files:
    errors.append('unexpected extra/missing sample or failed file')
if not all(a['savedAtUTC']<b['savedAtUTC'] for a,b in zip(windows,windows[1:])):
    errors.append('saved file order differs from protocol')
for name,sha in protocol['files'].items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha:
        errors.append('fixture hash changed:'+name)

comparisons = {}
for point in ['camp','street']:
    rows = [raw_objects[(run,point)]['before'] for run in ['r10-old-a','r10-new','r10-old-b']]
    cam_drift = max(drift(row['stats']['camera'],rows[0]['stats']['camera']) for row in rows)
    player_drift = max(drift(row['player'],rows[0]['player']) for row in rows)
    target_drift = max(drift(row['camera']['target'],rows[0]['camera']['target']) for row in rows)
    if max(cam_drift,player_drift,target_drift)>.0001:
        errors.append('cross-window pose mismatch:'+point)
    old_a,new,old_b = [row['stats'] for row in rows]
    delta = {k:old_b[k]-old_a[k] for k in keys}
    comparisons[point] = dict(crossWindowCameraMaxDriftM=cam_drift,crossWindowPlayerMaxDriftM=player_drift,crossWindowTargetMaxDriftM=target_drift,oldA=dict((k,old_a[k]) for k in keys),candidate=dict((k,new[k]) for k in keys),oldB=dict((k,old_b[k]) for k in keys),oldBMinusOldA=delta,oldBvsOldATriangleChangePercent=100*delta['triangles']/old_a['triangles'],candidateVsOldTriangleChangesPercent=[100*(new['triangles']-old['triangles'])/old['triangles'] for old in [old_a,old_b]],strictEqualLoad=False)

wait = json.loads((runtime/'executor-wait-note-r10.json').read_text())
cleanup = json.loads((runtime/'executor-cleanup-r10.json').read_text())
dom = (runtime/cleanup['pauseDOM']).read_text()
result = dict(verifiedAt=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),status='SIX_WINDOWS_VALID_BOUNDED_LOCAL_PLAYTEST_SUPPORTED' if not errors else 'AUDIT_FAILURE',errors=errors,windows=windows,comparisons=comparisons,sampleFileCount=len(sample_files),failedFiles=failed_files,reviewGapSeconds=wait['gapFromFirstSaveToSecondPreparationSeconds'],cleanupReceipt=cleanup,pausedMenuInSavedDOM=('dialog "地图与设置"' in dom or 'container 地图与设置' in dom),independentVisualReview=dict(images=['runtime/r10-shelter-sit-visible.png','runtime/r10-shelter-stand-visible.png'],result='Avatar and seat relationship visible from open side; stand image returns E Sit. Camera no longer obscured by backrest/roof or hiding guide. Does not certify anatomical sitting-animation quality.',actualMediaType='image/jpeg',dimensions=[1710,875]),localCandidatePlaytestSupported=not errors,strictEqualLoadCostClaimSupported=False,zeroOverheadClaimSupported=False,wholeIslandPerformanceClaimSupported=False,limitations=['Six short windows, one nonrandomized ABA per point; 679.306s first-save to second-preparation review gap retained.','Within-window counts stable does not imply equal cross-load residency, geometry, shader state or streaming completion. Legacy A/B counts differ despite effectively identical poses.','gl.info calls/triangles include scene and shadow work; allocated geometry/texture/program counts are not a list of visible assets. Missing per-asset state prevents attribution of the legacy difference.','Near60FPS results are refresh-limited observations, not GPU/CPU timing or proof of performance headroom.57ms and58ms spikes retained.','No new tests, samples, browser control, server or lock acquired by independent reviewer.'])
(root/'final-audit-r10.json').write_text(json.dumps(result,indent=2))
print(json.dumps(dict(status=result['status'],errors=errors,windows=[dict(name=w['name'],fps=w['summary']['fps'],p95=w['summary']['p95'],max=w['summary']['max'],counters=w['constantCounters']) for w in windows],comparisons=comparisons,reviewGapSeconds=result['reviewGapSeconds'],pausedMenuInSavedDOM=result['pausedMenuInSavedDOM']),indent=2))
if errors:
    raise SystemExit(1)

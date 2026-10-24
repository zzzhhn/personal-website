"""Build manifest.json from qa_report.json + ledgers (plain python3)."""
import hashlib, json
D = '/Users/bobby/WorkBuddy/personal-website/personal-website/docs/world/camp-slice/shelters'
q = json.load(open(f'{D}/qa_report.json'))
INSTANCES = {'C03': 1, 'C04': 2, 'C05': 1, 'C06': 4}
NOTES = {
    'C03': 'Ridge wall tent: sagging chevron fly with thickness, bound edges, ridge cap and panel seams, gable walls, open door flaps with tie-backs, ridge + two upright poles, 4 staked guy lines inside footprint, rear vent patch, groundsheet.',
    'C04': 'Same construction as C03 scaled to the Fable-revised smaller footprint; one asset for both instances.',
    'C05': '12 chamfered stones (two greys), charcoal ash bed, 5-log teepee + 2 kindling sticks; centre r<0.15 m left open for runtime flame (log tips top out at y~0.59).',
    'C06': 'Split log seat (flat light top at y=0.6, bark sides, light end grain with bark ring), branch stub, two half-log saddles bedded under it.',
}
assets = []
for a in q['assets']:
    aid = a['id']; n = a['native']; g = a['glb_reimport']; f = a['glb_file']; c = a['compare']
    sha = hashlib.sha256(open(f['path'], 'rb').read()).hexdigest()
    assets.append(dict(
        id=aid, name=json.load(open(f'{D}/ledger_{aid}.json'))['name'], instances=INSTANCES[aid],
        glb=f'public/assets/world/camp/{aid}.glb', glb_bytes=f['bytes'], glb_sha256=sha,
        blend=f'tools/world/camp/shelters/blend/{aid}.blend',
        contract='metres, +Y up, +X front, ground y=0, root at horizontal bounds centre',
        target_dims_xyz=c['target_dims'], final_dims_xyz=[round(x, 4) for x in n['dims_glb_xyz']],
        glb_reimport_dims_xyz=[round(x, 4) for x in g['dims_glb_xyz']], bounds_delta_max_m=c['bounds_delta_max_m'],
        triangles_evaluated=n['triangles'], triangles_glb_reimport=g['triangles'],
        legacy_triangle_estimate=c['baseline_estimate'], ratio_vs_legacy_estimate=c['ratio_vs_legacy_estimate'],
        draco=dict(primitives=f['primitives'], compressed=f['draco_primitives'], position_bits=20, normal_bits=10, level=6),
        materials=[dict(name=m['name'], materialRole=m['role'], baseColorFactor_linear=m['baseColorFactor'],
                        roughness=round(m['roughness'], 3), metallic=m['metallic']) for m in f['materials']],
        mesh_shells=n['components'], machine_pass=a['machine_pass'], machine_failures=a['machine_failures'],
        notes=NOTES[aid],
        views=dict(color_sheet=f'docs/world/camp-slice/shelters/views/r3/{aid}_sheet.png',
                   color_source=json.load(open(f'{D}/views/r3/{aid}/source.json')),
                   color_source_matches_glb=json.load(open(f'{D}/views/r3/{aid}/source.json'))['sha256'] == sha,
                   clay_sheet=f'docs/world/camp-slice/shelters/views/r3/{aid}_clay_sheet.png',
                   clay_source='native .blend with clay override (not GLB)')))
man = dict(group='shelters', date='2026-10-21', blender=q['blender'], round='r3 (final of max 3)',
           build='Blender -b --factory-startup -P tools/world/camp/shelters/build_shelters.py',
           qa='Blender -b --factory-startup -P tools/world/camp/shelters/qa_shelters.py -- docs/world/camp-slice/shelters/qa_report.json',
           views='Color six-view sheets views/r3/<ID>_sheet.png are rendered from a fresh import of the final Draco GLB (hash in each asset.views); clay sheets are native .blend; overview_from_glb.png is from final GLBs.',
           status='Machine checks pass; NOT art-approved. Fable/Bobby visual acceptance and in-runtime dusk/night checks pending.',
           totals=dict(unique_triangles=sum(x['triangles_evaluated'] for x in assets),
                       on_screen_triangles_with_instances=sum(x['triangles_evaluated'] * x['instances'] for x in assets)),
           assets=assets)
json.dump(man, open(f'{D}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(man['totals']), [(x['id'], x['final_dims_xyz'], x['triangles_evaluated'], x['glb_bytes']) for x in assets])

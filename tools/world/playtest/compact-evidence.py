"""Keep full bot evidence in gzip and a small reviewable index. No verdict rewriting."""
import gzip,json,pathlib,sys
for name in sys.argv[1:]:
    folder=pathlib.Path(name); p=folder/'report.json'
    d=json.loads(p.read_text())
    if d.get('fullEvidence'): continue
    raw=p.read_bytes()
    with gzip.GzipFile(filename=str(folder/'report-full.json.gz'),mode='wb',mtime=0) as f:f.write(raw)
    index={k:v for k,v in d.items() if k not in ('cases','checks')}
    index['fullEvidence']='report-full.json.gz'
    index['cases']=[]
    for case in d.get('cases',[]):
        row={k:v for k,v in case.items() if k not in ('samples','groundedClearances','solidContacts')}
        for key in ('down','up'):
            if key in row: row[key]={k:v for k,v in row[key].items() if k!='trace'}
        row['sampleCount']=len(case.get('samples',[]))
        if 'solidContacts' in case:row['solidContactCount']=len(case['solidContacts'])
        index['cases'].append(row)
    index['checks']=[]
    for check in d.get('checks',[]):
        row=dict(check); e=row.get('evidence')
        if isinstance(e,dict) and 'samples' in e: row['evidence']={k:v for k,v in e.items() if k not in ('samples','groundedClearances')}
        index['checks'].append(row)
    p.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
    print(folder.name,len(raw),'->',p.stat().st_size,'+', (folder/'report-full.json.gz').stat().st_size)

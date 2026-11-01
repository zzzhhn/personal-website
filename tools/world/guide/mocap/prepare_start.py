"""Prepare only a measured CMU 143_03 start. Fixed source events precede target QA.
Raw ASF/AMC remain in the existing external cache. No old clip or contact mask changes.
"""
import hashlib,json,sys
from pathlib import Path
import numpy as np
from cmu_motion import load
from prepare_extra import pack,cmu_rest
CACHE=Path.home()/'.cache/g24-cmu'
FIRST,LAST=112,196  # inclusive, zero based; natural arm-down double support before right step
CONTACTS={'L':[(112,155),(190,196)],'R':[(112,129),(163,177)]}
if __name__=='__main__':
 out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
 D=load(str(CACHE),'143.asf','143_03.amc',120,'hips')
 # Heading from this forward start, not the entire source take.
 direction=D['hipmid'][LAST,:2]-D['hipmid'][FIRST,:2];angle=np.arctan2(direction[1],direction[0]);c,s=np.cos(-angle),np.sin(-angle)
 R=np.array([[c,-s,0],[s,c,0],[0,0,1]])
 for k in D['pos']:D['pos'][k]=D['pos'][k]@R.T;D['rot'][k]=np.einsum('ij,njk->nik',R,D['rot'][k])
 D['hipmid']=D['hipmid']@R.T
 O=pack(D,FIRST,LAST+1,{'start':FIRST,'end':LAST},cmu_rest(str(CACHE/'143.asf')))
 O['sourceContact']={t:[int(any(a<=f<=b for a,b in ranges)) for f in range(FIRST,LAST+1)] for t,ranges in CONTACTS.items()}
 O['rootDistanceLegs']=((D['hipmid'][FIRST:LAST+1,0]-D['hipmid'][FIRST,0])/D['leg']).round(7).tolist()
 low=np.minimum.reduce([D['pos'][k][:,2] for k in ['ltibia','rtibia','lfoot','rfoot','ltoes','rtoes']])
 sourceHipHeight=float(np.median((D['hipmid'][:,2]-low)[88:112]))
 O['sourceHipHeight']=sourceHipHeight
 evidence=dict(sourceHipHeight=sourceHipHeight,sourceStaticFramesZeroBasedInclusive=[88,111],source='CMU mocap 143_03.amc',sourceFiles={n:hashlib.sha256((CACHE/n).read_bytes()).hexdigest() for n in ['143.asf','143_03.amc']},license='CMU mocap free use; acknowledge CMU and NSF EIA-0196217',framesZeroBasedInclusive=[FIRST,LAST],sourceFps=D['fps'],contactIntervals=CONTACTS,
   contactRule='Fixed FK toe velocity, ankle/toe height and first-step events before target baking; no target QA fitting.',
   fk={t:{'toeWorld':D['pos'][s+'foot'][FIRST:LAST+1].round(6).tolist(),'ankleWorld':D['pos'][s+'tibia'][FIRST:LAST+1].round(6).tolist(),'toeSpeed':(np.linalg.norm(np.gradient(D['pos'][s+'foot'],axis=0),axis=1)*D['fps'])[FIRST:LAST+1].round(6).tolist()} for t,s in [('L','l'),('R','r')]})
 json.dump(dict(oneshots={'start':O},evidence=evidence),out.open('w'),indent=1)
 print(out,'distance/leg',O['rootDistanceLegs'][-1])

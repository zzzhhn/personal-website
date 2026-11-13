import type { FactoryConfiguration, FactoryInspection } from './factory-game';

export interface FactoryInspectionProbe {
  frameGap:number;wheelGap:number;shellGap:number;wheelCount:number;
  /** Measured change in rendered wheel angles, not the requested motor speed. */
  wheelSpeed:number;labelId:string|null;
}
export interface FactoryInspectionSession {
  step:0|1|2|3|4|5|6;motor:boolean;observedMotion:boolean;stopSeconds:number;
  evidence:FactoryInspection;
}
export function createFactoryInspection(config:FactoryConfiguration):FactoryInspectionSession {
  if(!config.parts.frame||!config.parts.wheels||!config.parts.shell)throw new TypeError('Inspection requires fitted parts');
  return {step:0,motor:false,observedMotion:false,stopSeconds:0,evidence:{configurationId:config.id,
    checkedPartIds:{frame:config.parts.frame,wheels:config.parts.wheels,shell:config.parts.shell},
    checks:{frameSecured:false,wheelsSecured:false,shellSecured:false,safetyStop:false,markings:false}}};
}
/** The renderer supplies contact gaps and actual wheel motion. Missing evidence never prints a pass. */
export function advanceFactoryInspection(s:FactoryInspectionSession,p:FactoryInspectionProbe,confirm:boolean,dt:number){
  if(!Number.isFinite(dt)||dt<=0||s.step===6)return;
  const contact=(v:number)=>Number.isFinite(v)&&v>=0&&v<.025;
  if(s.step===3&&s.motor&&Number.isFinite(p.wheelSpeed)&&p.wheelSpeed>2)s.observedMotion=true;
  if(s.step===4){
    s.stopSeconds=Number.isFinite(p.wheelSpeed)&&Math.abs(p.wheelSpeed)<.02?s.stopSeconds+Math.min(.05,dt):0;
    if(s.observedMotion&&s.stopSeconds>=.3){s.evidence.checks.safetyStop=true;s.step=5;}
  }
  if(!confirm)return;
  switch(s.step){
    case 0:if(contact(p.frameGap)){s.evidence.checks.frameSecured=true;s.step=1;}break;
    case 1:if(contact(p.wheelGap)&&p.wheelCount===4){s.evidence.checks.wheelsSecured=true;s.step=2;}break;
    case 2:if(contact(p.shellGap)){s.evidence.checks.shellSecured=true;s.step=3;}break;
    case 3:if(!s.motor)s.motor=true;else if(s.observedMotion){s.motor=false;s.step=4;}break;
    case 5:if(p.labelId===s.evidence.configurationId){s.evidence.checks.markings=true;s.step=6;}break;
  }
}

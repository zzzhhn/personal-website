import VariableProximityText from './VariableProximityText';

interface BioProximityProps {
  textEn: string;
  textZh: string;
}

export default function BioProximity({ textEn, textZh }: BioProximityProps) {
  return (
    <>
      <div data-lang="en" className="bio-text">
        <VariableProximityText
          label={textEn}
          radius={55}
          falloff="gaussian"
        />
      </div>
      <div data-lang="zh" className="bio-text">
        <VariableProximityText
          label={textZh}
          radius={40}
          falloff="gaussian"
        />
      </div>
    </>
  );
}

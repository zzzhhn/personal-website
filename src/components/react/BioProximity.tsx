import VariableProximityText from './VariableProximityText';

interface BioProximityProps {
  textEn: string;
  textZh: string;
}

export default function BioProximity({ textEn, textZh }: BioProximityProps) {
  return (
    <>
      <p data-lang="en" className="bio-text" style={{ lineHeight: 1.8 }}>
        <VariableProximityText
          label={textEn}
          radius={55}
          falloff="gaussian"
        />
      </p>
      <p data-lang="zh" className="bio-text" style={{ lineHeight: 1.8 }}>
        <VariableProximityText
          label={textZh}
          radius={40}
          falloff="gaussian"
        />
      </p>
    </>
  );
}

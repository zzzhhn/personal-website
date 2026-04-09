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
          radius={80}
          falloff="gaussian"
        />
      </p>
      <p data-lang="zh" className="bio-text" style={{ lineHeight: 1.8 }}>
        <VariableProximityText
          label={textZh}
          radius={60}
          falloff="gaussian"
        />
      </p>
    </>
  );
}

import VariableProximityText from './VariableProximityText';

interface BioParagraphProps {
  textEn: string;
  textZh: string;
  radiusEn?: number;
  radiusZh?: number;
}

export default function BioParagraph({
  textEn,
  textZh,
  radiusEn = 55,
  radiusZh = 40,
}: BioParagraphProps) {
  return (
    <>
      <div data-lang="en" className="bio-text">
        <VariableProximityText label={textEn} radius={radiusEn} falloff="gaussian" />
      </div>
      <div data-lang="zh" className="bio-text">
        <VariableProximityText label={textZh} radius={radiusZh} falloff="gaussian" />
      </div>
    </>
  );
}

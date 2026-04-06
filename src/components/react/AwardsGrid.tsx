import AwardCard from "./AwardCard";

interface Award {
  label: string;
  image: string;
}

interface Props {
  awards: Award[];
}

export default function AwardsGrid({ awards }: Props) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-3 mx-auto"
      style={{ maxWidth: "48rem" }}
    >
      {awards.map((award, i) => (
        <AwardCard
          key={award.image + i}
          label={award.label}
          imageSlug={award.image}
          index={i}
        />
      ))}
    </div>
  );
}

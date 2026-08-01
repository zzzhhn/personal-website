import RotatingText from "./RotatingText";

const LANGUAGES = [
  { names: ["Putonghua", "普通话"], level: { en: "Native", zh: "母语" } },
  { names: ["English", "英语"], level: { en: "Proficient; TOEFL 6.0, IELTS 8.0, CET-4 660, with A-range grades across all English-related courses", zh: "熟练；托福 6.0，雅思 8.0，大学英语四级 660 分，英语相关课程均 A range" } },
  { names: ["Japanese", "日本語"], level: { en: "Basic", zh: "基础" } },
  { names: ["Spanish", "Español"], level: { en: "Basic, CEFR: B1", zh: "基础，CEFR: B1" } },
];

export default function LanguageRotator({ lang = "en" }: { lang?: "en" | "zh" }) {
  return (
    <div className="language-list">
      {LANGUAGES.map((language) => (
        <div className="language-row" key={language.names[0]}>
          <RotatingText
            texts={language.names}
            mainClassName="language-name-pill"
            staggerFrom="last"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-120%", opacity: 0 }}
            staggerDuration={0.025}
            splitLevelClassName="language-name-word"
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            rotationInterval={3000}
          />
          <span className="language-level">
            {lang === "en" ? language.level.en : language.level.zh}
          </span>
        </div>
      ))}
    </div>
  );
}

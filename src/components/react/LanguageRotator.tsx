import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LANGUAGES = [
  { names: ['Putonghua', '普通话'], level: { en: 'Native', zh: '母语' } },
  { names: ['English', 'English'], level: { en: 'Proficient; TOEFL 106, CET4 660, English courses all A range', zh: '熟练；托福 106，大学英语四级 660 分，英语相关课程均 A range' } },
  { names: ['Japanese', '日本語'], level: { en: 'Basic', zh: '基础' } },
  { names: ['Spanish', 'Español'], level: { en: 'Basic, CEFR: B1', zh: '基础，CEFR: B1' } },
];

const spring = { type: 'spring' as const, damping: 25, stiffness: 300 };

// index 0 = English name (transparent pill), index 1 = native name (colored pill)
function RotatingName({ texts, interval }: { texts: string[]; interval: number }) {
  const [index, setIndex] = useState(0);
  const isNative = index === 1;

  useEffect(() => {
    const id = setInterval(() => setIndex((p) => (p + 1) % texts.length), interval);
    return () => clearInterval(id);
  }, [texts.length, interval]);

  return (
    <motion.span
      animate={{
        background: isNative
          ? 'var(--lang-pill-bg)'
          : 'transparent',
        borderColor: isNative
          ? 'var(--lang-pill-border)'
          : 'transparent',
      }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'inline-flex',
        justifyContent: 'center',
        overflow: 'hidden',
        verticalAlign: 'baseline',
        minHeight: '1.4em',
        width: '100%',
        borderRadius: '999px',
        padding: '0.15em 0.6em',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-120%', opacity: 0 }}
          transition={spring}
          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export default function LanguageRotator({ lang = 'en' }: { lang?: 'en' | 'zh' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {LANGUAGES.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              flexShrink: 0,
              width: lang === 'en' ? '6.5rem' : '5rem',
              textAlign: 'center',
              color: 'var(--color-text-primary)',
            }}
          >
            <RotatingName texts={l.names} interval={3000} />
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {lang === 'en' ? l.level.en : l.level.zh}
          </span>
        </div>
      ))}
    </div>
  );
}

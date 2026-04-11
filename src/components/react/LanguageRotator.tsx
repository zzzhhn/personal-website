import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LANGUAGES = [
  { names: ['Putonghua', '普通话'], level: { en: 'Native', zh: '母语' } },
  { names: ['English', 'English'], level: { en: 'Proficient; TOEFL 106, CET4 660, English courses all A range', zh: '熟练；托福 106，大学英语四级 660 分，英语相关课程均 A range' } },
  { names: ['Japanese', '日本語'], level: { en: 'Basic', zh: '基础' } },
  { names: ['Spanish', 'Español'], level: { en: 'Basic, CEFR: B1', zh: '基础，CEFR: B1' } },
];

const spring = { type: 'spring' as const, damping: 25, stiffness: 300 };

function RotatingName({ texts, interval }: { texts: string[]; interval: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((p) => (p + 1) % texts.length), interval);
    return () => clearInterval(id);
  }, [texts.length, interval]);

  return (
    <span
      style={{
        display: 'inline-flex',
        overflow: 'hidden',
        verticalAlign: 'baseline',
        minHeight: '1.4em',
        background: 'var(--color-surface-glass)',
        border: '1px solid var(--color-border-glass)',
        borderRadius: '999px',
        padding: '0.15em 0.6em',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
    </span>
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
              minWidth: lang === 'en' ? '5rem' : '4rem',
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

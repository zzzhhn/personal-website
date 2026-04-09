import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RotatingTextProps {
  texts: string[];
  rotationInterval?: number;
  className?: string;
}

export default function RotatingText({
  texts,
  rotationInterval = 2000,
  className = '',
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % texts.length);
  }, [texts.length]);

  useEffect(() => {
    const id = setInterval(next, rotationInterval);
    return () => clearInterval(id);
  }, [next, rotationInterval]);

  return (
    <span className={className} style={{ display: 'inline-flex', overflow: 'hidden', verticalAlign: 'baseline' }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-120%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

CREATE TABLE IF NOT EXISTS event_counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  target TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'zh')),
  theme TEXT NOT NULL CHECK (theme IN ('light', 'dark')),
  viewport TEXT NOT NULL CHECK (viewport IN ('mobile', 'tablet', 'desktop')),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, event, target, lang, theme, viewport)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS event_counts_event_day
  ON event_counts (event, day);

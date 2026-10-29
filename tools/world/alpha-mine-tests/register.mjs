import { register } from 'node:module';

// Test-only TS/TSX support; uses the repository's existing TypeScript dependency.
register('./loader.mjs', import.meta.url);

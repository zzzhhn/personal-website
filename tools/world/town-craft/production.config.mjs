// Local production delivery reuses the existing immutable public-asset fallback.
// No review toolbar or baseline source substitution is compiled into this build.
import config from '../../../astro.config.mjs';
export default {...config,publicDir:'/tmp/town-craft-20261107/empty',outDir:'/tmp/town-craft-20261107/production'};

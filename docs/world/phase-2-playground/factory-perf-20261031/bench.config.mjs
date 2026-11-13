import base from '../../../../astro.config.mjs';
import { fileURLToPath } from 'node:url';
export default {...base, integrations:[...base.integrations,{name:'local-factory-benchmark',hooks:{
  'astro:config:setup':({injectRoute})=>injectRoute({pattern:'/factory-bench',entrypoint:fileURLToPath(new URL('./fixture.astro',import.meta.url))})
}}]};

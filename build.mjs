import { cp, mkdir, rm } from 'node:fs/promises';
const files = ['index.html', 'styles.css', 'overrides.css', 'app.mjs', 'engine.mjs', 'contract.mjs', 'favicon.svg', 'sentinel-mark.svg'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of files) await cp(file, `dist/${file}`);
console.log(`Built ${files.length} Sentinel assets into dist/`);

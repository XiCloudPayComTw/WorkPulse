import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'styles.css', 'favicon.svg', 'src'].map(path => cp(path, `dist/${path}`, { recursive: true })));
console.log('Built static assets in dist/ (zero runtime dependencies).');

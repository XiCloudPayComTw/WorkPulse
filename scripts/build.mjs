import { cp, mkdir, rm } from 'node:fs/promises';
import {buildPwa} from './build-pwa.mjs';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'styles', 'favicon.svg', 'src'].map(path => cp(path, `dist/${path}`, { recursive: true })));
await buildPwa('dist');
console.log('Built static assets in dist/ (zero runtime dependencies).');

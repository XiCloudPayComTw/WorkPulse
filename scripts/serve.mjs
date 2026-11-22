import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 5173);
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = normalize(pathname).replace(/^[/\\]+/, '');
    const path = join(root, relative || 'index.html');
    if (!path.startsWith(root) || relative.split(sep).includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(path);
    const resource = info.isDirectory() ? join(path, 'index.html') : path;
    const file = await readFile(resource);
    res.writeHead(200, { 'Content-Type': `${types[extname(resource)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(file);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`WorkPulse → http://127.0.0.1:${port}`));

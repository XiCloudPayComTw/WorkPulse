import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
// Deterministic PNG icons, using the existing WorkPulse W + dot mark and a safe maskable inset.
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([len,name,data,crc]);}
function segment(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
export function workPulseIcon(size,maskable=false){
 const raw=Buffer.alloc(size*(1+size*3)),points=[[12,22],[19,44],[28,26],[37,44],[44,22]];
 const scale=maskable?.72:1;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const xx=((x+.5)*64/size-32)/scale+32,yy=((y+.5)*64/size-32)/scale+32;
  const d=Math.min(...points.slice(1).map((b,i)=>segment(xx,yy,points[i],b)),Math.hypot(xx-50,yy-42)-1.5);
  const a=Math.max(0,Math.min(1,(2.5-d)*size/64*scale+.5));
  const o=y*(1+size*3)+1+x*3;
  [110,127,141].forEach((v,i)=>raw[o+i]=Math.round(v*(1-a)+[239,242,249][i]*a));
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
async function list(dir,prefix=''){const rows=await readdir(join(dir,prefix),{withFileTypes:true});const paths=[];for(const row of rows){const p=prefix+row.name;if(row.isDirectory())paths.push(...await list(dir,p+'/'));else if(row.isFile())paths.push(p);}return paths.sort();}
export async function buildPwa(out){
 const template=await readFile(new URL('./pwa-worker-template.js',import.meta.url),'utf8');
 const html=await readFile(join(out,'index.html'),'utf8');
 const marker='<!-- WORKPULSE_PWA_BUILD -->';if(!html.includes(marker))throw Error('PWA build marker missing');
 await mkdir(join(out,'icons'),{recursive:true});
 await Promise.all([[192,false,'icon-192.png'],[512,false,'icon-512.png'],[512,true,'maskable-512.png'],[180,false,'apple-touch-icon.png']].map(([n,m,name])=>writeFile(join(out,'icons',name),workPulseIcon(n,m))));
 const manifest={id:'./',name:'WorkPulse — 工作日誌',short_name:'WorkPulse',lang:'zh-Hant',start_url:'./#/overview',scope:'./',display:'standalone',background_color:'#eff2f9',theme_color:'#eff2f9',icons:[{src:'./icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'./icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'./icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
 await writeFile(join(out,'manifest.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
 await writeFile(join(out,'index.html'),html.replace(marker,'<meta name="workpulse-pwa-build" content="static" />\n  <link rel="manifest" href="./manifest.webmanifest" />\n  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />'));
 // Exact static allowlist only; no arbitrary request caching, API responses or storage.
 const paths=(await list(out)).filter(p=>p==='index.html'||p==='favicon.svg'||p==='manifest.webmanifest'||/^(src\/.*\.js|styles\/.*\.css|icons\/.*\.png)$/.test(p));
 const hash=createHash('sha256').update(template),digests={};for(const p of paths){const data=await readFile(join(out,p));hash.update(p).update(data);digests[p]=createHash('sha256').update(data).digest('hex');}
 const release=hash.digest('hex').slice(0,20);
 await writeFile(join(out,'sw.js'),template.replace('__WP_RELEASE__',JSON.stringify(release)).replace('__WP_STATIC_PATHS__',JSON.stringify(digests)));
 return {release,paths};
}

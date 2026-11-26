/**
 * Real Chromium smoke test for local WorkPulse routes without adding production
 * dependencies. CI's ubuntu-latest image includes Google Chrome.
 * Run: npm run smoke:browser
 */
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const browser=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(name=>spawnSync('which',[name],{encoding:'utf8'}).status===0);
if(!browser)throw new Error('Chromium/Google Chrome 未安裝，無法執行真實瀏覽器測試');
const port=Number(process.env.WORKPULSE_SMOKE_PORT||5287);
const fileName=`workpulse-browser-smoke-${process.pid}.html`;
const testFile=join(root,fileName);
const html=await readFile(join(root,'index.html'),'utf8');
const bootstrap=`<script>
 window.__wpSmokeErrors=[];
 window.addEventListener('error',e=>window.__wpSmokeErrors.push(e.message));
 window.addEventListener('unhandledrejection',e=>window.__wpSmokeErrors.push(String(e.reason)));
 </script>`;
const probe=`<script>
 window.addEventListener('load',()=>{
   setTimeout(()=>{
     const title=document.querySelector('h1.page-title')?.textContent.trim()||'';
     const attendance=Boolean(document.querySelector('.att-page .att-fields'));
     const fieldHome=document.querySelector('.wp-field-home');
     const mobileLauncher=Boolean(fieldHome&&getComputedStyle(fieldHome).display!=='none');
     const mobileTabs=[...document.querySelectorAll('.mobile-nav .nav-link')].map(x=>x.textContent.trim());
     const noAdminTabs=!mobileTabs.some(x=>x.includes('統計分析')||x.includes('系統設定'));
     const loading=Boolean(document.querySelector('.att-page')?.textContent.includes('正在讀取出勤資料'));
     const overflow=document.documentElement.scrollWidth>window.innerWidth+2;
     const failed=window.__wpSmokeErrors.length>0;
     const output=document.createElement('output');
     output.id='workpulse-smoke-result';
     output.dataset.title=title;
     output.dataset.attendance=attendance?'1':'0';
     output.dataset.mobileLauncher=mobileLauncher?'1':'0';
     output.dataset.noAdminTabs=noAdminTabs?'1':'0';
     output.dataset.loading=loading?'1':'0';
     output.dataset.overflow=overflow?'1':'0';
     output.dataset.failed=failed?'1':'0';
     output.dataset.width=String(window.innerWidth);
     output.dataset.errors=window.__wpSmokeErrors.join(' // ').slice(0,250);
     document.body.appendChild(output);
   },850);
 });
 </script>`;
if(!html.includes('<head>')||!html.includes('</body>'))
 throw new Error('無法對網站 HTML 插入測試探針');
await writeFile(testFile,html.replace('<head>','<head>'+bootstrap).replace('</body>',probe+'</body>'));
const server=spawn(process.execPath,['scripts/serve.mjs'],{
 cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
try{
 let available=false;
 for(let attempt=0;attempt<50;attempt++){
  if(server.exitCode!==null)throw new Error('WorkPulse 本機伺服器提前退出');
  try{const res=await fetch(`http://127.0.0.1:${port}/${fileName}`);if(res.ok){available=true;break;}}
  catch{}
  await delay(100);
 }
 if(!available)throw new Error('WorkPulse 本機伺服器無法啟動');
 const routes=[
  ['overview','工作總覽'],['attendance','出勤表'],['entry','填寫工作日誌'],
  ['history','歷史工作紀錄'],['insights','統計分析'],['settings','系統設定']];
 let count=0;
 for(const width of [390,1366]){
  for(const [route,title] of routes){
   const url=`http://127.0.0.1:${port}/${fileName}#/${route}`;
   const output=execFileSync(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-extensions',
    '--virtual-time-budget=3500','--window-size='+width+',900',
    '--dump-dom',url
   ],{cwd:root,encoding:'utf8',maxBuffer:15*1024*1024,timeout:25000,stdio:['ignore','pipe','pipe']});
   const match=output.match(/<output id="workpulse-smoke-result"([^>]*)><\/output>/);
   if(!match)throw new Error(`${route}@${width}: 頁面未完成初始化或瀏覽器測試探針未載入`);
   const attrs=Object.fromEntries([...match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));
   const mobile=width===390;
   const expected=mobile&&['insights','settings'].includes(route)?'工作總覽':title;
   if(attrs.title!==expected||attrs.overflow==='1'||attrs.failed==='1'||
      (mobile&&(attrs.noAdminTabs!=='1'||(expected==='工作總覽'&&attrs.mobileLauncher!=='1')))||
      (route==='attendance'&&(attrs.attendance!=='1'||attrs.loading!=='0')))
    throw new Error(`${route}@${width}: ${JSON.stringify(attrs)}`);
   console.log(`PASS ${route}, requested ${width}px, actual ${attrs.width}px, no page overflow`);
   count++;
  }
 }
 console.log(`Real Chromium smoke tests passed: ${count}/${count}`);
}finally{
 server.kill('SIGTERM');
 await rm(testFile,{force:true});
}

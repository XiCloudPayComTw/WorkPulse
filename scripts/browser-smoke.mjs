/**
 * Real Chromium smoke test for local WorkPulse routes without adding production
 * dependencies. CI's ubuntu-latest image includes Google Chrome.
 * Run: npm run smoke:browser
 */
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFile,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
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
const frameName=`workpulse-viewport-${process.pid}.html`,frameFile=join(root,frameName);
// Native storage operations need wall-clock time, not Chrome's virtual-time budget.
async function nativeVaultSmoke(){
 const token=randomUUID(),profile=await mkdtemp(join(tmpdir(),'workpulse-vault-smoke-'));
 const source=await readFile(join(root,'src/services/offline-vault.js'),'utf8');
 let child,timer,settle;
 const result=new Promise((resolve,reject)=>{settle={resolve,reject};});
 const probe=`<!doctype html><html><body><output id="vault-result">waiting</output><script type="module">
 import {createOfflineVault} from '/src/services/offline-vault.js';
 const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
 const prefs=memory(),make=()=>{const s=memory();return createOfflineVault({session:()=>s,preferences:()=>prefs,signal(){}})};
 const key='workpulse:field-recovery:v1',scope='native-smoke';
 let step='enable',outcome;
 try{
  const a=make();await a.configure(scope);if(!await a.enable())throw Error(a.status().failure||'enable failed');
  step='persist';a.storage().setItem(key,'native test');if(!await a.flush())throw Error(a.status().failure||'flush failed');
  step='lock';const b=make();await b.configure(scope);if(b.status().phase!=='locked')throw Error('second vault not locked');
  step='restore';await a.configure('');const c=make();await c.configure(scope);if(c.storage().getItem(key)!=='native test')throw Error(c.status().failure||'native restore failed: '+c.status().phase);
  step='clear';if(!await c.disable())throw Error(c.status().failure||'clear failed');await c.configure('');
  const d=make();await d.configure(scope);if(d.storage().getItem(key)!==null)throw Error('data not cleared');outcome='PASS';
 }catch(e){outcome='FAIL '+step+': '+e.message;}
 document.querySelector('#vault-result').textContent=outcome;
 await fetch('/result/'+${JSON.stringify(token)}+'?value='+encodeURIComponent(outcome),{cache:'no-store'});
 </script></body></html>`;
 const listener=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(probe);return;}
  if(u.pathname==='/src/services/offline-vault.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(source);return;}
  if(u.pathname==='/result/'+token&&req.method==='GET'){const value=u.searchParams.get('value')||'missing result';res.writeHead(204);res.end();settle.resolve(value);return;}
  res.writeHead(404);res.end();
 });
 try{
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  child=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-extensions','--user-data-dir='+profile,'http://127.0.0.1:'+listener.address().port+'/'],{cwd:root,stdio:'ignore'});
  child.once('error',settle.reject);child.once('exit',(code,signal)=>settle.reject(Error('Native browser exited before reporting: '+(signal||code))));
  timer=setTimeout(()=>settle.reject(Error('Native IndexedDB / Web Locks check timed out waiting for browser result')),45000);
  const outcome=await result;if(outcome!=='PASS')throw Error('Native IndexedDB / Web Locks check failed: '+outcome);
  console.log('Native IndexedDB / Web Locks check passed (wall clock)');
 }finally{
  clearTimeout(timer);
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1000)]);}}
  listener.closeAllConnections();await new Promise(resolve=>listener.close(()=>resolve()));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
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
     const noSalary=!document.querySelector('[data-att-salary],[data-att-monthly-pay],[data-att-preview-pay],[data-att-row-pay]');
     const exportButton=Boolean(document.querySelector('[data-action="payroll-start"]'));
     const fieldHome=document.querySelector('.wp-field-home');
     const mobileLauncher=Boolean(fieldHome&&getComputedStyle(fieldHome).display!=='none');
     const mobileTabs=[...document.querySelectorAll('.mobile-nav .nav-link')].map(x=>x.textContent.trim());
     const noAdminTabs=!mobileTabs.some(x=>x.includes('統計分析')||x.includes('系統設定'));
     const loading=Boolean(document.querySelector('.att-page')?.textContent.includes('正在讀取出勤資料'));
     const overflow=document.documentElement.scrollWidth>window.innerWidth+2;
     const nav=document.querySelector('.mobile-nav');
     const mobileFit=window.innerWidth>900||Boolean(nav&&nav.scrollWidth<=nav.clientWidth+2&&[...nav.querySelectorAll('.nav-link')].every(n=>n.getBoundingClientRect().height>=44));
     const field=document.querySelector('.main .input');
     const inputReadable=window.innerWidth>900||!field||parseFloat(getComputedStyle(field).fontSize)>=16;
     const failed=()=>window.__wpSmokeErrors.length>0;
     let personChoice='skip';
     if(location.hash.includes('/overview')){
       const menuButton=document.querySelector('[data-action="person-menu"]');
       const before=menuButton?.textContent.trim();
       menuButton?.click();
       const option=window.innerWidth<=900?[...document.querySelectorAll('.wp-bottom-sheet [data-sheet-value]')][1]:[...document.querySelectorAll('[data-action="person-select"]')][1];
       if(!option)personChoice='missing-option';
       else{
         const id=option.dataset.id||option.dataset.sheetValue;
         option.click();
         const stored=localStorage.getItem('workpulse:selected-person:v1');
         const after=document.querySelector('[data-action="person-menu"]')?.textContent.trim();
         const nav=document.querySelector('[data-action="navigate"][data-view="entry"]');
         nav?.click();
         const inForm=document.querySelector('#entry-employee')?.value;
         personChoice=(stored===id && inForm===id && after!==before)?'ok':'not-synced';
       }
     }
     let calendarCheck='skip',spacingCheck='skip';
     if(location.hash.includes('/attendance')){
       const cell=document.querySelector('.att-cal-day[data-date]');
       if(cell){const date=cell.dataset.date;cell.click();calendarCheck=document.querySelector('[data-att-date]')?.value===date?'ok':'wrong-date';}else calendarCheck='missing';
     }
     if(location.hash.includes('/entry')||location.hash.includes('/history')){
       const heading=document.querySelector('.section-head.section-space');
       spacingCheck=heading&&parseFloat(getComputedStyle(heading).marginTop)>=26?'ok':'missing-gap';
     }
     let dockCheck='skip',sheetCheck='skip',searchCheck='skip',collapseCheck='skip';
     if(window.innerWidth<=900&&location.hash.includes('/entry')){
       const dock=document.querySelector('#wp-mobile-dock'),before=document.querySelectorAll('.task-card').length;
       dock?.querySelector('[data-dock="add"]')?.click();
       dockCheck=dock&&!dock.hidden&&document.querySelectorAll('.task-card').length===before+1?'ok':'missing-dock';
       const first=document.querySelector('[data-action="task-collapse"]');first?.click();const closed=first?.getAttribute('aria-expanded')==='false'&&document.querySelector('#task-0-fields')?.hidden;first?.click();collapseCheck=closed&&first?.getAttribute('aria-expanded')==='true'&&!document.querySelector('#task-0-fields')?.hidden?'ok':'wrong-collapse';
       const trigger=document.querySelector('select[data-field="category"] + .wp-sheet-trigger');trigger?.click();
       const sheet=document.querySelector('.wp-bottom-sheet[open]'),choice=sheet?.querySelector('[data-sheet-value]:not([aria-pressed="true"]):not(:disabled)');
       if(choice){const search=sheet.querySelector('.wp-sheet-search');if(search){search.value='zz_no_match_123';search.dispatchEvent(new Event('input',{bubbles:true}));const hidden=[...sheet.querySelectorAll('.wp-sheet-option')].every(x=>x.hidden);search.value=choice.textContent;search.dispatchEvent(new Event('input',{bubbles:true}));searchCheck=hidden&&!choice.hidden?'ok':'wrong-filter';}else searchCheck='missing-search';const value=choice.dataset.sheetValue;choice.click();sheetCheck=!document.querySelector('.wp-bottom-sheet')&&document.querySelector('select[data-field="category"]')?.value===value?'ok':'wrong-option';}else sheetCheck='missing-sheet';
     }
     let exportCheck='skip';
     if(location.hash.includes('/attendance')&&window.innerWidth>900){
       document.querySelector('[data-action="payroll-start"]')?.click();
       const modal=document.querySelector('.payroll-modal');
       exportCheck=modal&&modal.querySelector('[data-payroll-person]')&&modal.querySelector('[data-payroll-start]')&&modal.querySelector('[data-payroll-pay-date]')&&!modal.querySelector('input[type="number"]')?'ok':'missing-export';
       if(exportCheck==='ok'){
         modal.querySelector('[data-action="payroll-confirm"]')?.click();
         if(!modal.querySelector('[data-action="payroll-export"]')||!modal.querySelector('.payroll-preview'))exportCheck='missing-preview';
       }
       modal?.querySelector('[data-action="payroll-close"]')?.click();
     }
     const copyCheck=new Event('copy',{bubbles:true,cancelable:true});
     const titleElement=document.querySelector('h1.page-title');
     titleElement?.dispatchEvent(copyCheck);
     const copyBlocked=Boolean(titleElement&&copyCheck.defaultPrevented);
     const output=document.createElement('output');
     output.id='workpulse-smoke-result';
     output.dataset.title=title;
     output.dataset.attendance=attendance?'1':'0';output.dataset.noSalary=noSalary?'1':'0';output.dataset.exportButton=exportButton?'1':'0';output.dataset.exportCheck=exportCheck;
     output.dataset.mobileLauncher=mobileLauncher?'1':'0';
     output.dataset.noAdminTabs=noAdminTabs?'1':'0';
     output.dataset.loading=loading?'1':'0';
     output.dataset.overflow=overflow?'1':'0';output.dataset.mobileFit=mobileFit?'1':'0';output.dataset.inputReadable=inputReadable?'1':'0';
     output.dataset.failed=failed()?'1':'0';
     output.dataset.personChoice=personChoice;
     output.dataset.copyBlocked=copyBlocked?'1':'0';
     output.dataset.calendarCheck=calendarCheck;output.dataset.dockCheck=dockCheck;output.dataset.collapseCheck=collapseCheck;output.dataset.sheetCheck=sheetCheck;output.dataset.searchCheck=searchCheck;output.dataset.storageBanner=document.querySelector('.wp-storage-banner')?.textContent.includes('本機展示版')?'1':'0';output.dataset.height=String(window.innerHeight);
     output.dataset.spacingCheck=spacingCheck;
     output.dataset.width=String(window.innerWidth);
     output.dataset.errors=window.__wpSmokeErrors.join(' // ').slice(0,250);
     document.body.appendChild(output);
     if(window.parent!==window)window.parent.document.body.appendChild(output.cloneNode(true));
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
 await nativeVaultSmoke();
 const routes=[
  ['overview','工作總覽'],['attendance','出勤表'],['entry','填寫工作日誌'],
  ['history','歷史工作紀錄'],['insights','統計分析'],['settings','系統設定']];
 let count=0;
 // Chrome clamps its top-level window to 500px. A same-origin iframe gives an exact CSS viewport.
 for(const [width,height] of [[320,900],[375,900],[390,900],[430,900],[768,900],[820,900],[1024,900],[1366,900],[667,375],[844,390]]){
  for(const [route,title] of routes){
   const mobile=width<900;
   if(mobile)await writeFile(frameFile,`<!doctype html><html><body style="margin:0"><iframe title="Exact CSS viewport" style="display:block;border:0;width:${width}px;height:${height}px" src="/${fileName}#/${route}"></iframe></body></html>`);
   const url=`http://127.0.0.1:${port}/${mobile?frameName:fileName+'#/'+route}`;
   const output=execFileSync(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-extensions',
    '--virtual-time-budget=5000','--window-size='+Math.max(width,500)+',1000',
    '--dump-dom',url
   ],{cwd:root,encoding:'utf8',maxBuffer:15*1024*1024,timeout:25000,stdio:['ignore','pipe','pipe']});
   const match=output.match(/<output id="workpulse-smoke-result"([^>]*)><\/output>/);
   if(!match)throw new Error(`${route}@${width}: 頁面未完成初始化或瀏覽器測試探針未載入`);
   const attrs=Object.fromEntries([...match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));
   if(Number(attrs.width)!==width)throw new Error(`${route}: expected exact ${width}px, got ${attrs.width}px`);
   const expected=mobile&&['insights','settings'].includes(route)?'工作總覽':title;
   if(attrs.title!==expected||attrs.overflow==='1'||attrs.failed==='1'||attrs['mobile-fit']!=='1'||attrs['input-readable']!=='1'||attrs['storage-banner']!=='1'||(mobile&&Number(attrs.height)!==height)||
      attrs['copy-blocked']!=='1'||
      (route==='overview'&&attrs['person-choice']!=='ok')||
      (mobile&&route==='entry'&&(attrs['dock-check']!=='ok'||attrs['sheet-check']!=='ok'||attrs['search-check']!=='ok'||attrs['collapse-check']!=='ok'))||
      (mobile&&(attrs['no-admin-tabs']!=='1'||(expected==='工作總覽'&&attrs['mobile-launcher']!=='1')))||
      (route==='attendance'&&(attrs.attendance!=='1'||attrs.loading!=='0'||attrs['calendar-check']!=='ok'||attrs['no-salary']!=='1'||attrs['export-button']!=='1'||(!mobile&&attrs['export-check']!=='ok')))||
      (['entry','history'].includes(route)&&attrs['spacing-check']!=='ok'))
    throw new Error(`${route}@${width}: ${JSON.stringify(attrs)}`);
   console.log(`PASS ${route}, requested ${width}px, actual ${attrs.width}x${attrs.height}, no page overflow`);
   count++;
  }
 }
 console.log(`Real Chromium smoke tests passed: ${count}/${count}`);
}finally{
 server.kill('SIGTERM');
 await rm(testFile,{force:true});
 await rm(frameFile,{force:true});
}

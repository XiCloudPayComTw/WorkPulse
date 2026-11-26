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
const frameName=`workpulse-viewport-${process.pid}.html`,frameFile=join(root,frameName);
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
     let dockCheck='skip',sheetCheck='skip';
     if(window.innerWidth<=900&&location.hash.includes('/entry')){
       const dock=document.querySelector('#wp-mobile-dock'),before=document.querySelectorAll('.task-card').length;
       dock?.querySelector('[data-dock="add"]')?.click();
       dockCheck=dock&&!dock.hidden&&document.querySelectorAll('.task-card').length===before+1?'ok':'missing-dock';
       const trigger=document.querySelector('select[data-field="category"] + .wp-sheet-trigger');trigger?.click();
       const sheet=document.querySelector('.wp-bottom-sheet[open]'),choice=sheet?.querySelector('[data-sheet-value]:not([aria-pressed="true"]):not(:disabled)');
       if(choice){const value=choice.dataset.sheetValue;choice.click();sheetCheck=!document.querySelector('.wp-bottom-sheet')&&document.querySelector('select[data-field="category"]')?.value===value?'ok':'wrong-option';}else sheetCheck='missing-sheet';
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
     output.dataset.calendarCheck=calendarCheck;output.dataset.dockCheck=dockCheck;output.dataset.sheetCheck=sheetCheck;
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
 const routes=[
  ['overview','工作總覽'],['attendance','出勤表'],['entry','填寫工作日誌'],
  ['history','歷史工作紀錄'],['insights','統計分析'],['settings','系統設定']];
 let count=0;
 // Chrome clamps its top-level window to 500px. A same-origin iframe gives an exact CSS viewport.
 for(const width of [320,375,390,430,768,820,1024,1366]){
  for(const [route,title] of routes){
   const mobile=width<900;
   if(mobile)await writeFile(frameFile,`<!doctype html><html><body style="margin:0"><iframe title="Exact CSS viewport" style="display:block;border:0;width:${width}px;height:900px" src="/${fileName}#/${route}"></iframe></body></html>`);
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
   if(attrs.title!==expected||attrs.overflow==='1'||attrs.failed==='1'||attrs['mobile-fit']!=='1'||attrs['input-readable']!=='1'||
      attrs['copy-blocked']!=='1'||
      (route==='overview'&&attrs['person-choice']!=='ok')||
      (mobile&&route==='entry'&&(attrs['dock-check']!=='ok'||attrs['sheet-check']!=='ok'))||
      (mobile&&(attrs['no-admin-tabs']!=='1'||(expected==='工作總覽'&&attrs['mobile-launcher']!=='1')))||
      (route==='attendance'&&(attrs.attendance!=='1'||attrs.loading!=='0'||attrs['calendar-check']!=='ok'||attrs['no-salary']!=='1'||attrs['export-button']!=='1'||(!mobile&&attrs['export-check']!=='ok')))||
      (['entry','history'].includes(route)&&attrs['spacing-check']!=='ok'))
    throw new Error(`${route}@${width}: ${JSON.stringify(attrs)}`);
   console.log(`PASS ${route}, requested ${width}px, actual ${attrs.width}px, no page overflow`);
   count++;
  }
 }
 console.log(`Real Chromium smoke tests passed: ${count}/${count}`);
}finally{
 server.kill('SIGTERM');
 await rm(testFile,{force:true});
 await rm(frameFile,{force:true});
}

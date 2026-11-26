// The static build alone gets the PWA marker. No worker registration in GAS.
import {esc} from '../shared/utils.js';
let wpPwaEnabled=false,wpPwaPrompt=null,wpPwaState='checking',wpPwaUpdate=false,wpPwaHelp=false,wpPwaInstalled=false;
export function pwaMarkup(cloud){
 if(cloud)return '<details class="wp-pwa-panel"><summary>加入手機桌面</summary><p>可使用瀏覽器的加入主畫面／建立捷徑功能。正式 Google Apps Script 入口仍須連線驗證，不提供離線啟動或 Service Worker 快取。</p></details>';
 if(!wpPwaEnabled)return '';
 const status=wpPwaState==='ready'?'靜態離線外殼已準備':wpPwaState==='error'?'離線外殼尚未準備，請保持連線':wpPwaState==='unsupported'?'此瀏覽器未支援離線外殼':'正在準備離線外殼…';
 return '<section id="wp-pwa-panel" class="wp-pwa-panel" aria-label="App 安裝與離線外殼"><div class="wp-pwa-row"><div><strong>'+esc(wpPwaInstalled?'WorkPulse 獨立視窗':'將 WorkPulse 加入桌面')+'</strong><span role="status">'+esc(status)+'</span></div><button type="button" class="soft-button mini" data-action="'+(wpPwaPrompt?'pwa-install':'pwa-help')+'">'+(wpPwaPrompt?'安裝 App':wpPwaHelp?'收合說明':'安裝說明')+'</button></div>'+
 (wpPwaUpdate?'<p role="status">新版已下載。請先保存工作，再關閉所有 WorkPulse 視窗後重開，避免中斷目前草稿。</p>':'')+
 (wpPwaHelp?'<p>Android／桌面 Chrome、Edge：瀏覽器選單中的安裝應用程式或加入主畫面。iPhone／iPad：Safari 分享 → 加入主畫面（依系統版本而異）。如果沒有選項，仍可使用一般網站。</p>':'')+
 '<p>僅本機展示版，離線外殼不會將資料同步至 Google Drive。首次使用需連線完成快取。</p></section>';
}
function wpPwaRefresh(){const panel=document.querySelector('#wp-pwa-panel');if(panel)panel.outerHTML=pwaMarkup(false);}
export function initPwa(cloud){
 if(cloud||typeof document==='undefined'||typeof window==='undefined'||!document.querySelector('meta[name="workpulse-pwa-build"]'))return;
 wpPwaEnabled=true;wpPwaInstalled=!!window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();wpPwaPrompt=e;wpPwaRefresh();});
 window.addEventListener('appinstalled',()=>{wpPwaPrompt=null;wpPwaInstalled=true;wpPwaRefresh();});
 if(!navigator.serviceWorker||!window.isSecureContext){wpPwaState='unsupported';return;}
 const watch=reg=>{
  if(reg.waiting&&navigator.serviceWorker.controller){wpPwaUpdate=true;wpPwaRefresh();}
  reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){wpPwaUpdate=true;wpPwaRefresh();}if(worker.state==='redundant'&&!navigator.serviceWorker.controller){wpPwaState='error';wpPwaRefresh();}});});
 };
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{watch(reg);if(reg.active&&navigator.serviceWorker.controller){wpPwaState='ready';wpPwaRefresh();}}).catch(()=>{wpPwaState='error';wpPwaRefresh();});
 navigator.serviceWorker.ready.then(()=>{if(navigator.serviceWorker.controller){wpPwaState='ready';wpPwaRefresh();}});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{wpPwaState='ready';wpPwaRefresh();});
}
export async function handlePwaAction(action){
 if(!wpPwaEnabled)return;
 if(action==='pwa-install'&&wpPwaPrompt){const prompt=wpPwaPrompt;wpPwaPrompt=null;try{await prompt.prompt();await prompt.userChoice;}catch{wpPwaHelp=true;}wpPwaRefresh();return;}
 if(action==='pwa-help'){wpPwaHelp=!wpPwaHelp;wpPwaRefresh();}
}

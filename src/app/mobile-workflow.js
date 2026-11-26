/** Mobile controls delegate to existing form events; never save or mutate independently. */
import {isMobileViewport} from './person.js';
let wpSheet=null,wpSheetOrigin=null,wpViewportMax=0,wpViewportWidth=0;
export function keyboardObscures(height,visible,focused){return Boolean(focused&&height-visible>140);}
export function closeMobileSheet(restore=true){
 const dialog=wpSheet,origin=wpSheetOrigin;wpSheet=null;wpSheetOrigin=null;
 if(dialog){if(dialog.open)dialog.close();dialog.remove();}
 if(origin){origin.setAttribute('aria-expanded','false');if(restore&&origin.isConnected)origin.focus({preventScroll:true});}
}
export function openMobileSheet(origin,title,items,onChoose){
 if(!isMobileViewport()||typeof HTMLDialogElement==='undefined'||typeof HTMLDialogElement.prototype.showModal!=='function')return false;
 closeMobileSheet(false);
 const dialog=document.createElement('dialog');dialog.className='wp-bottom-sheet';dialog.setAttribute('aria-label',title);
 const heading=document.createElement('div');heading.className='wp-sheet-heading';
 const label=document.createElement('h2');label.textContent=title;heading.append(label);
 const close=document.createElement('button');close.type='button';close.className='soft-button';close.textContent='關閉';close.addEventListener('click',()=>closeMobileSheet());heading.append(close);dialog.append(heading);
 const list=document.createElement('div');list.className='wp-sheet-list';
 for(const item of items){
  const button=document.createElement('button');button.type='button';button.className='wp-sheet-option';button.textContent=item.label;button.dataset.sheetValue=item.value;button.setAttribute('aria-pressed',String(!!item.selected));button.disabled=!!item.disabled;
  button.addEventListener('click',()=>{closeMobileSheet();onChoose(item.value);});list.append(button);
 }
 dialog.append(list);document.body.append(dialog);wpSheet=dialog;wpSheetOrigin=origin;origin.setAttribute('aria-expanded','true');
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeMobileSheet();});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientY<rect.top||e.clientY>rect.bottom||e.clientX<rect.left||e.clientX>rect.right)closeMobileSheet();}});
 try{dialog.showModal();(list.querySelector('[aria-pressed="true"]:not(:disabled)')||close).focus({preventScroll:true});}
 catch{closeMobileSheet(false);return false;}
 return true;
}
export function enhanceMobileSelects(){
 if(typeof HTMLDialogElement==='undefined'||typeof HTMLDialogElement.prototype.showModal!=='function')return;
 const selector='select[data-identity="employeeId"],select[data-field="category"],select[data-field="project"],select[data-filter],select[data-att-person]';
 for(const select of document.querySelectorAll(selector)){
  if(select.dataset.sheetEnhanced)continue;
  select.dataset.sheetEnhanced='1';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='input wp-sheet-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const title=select.closest('label')?.querySelector('.field-label')?.textContent?.trim()||select.closest('label')?.textContent?.trim()||'選擇';
  const update=()=>{trigger.textContent=select.selectedOptions[0]?.textContent||'請選擇';trigger.disabled=select.disabled;trigger.setAttribute('aria-label',title+'：'+trigger.textContent);};
  update();select.after(trigger);
  trigger.addEventListener('click',()=>{
   if(select.disabled)return;
   openMobileSheet(trigger,title,[...select.options].map(o=>({value:o.value,label:o.textContent,selected:o.selected,disabled:o.disabled})),value=>{
    if(!select.isConnected||select.disabled||select.value===value)return;
    select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));
    if(select.isConnected)select.dispatchEvent(new Event('change',{bubbles:true}));
    if(select.isConnected)update();
   });
  });
  select.addEventListener('change',update);
 }
}
export function syncMobileDock(){
 const dock=document.querySelector('#wp-mobile-dock');if(!dock)return;
 const nav=document.querySelector('.mobile-nav');
 if(nav?.getBoundingClientRect&&document.documentElement?.style)document.documentElement.style.setProperty('--wp-nav-height',Math.max(0,nav.getBoundingClientRect().height)+'px');
 const entry=document.querySelector('.entry-actions [data-action="save-journal"]'),attendance=document.querySelector('.att-page [data-action="attendance-save"]'),source=entry||attendance;
 dock.hidden=!source;
 if(document.documentElement?.classList)document.documentElement.classList.toggle('wp-has-dock',!!source);
 if(!source)return;
 const save=dock.querySelector('[data-dock="save"]'),add=dock.querySelector('[data-dock="add"]'),status=dock.querySelector('[data-dock-status]');
 save.disabled=source.disabled;save.textContent=source.textContent.trim();add.hidden=!entry;add.disabled=source.disabled;
 const draft=entry?document.querySelector('#draft-save-status')?.textContent:document.querySelector('.att-page .att-notice')?.textContent;
 status.textContent=draft||(!entry?'出勤紀錄 · 儲存後才正式提交':'草稿與正式儲存狀態');
}
export function mobileDockMarkup(){
 return '<div id="wp-mobile-dock" class="wp-mobile-dock" hidden><span data-dock-status role="status" aria-live="polite"></span><div><button type="button" class="soft-button" data-dock="add">新增項目</button><button type="button" class="soft-button primary" data-dock="save">儲存</button></div></div>';
}
export function initMobileWorkflow(){
 if(typeof document==='undefined'||!document.documentElement||!window.matchMedia)return;
 const media=window.matchMedia('(max-width:900px)');
 const refresh=()=>{
  const vv=window.visualViewport,width=window.innerWidth,height=window.innerHeight,focused=document.activeElement?.matches?.('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file])');
  if(wpViewportWidth!==width){wpViewportMax=height;wpViewportWidth=width;}else if(!focused)wpViewportMax=Math.max(wpViewportMax,height);
  const visible=vv?.height??height,keyboard=media.matches&&keyboardObscures(Math.max(height,wpViewportMax),visible,focused);
  document.documentElement.classList.toggle('wp-keyboard-open',keyboard);
  if(!media.matches&&wpSheet)closeMobileSheet();
  if(keyboard&&document.activeElement?.getBoundingClientRect){const rect=document.activeElement.getBoundingClientRect(),bottom=(vv?.offsetTop||0)+visible;if(rect.bottom>bottom-20||rect.top<(vv?.offsetTop||0))document.activeElement.scrollIntoView({block:'center',behavior:'instant'});}
 };
 window.visualViewport?.addEventListener('resize',refresh);window.visualViewport?.addEventListener('scroll',refresh);
 window.addEventListener('resize',()=>{refresh();syncMobileDock();});document.addEventListener('focusin',refresh);document.addEventListener('focusout',()=>setTimeout(refresh,0));
 window.addEventListener('hashchange',()=>{closeMobileSheet(false);refresh();});
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-dock]');if(!button||button.disabled)return;
  const source=button.dataset.dock==='add'?document.querySelector('.entry-grid [data-action="add-task"]'):document.querySelector('.entry-actions [data-action="save-journal"],.att-page [data-action="attendance-save"]');
  if(source&&!source.disabled)source.click();
 });
 refresh();
}
export function mobileSkeleton(label){
 return '<section class="soft-card card-pad-lg wp-read-skeleton" role="status" aria-live="polite"><p>'+label+'</p><div aria-hidden="true"><span></span><span></span><span></span></div></section>';
}

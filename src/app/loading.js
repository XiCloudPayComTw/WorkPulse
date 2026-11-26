/** Delayed shared loading surface; active writes take priority over reads. */
const wpLoadingRequests=new Map();
let wpLoadingSequence=0,wpLoadingReveal=null,wpLoadingSurface=null;
function wpLoadingMessage(){return [...wpLoadingRequests.values()].some(x=>x==='正在儲存資料…')?'正在儲存資料…':([...wpLoadingRequests.values()].at(-1)||'正在讀取資料…');}
function wpLoadingRefresh(){const label=wpLoadingSurface?.querySelector('.wp-loading-text');if(label)label.textContent=wpLoadingMessage();}
export function startFieldLoading(message='正在讀取資料…'){
 const id=++wpLoadingSequence;wpLoadingRequests.set(id,message);
 if(wpLoadingSurface){wpLoadingRefresh();return id;}
 if(wpLoadingReveal!==null)return id;
 wpLoadingReveal=setTimeout(()=>{
  wpLoadingReveal=null;
  if(!wpLoadingRequests.size||typeof document==='undefined'||!document.body?.appendChild)return;
  const el=document.createElement('div');el.className='wp-loading-overlay';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  el.innerHTML='<div class="wp-loading-card"><div class="wp-jelly-orb" aria-hidden="true"><span></span><span></span><span></span></div><p class="wp-loading-text"></p><small>網路訊號較弱時，資料載入可能需要一些時間</small></div>';
  document.body.appendChild(el);wpLoadingSurface=el;wpLoadingRefresh();
 },180);return id;
}
export function stopFieldLoading(id){
 wpLoadingRequests.delete(id);
 if(!wpLoadingRequests.size){
  if(wpLoadingReveal!==null){clearTimeout(wpLoadingReveal);wpLoadingReveal=null;}
  if(wpLoadingSurface){wpLoadingSurface.remove();wpLoadingSurface=null;}
 }else wpLoadingRefresh();
}

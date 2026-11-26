/** One soft loading surface for remote calls, including slow outdoor connections.
 * Delayed reveal avoids flashing for fast requests; every operation is counted.
 */
let wpLoadingCount=0;
let wpLoadingReveal=null;
let wpLoadingSurface=null;
function wpLoadingRemove(){
 if(wpLoadingSurface){wpLoadingSurface.remove();wpLoadingSurface=null;}
}
export function startFieldLoading(message='正在讀取資料…'){
 wpLoadingCount++;
 if(wpLoadingSurface)return;
 if(wpLoadingReveal!==null)return;
 wpLoadingReveal=setTimeout(()=>{
  wpLoadingReveal=null;
  if(!wpLoadingCount||typeof document==='undefined'||!document.body?.appendChild)return;
  const el=document.createElement('div');
  el.className='wp-loading-overlay';
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  el.innerHTML='<div class="wp-loading-card"><div class="wp-jelly-orb" aria-hidden="true"><span></span><span></span><span></span></div>'+
   '<p class="wp-loading-text"></p><small>網路訊號較弱時，資料載入可能需要一些時間</small></div>';
  el.querySelector('.wp-loading-text').textContent=message;
  document.body.appendChild(el);wpLoadingSurface=el;
 },180);
}
export function stopFieldLoading(){
 wpLoadingCount=Math.max(0,wpLoadingCount-1);
 if(!wpLoadingCount){
  if(wpLoadingReveal!==null){clearTimeout(wpLoadingReveal);wpLoadingReveal=null;}
  wpLoadingRemove();
 }
}

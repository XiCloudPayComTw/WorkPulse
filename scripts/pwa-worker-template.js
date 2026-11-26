/* Generated only for the static GitHub Pages build. No company responses are cached. */
const release=__WP_RELEASE__;
const paths=__WP_STATIC_PATHS__;
const root=new URL(self.registration.scope);
const prefix='workpulse-static:'+root.href+':';
const cacheName=prefix+release;
const allowed=new Set(paths.map(path=>new URL(path,root).href));
const index=new URL('index.html',root).href;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  try{
   for(const url of allowed){
    const response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'error'});
    if(!response.ok||response.type!=='basic')throw Error('Static asset unavailable: '+url);
    await cache.put(url,response);
   }
  }catch(e){await caches.delete(cacheName);throw e;}
 })());
 // No skipWaiting: older open tabs retain their release until closed.
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==root.origin||url.search||request.headers.has('range'))return;
 const key=request.mode==='navigate'&&(url.href===root.href||url.href===index)?index:allowed.has(url.href)&&request.mode!=='navigate'?url.href:'';
 if(!key)return;
 event.respondWith((async()=>{const cache=await caches.open(cacheName);const hit=await cache.match(key);return hit||fetch(request);})());
});

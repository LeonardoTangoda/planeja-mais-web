const CACHE_VERSION='planeja-plus-shell-v2';
const STATIC_CACHE=CACHE_VERSION;
const APP_SHELL=['/','/manifest.json','/pwa-icon.svg','/brand/planeja-logo.png','/favicon.png'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('planeja-plus-shell-')&&k!==STATIC_CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function isStaticAsset(url){
  return url.origin===self.location.origin&&(
    url.pathname.startsWith('/assets/')||
    url.pathname.startsWith('/brand/')||
    url.pathname==='/favicon.png'||
    url.pathname==='/pwa-icon.svg'||
    url.pathname==='/manifest.json'
  );
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  // Never cache API/auth/user-specific responses. Financial data must always come from the live backend.
  if(url.pathname.includes('/functions/')||url.pathname.includes('/rest/')||url.pathname.includes('/auth/'))return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        if(res.ok)caches.open(STATIC_CACHE).then(cache=>cache.put('/',copy));
        return res;
      }).catch(()=>caches.match('/').then(hit=>hit||Response.error()))
    );
    return;
  }

  if(isStaticAsset(url)){
    event.respondWith(
      caches.match(req).then(cached=>{
        const fresh=fetch(req).then(res=>{
          if(res.ok)caches.open(STATIC_CACHE).then(cache=>cache.put(req,res.clone()));
          return res;
        }).catch(()=>cached);
        return cached||fresh;
      })
    );
  }
});

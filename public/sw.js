const CACHE='uptilldawn-public-v7'
const PUBLIC_ASSETS=['/offline.html','/offline-public.html','/up-till-dawn-mark.webp']
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC_ASSETS))))
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('uptilldawn-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())))
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return
 const url=new URL(event.request.url)
 if(url.origin!==self.location.origin)return
 if(event.request.mode==='navigate'){
  const publicRoute=url.pathname==='/login'||url.pathname.startsWith('/login/')||url.pathname==='/signup'||url.pathname==='/forgot-password'||url.pathname==='/verify-email'||url.pathname==='/disabled'||url.pathname==='/unauthorized'||url.pathname.startsWith('/auth/')
  event.respondWith(fetch(event.request).catch(()=>caches.match(publicRoute?'/offline-public.html':'/offline.html')))
 }else if(PUBLIC_ASSETS.includes(url.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)))
})

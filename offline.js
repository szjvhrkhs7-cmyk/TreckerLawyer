/* Offline preparation never blocks the local UI or requires a cloud account. */
(() => {
  'use strict';
  const supported='serviceWorker' in navigator && window.isSecureContext;
  const snapshot={supported,ready:false,updateAvailable:false,label:supported?'Подготавливаем приложение для работы без сети…':'Этот браузер не поддерживает автономный запуск.'};
  let registration=null,preparing=null,hadController=Boolean(navigator.serviceWorker?.controller),needsReload=false;
  const scope=new URL('./',location.href).href,workerURL=new URL('sw.js',scope).href;
  function publish(patch){Object.assign(snapshot,patch);window.dispatchEvent(new CustomEvent('lawyer-offline-state',{detail:{...snapshot}}));}
  const watched=new WeakSet(),watchedWorkers=new WeakSet();
  function reloadWhenSafe(){const subtaskDraft=[...document.querySelectorAll('.j-subform input')].some(input=>input.value.trim());if(needsReload&&!document.querySelector('.overlay.show')&&!subtaskDraft){needsReload=false;location.reload();}}
  function verify(worker){
    if(!worker)return;
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();if(!snapshot.ready)publish({label:'Подготовка еще не завершена. Откройте трекер с интернетом.'});},5000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();if(event.data?.type==='READY')publish({ready:true,label:'Готово. Трекер можно закрывать и открывать без интернета.',updateAvailable:Boolean(registration?.waiting)});};
    worker.postMessage({type:'CHECK_READY'},[channel.port2]);
  }
  function watch(reg){
    registration=reg;if(reg.active)verify(reg.active);
    if(reg.waiting)publish({updateAvailable:true});
    const installing=reg.installing;
    if(installing&&!watchedWorkers.has(installing)){watchedWorkers.add(installing);installing.addEventListener('statechange',()=>{if(installing.state==='activated')verify(reg.active||installing);else if(installing.state==='installed'&&reg.active)publish({updateAvailable:true});else if(installing.state==='redundant'&&!snapshot.ready)publish({label:'Не удалось подготовить все файлы. Повторим при подключении к интернету.'});});}
    if(!watched.has(reg)){watched.add(reg);reg.addEventListener('updatefound',()=>watch(reg));}
  }
  async function prepare(){
    if(!supported||preparing)return preparing;
    preparing=(async()=>{
      try{
        const saved=await navigator.serviceWorker.getRegistration(scope);
        if(saved?.scope===scope)watch(saved);
        if(!navigator.onLine){if(!snapshot.ready&&!saved?.active)publish({label:'Для первого автономного запуска откройте трекер с интернетом.'});return;}
        const reg=await navigator.serviceWorker.register(workerURL,{scope,updateViaCache:'none'});watch(reg);
      }catch{publish({label:snapshot.ready?snapshot.label:'Не удалось подготовить автономный запуск. Повторим при восстановлении связи.'});}
      finally{preparing=null;}
    })();return preparing;
  }
  async function applyUpdate(){
    if(!registration?.waiting)return false;
    if(document.querySelector('.overlay.show'))return false;
    registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});return true;
  }
  window.lawyerOffline={getState:()=>({...snapshot}),prepare,applyUpdate};
  if(supported){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{verify(navigator.serviceWorker.controller);if(hadController){needsReload=true;reloadWhenSafe();}else hadController=true;});
    new MutationObserver(reloadWhenSafe).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('online',()=>prepare());
    prepare();
  }
})();

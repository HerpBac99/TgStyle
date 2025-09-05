(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&r(i)}).observe(document,{childList:!0,subtree:!0});function o(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerPolicy&&(s.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?s.credentials="include":n.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(n){if(n.ep)return;n.ep=!0;const s=o(n);fetch(n.href,s)}})();const B="tgstyle_app_logs",O=1e3;window.apiUrl="https://tgstyle.flappy.crazedns.ru/api";const _={logs:[],init(){try{const e=localStorage.getItem(B);e&&(this.logs=JSON.parse(e),console.log(`Загружено ${this.logs.length} ранее сохраненных логов`))}catch(e){console.error("Ошибка при загрузке логов из localStorage:",e)}return this.createLogUI(),window.addEventListener("error",e=>{this.log("Необработанная ошибка: "+e.message,"error",{filename:e.filename,lineno:e.lineno,colno:e.colno,stack:e.error?e.error.stack:null}),this.saveLogs()}),console.log("Система логирования инициализирована"),this},createLogUI(){const e=document.createElement("button");e.id="view-logs-btn",e.textContent="🔍 Логи",e.style.cssText=`
            position: fixed;
            bottom: 10px;
            right: 10px;
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.6);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            z-index: 9999;
            cursor: pointer;
        `;const t=document.createElement("div");t.id="log-modal",t.style.cssText=`
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: none;
            flex-direction: column;
            color: white;
            font-family: monospace;
            padding: 10px;
        `;const o=document.createElement("div");o.style.cssText=`
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        `;const r=document.createElement("h3");r.textContent="Журнал логов приложения",r.style.margin="0";const n=document.createElement("div");n.id="log-content",n.style.cssText=`
            flex: 1;
            overflow-y: auto;
            background-color: rgba(0, 0, 0, 0.5);
            padding: 10px;
            border-radius: 4px;
            font-size: 11px;
            white-space: pre-wrap;
        `;const s=document.createElement("div");s.style.cssText=`
            display: flex;
            justify-content: flex-start;
            gap: 10px;
            margin-top: 10px;
        `;const i=document.createElement("button");i.textContent="Копировать",i.className="log-btn";const a=document.createElement("button");a.textContent="Отправить",a.className="log-btn";const l=document.createElement("button");l.textContent="Очистить",l.className="log-btn";const p=document.createElement("button");p.textContent="Выход",p.className="log-btn";const g=document.createElement("style");g.textContent=`
            .log-btn {
                padding: 6px 12px;
                background-color: #40a7e3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .log-btn:hover {
                background-color: #2c7db2;
            }
            .log-entry {
                margin-bottom: 4px;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .log-info { color: #90caf9; }
            .log-debug { color: #80deea; }
            .log-warn { color: #ffcc80; }
            .log-error { color: #ef9a9a; }
        `,o.appendChild(r),s.appendChild(i),s.appendChild(a),s.appendChild(l),s.appendChild(p),t.appendChild(o),t.appendChild(n),t.appendChild(s),document.head.appendChild(g),document.body.appendChild(e),document.body.appendChild(t),e.addEventListener("click",()=>{this.updateLogDisplay(),t.style.display="flex"}),i.addEventListener("click",()=>{const L=this.formatLogsForExport();navigator.clipboard.writeText(L).then(()=>{alert("Логи скопированы в буфер обмена")}).catch(v=>{console.error("Ошибка при копировании логов:",v),alert("Не удалось скопировать логи: "+v.message)})}),a.addEventListener("click",()=>{this.sendLogsToServer()}),l.addEventListener("click",()=>{confirm("Очистить все логи?")&&(this.clearLogs(),this.updateLogDisplay())}),p.addEventListener("click",()=>{t.style.display="none"})},updateLogDisplay(){const e=document.getElementById("log-content");if(!e)return;if(e.innerHTML="",this.logs.length===0){e.innerHTML="<em>Нет записей в журнале</em>";return}this.logs.slice(-500).forEach(o=>{const r=document.createElement("div");r.className=`log-entry log-${o.level}`,r.innerHTML=`
                <strong>[${o.timestamp}]</strong> 
                <span class="log-level">[${o.level.toUpperCase()}]</span> 
                <span class="log-message">${o.message}</span>
                <br><small class="log-caller">${o.caller}</small>
                ${o.data?`<br><small class="log-data">${o.data}</small>`:""}
            `,e.appendChild(r)}),e.scrollTop=e.scrollHeight},formatLogsForExport(){return this.logs.map(e=>`[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message} (${e.caller})${e.data?`
  Данные: `+e.data:""}`).join(`
`)},saveLogs(){try{this.logs.length>O&&(this.logs=this.logs.slice(-O)),localStorage.setItem(B,JSON.stringify(this.logs))}catch(e){console.error("Ошибка при сохранении логов в localStorage:",e)}},clearLogs(){this.logs=[],this.saveLogs()},getCallerInfo(){try{const t=new Error().stack.split(`
`);if(t.length>=4){const o=t[3].trim(),r=o.match(/at\s+([^\s]+)\s+\((.+):(\d+):(\d+)\)/);if(r){const[s,i,a,l,p]=r,g=a.split("/").pop();return`${i} в ${g}:${l}`}const n=o.match(/at\s+(.+):(\d+):(\d+)/);if(n){const[s,i,a,l]=n;return`${i.split("/").pop()}:${a}`}return o.replace(/^\s*at\s+/,"")}return"неизвестно"}catch{return"ошибка определения"}},log(e,t="info",o=null,r=null){const n=r||this.getCallerInfo(),s=new Date().toISOString(),i={timestamp:s,level:t,message:e,caller:n,data:o?JSON.stringify(o):null};this.logs.push(i);const a=`[${s}] [${t.toUpperCase()}] ${e} (${n})`;switch(t){case"error":console.error(a,o||"");break;case"warn":console.warn(a,o||"");break;case"debug":console.debug(a,o||"");break;default:console.log(a,o||"")}return this.saveLogs(),i},sendLogsToServer(){const e=document.getElementById("log-content");if(!e)return;const t=e.innerHTML;e.innerHTML='<div style="text-align: center; padding: 20px;">Отправка логов на сервер...</div>';const o={logs:this.logs,userAgent:navigator.userAgent,appVersion:"1.0.0",timestamp:new Date().toISOString()};fetch(`${window.apiUrl}/log-error`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)}).then(r=>{if(!r.ok)throw new Error(`HTTP ошибка: ${r.status}`);return r.json()}).then(r=>{if(r.success)e.innerHTML='<div style="text-align: center; padding: 20px; color: #81c784;">Логи успешно отправлены на сервер!</div>',setTimeout(()=>{e.innerHTML=t},2e3);else throw new Error(r.error||"Неизвестная ошибка")}).catch(r=>{e.innerHTML=`<div style="text-align: center; padding: 20px; color: #e57373;">Ошибка при отправке логов: ${r.message}</div>`,setTimeout(()=>{e.innerHTML=t},3e3)})}};function J(e,t="info",o=null){return _.log(e,t,o,"appLogger")}window.Logger=_;window.appLogger=J;let h=window.Telegram.WebApp;typeof window.appLogger!="function"&&(window.appLogger=function(e,t="info",o=null){console[t==="error"?"error":t==="warn"?"warn":"log"](e,o||"")},console.warn("Logger не загружен, используется временный логгер"));window.apiUrl||(window.apiUrl="https://tgstyle.flappy.crazedns.ru/api",console.warn("apiUrl не найден, используется значение по умолчанию"));window.apiUrl="https://tgstyle.flappy.crazedns.ru/api";h.expand();h.enableClosingConfirmation();const q=document.getElementById("user-name"),K=document.getElementById("user-photo"),V=document.querySelectorAll(".history-cell"),R=document.getElementById("camera-btn");let C=null,b=null,j=!1;const $="tgStyleHistory",y=4;function A(){const e=getComputedStyle(document.body).backgroundColor,t="#81D8D0";if(e!==t&&e!=="rgb(129, 216, 208)"||!j){appLogger("Применяем тему приложения","info",{currentBgColor:e,targetColor:t}),document.body.style.backgroundColor=t;const r=document.querySelector(".app-container");r&&(r.style.backgroundColor=t),j=!0}}function U(){appLogger("Загрузка профиля пользователя","info");try{if(h.initDataUnsafe&&h.initDataUnsafe.user){const e=h.initDataUnsafe.user;q.textContent=e.first_name||"",appLogger("Данные пользователя получены","debug",{firstName:e.first_name,hasPhoto:!!e.photo_url}),e.photo_url&&(K.style.backgroundImage=`url(${e.photo_url})`)}else appLogger("Данные пользователя недоступны","warn")}catch(e){appLogger("Ошибка при загрузке профиля","error",e)}}async function D(){try{appLogger("Начало процесса авторизации","info"),U(),A(),te();const e=h.initData;if(!e){appLogger("InitData отсутствует, продолжаем без авторизации","warn");return}appLogger("Отправка данных на сервер для авторизации","debug");try{const t=await fetch(`${window.apiUrl}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData:e})});if(t.status>=500){const n=t.statusText||"Ошибка сервера";if(appLogger(`Ошибка сервера ${t.status}: ${n}`,"error"),t.status===502){w("Ошибка 502 Bad Gateway: Сервер недоступен или перегружен. Попробуйте позже или обратитесь к администратору."),appLogger("Диагностика: проверка доступности API","debug");try{const i=await fetch(`${window.apiUrl}/ping`,{method:"GET",mode:"no-cors"});appLogger(`Статус пинга: ${i.status}`,"debug")}catch(i){appLogger("Сервер полностью недоступен","error",{error:i.message})}return}throw new Error(`Ошибка сервера: ${t.status} ${n}`)}const o=t.headers.get("content-type");if(!o||!o.includes("application/json")){const n=await t.text();throw appLogger("Сервер вернул не-JSON ответ","error",{status:t.status,text:n.substring(0,200)}),new Error(`Сервер вернул некорректный формат данных: ${n.substring(0,50)}...`)}const r=await t.json();if(appLogger("Получен ответ от сервера","debug",r),r.success)appLogger("Авторизация успешна","info");else{const n="Ошибка авторизации: "+r.error;appLogger(n,"error"),w(n)}}catch(t){throw appLogger("Ошибка сети при выполнении запроса","error",{message:t.message,type:t.name}),navigator.onLine?w("Ошибка сети: "+t.message):w("Нет подключения к интернету. Пожалуйста, проверьте соединение."),t}}catch(e){const t="Ошибка: "+e.message;appLogger("Исключение при авторизации","error",{message:e.message,stack:e.stack}),w(t)}}function w(e){appLogger("Отображение ошибки: "+e,"error");const t=document.createElement("div");t.className="error",t.textContent=e,t.style.position="fixed",t.style.top="50%",t.style.left="50%",t.style.transform="translate(-50%, -50%)",t.style.padding="20px",t.style.zIndex="9999",document.body.appendChild(t),setTimeout(()=>{document.body.removeChild(t)},3e3)}R.addEventListener("click",e=>{appLogger("Кнопка камеры нажата, открытие камеры Telegram","info"),e.stopPropagation();try{appLogger("Проверка доступных методов Telegram API","debug",{methods:Object.keys(h).filter(t=>typeof h[t]=="function")}),z(!0)}catch(t){appLogger("Ошибка при открытии камеры","error",{message:t.message,stack:t.stack}),z(!0)}});function z(e=!1){appLogger(`Показываем выбор файла (предпочтение камеры: ${e})`,"info");const t=document.createElement("input");t.type="file",t.accept="image/*",e&&t.setAttribute("capture","camera"),t.style.display="none",t.addEventListener("change",o=>{if(o.target.files&&o.target.files[0]){const r=o.target.files[0];appLogger("Файл выбран","debug",{name:r.name,size:r.size,type:r.type});const n=new FileReader;n.onload=function(s){const i=s.target.result.split(",")[1];C=i,Z(s.target.result),appLogger("Фото загружено и отображено в полноэкранном режиме","info",{size:i.length})},n.onerror=function(s){appLogger("Ошибка при чтении файла","error",{message:s.message}),w("Не удалось прочитать файл: "+s.message)},n.readAsDataURL(r)}else appLogger("Файл не выбран","warn");document.body.removeChild(t)}),document.body.appendChild(t),t.click()}async function W(e,t=1.5,o=1280){return appLogger("Сжатие изображения перед отправкой","info"),new Promise((r,n)=>{try{const s=new Image,i=document.createElement("canvas"),a=i.getContext("2d");s.onload=function(){let l=s.width,p=s.height;if(l>o){const f=o/l;l=o,p=Math.floor(p*f)}i.width=l,i.height=p,a.drawImage(s,0,0,l,p);let g=.9,L=i.toDataURL("image/jpeg",g);const v=f=>Math.ceil((f.length-f.indexOf(",")-1)*.75);let u=v(L);const m=t*1024*1024;for(;u>m&&g>.1;)g-=.05,L=i.toDataURL("image/jpeg",g),u=v(L);const x=L.split(",")[1];appLogger("Изображение успешно сжато","info",{originalSize:e.length,compressedSize:x.length,quality:g.toFixed(2),dimensions:`${l}x${p}`}),r(x)},s.onerror=function(){n(new Error("Не удалось загрузить изображение для сжатия"))},s.src=`data:image/jpeg;base64,${e}`}catch(s){appLogger("Ошибка при сжатии изображения","error",s),n(s)}})}function Z(e){appLogger("Отображение фото в полноэкранном режиме","info");const t=document.getElementById("fullscreen-preview");t&&document.body.removeChild(t);const o=document.createElement("div");o.id="fullscreen-preview",o.style.cssText=`
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #000;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 0;
    `;const r=document.createElement("img");r.src=e,r.style.cssText=`
        width: 100%;
        height: calc(100% - 70px);
        object-fit: contain;
    `;const n=document.createElement("div");n.style.cssText=`
        display: flex;
        justify-content: space-between;
        width: 100%;
        height: 70px;
        background-color: #18191a;
        padding: 10px 20px;
    `;const s=document.createElement("button");s.innerHTML=`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
    `,s.style.cssText=`
        background-color: transparent;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: none;
    `;const i=document.createElement("button");i.innerHTML=`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
    `,i.style.cssText=`
        background-color: #81D8D0;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: none;
    `,i.addEventListener("click",async()=>{i.innerHTML=`
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="16"></circle>
            </svg>
        `;const a=document.createElement("style");a.textContent=`
            .spinner {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `,document.head.appendChild(a),i.disabled=!0;try{appLogger("Отправка фото на сервер для анализа","info");const l=await W(C,1.5,1280),p=await fetch(`${window.apiUrl}/analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:l,platform:navigator.platform,userAgent:navigator.userAgent,initData:h.initData||null})});if(!p.ok)throw new Error(`Ошибка сервера: ${p.status} ${p.statusText}`);const g=await p.json();if(g.success)g.classification||(appLogger("Отсутствуют данные классификации в ответе сервера","warn",g),g.classification={classNameRu:"Неизвестный тип",confidence:"0"}),appLogger("Анализ успешно завершен","info",{classification:g.classification}),b={photo:C,analysis:g.analysis||"",comments:g.comments||[],classification:g.classification,timestamp:new Date().toISOString()},appLogger("Данные для сохранения в историю","debug",{hasPhoto:!!b.photo,photoLength:b.photo?b.photo.length:0,classification:b.classification,timestamp:b.timestamp}),ee(b)||appLogger("Предупреждение: не удалось сохранить анализ в историю","warn"),document.body.removeChild(o),Q(g.classification);else throw new Error(g.error||"Ошибка при анализе фото")}catch(l){appLogger("Ошибка при анализе фото","error",{message:l.message,stack:l.stack}),i.innerHTML=`
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
            `,i.disabled=!1,w("Ошибка при анализе: "+l.message)}}),s.addEventListener("click",()=>{document.body.removeChild(o),C=null}),n.appendChild(s),n.appendChild(i),o.appendChild(r),o.appendChild(n),document.body.appendChild(o)}function Q(e){appLogger("Отображение результатов классификации","info");try{if(!e||typeof e!="object"){appLogger("Некорректные данные классификации","error",e);return}const t=e.classNameRu||"Неизвестный тип",o=e.confidence||"0",r=document.createElement("div");r.className="classification-toast",r.style.cssText=`
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            font-size: 16px;
            text-align: center;
            z-index: 2000;
            min-width: 250px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
        `,r.innerHTML=`
            <div style="font-weight: bold; margin-bottom: 5px;">Результат анализа:</div>
            <div>${t}</div>
            <div style="margin-top: 5px; font-size: 14px; opacity: 0.8;">Уверенность: ${o}%</div>
        `,document.body.appendChild(r),setTimeout(()=>{r.style.transform="translateX(-50%) translateY(0)",r.style.opacity="1"},10),setTimeout(()=>{r.style.transform="translateX(-50%) translateY(100px)",r.style.opacity="0",setTimeout(()=>{document.body.removeChild(r)},300)},4e3)}catch(t){appLogger("Ошибка при отображении результатов классификации","error",{message:t.message,stack:t.stack,data:e})}}function ee(e){try{if(appLogger("Попытка сохранения анализа в историю","info"),!e||typeof e!="object")return appLogger("Ошибка при сохранении: некорректные данные анализа","error",{analysisData:e}),!1;if(e.photo)try{if(e.photo.length>1e5){appLogger("Сжатие фото перед сохранением","info",{originalSize:Math.round(e.photo.length/1024)+"KB"});const o=new Image;return o.src=`data:image/jpeg;base64,${e.photo}`,o.onload=function(){const r=document.createElement("canvas"),n=r.getContext("2d");let s=o.width,i=o.height;const a=s/i;let l=.8,p=e.photo;for(;p.length>1e5&&(s>200||l>.4);)s>200?(s=s*.8,i=s/a):l-=.1,r.width=s,r.height=i,n.fillStyle="#FFFFFF",n.fillRect(0,0,s,i),n.drawImage(o,0,0,s,i),p=r.toDataURL("image/jpeg",l).split(",")[1],appLogger("Попытка сжатия изображения","debug",{width:s,height:i,quality:l,newSize:Math.round(p.length/1024)+"KB"});e.photo=p,p.length>1e5&&(appLogger("Фото всё ещё слишком большое, обрезаем","warn",{finalSize:Math.round(p.length/1024)+"KB",limit:Math.round(1e5/1024)+"KB"}),e.photo=p.substring(0,1e5)+"..."),appLogger("Фото сжато перед сохранением","info",{originalSize:Math.round(e.photo.length/1024)+"KB",finalSize:Math.round(e.photo.length/1024)+"KB"}),T(e)},o.onerror=function(){appLogger("Ошибка при загрузке изображения для сжатия","error"),e.photo.length>1e5&&(e.photo=e.photo.substring(0,1e5)+"..."),T(e)},!0}else return T(e),!0}catch(t){return appLogger("Ошибка при оптимизации фото","error",t),T(e),!0}else return T(e),!0}catch(t){return appLogger("Ошибка при сохранении анализа","error",t),!1}}function T(e){try{let t=k();Array.isArray(t)||(t=[]),e.timestamp=new Date().toISOString();let o=t.findIndex(r=>!r||r.isEmpty);return o!==-1?t[o]=e:(t.unshift(e),t.length>y&&(t=t.slice(0,y))),X(t),N(t),appLogger("Анализ успешно сохранен в историю","info"),!0}catch(t){return appLogger("Ошибка при завершении сохранения анализа","error",t),!1}}function k(){try{const e=localStorage.getItem($);if(!e)return new Array(y).fill(null);try{const t=JSON.parse(e);if(!Array.isArray(t))return appLogger("История не является массивом","warn"),new Array(y).fill(null);const o=t.slice(0,y);for(;o.length<y;)o.push(null);return o}catch(t){return appLogger("Ошибка при парсинге истории","error",t),new Array(y).fill(null)}}catch(e){return appLogger("Ошибка при загрузке истории из localStorage","error",e),new Array(y).fill(null)}}function X(e){try{const o=(Array.isArray(e)?[...e]:new Array(y).fill(null)).slice(0,y),r=JSON.stringify(o),n=new Blob([r]).size,s=4*1024*1024;if(n>s){appLogger("История слишком большая для сохранения в localStorage","warn",{size:n,limit:s});const i=o.map(a=>{var l;if(a&&!a.isEmpty){const p=(l=a.photo)==null?void 0:l.substring(0,1e4);return{...a,photo:p?p+"...":null}}return a});localStorage.setItem($,JSON.stringify(i)),appLogger("Сохранена уменьшенная версия истории","info")}else localStorage.setItem($,r)}catch(t){appLogger("Ошибка при сохранении истории в localStorage","error",t)}}function te(){const e=k();N(e)}function N(e){const t=e||k();if(!Array.isArray(t)){appLogger("История не является массивом при обновлении ячеек","error",{history:t});return}V.forEach((o,r)=>{const n=r<t.length?t[r]:null,s=o.querySelector(".history-cell-content");if(!s){appLogger(`Не найден контейнер содержимого для ячейки ${r}`,"error");return}s.innerHTML="",o.className="history-cell",o.onclick=null;let i,a=!1;if(n&&!n.isEmpty){let x=function(c){if(a)return;const d=c.type==="touchstart"?c.touches[0].clientX:c.clientX,F=c.type==="touchstart"?c.touches[0].clientY:c.clientY;m=function(E){const G=E.type.includes("touch")?E.touches[0].clientX:E.clientX,Y=E.type.includes("touch")?E.touches[0].clientY:E.clientY;(Math.abs(G-d)>10||Math.abs(Y-F)>10)&&(clearTimeout(i),o.removeEventListener("mousemove",m),o.removeEventListener("touchmove",m))},o.addEventListener("mousemove",m),o.addEventListener("touchmove",m,{passive:!0}),i=setTimeout(()=>{a=!0,appLogger("Активирован режим удаления для ячейки истории","info",{index:r}),o.classList.add("delete-mode"),window.navigator&&window.navigator.vibrate&&window.navigator.vibrate(50),H(),c.preventDefault()},500)},f=function(){clearTimeout(i),m&&(o.removeEventListener("mousemove",m),o.removeEventListener("touchmove",m)),a||(o.onclick=()=>M(n))},H=function(){const c=document.createElement("button");c.className="delete-history-btn",c.innerHTML=`
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Удалить
                `,c.addEventListener("click",d=>{d.stopPropagation(),appLogger("Запрос на удаление элемента истории","info",{index:r}),c.disabled=!0,c.innerHTML="Удаление...",c.style.opacity="0.7",confirm("Удалить этот элемент из истории?")?(oe(r),c.style.opacity="0",setTimeout(()=>{c.parentNode&&c.parentNode.removeChild(c)},300)):(c.disabled=!1,c.innerHTML=`
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Удалить
                        `,c.style.opacity="1")}),o.appendChild(c),document.addEventListener("click",S)},S=function(c){o.contains(c.target)||I()},I=function(){a=!1,o.classList.remove("delete-mode"),o.style.transform="";const c=o.querySelector(".delete-history-btn");c&&c.remove(),document.removeEventListener("click",S),o.onclick=()=>M(n)};var l=x,p=f,g=H,L=S,v=I;if(o.classList.add("filled"),n.photo)if(typeof n.photo=="string")try{appLogger(`Установка фона для ячейки ${r}`,"debug",{photoLength:n.photo.length,photoStart:n.photo.substring(0,30)+"...",photoEnd:"..."+n.photo.substring(n.photo.length-30),isTruncated:n.photo.endsWith("...")}),n.photo.endsWith("...")&&appLogger(`Фото в ячейке ${r} было обрезано при сохранении`,"warn"),o.style.backgroundImage=`url(data:image/jpeg;base64,${n.photo})`,setTimeout(()=>{const c=window.getComputedStyle(o).backgroundImage;if(c==="none"||c===""){appLogger(`Ошибка установки фона для ячейки ${r}`,"error",{computedStyle:c});const d=document.createElement("div");d.className="photo-error-overlay",d.textContent="Ошибка загрузки",o.appendChild(d)}},100)}catch(c){appLogger(`Ошибка при установке фона для ячейки ${r}`,"error",c),o.style.backgroundImage="";const d=document.createElement("div");d.className="photo-error-overlay",d.textContent="Ошибка загрузки",o.appendChild(d)}else appLogger(`Некорректный формат фото в ячейке ${r}`,"warn",{photoType:typeof n.photo}),o.style.backgroundImage="";else o.style.backgroundImage="";const u=document.createElement("div");u.className="history-cell-caption";try{const c=new Date(n.savedAt||n.timestamp||0),d=`${c.toLocaleDateString()} ${c.toLocaleTimeString().slice(0,5)}`;u.textContent=d}catch(c){appLogger(`Ошибка при форматировании даты для ячейки ${r}`,"error",c),u.textContent="Дата не определена"}s.appendChild(u),o.addEventListener("mousedown",x),o.addEventListener("touchstart",x,{passive:!0}),o.addEventListener("mouseup",f),o.addEventListener("mouseleave",f),o.addEventListener("touchend",f),o.addEventListener("touchcancel",f);let m;o.onclick=()=>M(n)}else{o.style.backgroundImage="";const u=document.createElement("div");u.className="add-analysis",u.innerHTML=`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
            `,s.appendChild(u),o.onclick=()=>R.click()}})}function M(e){try{if(appLogger("Показ сохраненной фотографии","info"),!e||!e.photo){appLogger("Отсутствуют данные для показа","error",{analysisData:e}),w("Не удалось загрузить данные фотографии");return}let t=document.getElementById("photo-preview-container");if(t){P();return}let o=e.photo;typeof o=="string"&&o.endsWith("...")&&appLogger("Обнаружено обрезанное фото, загружаем оригинал","info"),t=document.createElement("div"),t.id="photo-preview-container",t.style.cssText=`
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 15px;
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;const r=document.createElement("div");r.style.cssText=`
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
        `;const n=document.createElement("img");try{n.src=`data:image/jpeg;base64,${o}`}catch(a){appLogger("Ошибка при установке источника изображения","error",a),n.src=""}n.style.cssText=`
            max-width: 100%;
            max-height: 80%;
            object-fit: contain;
            border-radius: 10px;
            margin-bottom: 10px;
        `,n.onerror=function(){appLogger("Ошибка загрузки изображения","error"),n.style.display="none";const a=document.createElement("div");a.textContent="Не удалось загрузить изображение",a.style.cssText=`
                background-color: rgba(255, 0, 0, 0.2);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 10px;
            `,r.insertBefore(a,n.nextSibling)};let s=document.createElement("div");if(e.classification)try{const a=e.classification||{},l=a.classNameRu||"Неизвестный тип",p=a.confidence||"0";s.style.cssText=`
                    background-color: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 10px;
                    font-size: 16px;
                    text-align: center;
                    margin-bottom: 10px;
                    width: 90%;
                `,s.innerHTML=`<strong>Определено:</strong> ${l} (уверенность: ${p}%)`}catch(a){appLogger("Ошибка при отображении данных классификации","error",a),s.style.cssText="height: 10px;"}else s.style.cssText="height: 10px;";const i=document.createElement("div");i.className="date-caption";try{const a=new Date(e.savedAt||e.timestamp||0),l=`${a.toLocaleDateString()} ${a.toLocaleTimeString().slice(0,5)}`;i.textContent=l}catch(a){appLogger("Ошибка при форматировании даты","error",a),i.textContent="Дата не определена"}t.addEventListener("click",P),r.appendChild(n),r.appendChild(s),r.appendChild(i),t.appendChild(r),document.body.appendChild(t),setTimeout(()=>{t.style.opacity="1",t.style.transform="scale(1)"},10)}catch(t){appLogger("Ошибка при показе сохраненной фотографии","error",{message:t.message,stack:t.stack,data:e}),w("Ошибка при отображении фотографии")}}function P(){const e=document.getElementById("photo-preview-container");e&&(appLogger("Закрытие предпросмотра фотографии","info"),e.style.opacity="0",e.style.transform="scale(0.95)",setTimeout(()=>{e.parentNode&&e.parentNode.removeChild(e)},300))}document.addEventListener("visibilitychange",()=>{document.hidden||(appLogger("Приложение стало видимым","debug"),A())});(function(){Logger.init(),appLogger("Немедленная инициализация приложения","info",{userAgent:navigator.userAgent,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight}),document.body.style.overflow="hidden",h.isVersionAtLeast("6.9")&&(appLogger("Запрос полноэкранного режима в Telegram","info"),h.requestFullscreen()),A(),U(),D()})();function oe(e){try{appLogger("Удаление элемента истории","info",{index:e});const t=k();return!Array.isArray(t)||e<0||e>=t.length?(appLogger("Некорректный индекс или история не является массивом","error",{index:e,history:t}),!1):(t[e]=null,X(t),N(t),appLogger("Элемент истории успешно удален","success",{index:e}),!0)}catch(t){return appLogger("Ошибка при удалении элемента истории","error",{message:t.message,stack:t.stack,index:e}),!1}}

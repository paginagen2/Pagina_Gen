(function initializeAndroidUpdates() {
  if (!window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() !== 'android') return;

  const script = document.currentScript;
  if (!script) return;
  const siteRoot = new URL('../', script.src);
  const remoteDailyUrl = 'https://raw.githubusercontent.com/paginagen2/Pagina_Gen/main/datos/inicio.json';
  const firebaseWebApiKey = 'AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE';
  const firestoreConfigUrl = `https://firestore.googleapis.com/v1/projects/pagina-gen/databases/(default)/documents/configuracion_publica/android?key=${encodeURIComponent(firebaseWebApiKey)}`;
  const cacheKey = 'gen2-android-update-configuration';

  function validConfiguration(value) {
    return value
      && Number.isInteger(Number(value.versionCode))
      && Number.isInteger(Number(value.minimumVersionCode))
      && /^https:\/\//i.test(String(value.apkUrl || ''));
  }

  function publishState(installed, configuration) {
    if (!validConfiguration(configuration)) return null;
    const installedVersionCode = Number(installed.versionCode);
    const latestVersionCode = Number(configuration.versionCode);
    const minimumVersionCode = Number(configuration.minimumVersionCode);
    const state = {
      installedVersionCode,
      installedVersionName: String(installed.versionName || ''),
      latestVersionCode,
      latestVersionName: String(configuration.versionName || ''),
      minimumVersionCode,
      updateAvailable: installedVersionCode < latestVersionCode,
      required: installedVersionCode < minimumVersionCode,
      apkUrl: String(configuration.apkUrl),
      title: String(configuration.titulo || 'Actualizá Gen 2'),
      description: String(configuration.descripcion || 'Hay una nueva versión disponible.'),
      actionText: String(configuration.textoEnlace || 'Descargar actualización')
    };
    window.genAndroidUpdateState = state;
    window.dispatchEvent(new CustomEvent('gen:android-update', { detail: state }));
    if (state.required) renderRequiredUpdate(state);
    return state;
  }

  function decodeFirestoreValue(value = {}) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    return undefined;
  }

  function decodeFirestoreDocument(document = {}) {
    return Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]));
  }

  function rememberConfiguration(configuration) {
    if (!validConfiguration(configuration)) return;
    try { localStorage.setItem(cacheKey, JSON.stringify(configuration)); } catch (_) {}
  }

  function cachedConfiguration() {
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      return validConfiguration(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  async function fetchJson(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Respuesta ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveRemoteConfiguration() {
    try {
      const firestoreDocument = await fetchJson(firestoreConfigUrl);
      const configuration = decodeFirestoreDocument(firestoreDocument);
      if (!validConfiguration(configuration)) throw new Error('Configuración de Firestore inválida');
      rememberConfiguration(configuration);
      return configuration;
    } catch (firestoreError) {
      console.warn('No se pudo consultar la configuración Android en Firestore:', firestoreError);
    }
    try {
      const daily = await fetchJson(`${remoteDailyUrl}?actualizacion=${Date.now()}`);
      if (!validConfiguration(daily.android)) throw new Error('El archivo diario no contiene una versión válida');
      rememberConfiguration(daily.android);
      return daily.android;
    } catch (dailyError) {
      console.warn('No se pudo consultar la configuración Android en GitHub:', dailyError);
    }
    const cached = cachedConfiguration();
    if (cached) return cached;
    const bundledDaily = await fetchJson(new URL('datos/inicio.json', siteRoot).href, 3000);
    if (!validConfiguration(bundledDaily.android)) throw new Error('No hay una configuración Android disponible');
    return bundledDaily.android;
  }

  function renderRequiredUpdate(state) {
    if (document.getElementById('gen-required-update')) return;
    const style = document.createElement('style');
    style.textContent = `
      body.gen-update-required { overflow: hidden !important; }
      #gen-required-update { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top, #33205a 0%, #14111d 58%, #09080d 100%); color: #fff; font-family: inherit; }
      #gen-required-update .gen-update-card { width: min(100%, 460px); padding: 34px 28px; border: 1px solid rgba(190,150,255,.34); border-radius: 28px; background: rgba(29,23,42,.96); box-shadow: 0 24px 70px rgba(0,0,0,.48); text-align: center; }
      #gen-required-update .gen-update-mark { display: grid; place-items: center; width: 66px; height: 66px; margin: 0 auto 22px; border-radius: 20px; background: linear-gradient(145deg,#8f5ee8,#5d30b1); font-size: 24px; font-weight: 800; }
      #gen-required-update h1 { margin: 0 0 12px; font-size: clamp(25px,7vw,34px); line-height: 1.08; }
      #gen-required-update p { margin: 0 0 12px; color: #d6cde5; line-height: 1.55; }
      #gen-required-update small { display: block; margin: 0 0 24px; color: #9f92b5; }
      #gen-required-update a { display: block; padding: 15px 20px; border-radius: 14px; background: #8f5ee8; color: #fff; font-weight: 750; text-decoration: none; box-shadow: 0 10px 26px rgba(101,55,184,.38); }
    `;
    document.head.appendChild(style);
    const overlay = document.createElement('section');
    overlay.id = 'gen-required-update';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gen-required-update-title');
    overlay.innerHTML = `
      <div class="gen-update-card">
        <div class="gen-update-mark" aria-hidden="true">GEN</div>
        <h1 id="gen-required-update-title"></h1>
        <p></p>
        <small></small>
        <a rel="external">Descargar actualización</a>
      </div>`;
    overlay.querySelector('h1').textContent = state.title;
    overlay.querySelector('p').textContent = state.description;
    overlay.querySelector('small').textContent = `Tenés la versión ${state.installedVersionName || state.installedVersionCode}. Necesitás la versión ${state.latestVersionName || state.minimumVersionCode}.`;
    const action = overlay.querySelector('a');
    action.href = state.apkUrl;
    action.textContent = state.actionText;
    document.body.classList.add('gen-update-required');
    document.body.appendChild(overlay);
    action.focus();
  }

  async function checkForUpdate() {
    const [installed, configuration] = await Promise.all([
      fetchJson(new URL('aaglobal/android-build.json', siteRoot).href, 3000),
      resolveRemoteConfiguration()
    ]);
    return publishState(installed, configuration);
  }

  window.genAndroidUpdateReady = checkForUpdate().catch(error => {
    console.warn('No se pudo comprobar si hay una actualización de Android:', error);
    return null;
  });
}());

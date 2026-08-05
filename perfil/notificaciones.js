const PRESETS = {
  essential: {
    title: 'Configuración esencial',
    description: 'Recibirás solamente las comunicaciones generales y las de tu zona.',
    summary: ['Comunicación general al publicarse', 'Comunicación de tu zona al publicarse'],
    categories: {
      general: 'immediate', zone: 'immediate', wordOfLife: 'off', passphrase: 'off', meditation: 'off'
    },
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '21:00' }
  },
  balanced: {
    title: 'Configuración equilibrada',
    description: 'Mantiene activa la comunicación y suma propuestas espirituales puntuales, sin saturarte.',
    summary: ['Comunicación', 'Palabra de Vida · 3 veces al mes', '1 Pasapalabra por semana', '1 Meditación por semana'],
    categories: {
      general: 'immediate', zone: 'immediate', wordOfLife: 'monthly_cycle',
      passphrase: 'weekly', meditation: 'weekly'
    },
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '21:00' }
  },
  all: {
    title: 'Todas las notificaciones',
    description: 'Recibirás Comunicación y todas las propuestas espirituales disponibles.',
    summary: ['Comunicación', 'Palabra de Vida · 3 veces al mes', 'Pasapalabra diario', 'Meditación diaria'],
    categories: {
      general: 'immediate', zone: 'immediate', wordOfLife: 'monthly_cycle',
      passphrase: 'daily', meditation: 'daily'
    },
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '21:00' }
  }
};

const CATEGORIES = [
  { id: 'general', name: 'Comunicación general', description: 'Es esencial y se envía al publicarse.', essential: true, options: [['immediate', 'Al publicarse']] },
  { id: 'zone', name: 'Comunicación de tu zona', description: 'Es esencial y se envía al publicarse para la zona de tu perfil.', essential: true, options: [['immediate', 'Al publicarse']] },
  { id: 'wordOfLife', name: 'Palabra de Vida', description: 'Recordatorios distribuidos durante el mes.', options: [['off', 'Desactivada'], ['monthly_cycle', '3 veces al mes'], ['weekly', '1 por semana'], ['daily', 'Todos los días']] },
  { id: 'passphrase', name: 'Pasapalabra', description: 'Una propuesta breve en un momento variable.', options: [['off', 'Desactivada'], ['weekly', '1 por semana'], ['two_week', '2 por semana'], ['daily', 'Todos los días']] },
  { id: 'meditation', name: 'Meditación diaria', description: 'Una pausa para acompañar tu día.', options: [['off', 'Desactivada'], ['weekly', '1 por semana'], ['two_week', '2 por semana'], ['daily', 'Todos los días']] }
];

const DAY_NAMES = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado' };
let currentUser = null;
let loadedPreferences = null;
let notificationsEnabled = false;
let webPushRegistration = null;
let webPushPublicKey = '';
const notificationDeviceId = getNotificationDeviceId();
const notificationPreferencesCacheKey = `gen2-notification-preferences:${notificationDeviceId}`;
const elements = {};

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(elements, {
    loading: document.getElementById('notifications-loading'),
    signedOut: document.getElementById('notifications-signed-out'),
    form: document.getElementById('notifications-form'),
    settings: document.getElementById('notification-settings'),
    enable: document.getElementById('notifications-enable'),
    activationTitle: document.getElementById('activation-title'),
    activationDescription: document.getElementById('activation-description'),
    activationPermissionTip: document.getElementById('activation-permission-tip'),
    activationStatus: document.getElementById('activation-status'),
    customSection: document.getElementById('custom-section'),
    categoryList: document.getElementById('category-list'),
    summaryTitle: document.getElementById('summary-title'),
    summaryDescription: document.getElementById('summary-description'),
    summaryList: document.getElementById('summary-list'),
    scheduleWarning: document.getElementById('schedule-warning'),
    from: document.getElementById('time-from'),
    to: document.getElementById('time-to'),
    status: document.getElementById('notifications-status'),
    save: document.querySelector('.notifications-save')
  });

  renderCategories();
  elements.enable.addEventListener('click', toggleNotifications);
  elements.form.addEventListener('change', handleFormChange);
  elements.form.addEventListener('submit', savePreferences);

  try {
    if (window.firebaseReady) await window.firebaseReady;
    if (!window.firebaseAuth || !window.firebaseUtils) throw new Error('Firebase no está disponible');
    window.firebaseUtils.onAuthStateChanged(window.firebaseAuth, handleAuthState);
  } catch (error) {
    console.error(error);
    elements.loading.innerHTML = '<p>No pudimos conectar con tu cuenta. Recargá la página para volver a intentarlo.</p>';
  }
});

function renderCategories() {
  const fragment = document.createDocumentFragment();
  CATEGORIES.forEach(category => {
    const row = document.createElement('div');
    row.className = `category-row${category.essential ? ' category-essential' : ''}`;
    row.dataset.category = category.id;

    const info = document.createElement('div');
    info.className = 'category-info';
    const toggle = document.createElement('label');
    toggle.className = 'category-toggle';
    toggle.innerHTML = `<input type="checkbox" data-category-toggle="${category.id}" aria-label="Activar ${category.name}"><span aria-hidden="true"></span>`;
    const copy = document.createElement('span');
    copy.className = 'category-copy';
    copy.innerHTML = `<strong>${category.name}${category.essential ? '<em>Esencial</em>' : ''}</strong><small>${category.description}</small>`;
    info.append(toggle, copy);

    const select = document.createElement('select');
    select.dataset.categoryFrequency = category.id;
    select.setAttribute('aria-label', `Frecuencia de ${category.name}`);
    category.options.forEach(([value, label]) => select.add(new Option(label, value)));

    const controls = document.createElement('div');
    controls.className = 'category-controls';
    controls.append(select);
    if (category.options.some(([value]) => value === 'daily')) {
      const fixedTime = document.createElement('div');
      fixedTime.className = 'category-fixed-time';
      fixedTime.hidden = true;
      fixedTime.innerHTML = `
        <label class="same-time-option">
          <input type="checkbox" data-category-fixed="${category.id}">
          <span>A la misma hora</span>
        </label>
        <label class="fixed-time-clock">
          Hora
          <input type="time" value="${defaultFixedTime(category.id)}" data-category-time="${category.id}" aria-label="Hora diaria de ${category.name}" disabled>
        </label>`;
      controls.append(fixedTime);
    }
    row.append(info, controls);
    fragment.append(row);
  });
  elements.categoryList.append(fragment);
}

async function handleAuthState(user) {
  currentUser = user;
  if (!user) {
    elements.loading.hidden = true;
    elements.signedOut.hidden = false;
    elements.form.hidden = true;
    return;
  }

  try {
    await prepareWebPush();
    const { doc, getDoc } = window.firebaseUtils;
    const snapshot = await getDoc(notificationDeviceRef(user.uid));
    const remotePreferences = snapshot.exists() ? snapshot.data() : null;
    loadedPreferences = newestPreferences(readCachedPreferences(), remotePreferences);
  } catch (error) {
    console.error('No se pudieron cargar las preferencias:', error);
    loadedPreferences = readCachedPreferences();
  }

  applyLoadedPreferences(loadedPreferences);
  if (webPushRegistration) {
    const activeSubscription = await webPushRegistration.pushManager.getSubscription();
    notificationsEnabled = loadedPreferences?.enabled !== false
      && getNotificationPermission() === 'granted'
      && Boolean(activeSubscription);
  }
  updateActivationPresentation();
  elements.loading.hidden = true;
  elements.signedOut.hidden = true;
  elements.form.hidden = false;
}

function applyLoadedPreferences(preferences) {
  const mode = preferences?.mode && ['essential', 'balanced', 'all', 'custom'].includes(preferences.mode)
    ? preferences.mode
    : 'balanced';
  elements.form.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  const source = mode === 'custom'
    ? {
        categories: preferences?.categories || PRESETS.balanced.categories,
        fixedTimes: preferences?.fixedTimes || {},
        schedule: preferences?.schedule || PRESETS.balanced.schedule
      }
    : PRESETS[mode];
  applyCategories(source.categories, source.fixedTimes);
  applySchedule(source.schedule);
  updateModePresentation(mode);
  notificationsEnabled = preferences?.enabled !== false && getNotificationPermission() === 'granted';
}

async function toggleNotifications() {
  elements.activationStatus.textContent = '';

  if (notificationsEnabled) {
    notificationsEnabled = false;
    if (webPushRegistration) {
      const subscription = await webPushRegistration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    }
    cachePreferences({ ...buildCurrentPreferences(), ...getDeviceMetadata(), enabled: false, permission: getNotificationPermission(), updatedAt: new Date().toISOString(), version: 6, subscription: null, fcmToken: null });
    await persistEnabledState(false);
    updateActivationPresentation();
    return;
  }

  if (!('Notification' in window)) {
    elements.activationStatus.textContent = 'Este navegador no admite notificaciones. Probá desde un navegador actualizado.';
    return;
  }

  elements.enable.disabled = true;
  elements.enable.textContent = 'Solicitando permiso…';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await subscribeWebPush();
    notificationsEnabled = permission === 'granted';
    cachePreferences({
      ...buildCurrentPreferences(),
      ...getDeviceMetadata(),
      enabled: notificationsEnabled,
      permission,
      updatedAt: new Date().toISOString(),
      version: 6,
      subscription: await currentWebPushSubscription(),
      fcmToken: null
    });
    await persistEnabledState(notificationsEnabled);
    if (permission === 'denied') {
      elements.activationStatus.textContent = 'El permiso está bloqueado. Podés habilitarlo desde la configuración del navegador.';
    } else if (notificationsEnabled) {
      elements.activationStatus.textContent = 'Listo. Este dispositivo ya puede recibir notificaciones.';
    }
  } catch (error) {
    console.error('No se pudo solicitar permiso para notificaciones:', error);
    notificationsEnabled = false;
    const isBrave = Boolean(navigator.brave);
    if (!window.isSecureContext) {
      elements.activationStatus.textContent = 'Las notificaciones necesitan una conexión segura. Abrí la página desde su dirección web normal.';
    } else if (('Notification' in window && Notification.permission === 'denied') || error?.name === 'NotAllowedError') {
      elements.activationStatus.textContent = 'El permiso está bloqueado en el navegador. Habilitá las notificaciones para este sitio desde el candado de la barra de direcciones.';
    } else if (isBrave && error?.name === 'AbortError') {
      elements.activationStatus.textContent = 'Brave tiene desactivado su servicio de avisos. En Configuración › Privacidad y seguridad, activá “Usar servicios de Google para los mensajes push” y reiniciá Brave.';
    } else {
      elements.activationStatus.textContent = 'No pudimos registrar este dispositivo. Recargá la página y volvé a intentarlo.';
    }
  } finally {
    elements.enable.disabled = false;
    updateActivationPresentation();
  }
}

async function persistEnabledState(enabled) {
  if (!currentUser) return;
  const currentPreferences = buildCurrentPreferences();
  try {
    const { setDoc } = window.firebaseUtils;
    const preferences = {
      ...currentPreferences,
      ...getDeviceMetadata(),
      enabled,
      permission: getNotificationPermission(),
      updatedAt: new Date().toISOString(),
      version: 6,
      subscription: enabled ? await currentWebPushSubscription() : null,
      fcmToken: null
    };
    cachePreferences(preferences);
    await setDoc(notificationDeviceRef(currentUser.uid), preferences, { merge: true });
    loadedPreferences = preferences;
  } catch (error) {
    console.error('No se pudo guardar el estado de notificaciones:', error);
    elements.activationStatus.textContent = 'El permiso cambió, pero no pudimos guardar la preferencia en tu cuenta.';
  }
}

function updateActivationPresentation() {
  const permission = getNotificationPermission();
  elements.settings.disabled = !notificationsEnabled;
  elements.enable.classList.toggle('is-active', notificationsEnabled);
  elements.enable.textContent = notificationsEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones';
  elements.activationTitle.textContent = notificationsEnabled ? 'Notificaciones activadas' : 'Activar notificaciones';
  elements.activationDescription.textContent = notificationsEnabled
    ? 'Las comunicaciones generales y las de tu zona están activas. Podés elegir debajo qué otros avisos recibir.'
    : 'Permití que Gen 2 te avise cuando haya una comunicación importante.';
  elements.activationPermissionTip.hidden = notificationsEnabled;
}

function getNotificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

async function prepareWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  webPushRegistration = await navigator.serviceWorker.register('../notification-sw.js', { scope: '../' });
  await navigator.serviceWorker.ready;
  webPushPublicKey = window.GEN2_VAPID_PUBLIC_KEY || '';
}

async function subscribeWebPush() {
  if (!webPushRegistration) await prepareWebPush();
  if (!webPushRegistration || !webPushPublicKey) {
    throw new Error('La configuración Web Push todavía no está disponible.');
  }
  const existing = await webPushRegistration.pushManager.getSubscription();
  if (existing) return existing;
  return webPushRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(webPushPublicKey)
  });
}

async function currentWebPushSubscription() {
  const subscription = await webPushRegistration?.pushManager.getSubscription();
  return subscription?.toJSON() || null;
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

function handleFormChange(event) {
  if (event.target.name === 'mode') {
    const mode = event.target.value;
    if (mode !== 'custom') {
      applyCategories(PRESETS[mode].categories, PRESETS[mode].fixedTimes);
      applySchedule(PRESETS[mode].schedule);
    } else if (!loadedPreferences || loadedPreferences.mode !== 'custom') {
      applyCategories(PRESETS.balanced.categories, PRESETS.balanced.fixedTimes);
      applySchedule(PRESETS.balanced.schedule);
    }
    updateModePresentation(mode);
    return;
  }

  if (event.target.matches('[data-category-toggle]')) {
    const id = event.target.dataset.categoryToggle;
    const category = CATEGORIES.find(item => item.id === id);
    if (category?.essential) {
      event.target.checked = true;
      return;
    }
    const select = elements.form.querySelector(`[data-category-frequency="${id}"]`);
    select.disabled = !event.target.checked;
    if (event.target.checked && select.value === 'off') select.value = 'weekly';
    if (!event.target.checked) select.value = 'off';
  }
  updateFixedTimeVisibility();
  updateScheduleWarning();
}

function updateModePresentation(mode) {
  elements.customSection.hidden = mode !== 'custom';
  const content = mode === 'custom'
    ? {
        title: 'Configuración personalizada',
        description: 'Tus selecciones se guardarán en tu cuenta y se aplicarán a los dispositivos que autorices.',
        summary: ['Comunicaciones general y de tu zona esenciales', 'Secciones elegidas por vos', 'Horario diario aleatorio o fijo']
      }
    : PRESETS[mode];
  elements.summaryTitle.textContent = content.title;
  elements.summaryDescription.textContent = content.description;
  elements.summaryList.replaceChildren(...content.summary.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  updateScheduleWarning();
}

function applyCategories(values, fixedTimes = {}) {
  CATEGORIES.forEach(category => {
    const value = category.essential ? 'immediate' : (values?.[category.id] || 'off');
    const toggle = elements.form.querySelector(`[data-category-toggle="${category.id}"]`);
    const select = elements.form.querySelector(`[data-category-frequency="${category.id}"]`);
    const validValue = [...select.options].some(option => option.value === value) ? value : 'off';
    toggle.checked = category.essential || validValue !== 'off';
    toggle.disabled = Boolean(category.essential);
    select.value = validValue;
    select.disabled = Boolean(category.essential) || validValue === 'off';
    const timeInput = elements.form.querySelector(`[data-category-time="${category.id}"]`);
    const fixedToggle = elements.form.querySelector(`[data-category-fixed="${category.id}"]`);
    if (timeInput) timeInput.value = fixedTimes?.[category.id] || defaultFixedTime(category.id);
    if (fixedToggle) fixedToggle.checked = Boolean(fixedTimes?.[category.id]);
  });
  updateFixedTimeVisibility();
}

function applySchedule(schedule = PRESETS.balanced.schedule) {
  const days = Array.isArray(schedule.days) ? schedule.days.map(Number) : PRESETS.balanced.schedule.days;
  elements.form.querySelectorAll('input[name="day"]').forEach(input => {
    input.checked = days.includes(Number(input.value));
  });
  elements.from.value = schedule.from || '09:00';
  elements.to.value = schedule.to || '21:00';
  updateScheduleWarning();
}

function collectCategories() {
  return Object.fromEntries(CATEGORIES.map(category => {
    if (category.essential) return [category.id, 'immediate'];
    const toggle = elements.form.querySelector(`[data-category-toggle="${category.id}"]`);
    const select = elements.form.querySelector(`[data-category-frequency="${category.id}"]`);
    return [category.id, toggle.checked ? select.value : 'off'];
  }));
}

function collectFixedTimes() {
  const categories = collectCategories();
  return Object.fromEntries(CATEGORIES
    .filter(category =>
      categories[category.id] === 'daily'
      && elements.form.querySelector(`[data-category-fixed="${category.id}"]`)?.checked
    )
    .map(category => {
      const input = elements.form.querySelector(`[data-category-time="${category.id}"]`);
      return [category.id, input?.value || defaultFixedTime(category.id)];
    }));
}

function updateFixedTimeVisibility() {
  CATEGORIES.forEach(category => {
    const select = elements.form.querySelector(`[data-category-frequency="${category.id}"]`);
    const input = elements.form.querySelector(`[data-category-time="${category.id}"]`);
    if (!input) return;
    const container = input.closest('.category-fixed-time');
    const fixedToggle = elements.form.querySelector(`[data-category-fixed="${category.id}"]`);
    container.hidden = select.value !== 'daily' || select.disabled;
    input.disabled = container.hidden || !fixedToggle.checked;
  });
}

function defaultFixedTime(categoryId) {
  if (categoryId === 'passphrase') return '09:00';
  if (categoryId === 'meditation') return '20:00';
  return '10:00';
}

function updateScheduleWarning() {
  if (!elements.scheduleWarning) return;
  const categories = collectCategories();
  const enabledDays = [...elements.form.querySelectorAll('input[name="day"]:checked')]
    .map(input => DAY_NAMES[Number(input.value)]);
  const disabledDays = [...elements.form.querySelectorAll('input[name="day"]:not(:checked)')]
    .map(input => DAY_NAMES[Number(input.value)]);
  const weeklyAmounts = { weekly: 1, two_week: 2, daily: 7 };
  const conflicts = CATEGORIES
    .map(category => ({
      name: category.name,
      frequency: categories[category.id],
      requested: weeklyAmounts[categories[category.id]] || 0
    }))
    .filter(item => item.requested > enabledDays.length);

  elements.scheduleWarning.hidden = conflicts.length === 0;
  if (conflicts.length === 0) {
    elements.scheduleWarning.textContent = '';
    return;
  }

  const conflictDescriptions = conflicts.map(item => {
    const frequencyText = item.frequency === 'daily'
      ? 'todos los días'
      : `${item.requested} ${item.requested === 1 ? 'vez' : 'veces'} por semana`;
    return `${item.name} ${frequencyText}`;
  });
  const enabledText = enabledDays.length
    ? `solo habilitaste ${joinNames(enabledDays)}`
    : 'no dejaste ningún día habilitado';
  const disabledText = disabledDays.length
    ? ` Los días ${joinNames(disabledDays)} no recibirás notificaciones.`
    : '';
  elements.scheduleWarning.textContent =
    `La frecuencia elegida para ${joinNames(conflictDescriptions)} no coincide con los días disponibles: ${enabledText}. No hay suficientes días para distribuir esos avisos.${disabledText}`;
}

function buildCurrentPreferences() {
  const mode = elements.form.querySelector('input[name="mode"]:checked')?.value || 'balanced';
  const selectedDays = [...elements.form.querySelectorAll('input[name="day"]:checked')].map(input => Number(input.value));
  const base = mode === 'custom'
    ? {
        categories: collectCategories(),
        fixedTimes: collectFixedTimes(),
        schedule: { days: selectedDays, from: elements.from.value, to: elements.to.value }
      }
    : PRESETS[mode];
  return {
    mode,
    categories: { ...base.categories, general: 'immediate', zone: 'immediate' },
    fixedTimes: base.fixedTimes || {},
    schedule: base.schedule,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires'
  };
}

async function savePreferences(event) {
  event.preventDefault();
  if (!currentUser || !notificationsEnabled) return;
  const mode = elements.form.querySelector('input[name="mode"]:checked')?.value || 'balanced';
  const selectedDays = [...elements.form.querySelectorAll('input[name="day"]:checked')].map(input => Number(input.value));

  if (mode === 'custom' && selectedDays.length === 0) {
    showStatus('Elegí por lo menos un día para recibir notificaciones.', true);
    return;
  }
  if (mode === 'custom' && elements.from.value >= elements.to.value) {
    showStatus('La hora de finalización debe ser posterior a la hora de inicio.', true);
    return;
  }

  const preferences = {
    ...buildCurrentPreferences(),
    ...getDeviceMetadata(),
    enabled: true,
    permission: getNotificationPermission(),
    updatedAt: new Date().toISOString(),
    version: 6,
    subscription: await currentWebPushSubscription(),
    fcmToken: null
  };
  cachePreferences(preferences);

  elements.save.disabled = true;
  elements.save.textContent = 'Guardando…';
  showStatus('');
  try {
    const { setDoc } = window.firebaseUtils;
    await setDoc(notificationDeviceRef(currentUser.uid), preferences, { merge: true });
    loadedPreferences = preferences;
    showStatus('Preferencias guardadas.');
  } catch (error) {
    console.error('No se pudieron guardar las preferencias:', error);
    showStatus('No pudimos guardar los cambios. Intentá nuevamente.', true);
  } finally {
    elements.save.disabled = false;
    elements.save.textContent = 'Guardar preferencias';
  }
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

function notificationDeviceRef(uid) {
  return window.firebaseUtils.doc(
    window.firebaseDb,
    'usuarios',
    uid,
    'dispositivosNotificaciones',
    notificationDeviceId
  );
}

function getNotificationDeviceId() {
  const storageKey = 'gen2-notification-device-id';
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return stored;
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function getDeviceMetadata() {
  return {
    deviceId: notificationDeviceId,
    platform: 'web',
    transport: 'web-push',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires'
  };
}

function readCachedPreferences() {
  try {
    const value = localStorage.getItem(notificationPreferencesCacheKey);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function cachePreferences(preferences) {
  try {
    localStorage.setItem(notificationPreferencesCacheKey, JSON.stringify(preferences));
  } catch {
    // La preferencia seguirá intentando guardarse en la cuenta.
  }
}

function newestPreferences(localPreferences, remotePreferences) {
  if (!localPreferences) return remotePreferences;
  if (!remotePreferences) return localPreferences;
  const localTime = Date.parse(localPreferences.updatedAt || '') || 0;
  const remoteTime = Date.parse(remotePreferences.updatedAt || '') || 0;
  return localTime >= remoteTime ? localPreferences : remotePreferences;
}

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

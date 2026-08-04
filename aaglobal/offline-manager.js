(function initGenOffline() {
  'use strict';

  const SETTINGS_KEY = 'gen2-offline-enabled';
  const USED_SECTIONS_KEY = 'gen2-offline-used-sections';
  const LAST_CHECK_KEY = 'gen2-offline-last-check';
  const DEFAULT_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  const INCREMENTAL_SYNC_ENABLED = false;
  const root = new URL('../', document.currentScript?.src || window.location.href);
  const rootPath = root.pathname.replace(/\/$/, '');

  const connectedSections = [
    { pattern: /\/canal\//, id: 'canal' },
    { pattern: /\/cancionero\//, id: 'cancionero' },
    { pattern: /\/meditacion\//, id: 'meditaciones' },
    { pattern: /\/pasapalabra\//, id: 'pasapalabra' },
    { pattern: /\/pdv\//, id: 'pdv' },
    { pattern: /\/biblioteca\//, id: 'biblioteca' },
    { pattern: /\/gen_animadores\//, id: 'animadores' },
    { pattern: /\/perfil\/perfil\.html$/, id: 'perfil' },
    { pattern: /\/admin\//, id: 'admin' }
  ];

  function isEnabled() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved === null ? true : saved === 'true';
    } catch (_) {
      return true;
    }
  }

  function currentSection(pathname = window.location.pathname) {
    const normalized = decodeURIComponent(pathname).replace(/\\/g, '/').toLowerCase();
    return connectedSections.find(item => item.pattern.test(normalized))?.id || '';
  }

  function usedSections() {
    try {
      const parsed = JSON.parse(localStorage.getItem(USED_SECTIONS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function markSectionUsed(section = currentSection()) {
    if (!section || !isEnabled()) return;
    const next = new Set(usedSections());
    next.add(section);
    try { localStorage.setItem(USED_SECTIONS_KEY, JSON.stringify([...next])); } catch (_) {}
    navigator.serviceWorker?.controller?.postMessage({ type: 'GEN_SECTION_USED', section });
  }

  function unavailableUrl(destination = window.location.href) {
    const url = new URL('perfil/sin-conexion-no-disponible.html', root);
    url.searchParams.set('volver', destination);
    return url.href;
  }

  function shouldBlock(destination) {
    if (navigator.onLine || isEnabled()) return false;
    const url = new URL(destination, window.location.href);
    return url.origin === window.location.origin && Boolean(currentSection(url.pathname))
      && !url.pathname.endsWith('/sin-conexion.html')
      && !url.pathname.endsWith('/sin-conexion-no-disponible.html');
  }

  function guardCurrentPage() {
    if (shouldBlock(window.location.href)) {
      window.location.replace(unavailableUrl(window.location.href));
      return true;
    }
    return false;
  }

  function guardNavigation(event) {
    const link = event.target.closest?.('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    if (!shouldBlock(link.href)) return;
    event.preventDefault();
    window.location.href = unavailableUrl(link.href);
  }

  async function registerWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return null;
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('notification-sw.js', root),
        { scope: root.pathname }
      );
      await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'GEN_OFFLINE_SETTINGS',
        enabled: isEnabled(),
        usedSections: usedSections()
      });
      return registration;
    } catch (error) {
      console.warn('No se pudo preparar el modo sin conexión:', error);
      return null;
    }
  }

  async function clearOfflineContent() {
    try {
      localStorage.removeItem(USED_SECTIONS_KEY);
      localStorage.removeItem(LAST_CHECK_KEY);
    } catch (_) {}

    if ('indexedDB' in window) {
      const knownDatabases = ['gen2-offline'];
      if (indexedDB.databases) {
        const databases = await indexedDB.databases().catch(() => []);
        databases.forEach(database => {
          if (/firestore|pagina-gen/i.test(database.name || '')) knownDatabases.push(database.name);
        });
      }
      knownDatabases.forEach(name => {
        try { indexedDB.deleteDatabase(name); } catch (_) {}
      });
    }

    const registration = await navigator.serviceWorker?.getRegistration(root.pathname).catch(() => null);
    const worker = registration?.active || navigator.serviceWorker?.controller;
    if (worker) {
      await new Promise(resolve => {
        const channel = new MessageChannel();
        const timeout = setTimeout(resolve, 2500);
        channel.port1.onmessage = () => {
          clearTimeout(timeout);
          resolve();
        };
        worker.postMessage({ type: 'GEN_CLEAR_OFFLINE' }, [channel.port2]);
      });
    } else if ('caches' in window) {
      await caches.delete('gen2-content-v1');
    }
  }

  async function setEnabled(enabled) {
    try { localStorage.setItem(SETTINGS_KEY, String(Boolean(enabled))); } catch (_) {}
    if (!enabled) await clearOfflineContent();
    if (enabled) await navigator.storage?.persist?.().catch(() => false);
    const registration = await registerWorker();
    registration?.active?.postMessage({
      type: 'GEN_OFFLINE_SETTINGS',
      enabled: Boolean(enabled),
      usedSections: usedSections()
    });
    window.dispatchEvent(new CustomEvent('gen:offline-setting-changed', { detail: { enabled: Boolean(enabled) } }));
  }

  async function storageEstimate() {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    return navigator.storage.estimate();
  }

  function shouldCheckForUpdates() {
    if (!isEnabled() || !navigator.onLine) return false;
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    return Date.now() - last >= DEFAULT_CHECK_INTERVAL;
  }

  function noteUpdateCheck() {
    try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch (_) {}
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('gen2-offline', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('collections')) {
          database.createObjectStore('collections', { keyPath: 'name' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getCollection(name) {
    if (!isEnabled() || !('indexedDB' in window)) return null;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('collections', 'readonly');
      const request = transaction.objectStore('collections').get(name);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    });
  }

  async function replaceCollection(name, items, metadata = {}) {
    if (!isEnabled() || !('indexedDB' in window)) return;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('collections', 'readwrite');
      const serializableItems = JSON.parse(JSON.stringify(Array.isArray(items) ? items : [], (_key, value) => {
        if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
        return value;
      }));
      transaction.objectStore('collections').put({
        name,
        items: serializableItems,
        updatedAt: Date.now(),
        revision: metadata.revision || ''
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function getItem(collectionName, id) {
    const record = await getCollection(collectionName);
    const item = record?.items?.find(entry => String(entry?.id) === String(id)) || null;
    return item ? { item, updatedAt: record.updatedAt } : null;
  }

  async function upsertItem(collectionName, item) {
    if (!item?.id) return;
    const record = await getCollection(collectionName).catch(() => null);
    const items = Array.isArray(record?.items) ? [...record.items] : [];
    const index = items.findIndex(entry => String(entry?.id) === String(item.id));
    if (index >= 0) items[index] = item;
    else items.push(item);
    await replaceCollection(collectionName, items, { revision: record?.revision || '' });
  }

  async function deleteItem(collectionName, id) {
    const record = await getCollection(collectionName).catch(() => null);
    if (!record?.items) return;
    await replaceCollection(
      collectionName,
      record.items.filter(item => String(item?.id) !== String(id)),
      { revision: record.revision || '' }
    );
  }

  function isFresh(record, maxAge = DEFAULT_CHECK_INTERVAL) {
    return Boolean(record?.updatedAt && Date.now() - record.updatedAt < maxAge);
  }

  const SECTION_COLLECTIONS = {
    cancionero: ['canciones'],
    meditaciones: ['meditaciones'],
    animadores: ['recursos'],
    biblioteca: ['biblioteca', 'meditaciones'],
    pdv: ['pdv'],
    pasapalabra: ['pasapalabra'],
    canal: ['canal']
  };

  async function fetchSyncJson(relativePath) {
    const response = await fetch(new URL(relativePath, root), { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo leer ${relativePath}`);
    return response.json();
  }

  function applyDelta(items, delta) {
    const current = new Map((items || []).map(item => [String(item.id), item]));
    (delta.deletes || []).forEach(id => current.delete(String(id)));
    (delta.upserts || []).forEach(item => current.set(String(item.id), item));
    return [...current.values()];
  }

  async function storeSyncedCollection(name, items, revision) {
    if (name === 'biblioteca') {
      await replaceCollection('biblioteca-catalogo', items, { revision });
      return;
    }
    if (name === 'recursos') {
      const categories = new Set(items.map(item => item.categoria).filter(Boolean));
      await Promise.all([
        replaceCollection('recursos', items, { revision }),
        ...[...categories].map(category =>
          replaceCollection(`recursos-${category}`, items.filter(item => item.categoria === category), { revision })
        )
      ]);
      return;
    }
    if (name === 'canal') {
      await replaceCollection('canal-publico', items, { revision });
      return;
    }
    await replaceCollection(name, items, { revision });
  }

  async function syncCollection(name, definition) {
    const storageName = name === 'biblioteca'
      ? 'biblioteca-catalogo'
      : name === 'canal' ? 'canal-publico' : name;
    const current = await getCollection(storageName).catch(() => null);
    if (current?.revision === definition.revision) return false;

    let items;
    if (current?.revision && current.revision === definition.previousRevision) {
      const delta = await fetchSyncJson(definition.delta);
      if (delta.fromRevision === current.revision && delta.toRevision === definition.revision) {
        items = applyDelta(current.items, delta);
      }
    }
    if (!items) {
      const snapshot = await fetchSyncJson(definition.snapshot);
      if (snapshot.revision !== definition.revision) throw new Error(`Revisión inválida para ${name}`);
      items = snapshot.items || [];
    }
    await storeSyncedCollection(name, items, definition.revision);
    return true;
  }

  async function syncUsedSections() {
    if (!INCREMENTAL_SYNC_ENABLED || !isEnabled() || !navigator.onLine || !shouldCheckForUpdates()) return;
    const manifest = await fetchSyncJson('datos/sincronizacion/manifest.json');
    if (manifest.schemaVersion !== 1) throw new Error('Manifiesto de sincronización incompatible');
    const required = new Set(usedSections().flatMap(section => SECTION_COLLECTIONS[section] || []));
    await Promise.all([...required].map(name => {
      const definition = manifest.collections?.[name];
      return definition ? syncCollection(name, definition) : null;
    }));
    noteUpdateCheck();
  }

  window.GenOffline = {
    isEnabled,
    setEnabled,
    clearOfflineContent,
    storageEstimate,
    usedSections,
    markSectionUsed,
    currentSection,
    shouldCheckForUpdates,
    noteUpdateCheck,
    unavailableUrl,
    getCollection,
    replaceCollection,
    getItem,
    upsertItem,
    deleteItem,
    isFresh,
    syncUsedSections,
    incrementalSyncEnabled: INCREMENTAL_SYNC_ENABLED
  };

  if (guardCurrentPage()) return;
  document.addEventListener('click', guardNavigation, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => markSectionUsed(), { once: true });
  } else {
    markSectionUsed();
  }
  window.addEventListener('online', () => {
    registerWorker();
    syncUsedSections().catch(error => console.warn('No se pudo sincronizar contenido:', error));
  });
  if (isEnabled()) navigator.storage?.persist?.().catch(() => false);
  registerWorker();
  syncUsedSections().catch(error => console.warn('No se pudo sincronizar contenido:', error));
}());

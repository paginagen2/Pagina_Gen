(function setupOfflineSettings() {
  const toggle = document.getElementById('offline-toggle');
  const stateCopy = document.getElementById('offline-state-copy');
  const storageValue = document.getElementById('offline-storage-value');
  const status = document.getElementById('offline-status');
  const dialog = document.getElementById('offline-confirm-dialog');

  function waitForManager() {
    if (window.GenOffline) return Promise.resolve(window.GenOffline);
    return new Promise(resolve => window.addEventListener('gen:offline-ready', () => resolve(window.GenOffline), { once: true }));
  }

  function formatBytes(bytes) {
    if (!bytes) return 'Menos de 1 MB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  async function refreshStorage(manager) {
    const estimate = await manager.storageEstimate();
    storageValue.textContent = formatBytes(estimate.usage || 0);
  }

  function render(enabled) {
    toggle.checked = enabled;
    stateCopy.textContent = enabled ? 'Activado' : 'Desactivado';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const manager = await waitForManager();
    render(manager.isEnabled());
    await refreshStorage(manager);

    toggle.addEventListener('change', async () => {
      if (!toggle.checked) {
        dialog.showModal();
        const result = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
        if (result !== 'confirm') {
          toggle.checked = true;
          return;
        }
      }

      toggle.disabled = true;
      status.textContent = toggle.checked ? 'Activando…' : 'Borrando contenido guardado…';
      await manager.setEnabled(toggle.checked);
      render(toggle.checked);
      await refreshStorage(manager);
      status.textContent = toggle.checked
        ? 'El modo sin conexión está activado.'
        : 'El contenido guardado se eliminó de este dispositivo.';
      toggle.disabled = false;
    });
  });
}());

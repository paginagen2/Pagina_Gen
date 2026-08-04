let profileUser = null;
let profileData = null;
let rolePendingRemoval = null;
const elements = {};

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(elements, {
    loading: document.getElementById('profile-loading'),
    signedOut: document.getElementById('profile-signed-out'),
    content: document.getElementById('profile-content'),
    avatar: document.getElementById('profile-avatar'),
    displayName: document.getElementById('profile-display-name'),
    displayEmail: document.getElementById('profile-display-email'),
    roles: document.getElementById('profile-roles'),
    form: document.getElementById('profile-form'),
    name: document.getElementById('profile-name'),
    email: document.getElementById('profile-email'),
    country: document.getElementById('profile-country'),
    city: document.getElementById('profile-city'),
    birthdate: document.getElementById('profile-birthdate'),
    description: document.getElementById('profile-description'),
    descriptionCount: document.getElementById('description-count'),
    status: document.getElementById('profile-status'),
    addRole: document.getElementById('profile-add-role'),
    logout: document.getElementById('profile-logout'),
    removeDialog: document.getElementById('role-remove-dialog'),
    removeForm: document.getElementById('role-remove-form'),
    removeName: document.getElementById('role-remove-name'),
    removeConfirmationName: document.getElementById('role-remove-confirmation-name'),
    removeConfirmation: document.getElementById('role-remove-confirmation'),
    removeStatus: document.getElementById('role-remove-status'),
    removeSubmit: document.getElementById('role-remove-submit'),
    removeCancel: document.getElementById('role-remove-cancel'),
    removeClose: document.getElementById('role-remove-close')
  });

  elements.description.addEventListener('input', updateDescriptionCount);
  const localToday = new Date();
  localToday.setMinutes(localToday.getMinutes() - localToday.getTimezoneOffset());
  elements.birthdate.max = localToday.toISOString().slice(0, 10);
  elements.form.addEventListener('submit', saveProfile);
  elements.addRole.addEventListener('click', () => window.genOpenRoleModal?.());
  elements.logout.addEventListener('click', logout);
  elements.removeForm.addEventListener('submit', removeRole);
  elements.removeConfirmation.addEventListener('input', validateRoleConfirmation);
  elements.removeCancel.addEventListener('click', closeRoleRemoval);
  elements.removeClose.addEventListener('click', closeRoleRemoval);
  elements.removeDialog.addEventListener('click', event => {
    if (event.target === elements.removeDialog) closeRoleRemoval();
  });
  window.addEventListener('gen:profile-updated', event => {
    if (profileUser && event.detail?.uid === profileUser.uid) {
      profileData = event.detail;
      renderProfile(profileUser, profileData);
    }
  });

  try {
    if (window.firebaseReady) await waitForFirebaseReady();
    if (!window.firebaseAuth || !window.firebaseUtils) throw new Error('Firebase no está disponible');
    window.firebaseUtils.onAuthStateChanged(window.firebaseAuth, async user => {
      profileUser = user;
      if (!user) return showSignedOut();
      const usesGoogle = user.providerData?.some(provider => provider?.providerId === 'google.com');
      if (!usesGoogle) {
        showSignedOut();
        return;
      }
      try {
        profileData = await waitForAuthProfile(user);
        renderProfile(user, profileData || {});
      } catch (error) {
        console.error('No se pudo cargar el perfil:', error);
        renderProfile(user, {});
        showStatus('No pudimos cargar todos tus datos. Podés volver a intentarlo.', true);
      }
    });
  } catch (error) {
    console.error(error);
    elements.loading.innerHTML = '<p>No pudimos conectar con tu cuenta. Recargá la página para volver a intentarlo.</p>';
  }
});

async function waitForFirebaseReady() {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Firebase tardó demasiado en responder')), 12000);
  });
  await Promise.race([window.firebaseReady, timeout]);
}

async function waitForAuthProfile(user) {
  const timeoutAt = Date.now() + 5000;
  while (!window.genAuthSession && Date.now() < timeoutAt) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return window.genAuthSession ? window.genAuthSession.getProfile(user) : null;
}

function renderProfile(user, profile) {
  const name = profile.nombre || user.displayName || user.email?.split('@')[0] || 'Usuario';
  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  elements.avatar.textContent = name.trim().charAt(0).toUpperCase() || '?';
  elements.displayName.textContent = name;
  elements.displayEmail.textContent = user.email || profile.email || '';
  elements.name.value = name;
  elements.email.value = user.email || profile.email || '';
  elements.country.value = profile.pais || '';
  elements.city.value = profile.ciudad || profile.ubicacion || '';
  elements.birthdate.value = normalizeBirthdate(profile.fechaNacimiento);
  elements.description.value = profile.descripcion || '';
  elements.roles.replaceChildren(...(roles.length ? roles.map(createRoleBadge) : [createMemberBadge()]));
  updateDescriptionCount();
  elements.loading.hidden = true;
  elements.signedOut.hidden = true;
  elements.content.hidden = false;
}

function createRoleBadge(role) {
  const visibleName = formatRole(role);
  const badge = document.createElement('div');
  badge.className = 'profile-role-badge';

  const label = document.createElement('span');
  label.textContent = visibleName;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'profile-role-remove';
  removeButton.textContent = '×';
  removeButton.setAttribute('aria-label', `Eliminar rol ${visibleName}`);
  removeButton.title = `Eliminar ${visibleName}`;
  removeButton.addEventListener('click', () => openRoleRemoval(role, visibleName));

  badge.append(label, removeButton);
  return badge;
}

function createMemberBadge() {
  const badge = document.createElement('div');
  badge.className = 'profile-role-badge profile-role-default';
  const label = document.createElement('span');
  label.textContent = 'Miembro';
  badge.append(label);
  return badge;
}

function openRoleRemoval(role, visibleName) {
  rolePendingRemoval = { role, visibleName };
  elements.removeName.textContent = visibleName;
  elements.removeConfirmationName.textContent = visibleName;
  elements.removeConfirmation.value = '';
  elements.removeStatus.textContent = '';
  elements.removeSubmit.disabled = true;
  elements.removeDialog.showModal();
  setTimeout(() => elements.removeConfirmation.focus(), 0);
}

function closeRoleRemoval() {
  if (elements.removeSubmit.disabled && elements.removeSubmit.dataset.saving === 'true') return;
  rolePendingRemoval = null;
  elements.removeDialog.close();
}

function validateRoleConfirmation() {
  const expected = normalizeConfirmation(rolePendingRemoval?.visibleName || '');
  const actual = normalizeConfirmation(elements.removeConfirmation.value);
  elements.removeSubmit.disabled = !expected || actual !== expected;
  elements.removeStatus.textContent = '';
}

async function removeRole(event) {
  event.preventDefault();
  if (!profileUser || !rolePendingRemoval || elements.removeSubmit.disabled) return;

  const { role, visibleName } = rolePendingRemoval;
  const currentRoles = Array.isArray(profileData?.roles) ? profileData.roles : [];
  if (!currentRoles.includes(role)) {
    elements.removeStatus.textContent = 'Este rol ya no está asociado a tu cuenta.';
    return;
  }

  const nextRoles = currentRoles.filter(currentRole => currentRole !== role);
  elements.removeSubmit.disabled = true;
  elements.removeSubmit.dataset.saving = 'true';
  elements.removeSubmit.textContent = 'Eliminando…';
  elements.removeStatus.textContent = '';

  try {
    const { doc, updateDoc } = window.firebaseUtils;
    await updateDoc(doc(window.firebaseDb, 'usuarios', profileUser.uid), { roles: nextRoles });
    profileData = { ...(profileData || {}), roles: nextRoles, uid: profileUser.uid };
    window.genAuthSession?.clear(profileUser.uid);
    window.dispatchEvent(new CustomEvent('gen:profile-updated', { detail: profileData }));
    rolePendingRemoval = null;
    elements.removeDialog.close();
    showStatus(`Rol ${visibleName} eliminado.`);
  } catch (error) {
    console.error('No se pudo eliminar el rol:', error);
    elements.removeStatus.textContent = 'No pudimos eliminar el rol. Intentá nuevamente.';
    elements.removeSubmit.disabled = false;
  } finally {
    delete elements.removeSubmit.dataset.saving;
    elements.removeSubmit.textContent = 'Eliminar rol';
  }
}

function showSignedOut() {
  elements.loading.hidden = true;
  elements.content.hidden = true;
  elements.signedOut.hidden = false;
}

function updateDescriptionCount() {
  elements.descriptionCount.textContent = String(elements.description.value.length);
}

async function saveProfile(event) {
  event.preventDefault();
  if (!profileUser) return;
  const submitButton = elements.form.querySelector('button[type="submit"]');
  const nombre = elements.name.value.trim();
  if (!nombre) {
    showStatus('Ingresá tu nombre antes de guardar.', true);
    elements.name.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Guardando…';
  showStatus('');
  const updates = {
    nombre,
    pais: elements.country.value.trim(),
    ciudad: elements.city.value.trim(),
    fechaNacimiento: elements.birthdate.value,
    descripcion: elements.description.value.trim(),
    perfilActualizadoEn: new Date().toISOString()
  };

  try {
    const { doc, updateDoc } = window.firebaseUtils;
    await updateDoc(doc(window.firebaseDb, 'usuarios', profileUser.uid), updates);
    profileData = { ...(profileData || {}), ...updates, uid: profileUser.uid };
    window.genAuthSession?.clear(profileUser.uid);
    elements.displayName.textContent = nombre;
    elements.avatar.textContent = nombre.charAt(0).toUpperCase();
    showStatus('Cambios guardados.');
  } catch (error) {
    console.error('No se pudo guardar el perfil:', error);
    showStatus('No pudimos guardar los cambios. Intentá nuevamente.', true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Guardar cambios';
  }
}

async function logout() {
  elements.logout.disabled = true;
  elements.logout.textContent = 'Cerrando sesión…';
  try {
    window.genAuthSession?.clear(profileUser?.uid);
    await window.firebaseUtils.signOut(window.firebaseAuth);
    window.location.href = '../index.html';
  } catch (error) {
    console.error('No se pudo cerrar la sesión:', error);
    elements.logout.disabled = false;
    elements.logout.textContent = 'Cerrar sesión';
    showStatus('No pudimos cerrar la sesión. Intentá nuevamente.', true);
  }
}

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

function formatRole(role) {
  const labels = { admin: 'Administrador', animador: 'Animador', editor: 'Editor', miembro: 'Miembro' };
  if (labels[role]) return labels[role];
  const withoutPrefix = role.replace(/^(zona|funcion)_/i, '');
  return withoutPrefix
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || role;
}

function normalizeConfirmation(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function normalizeBirthdate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  return '';
}

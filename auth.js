let db, utils, auth, currentUser = null;
let currentUserProfile = null;
let profileUnsubscribe = null;

function expandInheritedRoles(roles = []) {
    const expanded = new Set(Array.isArray(roles) ? roles : []);
    if (expanded.has('gen2')) expanded.add('gen');
    return [...expanded];
}

window.genExpandRoles = expandInheritedRoles;

const PROFILE_CACHE_PREFIX = 'gen_user_profile_';
const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const profileLoads = new Map();

function profileCacheKey(uid) {
    return `${PROFILE_CACHE_PREFIX}${uid}`;
}

function readCachedProfile(uid) {
    try {
        const raw = sessionStorage.getItem(profileCacheKey(uid));
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached.uid !== uid || cached.expiresAt <= Date.now()) {
            sessionStorage.removeItem(profileCacheKey(uid));
            return null;
        }
        return cached.profile || null;
    } catch {
        sessionStorage.removeItem(profileCacheKey(uid));
        return null;
    }
}

function writeCachedProfile(profile) {
    if (!profile?.uid) return;
    sessionStorage.setItem(profileCacheKey(profile.uid), JSON.stringify({
        uid: profile.uid,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        profile
    }));
}

function clearCachedProfile(uid) {
    if (uid) sessionStorage.removeItem(profileCacheKey(uid));
    if (!uid || currentUserProfile?.uid === uid) currentUserProfile = null;
}

async function loadUserProfile(user, { force = false, createIfMissing = true } = {}) {
    if (!user) return null;
    if (!isGoogleUser(user)) return null;
    if (!force && currentUserProfile?.uid === user.uid) return currentUserProfile;

    const cached = !force ? readCachedProfile(user.uid) : null;
    if (cached) {
        currentUserProfile = cached;
        return cached;
    }

    if (profileLoads.has(user.uid)) return profileLoads.get(user.uid);

    const loadPromise = (async () => {
        const userRef = utils.doc(db, 'usuarios', user.uid);
        const userDoc = await utils.getDoc(userRef);
        let profile;

        if (userDoc.exists()) {
            profile = { uid: user.uid, ...userDoc.data() };
        } else if (createIfMissing) {
            profile = {
                uid: user.uid,
                nombre: user.displayName || user.email?.split('@')[0] || 'Usuario',
                email: user.email || '',
                roles: [],
                fechaCreacion: new Date().toISOString()
            };
            await utils.setDoc(userRef, profile);
        } else {
            return null;
        }

        profile.roles = Array.isArray(profile.roles) ? profile.roles : [];
        currentUserProfile = profile;
        writeCachedProfile(profile);
        window.dispatchEvent(new CustomEvent('gen:profile-updated', { detail: profile }));
        return profile;
    })();

    profileLoads.set(user.uid, loadPromise);
    try {
        return await loadPromise;
    } finally {
        profileLoads.delete(user.uid);
    }
}

window.genAuthSession = {
    async getProfile(user = auth?.currentUser, options = {}) {
        return loadUserProfile(user, options);
    },
    async getRoles(user = auth?.currentUser, options = {}) {
        const profile = await loadUserProfile(user, options);
        return expandInheritedRoles(profile?.roles || []);
    },
    getCachedProfile(uid = auth?.currentUser?.uid) {
        if (!uid) return null;
        return currentUserProfile?.uid === uid ? currentUserProfile : readCachedProfile(uid);
    },
    clear(uid = auth?.currentUser?.uid) {
        clearCachedProfile(uid);
    }
};

// Esperar a que Firebase esté listo
async function waitForFirebase() {
    return new Promise((resolve) => {
        let tries = 0;
        const maxTries = 200; // Esperar máximo 20 segundos (100ms * 200)
        const checkFirebase = setInterval(() => {
            if (window.firebaseDb && window.firebaseUtils && window.firebaseAuth) {
                clearInterval(checkFirebase);
                resolve();
            } else if (tries < maxTries) {
                tries++;
            } else {
                clearInterval(checkFirebase);
                console.warn('Firebase no se cargó en 20 segundos');
                resolve();
            }
        }, 100);
    });
}

// Inicializar
async function initAuth() {
    await waitForFirebase();
    if (!window.firebaseDb || !window.firebaseUtils || !window.firebaseAuth) {
        console.error('Firebase no está inicializado');
        return;
    }

    db = window.firebaseDb;
    utils = window.firebaseUtils;
    auth = window.firebaseAuth;
    ensureAuthInterface();
    setupModal();
    setupAuthButton();
    listenAuthState();
}

function ensureAuthInterface() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    let container = document.getElementById('auth-button-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auth-button-container';
        container.className = 'auth-sidebar-container';
        sidebar.insertBefore(container, sidebar.firstChild);
    }
    container.className = 'auth-sidebar-container';

    if (!document.getElementById('auth-modal')) {
        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'auth-modal';
        modal.hidden = true;
        modal.innerHTML = `
          <div class="auth-modal-content">
            <button type="button" class="auth-modal-close" aria-label="Cerrar">&times;</button>
            <div id="tab-login" class="auth-modal-tab-content active">
              <div class="auth-google-only">
                <h2>Iniciar sesión</h2>
                <p>Accedé de forma segura con tu cuenta de Google.</p>
                <button type="button" class="auth-secondary-button" id="login-google"><img class="auth-google-icon" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">Iniciar con Google</button>
                <button type="button" class="auth-text-button auth-other-google-account" id="login-google-other" hidden>Usar otra cuenta de Google</button>
              </div>
            </div>
            <div id="tab-roles" class="auth-modal-tab-content" hidden>
              <h2 class="auth-role-title">Agregar rol</h2>
              <p class="auth-role-help">Ingresá el código que recibiste para sumar un rol a tu cuenta.</p>
              <form id="role-form">
                <div class="auth-form-group"><label for="role-code">Código</label><input type="text" id="role-code" required></div>
                <button type="submit" class="auth-primary-button">Canjear código</button>
              </form>
            </div>
          </div>`;
        document.body.appendChild(modal);
    }
}

// Configurar modal
function setupModal() {
    const modal = document.getElementById('auth-modal');
    const closeBtn = modal.querySelector('.auth-modal-close, .modal-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeAuthModal();
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAuthModal();
        }
    });

    setupRoleForm();
    setupGoogleLogin();
    updateAuthTabsForSession(Boolean(currentUser));
}

function updateAuthTabsForSession(isSignedIn) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    const loginContent = modal.querySelector('#tab-login');
    const roleContent = modal.querySelector('#tab-roles');
    if (loginContent) {
        loginContent.hidden = isSignedIn;
        loginContent.classList.toggle('active', !isSignedIn);
    }
    if (roleContent) {
        roleContent.hidden = !isSignedIn;
        roleContent.classList.toggle('active', isSignedIn);
    }
}

function openAuthModal(tabId = 'login') {
    const modal = document.getElementById('auth-modal');
    const requestedTab = currentUser ? 'roles' : (tabId === 'roles' ? 'login' : tabId);
    const loginContent = modal.querySelector('#tab-login');
    const roleContent = modal.querySelector('#tab-roles');
    loginContent.hidden = requestedTab !== 'login';
    loginContent.classList.toggle('active', requestedTab === 'login');
    roleContent.hidden = requestedTab !== 'roles';
    roleContent.classList.toggle('active', requestedTab === 'roles');
    modal.hidden = false;
    modal.classList.add('active');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('active');
    modal.hidden = true;
}

// Configurar botón de auth
function setupAuthButton() {
    const container = document.getElementById('auth-button-container');
    if (!container) return;

    container.innerHTML = `
        <button id="auth-btn" class="menu-item auth-menu-item" disabled>
            <span id="auth-avatar" class="auth-avatar" aria-hidden="true">
              <svg><use href="${new URL('aadocumentos/svg/iconos-gen.svg?v=20260730-7#usuario', import.meta.url).href}"></use></svg>
            </span>
            <span id="auth-btn-text" class="menu-text">Cargando sesión...</span>
        </button>
    `;

    const authBtn = document.getElementById('auth-btn');
    authBtn.addEventListener('click', () => {
        if (currentUser) {
            window.location.href = new URL('perfil/perfil.html', import.meta.url).href;
        } else {
            openAuthModal();
        }
    });
}

// Escuchar cambios de estado de autenticación
function listenAuthState() {
    utils.onAuthStateChanged(auth, async (user) => {
        if (profileUnsubscribe) {
            profileUnsubscribe();
            profileUnsubscribe = null;
        }
        const previousUid = currentUser?.uid;
        currentUser = user;
        const allowedUser = isGoogleUser(user) ? user : null;
        window.dispatchEvent(new CustomEvent('gen:auth-changed', { detail: { user: allowedUser } }));
        if (!user) {
            clearCachedProfile(previousUid);
            updateAuthUI(null, null);
            return;
        }

        if (!isGoogleUser(user)) {
            clearCachedProfile(user.uid);
            currentUser = null;
            await utils.signOut(auth);
            updateAuthUI(null, null);
            return;
        }

        // En Android la confirmación del estado puede llegar antes de que
        // finalice la promesa del selector nativo. Cerramos el acceso apenas
        // Firebase reconoce al usuario para no dejar la interfaz bloqueada.
        closeAuthModal();

        try {
            // Al iniciar una página, releer el perfil para recibir de inmediato
            // zonas o funcionalidades asignadas por un administrador.
            const profile = await loadUserProfile(user, { force: true });
            updateAuthUI(user, profile);
            if (typeof utils.onSnapshot === 'function') {
                profileUnsubscribe = utils.onSnapshot(utils.doc(db, 'usuarios', user.uid), snapshot => {
                    if (!snapshot.exists()) return;
                    const freshProfile = { uid: user.uid, ...snapshot.data() };
                    freshProfile.roles = Array.isArray(freshProfile.roles) ? freshProfile.roles : [];
                    currentUserProfile = freshProfile;
                    writeCachedProfile(freshProfile);
                    updateAuthUI(user, freshProfile);
                    window.dispatchEvent(new CustomEvent('gen:profile-updated', { detail: freshProfile }));
                }, error => console.warn('No se pudo actualizar el perfil en tiempo real:', error));
            }
        } catch (error) {
            console.error('No se pudo cargar el perfil del usuario:', error);
            updateAuthUI(user, readCachedProfile(user.uid));
        }
    });
}

// Actualizar UI según estado de auth
function updateAuthUI(user, profile) {
    const btnText = document.getElementById('auth-btn-text');
    const authBtn = document.getElementById('auth-btn');
    const avatar = document.getElementById('auth-avatar');
    updateAuthTabsForSession(Boolean(user));

    if (!btnText || !authBtn) {
        updateSidebarRoles(profile?.roles || []);
        return;
    }

    if (user) {
        const displayName = profile?.nombre || user.displayName || user.email.split('@')[0];
        btnText.textContent = displayName;
        authBtn.classList.add('logged-in');
        authBtn.setAttribute('aria-label', `Abrir perfil de ${displayName}`);
        authBtn.title = 'Abrir mi perfil';
        avatar.classList.add('auth-avatar-initial');
        avatar.textContent = displayName.trim().charAt(0).toUpperCase() || '?';
    } else {
        btnText.textContent = 'Iniciar Sesión';
        authBtn.classList.remove('logged-in');
        authBtn.setAttribute('aria-label', 'Iniciar sesión');
        authBtn.removeAttribute('title');
        avatar.classList.remove('auth-avatar-initial');
        avatar.innerHTML = `<svg><use href="${new URL('aadocumentos/svg/iconos-gen.svg?v=20260730-7#usuario', import.meta.url).href}"></use></svg>`;
    }
    authBtn.disabled = false;

    updateSidebarRoles(profile?.roles || []);
}

// Actualizar sidebar según roles
function updateSidebarRoles(roles = currentUserProfile?.roles || []) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const roleContainer = sidebar.querySelector('#sidebar-role-links') || sidebar;
    const accountArea = sidebar.querySelector('.sidebar-account-area');

    // Mantener preparado el acceso administrativo para evitar que dependa
    // del momento exacto en que termina de construirse la barra lateral.
    let adminLink = roleContainer.querySelector('[data-static-admin-link]');
    if (!adminLink) {
        adminLink = document.createElement('a');
        adminLink.href = new URL('admin/admin.html', import.meta.url).href;
        adminLink.className = 'menu-item role-link admin-role-link';
        adminLink.dataset.staticAdminLink = 'true';
        adminLink.innerHTML = `
            <img src="${new URL('aadocumentos/svg/llave.svg', import.meta.url).href}" alt="" class="menu-icon">
            <span class="menu-text">Administrador</span>
        `;
        roleContainer.appendChild(adminLink);
    }

    accountArea?.classList.toggle('has-account-actions', Boolean(currentUser));
    const safeRoles = Array.isArray(roles) ? roles.filter(role => typeof role === 'string') : [];
    const hasAdminAccess = Boolean(currentUser) && (
        safeRoles.includes('admin') || safeRoles.some(role => role.startsWith('funcion_') && role !== 'funcion_correccion_letras')
    );
    adminLink.hidden = !hasAdminAccess;
    adminLink.setAttribute('aria-hidden', String(!hasAdminAccess));
    if (hasAdminAccess) {
        accountArea?.classList.add('has-account-actions');
    }

    // Aquí puedes agregar más roles según necesites
}

// Menú de usuario
function openUserMenu() {
    // Crear menú simple
    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.innerHTML = `
        <div class="user-menu-item" id="menu-roles">Agregar Rol</div>
        <div class="user-menu-item" id="menu-logout">Cerrar Sesión</div>
    `;

    const authBtn = document.getElementById('auth-btn');
    document.body.appendChild(menu);

    const buttonRect = authBtn.getBoundingClientRect();

    menu.style.position = 'fixed';
    menu.style.top = Math.min(buttonRect.top, window.innerHeight - 120) + 'px';
    menu.style.left = buttonRect.right + 10 + 'px';
    menu.style.background = 'var(--card-bg)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '12px';
    menu.style.padding = '10px';
    menu.style.zIndex = '1000';

    // Cerrar al hacer clic fuera
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== authBtn) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);

    // Eventos del menú
    document.getElementById('menu-roles').addEventListener('click', () => {
        menu.remove();
        openAuthModal('roles');
    });

    document.getElementById('menu-logout').addEventListener('click', async () => {
        menu.remove();
        clearCachedProfile(currentUser?.uid);
        await utils.signOut(auth);
    });
}

window.genOpenRoleModal = () => openAuthModal('roles');

window.addEventListener('gen:profile-updated', event => {
    const profile = event.detail;
    if (!currentUser || profile?.uid !== currentUser.uid) return;
    currentUserProfile = profile;
    writeCachedProfile(profile);
    updateAuthUI(currentUser, profile);
});
window.genOpenAuthModal = () => openAuthModal('login');

function isGoogleUser(user) {
    return Boolean(user?.providerData?.some(provider => provider?.providerId === 'google.com'));
}

function isNativeApp() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
}

async function signInWithGoogleNative() {
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;
    if (!nativeAuth?.signInWithGoogle) {
        throw new Error('El acceso nativo de Google no está disponible en esta versión de la app.');
    }

    const result = await nativeAuth.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result?.credential?.idToken;
    const accessToken = result?.credential?.accessToken;
    if (!idToken && !accessToken) {
        throw new Error('Google no devolvió una credencial válida.');
    }

    const credential = utils.GoogleAuthProvider.credential(idToken || null, accessToken || null);
    await utils.signInWithCredential(auth, credential);
}

// Login con Google
function setupGoogleLogin() {
    const btn = document.getElementById('login-google');
    const otherAccountBtn = document.getElementById('login-google-other');
    if (!btn) return;

    if (isNativeApp() && otherAccountBtn) {
        otherAccountBtn.hidden = false;
        otherAccountBtn.addEventListener('click', async () => {
            const accountManager = window.Capacitor?.Plugins?.GoogleAccountManager;
            if (!accountManager?.chooseOrAddAccount) {
                alert('El administrador de cuentas no está disponible en esta versión de Android.');
                return;
            }

            otherAccountBtn.disabled = true;
            try {
                const selection = await accountManager.chooseOrAddAccount();
                if (!selection?.returned) return;
                await signInWithGoogleNative();
                closeAuthModal();
            } catch (error) {
                // Volver atrás desde el administrador no debe bloquear el acceso.
                console.warn('No se completó el acceso con otra cuenta:', error);
            } finally {
                otherAccountBtn.disabled = false;
            }
        });
    }

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            if (isNativeApp()) {
                await signInWithGoogleNative();
            } else {
                const provider = new utils.GoogleAuthProvider();
                await utils.signInWithPopup(auth, provider);
            }
            closeAuthModal();
        } catch (error) {
            alert(`Error al iniciar sesión con Google: ${error.message}`);
        } finally {
            btn.disabled = false;
        }
    });
}

// Formulario de código de rol
function setupRoleForm() {
    const form = document.getElementById('role-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('role-code').value.trim().toUpperCase();

        if (!currentUser || !isGoogleUser(currentUser)) {
            alert('Iniciá sesión con Google antes de agregar un rol');
            return;
        }

        try {
            const codeRef = utils.doc(db, 'codigos_roles', code);
            const userRef = utils.doc(db, 'usuarios', currentUser.uid);
            const redemptionRef = utils.doc(db, 'codigos_roles', code, 'canjes', currentUser.uid);
            const updatedProfile = await utils.runTransaction(db, async transaction => {
                const codeDoc = await transaction.get(codeRef);
                const userDoc = await transaction.get(userRef);

                if (!codeDoc.exists()) throw new Error('Código inválido');
                const codeData = codeDoc.data();
                if (!userDoc.exists()) throw new Error('No se encontró el perfil del usuario');
                const recipientEmail = String(codeData.destinatarioEmail || '').trim().toLowerCase();
                const currentEmail = String(currentUser.email || userDoc.data().email || '').trim().toLowerCase();
                if (recipientEmail && recipientEmail !== currentEmail) {
                    throw new Error('Este código está reservado para otro usuario');
                }

                const roleName = codeData.rol;
                const userData = userDoc.data();
                const roles = Array.isArray(userData.roles) ? userData.roles : [];
                if (roles.includes(roleName)) throw new Error('Ya tienes este rol');

                const nextRoles = [...roles, roleName];
                const now = new Date();
                const legacyCode = !codeData.tipo;

                if (legacyCode) {
                    if (codeData.usado) throw new Error('Este código ya fue usado');
                    transaction.update(codeRef, { usado: true, usadoPor: currentUser.uid, usadoEn: now });
                } else {
                    if (codeData.activo === false) throw new Error(codeData.tipo === 'libre' ? 'Este código está congelado' : 'Este código fue cancelado');
                    const expiry = codeData.venceEn?.toDate ? codeData.venceEn.toDate() : (codeData.venceEn ? new Date(codeData.venceEn) : null);
                    if (expiry && expiry <= now) throw new Error('Este código está vencido');
                    const uses = Number(codeData.usosActuales || 0);
                    if (codeData.tipo !== 'libre' && uses >= Number(codeData.maxUsos || 1)) {
                        throw new Error('Este código ya alcanzó su límite de usos');
                    }
                    transaction.update(codeRef, {
                        usosActuales: uses + 1,
                        ultimoUsoPor: currentUser.uid,
                        ultimoUsoEn: now
                    });
                    transaction.set(redemptionRef, {
                        uid: currentUser.uid,
                        rol: roleName,
                        canjeadoEn: now
                    });
                }

                transaction.update(userRef, { roles: nextRoles, ultimoCanjeCodigo: code });
                return { uid: currentUser.uid, ...userData, roles: nextRoles, ultimoCanjeCodigo: code };
            });

            currentUserProfile = updatedProfile;
            writeCachedProfile(updatedProfile);
            window.dispatchEvent(new CustomEvent('gen:profile-updated', { detail: updatedProfile }));

            alert('Rol agregado correctamente');
            form.reset();
            updateSidebarRoles(updatedProfile.roles);

        } catch (error) {
            alert(`Error al agregar rol: ${error.message}`);
        }
    });
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}

let db, utils, auth, currentUser = null;
let currentUserProfile = null;

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
        return profile?.roles || [];
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
            <div class="auth-modal-tabs">
              <button type="button" class="auth-modal-tab active" data-tab="login">Iniciar sesión</button>
              <button type="button" class="auth-modal-tab" data-tab="register">Registrarse</button>
              <button type="button" class="auth-modal-tab" data-tab="roles">Agregar rol</button>
            </div>
            <div id="tab-login" class="auth-modal-tab-content active">
              <form id="login-form">
                <div class="auth-form-group"><label for="login-email">Correo electrónico</label><input type="email" id="login-email" required></div>
                <div class="auth-form-group"><label for="login-password">Contraseña</label><input type="password" id="login-password" required></div>
                <button type="submit" class="auth-primary-button">Iniciar sesión</button>
                <button type="button" class="auth-secondary-button" id="login-google"><img class="auth-google-icon" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">Iniciar con Google</button>
              </form>
            </div>
            <div id="tab-register" class="auth-modal-tab-content" hidden>
              <form id="register-form">
                <div class="auth-form-group"><label for="register-name">Nombre</label><input type="text" id="register-name" required></div>
                <div class="auth-form-group"><label for="register-email">Correo electrónico</label><input type="email" id="register-email" required></div>
                <div class="auth-form-group"><label for="register-password">Contraseña</label><input type="password" id="register-password" required minlength="6"></div>
                <button type="submit" class="auth-primary-button">Registrarse</button>
              </form>
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
    const tabs = modal.querySelectorAll('.auth-modal-tab, .modal-tab');
    const tabContents = modal.querySelectorAll('.auth-modal-tab-content, .modal-tab-content');

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

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => { c.classList.remove('active'); c.hidden = true; });

            tab.classList.add('active');
            const content = modal.querySelector(`#tab-${tabId}`);
            content.classList.add('active');
            content.hidden = false;
        });
    });

    // Formularios
    setupLoginForm();
    setupRegisterForm();
    setupRoleForm();
    setupGoogleLogin();
    updateAuthTabsForSession(Boolean(currentUser));
}

function updateAuthTabsForSession(isSignedIn) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.toggle('auth-modal-signed-in', isSignedIn);

    const loginTab = modal.querySelector('[data-tab="login"]');
    const registerTab = modal.querySelector('[data-tab="register"]');
    const roleTab = modal.querySelector('[data-tab="roles"]');
    const loginContent = modal.querySelector('#tab-login');
    const registerContent = modal.querySelector('#tab-register');
    const roleContent = modal.querySelector('#tab-roles');

    if (loginTab) loginTab.hidden = isSignedIn;
    if (registerTab) registerTab.hidden = isSignedIn;
    if (roleTab) roleTab.hidden = !isSignedIn;

    [loginContent, registerContent, roleContent].forEach(content => {
        if (!content) return;
        content.hidden = true;
        content.classList.remove('active');
    });
}

function openAuthModal(tabId = 'login') {
    const modal = document.getElementById('auth-modal');
    const requestedTab = currentUser ? 'roles' : (tabId === 'roles' ? 'login' : tabId);
    modal.hidden = false;
    modal.classList.add('active');
    modal.querySelector(`[data-tab="${requestedTab}"]`).click();
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
              <img src="${new URL('aadocumentos/svg/Icono_vacio.svg', import.meta.url).href}" alt="">
            </span>
            <span id="auth-btn-text" class="menu-text">Cargando sesión...</span>
        </button>
    `;

    const authBtn = document.getElementById('auth-btn');
    authBtn.addEventListener('click', () => {
        if (currentUser) {
            openUserMenu();
        } else {
            openAuthModal();
        }
    });
}

// Escuchar cambios de estado de autenticación
function listenAuthState() {
    utils.onAuthStateChanged(auth, async (user) => {
        const previousUid = currentUser?.uid;
        currentUser = user;
        if (!user) {
            clearCachedProfile(previousUid);
            updateAuthUI(null, null);
            return;
        }

        try {
            const profile = await loadUserProfile(user);
            updateAuthUI(user, profile);
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
        const displayName = user.displayName || user.email.split('@')[0];
        btnText.textContent = displayName;
        authBtn.classList.add('logged-in');
        avatar.classList.add('auth-avatar-initial');
        avatar.textContent = displayName.trim().charAt(0).toUpperCase() || '?';
    } else {
        btnText.textContent = 'Iniciar Sesión';
        authBtn.classList.remove('logged-in');
        avatar.classList.remove('auth-avatar-initial');
        avatar.innerHTML = `<img src="${new URL('aadocumentos/svg/Icono_vacio.svg', import.meta.url).href}" alt="">`;
    }
    authBtn.disabled = false;

    updateSidebarRoles(profile?.roles || []);
}

// Actualizar sidebar según roles
function updateSidebarRoles(roles = currentUserProfile?.roles || []) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const roleContainer = sidebar.querySelector('#sidebar-role-links') || sidebar;

    // Eliminar roles anteriores si existen
    const existingRoleLinks = roleContainer.querySelectorAll('.role-link');
    existingRoleLinks.forEach(link => link.remove());

    if (!currentUser) return;

    // Agregar link de Admin si es admin
    if (roles.includes('admin')) {
        const adminLink = document.createElement('a');
        adminLink.href = new URL('admin/admin.html', import.meta.url).href;
        adminLink.className = 'menu-item role-link admin-role-link';
        adminLink.innerHTML = `
            <img src="${new URL('aadocumentos/svg/llave.svg', import.meta.url).href}" alt="Admin" class="menu-icon">
            <span class="menu-text">Administrador</span>
        `;
        roleContainer.appendChild(adminLink);
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

// Formulario de login
function setupLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            await utils.signInWithEmailAndPassword(auth, email, password);
            closeAuthModal();
            form.reset();
        } catch (error) {
            alert(`Error al iniciar sesión: ${error.message}`);
        }
    });
}

// Login con Google
function setupGoogleLogin() {
    const btn = document.getElementById('login-google');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const provider = new utils.GoogleAuthProvider();
        try {
            await utils.signInWithPopup(auth, provider);
            closeAuthModal();
        } catch (error) {
            alert(`Error al iniciar sesión con Google: ${error.message}`);
        }
    });
}

// Formulario de registro
function setupRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            const userCredential = await utils.createUserWithEmailAndPassword(auth, email, password);
            await userCredential.user.updateProfile({ displayName: name });
            closeAuthModal();
            form.reset();
        } catch (error) {
            alert(`Error al registrarse: ${error.message}`);
        }
    });
}

// Formulario de código de rol
function setupRoleForm() {
    const form = document.getElementById('role-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('role-code').value;

        if (!currentUser) {
            alert('Primero inicia sesión');
            return;
        }

        try {
            const codeRef = utils.doc(db, 'codigos_roles', code.trim());
            const userRef = utils.doc(db, 'usuarios', currentUser.uid);
            const updatedProfile = await utils.runTransaction(db, async transaction => {
                const codeDoc = await transaction.get(codeRef);
                const userDoc = await transaction.get(userRef);

                if (!codeDoc.exists()) throw new Error('Código inválido');
                const codeData = codeDoc.data();
                if (codeData.usado) throw new Error('Este código ya fue usado');
                if (!userDoc.exists()) throw new Error('No se encontró el perfil del usuario');

                const roleName = codeData.rol;
                const userData = userDoc.data();
                const roles = Array.isArray(userData.roles) ? userData.roles : [];
                if (roles.includes(roleName)) throw new Error('Ya tienes este rol');

                const nextRoles = [...roles, roleName];
                transaction.update(userRef, { roles: nextRoles, ultimoCanjeCodigo: code.trim() });
                transaction.update(codeRef, { usado: true, usadoPor: currentUser.uid, usadoEn: new Date() });
                return { uid: currentUser.uid, ...userData, roles: nextRoles, ultimoCanjeCodigo: code.trim() };
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

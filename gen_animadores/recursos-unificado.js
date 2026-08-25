/* Gen Animadores: carga, búsqueda, visualización y envío de recursos. */
(() => {
    'use strict';

    const PAGE_CONFIG = {
        'gen-animadores': { categoria: 'all', showPreview: true },
        'dinamicas-grupales': { categoria: 'dinamicas', containerId: 'dinamicasList', searchId: 'searchDinamicas', icon: '👥', label: 'dinámicas' },
        'juegos-encuentros': { categoria: 'juegos', containerId: 'juegosList', searchId: 'searchJuegos', icon: '🎲', label: 'juegos' },
        'reflexiones-guiadas': { categoria: 'reflexiones', containerId: 'reflexionesList', searchId: 'searchReflexiones', icon: '💭', label: 'reflexiones' },
        'recursos-retiros': { categoria: 'retiros', containerId: 'retirosList', searchId: 'searchRetiros', icon: '⛰️', label: 'recursos para retiros' }
    };

    const CATEGORY_LABELS = {
        dinamicas: 'Dinámicas grupales',
        juegos: 'Juegos para encuentros',
        reflexiones: 'Reflexiones guiadas',
        retiros: 'Recursos para retiros'
    };

    const state = {
        page: '',
        db: null,
        utils: null,
        recursos: [],
        visible: []
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        state.page = detectarPagina();
        document.body.classList.add('with-site-sidebar', 'site-kind-animadores');
        configurarEventos();

        try {
            await esperarFirebase();
            state.db = window.firebaseDb;
            state.utils = window.firebaseUtils;
            await cargarContenido();
        } catch (error) {
            console.error('No se pudo cargar Firebase:', error);
            mostrarContenidoAlternativo();
        }
    }

    function detectarPagina() {
        const name = window.location.pathname.split('/').pop().replace(/\.html$/, '');
        return PAGE_CONFIG[name] ? name : 'gen-animadores';
    }

    async function esperarFirebase() {
        if (window.firebaseReady) await window.firebaseReady;
        if (window.firebaseDb && window.firebaseUtils) return;

        await new Promise((resolve, reject) => {
            let intentos = 0;
            const comprobar = () => {
                if (window.firebaseDb && window.firebaseUtils) return resolve();
                if (++intentos >= 50) return reject(new Error('Firebase no está disponible'));
                window.setTimeout(comprobar, 100);
            };
            comprobar();
        });
    }

    async function cargarContenido() {
        if (state.page === 'gen-animadores') {
            await cargarPortada();
            return;
        }

        const config = PAGE_CONFIG[state.page];
        mostrarEstado(config.containerId, 'loading', 'Cargando recursos…');
        const recursos = await consultarCategoria(config.categoria);
        state.recursos = recursos;
        state.visible = recursos;
        renderLista();
        abrirRecursoDesdeEnlace();
    }

    async function consultarCategoria(categoria) {
        const cacheKey = `recursos-${categoria}`;
        const guardados = await window.GenOffline?.getCollection(cacheKey).catch(() => null);
        if (guardados?.items && (!navigator.onLine || window.GenOffline.isFresh(guardados))) {
            return ordenarPorFecha(guardados.items);
        }
        const { collection, getDocs, query, where } = state.utils;
        const consulta = query(
            collection(state.db, 'recursos'),
            where('categoria', '==', categoria),
            where('estado', '==', 'publicado')
        );
        const snapshot = await getDocs(consulta);
        const recursos = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        await window.GenOffline?.replaceCollection(cacheKey, recursos).catch(() => {});
        return ordenarPorFecha(recursos);
    }

    async function cargarPortada() {
        const categorias = Object.keys(CATEGORY_LABELS);
        const resultados = await Promise.allSettled(categorias.map(consultarCategoria));

        resultados.forEach((resultado, index) => {
            const categoria = categorias[index];
            const recursos = resultado.status === 'fulfilled' ? resultado.value : [];
            actualizarContador(categoria, recursos.length);
            actualizarPreview(categoria, recursos[0]);
        });
    }

    function ordenarPorFecha(recursos) {
        return recursos.sort((a, b) => fechaEnMilisegundos(b.fechaCreacion) - fechaEnMilisegundos(a.fechaCreacion));
    }

    function fechaEnMilisegundos(fecha) {
        if (!fecha) return 0;
        const valor = typeof fecha.toDate === 'function' ? fecha.toDate() : new Date(fecha);
        return Number.isNaN(valor.getTime()) ? 0 : valor.getTime();
    }

    function renderLista() {
        const config = PAGE_CONFIG[state.page];
        const container = document.getElementById(config.containerId);
        if (!container) return;

        if (!state.visible.length) {
            const buscando = Boolean(document.getElementById(config.searchId)?.value.trim());
            mostrarEstado(
                config.containerId,
                'empty',
                buscando ? 'No encontramos coincidencias' : `Todavía no hay ${config.label} publicados`,
                buscando ? 'Probá con otras palabras o limpiá la búsqueda.' : 'Volvé pronto: estamos preparando nuevos contenidos.'
            );
            return;
        }

        container.innerHTML = state.visible.map(recurso => `
            <article
                class="recurso-detail-card"
                data-resource-id="${escapeAttribute(recurso.id)}"
                role="button"
                tabindex="0"
                aria-label="Abrir ${escapeAttribute(recurso.titulo || 'recurso')}"
            >
                <div class="resource-card-top">
                    <h2>${escapeHtml(recurso.titulo || 'Recurso sin título')}</h2>
                </div>
                <p class="resource-description">${escapeHtml(recurso.descripcion || '')}</p>
                <div class="recurso-meta" aria-label="Información del recurso">
                    ${metaChip('Duración', recurso.duracion, '⏱')}
                    ${metaChip('Participantes', recurso.participantes, '👥')}
                </div>
                <span class="resource-open" aria-hidden="true">
                    Ver propuesta completa <span aria-hidden="true">→</span>
                </span>
            </article>
        `).join('');
    }

    function metaChip(label, value, icon) {
        if (!value) return '';
        return `<span><span aria-hidden="true">${icon}</span> <span class="sr-only">${label}: </span>${escapeHtml(value)}</span>`;
    }

    function actualizarPreview(categoria, recurso) {
        const container = document.getElementById(`preview-${categoria}`);
        if (!container) return;
        if (!recurso) {
            container.innerHTML = '<p class="preview-empty">Próximamente habrá nuevos recursos.</p>';
            return;
        }
        container.innerHTML = `
            <a class="recurso-item" href="${paginaCategoria(categoria)}">
                <span class="preview-label">Última propuesta</span>
                <h4>${escapeHtml(recurso.titulo || 'Recurso sin título')}</h4>
                <p>${escapeHtml(recurso.descripcion || '')}</p>
                ${recurso.duracion ? `<span class="preview-meta">⏱ ${escapeHtml(recurso.duracion)}</span>` : ''}
            </a>
        `;
    }

    function actualizarContador(categoria, cantidad) {
        const contador = document.getElementById(`count-${categoria}`);
        if (contador) contador.textContent = `${cantidad} ${cantidad === 1 ? 'recurso' : 'recursos'}`;
    }

    function paginaCategoria(categoria) {
        return {
            dinamicas: 'dinamicas-grupales.html',
            juegos: 'juegos-encuentros.html',
            reflexiones: 'reflexiones-guiadas.html',
            retiros: 'recursos-retiros.html'
        }[categoria] || 'gen-animadores.html';
    }

    function buscar() {
        const config = PAGE_CONFIG[state.page];
        const input = document.getElementById(config.searchId);
        const termino = normalizar(input?.value || '');
        state.visible = termino
            ? state.recursos.filter(recurso => textoBuscable(recurso).includes(termino))
            : [...state.recursos];
        renderLista();
    }

    function textoBuscable(recurso) {
        return normalizar([
            recurso.titulo, recurso.descripcion, recurso.objetivo, recurso.duracion,
            recurso.participantes, recurso.autor,
            ...(Array.isArray(recurso.materiales) ? recurso.materiales : []),
            ...(Array.isArray(recurso.pasos) ? recurso.pasos : [])
        ].filter(Boolean).join(' '));
    }

    function normalizar(texto) {
        return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function abrirRecurso(id, actualizarEnlace = true) {
        const recurso = state.recursos.find(item => item.id === id);
        if (!recurso) return notificar('No pudimos abrir este recurso.', 'error');

        const modal = document.getElementById('modalRecurso');
        const contenido = document.getElementById('contenidoRecurso');
        const config = PAGE_CONFIG[state.page];
        if (!modal || !contenido) return;

        contenido.innerHTML = `
            <div class="modal-resource-heading">
                <span class="category-label">${escapeHtml(CATEGORY_LABELS[recurso.categoria] || '')}</span>
                <h2 id="modalRecursoTitulo">${escapeHtml(recurso.titulo || 'Recurso')}</h2>
                <p>${escapeHtml(recurso.descripcion || '')}</p>
            </div>
            <div class="modal-meta">
                ${detailMeta('Duración', recurso.duracion)}
                ${detailMeta('Participantes', recurso.participantes)}
                ${detailMeta('Objetivo', recurso.objetivo)}
            </div>
            ${listaDetalle('Materiales necesarios', recurso.materiales, 'ul')}
            ${programaDetalle(recurso.programa)}
            ${listaDetalle(recurso.categoria === 'reflexiones' ? 'Guía de reflexión' : 'Paso a paso', recurso.pasos, 'ol')}
            <div class="modal-resource-footer">
                <p class="modal-author">Compartido por ${escapeHtml(recurso.autor || 'la comunidad')} · ${formatearFecha(recurso.fechaCreacion)}</p>
                <button type="button" class="secondary-button resource-share-button" data-share-resource="${escapeAttribute(recurso.id)}">
                    <span aria-hidden="true">↗</span> Compartir enlace
                </button>
            </div>
        `;

        if (actualizarEnlace) establecerRecursoEnUrl(id);
        modal.hidden = false;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        modal.querySelector('.modal-close')?.focus();
    }

    function detailMeta(label, value) {
        if (!value) return '';
        return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function listaDetalle(titulo, items, tipo) {
        if (!Array.isArray(items) || !items.length) return '';
        return `<section class="modal-section"><h3>${escapeHtml(titulo)}</h3><${tipo}>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</${tipo}></section>`;
    }

    function programaDetalle(programa) {
        if (!programa || typeof programa !== 'object' || Array.isArray(programa)) return '';
        const bloques = Object.entries(programa).map(([dia, actividades]) => {
            const lista = Array.isArray(actividades) ? actividades : [actividades];
            return `<div class="program-day"><h4>${escapeHtml(dia)}</h4><ul>${lista.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
        }).join('');
        return bloques ? `<section class="modal-section"><h3>Programa detallado</h3>${bloques}</section>` : '';
    }

    function cerrarModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.hidden = true;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        if (id === 'modalRecurso') quitarRecursoDeUrl();
    }

    function abrirRecursoDesdeEnlace() {
        const id = new URL(window.location.href).searchParams.get('recurso');
        if (!id) return;
        const existe = state.recursos.some(recurso => recurso.id === id);
        if (existe) {
            abrirRecurso(id, false);
            return;
        }
        quitarRecursoDeUrl();
        notificar('El recurso compartido ya no está disponible en esta sección.', 'warning');
    }

    function establecerRecursoEnUrl(id) {
        const url = new URL(window.location.href);
        url.searchParams.set('recurso', id);
        window.history.replaceState({}, '', url);
    }

    function quitarRecursoDeUrl() {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('recurso')) return;
        url.searchParams.delete('recurso');
        window.history.replaceState({}, '', url);
    }

    async function compartirRecurso(id) {
        const recurso = state.recursos.find(item => item.id === id);
        if (!recurso) return notificar('No pudimos preparar el enlace.', 'error');

        const url = new URL(window.location.href);
        url.searchParams.set('recurso', id);
        const shareData = {
            title: `${recurso.titulo} · Gen Animadores`,
            text: recurso.descripcion || `Mirá este recurso de Gen Animadores: ${recurso.titulo}`,
            url: url.toString()
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }

        try {
            await copiarEnlace(shareData.url);
            notificar('Enlace copiado. Ya podés compartirlo.', 'success');
        } catch (error) {
            notificar('No pudimos copiar el enlace automáticamente.', 'error');
        }
    }

    async function copiarEnlace(url) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
            return;
        }
        const campo = document.createElement('textarea');
        campo.value = url;
        campo.setAttribute('readonly', '');
        campo.style.position = 'fixed';
        campo.style.opacity = '0';
        document.body.appendChild(campo);
        campo.select();
        const copiado = document.execCommand('copy');
        campo.remove();
        if (!copiado) throw new Error('No se pudo copiar');
    }

    function mostrarFormulario() {
        const usuario = window.firebaseAuth?.currentUser;
        if (!usuario) {
            notificar('Iniciá sesión para compartir un recurso.', 'warning');
            document.querySelector('[data-auth-action], .auth-menu-item')?.click();
            return;
        }
        const modal = document.getElementById('modalAgregar');
        const form = document.getElementById('formNuevaDinamica');
        if (!modal || !form) return;
        form.reset();
        form.hidden = false;
        document.getElementById('loadingAgregar').hidden = true;
        modal.hidden = false;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        form.querySelector('input, select, textarea')?.focus();
    }

    async function guardarNuevaDinamica(event) {
        event.preventDefault();
        const usuario = window.firebaseAuth?.currentUser;
        if (!usuario) return notificar('Tu sesión venció. Volvé a iniciar sesión.', 'error');

        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const loading = document.getElementById('loadingAgregar');
        const boton = form.querySelector('[type="submit"]');
        boton.disabled = true;
        loading.hidden = false;

        try {
            const data = new FormData(form);
            const recurso = {
                categoria: textoLimitado(data.get('categoria'), 30),
                titulo: textoLimitado(data.get('titulo'), 120),
                descripcion: textoLimitado(data.get('descripcion'), 1000),
                duracion: textoLimitado(data.get('duracion'), 80),
                participantes: textoLimitado(data.get('participantes'), 80),
                autor: textoLimitado(data.get('autor'), 100),
                objetivo: textoLimitado(data.get('objetivo'), 1000),
                materiales: lineas(data.get('materiales'), 30, 200),
                pasos: lineas(data.get('pasos'), 40, 500),
                fechaCreacion: new Date(),
                estado: 'pendiente',
                usuarioId: usuario.uid
            };
            await state.utils.addDoc(state.utils.collection(state.db, 'recursos'), recurso);
            cerrarModal('modalAgregar');
            notificar('¡Gracias! La propuesta quedó pendiente de revisión.', 'success');
        } catch (error) {
            console.error('No se pudo guardar el recurso:', error);
            notificar('No pudimos enviar la propuesta. Intentá nuevamente.', 'error');
        } finally {
            boton.disabled = false;
            loading.hidden = true;
        }
    }

    function textoLimitado(valor, maximo) {
        return String(valor || '').trim().slice(0, maximo);
    }

    function lineas(valor, maxLineas, maxCaracteres) {
        return String(valor || '').split(/\r?\n/).map(item => item.trim().slice(0, maxCaracteres)).filter(Boolean).slice(0, maxLineas);
    }

    function mostrarContenidoAlternativo() {
        if (state.page === 'gen-animadores') {
            Object.keys(CATEGORY_LABELS).forEach(categoria => {
                actualizarContador(categoria, 0);
                actualizarPreview(categoria, null);
            });
            notificar('No pudimos actualizar los recursos. Probá nuevamente más tarde.', 'warning');
            return;
        }
        const config = PAGE_CONFIG[state.page];
        mostrarEstado(config.containerId, 'error', 'No pudimos cargar los recursos', 'Revisá tu conexión y volvé a intentarlo.', true);
    }

    function mostrarEstado(containerId, tipo, titulo, detalle = '', recargar = false) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const iconos = { loading: 'cargando', empty: 'vacio', error: 'error' };
        const icono = iconos[tipo] || 'vacio';
        container.innerHTML = `
            <div class="resource-state ${tipo}" role="status">
                <span class="state-icon" aria-hidden="true"><svg><use href="../aadocumentos/svg/iconos-gen.svg?v=20260730-7#${icono}"></use></svg></span>
                <h2>${escapeHtml(titulo)}</h2>
                ${detalle ? `<p>${escapeHtml(detalle)}</p>` : ''}
                ${recargar ? '<button type="button" class="secondary-button" data-reload>Volver a intentar</button>' : ''}
            </div>`;
    }

    function formatearFecha(fecha) {
        if (!fecha) return 'sin fecha';
        const valor = typeof fecha.toDate === 'function' ? fecha.toDate() : new Date(fecha);
        if (Number.isNaN(valor.getTime())) return 'sin fecha';
        return valor.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function notificar(mensaje, tipo = 'info') {
        const existente = document.querySelector('.notification');
        existente?.remove();
        const aviso = document.createElement('div');
        aviso.className = `notification ${tipo}`;
        aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
        aviso.textContent = mensaje;
        document.body.appendChild(aviso);
        window.setTimeout(() => aviso.remove(), 5000);
    }

    function configurarEventos() {
        const config = PAGE_CONFIG[state.page];
        document.getElementById(config.searchId)?.addEventListener('input', buscar);
        document.getElementById('formNuevaDinamica')?.addEventListener('submit', guardarNuevaDinamica);

        document.addEventListener('click', event => {
            const abrir = event.target.closest('[data-resource-id]');
            if (abrir) abrirRecurso(abrir.dataset.resourceId);
            const compartir = event.target.closest('[data-share-resource]');
            if (compartir) compartirRecurso(compartir.dataset.shareResource);
            if (event.target.closest('[data-open-submit]')) mostrarFormulario();
            const cerrar = event.target.closest('[data-close-modal]');
            if (cerrar) cerrarModal(cerrar.dataset.closeModal);
            if (event.target.matches('.modal-overlay')) cerrarModal(event.target.id);
            if (event.target.closest('[data-reload]')) window.location.reload();
        });

        document.addEventListener('keydown', event => {
            const tarjeta = event.target.closest('.recurso-detail-card[data-resource-id]');
            if (tarjeta && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                abrirRecurso(tarjeta.dataset.resourceId);
                return;
            }
            if (event.key !== 'Escape') return;
            ['modalRecurso', 'modalAgregar'].forEach(id => {
                const modal = document.getElementById(id);
                if (modal && !modal.hidden) cerrarModal(id);
            });
        });
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }
})();

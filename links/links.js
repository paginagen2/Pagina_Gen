const CONTACT_EMAIL = 'pagina.gen.2@gmail.com';

const categoryData = {
  cancionero: {
    title: 'Reportar una canción',
    subject: 'Cancionero · Corrección o sugerencia',
    opening: 'Hola, equipo de Página Gen 2:\n\nLes escribo por una canción del cancionero.',
    suggestions: [
      'Indicá el título de la canción y, si lo conocés, el artista.',
      'Contanos si el problema está en la letra, los acordes o un enlace.',
      'Copiá el fragmento que habría que corregir para encontrarlo más rápido.'
    ]
  },
  animadores: {
    title: 'Gen Animadores',
    subject: 'Gen Animadores · Consulta o reporte',
    opening: 'Hola, equipo de Página Gen 2:\n\nQuería consultarles por un recurso de Gen Animadores.',
    suggestions: [
      'Decinos qué dinámica, juego o material estás usando.',
      'Contanos la edad del grupo y el contexto del encuentro.',
      'Si encontraste un error, describí qué estabas intentando hacer.'
    ]
  },
  experiencia: {
    title: 'Compartir una experiencia',
    subject: 'Experiencia de vida para compartir',
    opening: 'Hola, equipo de Página Gen 2:\n\nQuisiera compartir una experiencia de vida con la comunidad.',
    suggestions: [
      'Contá brevemente qué pasó y qué significó para vos.',
      'Incluí tu nombre, ciudad o país solo si querés que aparezcan.',
      'Aclarános si autorizás que la experiencia sea publicada.'
    ]
  },
  biblioteca: {
    title: 'Biblioteca',
    subject: 'Biblioteca · Consulta o material',
    opening: 'Hola, equipo de Página Gen 2:\n\nLes escribo por un contenido de la biblioteca.',
    suggestions: [
      'Indicá el título, autor o tema del material.',
      'Si un archivo no abre, compartí el nombre o enlace correspondiente.',
      'Si buscás un documento, contanos para qué tema lo necesitás.'
    ]
  },
  movimiento: {
    title: 'Sobre el Movimiento',
    subject: 'Consulta sobre el Movimiento de los Focolares',
    opening: 'Hola, equipo de Página Gen 2:\n\nQuisiera hacerles una consulta sobre el Movimiento de los Focolares.',
    suggestions: [
      'Escribí la pregunta de la manera más concreta posible.',
      'Si se trata de una corrección, indicá la página y la fuente.',
      'Contanos si buscás información, formación o un contacto cercano.'
    ]
  },
  mejoras: {
    title: 'Mejorar la página',
    subject: 'Página Gen 2 · Mejora o problema',
    opening: 'Hola, equipo de Página Gen 2:\n\nQuería acercarles una mejora o contarles un problema de la página.',
    suggestions: [
      'Contanos en qué sección estabas y qué esperabas que ocurriera.',
      'Indicá si usabas celular o computadora.',
      'Si podés, adjuntá una captura para ayudarnos a entenderlo.'
    ]
  },
  general: {
    title: 'Consulta general',
    subject: 'Consulta general · Página Gen 2',
    opening: 'Hola, equipo de Página Gen 2:\n\nQuería ponerme en contacto con ustedes por el siguiente motivo:',
    suggestions: [
      'Explicanos brevemente en qué podemos ayudarte.',
      'Si buscás un contacto local, indicá tu ciudad y país.',
      'Dejanos una forma de responderte si escribís desde otro correo.'
    ]
  }
};

const topicButtons = [...document.querySelectorAll('.topic-button')];
const messageContent = document.getElementById('messageContent');
const messageTitle = document.getElementById('messageTitle');
const messagePanel = document.getElementById('messagePanel');
const copyEmailButton = document.getElementById('copyEmailButton');
const copyEmailIcon = document.getElementById('copyEmailIcon');
const toast = document.getElementById('contactToast');
let toastTimer;

function buildMessage(data) {
  return `${data.opening}\n\n[Escribí acá tu mensaje]\n\n¡Gracias!`;
}

function buildGmailCompose(email, subject = '', body = '') {
  const parameters = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: email
  });
  if (subject) parameters.set('su', subject);
  if (body) parameters.set('body', body);
  return `https://mail.google.com/mail/?${parameters.toString()}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const temporaryField = document.createElement('textarea');
      temporaryField.value = text;
      temporaryField.setAttribute('readonly', '');
      temporaryField.style.position = 'fixed';
      temporaryField.style.opacity = '0';
      document.body.appendChild(temporaryField);
      temporaryField.select();
      const copied = document.execCommand('copy');
      temporaryField.remove();
      if (!copied) throw new Error('No se pudo copiar');
    }
    showToast(successMessage);
    return true;
  } catch (error) {
    showToast('No pudimos copiarlo. Seleccioná el texto manualmente.');
    return false;
  }
}

function renderStandardCategory(category) {
  const data = categoryData[category];
  const message = buildMessage(data);
  messageTitle.textContent = data.title;
  messageContent.innerHTML = `
    <div class="message-preview">
      <span class="preview-label">Vista previa</span>
      <p>${message}</p>
    </div>
    <div class="subject-line"><span>Asunto:</span><strong>${data.subject}</strong></div>
    <ul class="suggestion-list">
      ${data.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
    </ul>
    <div class="message-actions">
      <a class="primary-action prepared-email-link" href="${buildGmailCompose(CONTACT_EMAIL, data.subject, message)}" target="_blank" rel="noopener noreferrer">
        <span>Abrir mensaje en Gmail</span><span aria-hidden="true">↗</span>
      </a>
      <button class="copy-message-button" type="button">Copiar mensaje</button>
    </div>
  `;

  messageContent.querySelector('.copy-message-button').addEventListener('click', () => {
    copyText(message, 'Mensaje copiado. Ya podés pegarlo donde quieras.');
  });
}

function renderSafetyCategory() {
  messageTitle.textContent = 'Denuncias y ayuda';
  messageContent.innerHTML = `
    <p class="safety-intro"><strong>No estás solo ni sola.</strong> Para una denuncia o una consulta de protección, usá directamente los canales oficiales e independientes que correspondan.</p>
    <div class="safety-links">
      <a class="safety-link" href="https://www.focolare.org/es/prevencion-de-abusos/" target="_blank" rel="noopener noreferrer">
        <span><strong>Página oficial de prevención</strong><small>Información, procedimientos y recursos</small></span><b aria-hidden="true">↗</b>
      </a>
      <a class="safety-link" href="${buildGmailCompose('abusereport.foc@gmail.com', 'Denuncia de abuso')}" target="_blank" rel="noopener noreferrer">
        <span><strong>Denunciar un abuso</strong><small>abusereport.foc@gmail.com</small></span><b aria-hidden="true">→</b>
      </a>
      <a class="safety-link" href="${buildGmailCompose('ufficio.tutela@focolare.org', 'Consulta a la oficina de protección')}" target="_blank" rel="noopener noreferrer">
        <span><strong>Oficina de protección</strong><small>ufficio.tutela@focolare.org</small></span><b aria-hidden="true">→</b>
      </a>
      <a class="safety-link" href="${buildGmailCompose('supervisoryboard.cobetu@gmail.com', 'Contacto con el órgano de control')}" target="_blank" rel="noopener noreferrer">
        <span><strong>Órgano de control independiente</strong><small>supervisoryboard.cobetu@gmail.com</small></span><b aria-hidden="true">→</b>
      </a>
    </div>
  `;
}

function selectCategory(category, shouldFocusResult = false) {
  topicButtons.forEach(button => {
    const isSelected = button.dataset.category === category;
    button.classList.toggle('active', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  if (category === 'abusos') {
    renderSafetyCategory();
  } else {
    renderStandardCategory(categoryData[category] ? category : 'general');
  }

  if (shouldFocusResult && window.matchMedia('(max-width: 620px)').matches) {
    window.requestAnimationFrame(() => {
      messagePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

topicButtons.forEach(button => {
  button.addEventListener('click', () => selectCategory(button.dataset.category, true));
});

copyEmailButton.addEventListener('click', async () => {
  const copied = await copyText(CONTACT_EMAIL, 'Correo copiado: pagina.gen.2@gmail.com');
  if (!copied) return;
  copyEmailIcon.textContent = 'Copiado';
  window.setTimeout(() => { copyEmailIcon.textContent = 'Copiar'; }, 1800);
});

const requestedCategory = new URLSearchParams(window.location.search).get('categoria');
const availableCategories = new Set(topicButtons.map(button => button.dataset.category));
selectCategory(availableCategories.has(requestedCategory) ? requestedCategory : 'general');

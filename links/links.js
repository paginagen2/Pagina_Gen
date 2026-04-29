// ============ FUNCIONES DE COPIADO ============
function copyEmail() {
  const emailText = 'pagina.gen.2@gmail.com';
  const copyBtn = document.getElementById('copyBtn');
  const copyIcon = document.getElementById('copyIcon');
  
  navigator.clipboard.writeText(emailText).then(function() {
    copyIcon.textContent = '✅';
    copyBtn.style.background = '#27ae60';
    
    setTimeout(function() {
      copyIcon.textContent = '📋';
      copyBtn.style.background = '#3498db';
    }, 1500);
  }).catch(function(err) {
    console.log('Error al copiar: ', err);
    selectEmailText();
  });
}

function selectEmailText() {
  const emailElement = document.querySelector('.email-text');
  const range = document.createRange();
  range.selectNode(emailElement);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

// Función para copiar texto al portapapeles
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Opcional: mostrar un mensaje de éxito temporal
    mostrarToastTemporal('Copiado al portapapeles: ' + text, 'success');
  }).catch(err => {
    console.error('Error al copiar el texto: ', err);
    alert('Error al copiar el texto. Por favor, cópialo manualmente: ' + text);
  });
}

// Función para mostrar un toast temporal :)
function mostrarToastTemporal(mensaje, tipo = 'info') {
  const colores = {
    success: '#28a745',
    error: '#dc3545',
    info: '#17a2b8'
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${colores[tipo] || colores.info};
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-family: 'Arial', sans-serif;
    font-size: 14px;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
  `;
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  // Mostrar el toast
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 100);

  // Ocultar y remover el toast después de 3 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

// ============ SISTEMA DE CATEGORÍAS ============
const categoryData = {
  cancionero: {
    title: "🎸 Reportes del Cancionero",
    suggestions: [
      "¿Hay errores en alguna canción? Especifica el título y describe el problema",
      "¿Faltan acordes o están incorrectos? Menciona qué canción necesita corrección",
      "¿Los enlaces no funcionan? Indica cuáles están rotos"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Cancionero"
  },
  
  animadores: {
    title: "🎯 Reportes de Gen Animadores",
    suggestions: [
      "¿Hay problemas con alguna dinámica? Especifica cuál y qué no funciona",
      "¿Los materiales están dañados o son inaccesibles? Indica cuáles",
      "¿Necesitas ayuda con recursos para tu grupo? Especifica edad y contexto"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Gen Animadores"
  },
  
  experiencia: {
    title: "💝 Compartir Experiencia",
    suggestions: [
      "Cuenta tu experiencia con detalles: ¿qué pasó y cómo te marcó?",
      "Incluye reflexiones: ¿qué aprendiste de esta vivencia?",
      "Menciona tu nombre y país para identificar el testimonio",
      "Si tienes fotos relacionadas, puedes adjuntarlas"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Experiencia de vida"
  },
  
  biblioteca: {
    title: "📚 Biblioteca",
    suggestions: [
      "¿Buscas un documento específico? Describe el tema, autor o título",
      "¿Hay enlaces rotos o archivos dañados? Indica cuáles exactamente",
      "¿Necesitas material sobre algún tema del movimiento? Sé específico"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Biblioteca"
  },
  
  movimiento: {
    title: "❤️ Sobre el Movimiento",
    suggestions: [
      "¿Tienes dudas sobre historia o espiritualidad? Formula preguntas específicas",
      "¿Quieres corregir información? Cita fuentes y especifica qué cambiar",
      "¿Buscas material sobre algún aspecto del carisma? Menciona qué tema"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Sobre el Movimiento"
  },
  
  colaboracion: {
    title: "🤝 Abusos: Denuncias y ayuda",
    suggestions: [
      "<p>Pagina oficial: <a href=\"https://www.focolare.org/es/prevencion-de-abusos/\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.focolare.org/es/prevencion-de-abusos/</a></p>",
      "<p>Mail para denunciar un abuso: <a href=\"javascript:void(0)\" onclick=\"copyToClipboard('abusereport.foc@gmail.com')\">abusereport.foc@gmail.com</a></p>",
      "<p>Mail para ponerse en contacto con la oficina de protección: <a href=\"javascript:void(0)\" onclick=\"copyToClipboard('ufficio.tutela@focolare.org')\">ufficio.tutela@focolare.org</a></p>",
      "<p>Mail para contactar con el órgano de control: <a href=\"javascript:void(0)\" onclick=\"copyToClipboard('supervisoryboard.cobetu@gmail.com')\">supervisoryboard.cobetu@gmail.com</a></p>",  
    ],
    tip: "💡 <strong>No estas sol@:</strong>"
  },
  
  mejoras: {
    title: "💡 Mejoras para la Página",
    suggestions: [
      "¿Encontraste un error? Describe qué estabas haciendo cuando ocurrió",
      "¿Tienes ideas para nuevas funciones? Explica cómo mejorarían la experiencia",
      "¿Hay problemas de diseño? Especifica dispositivo, navegador y pantalla",
      "¿La página es lenta? Menciona tu conexión y ubicación"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Mejoras página"
  },
  
  general: {
    title: "💭 Contacto General",
    suggestions: [
      "¿Tienes preguntas sobre cómo participar? Especifica qué te interesa",
      "¿Necesitas contacto de otros centros? Indica ubicación o región",
      "¿Quieres información general del movimiento? Sé específico",
      "¿Tienes dudas que no encajan en otras categorías? Explica tu situación"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Consulta general"
  }
};

function selectCategory(category) {
  // Actualizar botones
  document.querySelectorAll('.categoria-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const selectedBtn = document.querySelector(`[data-category="${category}"]`);
  selectedBtn.classList.add('active');
  
  // Actualizar área de sugerencias
  const sugerenciasArea = document.getElementById('sugerenciasArea');
  const sugerenciaContent = document.getElementById('sugerenciaContent');
  
  const data = categoryData[category];
  
  if (data) {
    sugerenciaContent.innerHTML = `
      <h5>${data.title}</h5>
      
      <div class="intro-email">
        <p>"Hola equipo Gen 2, les escribo para contactarlos sobre ${data.title.replace(/🎸|🎯|💝|📚|❤️|🤝|💡|💭/g, '').trim()}, breve descripción del mensaje.</p>
        <p>Mensaje completo"</p>
      </div>
      
      <ul>
        ${data.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
      </ul>
      
      <div class="tip">
        ${data.tip}
      </div>
    `;
  }
  
  // Animación suave
  sugerenciasArea.style.opacity = '0.7';
  setTimeout(() => {
    sugerenciasArea.style.opacity = '1';
  }, 150);
}

// ============ NAVEGACIÓN ============
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  }
}

// ============ INICIALIZACIÓN ============
window.addEventListener('load', function() {
  if (window.location.hash === '#contacto' || document.referrer.includes('experiencias.html')) {
    setTimeout(function() {
      scrollToSection('contacto');
    }, 300);
  }
});

// ============ DETECCIÓN DE TEMA ============
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (event.matches) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
});


console.log('✅ Links renovado cargado correctamente');

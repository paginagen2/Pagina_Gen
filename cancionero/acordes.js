// Variables globales
let currentInstrument = 'piano';
let currentCifrado = 'americano';
let currentFilter = { nota: 'all', tipo: 'all' };

// Base de datos de acordes
const acordesData = {
  // Acordes mayores
  'C_major': { nota: 'C', tipo: 'major', piano: [0, 4, 7], guitar: ['x', 3, 2, 0, 1, 0], formula: '1 3 5' },
  'D_major': { nota: 'D', tipo: 'major', piano: [2, 6, 9], guitar: ['x', 'x', 0, 2, 3, 2], formula: '1 3 5' },
  'E_major': { nota: 'E', tipo: 'major', piano: [4, 8, 11], guitar: [0, 2, 2, 1, 0, 0], formula: '1 3 5' },
  'F_major': { nota: 'F', tipo: 'major', piano: [5, 9, 0], guitar: [1, 3, 3, 2, 1, 1], formula: '1 3 5' },
  'G_major': { nota: 'G', tipo: 'major', piano: [7, 11, 2], guitar: [3, 2, 0, 0, 3, 3], formula: '1 3 5' },
  'A_major': { nota: 'A', tipo: 'major', piano: [9, 1, 4], guitar: ['x', 0, 2, 2, 2, 0], formula: '1 3 5' },
  'B_major': { nota: 'B', tipo: 'major', piano: [11, 3, 6], guitar: ['x', 2, 4, 4, 4, 2], formula: '1 3 5' },
  
  // Acordes menores
  'C_minor': { nota: 'C', tipo: 'minor', piano: [0, 3, 7], guitar: ['x', 3, 1, 0, 1, 3], formula: '1 ♭3 5' },
  'D_minor': { nota: 'D', tipo: 'minor', piano: [2, 5, 9], guitar: ['x', 'x', 0, 2, 3, 1], formula: '1 ♭3 5' },
  'E_minor': { nota: 'E', tipo: 'minor', piano: [4, 7, 11], guitar: [0, 2, 2, 0, 0, 0], formula: '1 ♭3 5' },
  'F_minor': { nota: 'F', tipo: 'minor', piano: [5, 8, 0], guitar: [1, 3, 3, 1, 1, 1], formula: '1 ♭3 5' },
  'G_minor': { nota: 'G', tipo: 'minor', piano: [7, 10, 2], guitar: [3, 5, 5, 3, 3, 3], formula: '1 ♭3 5' },
  'A_minor': { nota: 'A', tipo: 'minor', piano: [9, 0, 4], guitar: ['x', 0, 2, 2, 1, 0], formula: '1 ♭3 5' },
  'B_minor': { nota: 'B', tipo: 'minor', piano: [11, 2, 6], guitar: ['x', 2, 4, 4, 3, 2], formula: '1 ♭3 5' },
  
  // Acordes de séptima (dominante)
  'C_seventh': { nota: 'C', tipo: 'seventh', piano: [0, 4, 7, 10], guitar: ['x', 3, 2, 3, 1, 0], formula: '1 3 5 ♭7' },
  'D_seventh': { nota: 'D', tipo: 'seventh', piano: [2, 6, 9, 0], guitar: ['x', 'x', 0, 2, 1, 2], formula: '1 3 5 ♭7' },
  'E_seventh': { nota: 'E', tipo: 'seventh', piano: [4, 8, 11, 2], guitar: [0, 2, 0, 1, 0, 0], formula: '1 3 5 ♭7' },
  'F_seventh': { nota: 'F', tipo: 'seventh', piano: [5, 9, 0, 3], guitar: [1, 3, 1, 2, 1, 1], formula: '1 3 5 ♭7' },
  'G_seventh': { nota: 'G', tipo: 'seventh', piano: [7, 11, 2, 5], guitar: [3, 2, 0, 0, 0, 1], formula: '1 3 5 ♭7' },
  'A_seventh': { nota: 'A', tipo: 'seventh', piano: [9, 1, 4, 7], guitar: ['x', 0, 2, 0, 2, 0], formula: '1 3 5 ♭7' },
  'B_seventh': { nota: 'B', tipo: 'seventh', piano: [11, 3, 6, 9], guitar: ['x', 2, 1, 2, 0, 2], formula: '1 3 5 ♭7' },
  
  // Acordes de séptima mayor (Maj7)
  'C_major_seventh': { nota: 'C', tipo: 'major_seventh', piano: [0, 4, 7, 11], guitar: ['x', 3, 2, 0, 0, 0], formula: '1 3 5 7' },
  'D_major_seventh': { nota: 'D', tipo: 'major_seventh', piano: [2, 6, 9, 1], guitar: ['x', 'x', 0, 2, 2, 2], formula: '1 3 5 7' },
  'E_major_seventh': { nota: 'E', tipo: 'major_seventh', piano: [4, 8, 11, 3], guitar: [0, 2, 1, 1, 0, 0], formula: '1 3 5 7' },
  'F_major_seventh': { nota: 'F', tipo: 'major_seventh', piano: [5, 9, 0, 4], guitar: [1, 3, 2, 2, 1, 1], formula: '1 3 5 7' },
  'G_major_seventh': { nota: 'G', tipo: 'major_seventh', piano: [7, 11, 2, 6], guitar: [3, 2, 0, 0, 0, 2], formula: '1 3 5 7' },
  'A_major_seventh': { nota: 'A', tipo: 'major_seventh', piano: [9, 1, 4, 8], guitar: ['x', 0, 2, 1, 2, 0], formula: '1 3 5 7' },
  'B_major_seventh': { nota: 'B', tipo: 'major_seventh', piano: [11, 3, 6, 10], guitar: ['x', 2, 1, 3, 0, 2], formula: '1 3 5 7' },
  
  // Acordes disminuidos
  'C_diminished': { nota: 'C', tipo: 'diminished', piano: [0, 3, 6], guitar: ['x', 3, 1, 2, 1, 2], formula: '1 ♭3 ♭5' },
  'D_diminished': { nota: 'D', tipo: 'diminished', piano: [2, 5, 8], guitar: ['x', 'x', 0, 1, 0, 1], formula: '1 ♭3 ♭5' },
  'E_diminished': { nota: 'E', tipo: 'diminished', piano: [4, 7, 10], guitar: [0, 1, 2, 0, 2, 0], formula: '1 ♭3 ♭5' },
  
  // Acordes aumentados
  'C_augmented': { nota: 'C', tipo: 'augmented', piano: [0, 4, 8], guitar: ['x', 3, 2, 1, 1, 0], formula: '1 3 #5' },
  'D_augmented': { nota: 'D', tipo: 'augmented', piano: [2, 6, 10], guitar: ['x', 'x', 0, 3, 3, 2], formula: '1 3 #5' },
  'E_augmented': { nota: 'E', tipo: 'augmented', piano: [4, 8, 0], guitar: [0, 3, 2, 1, 1, 0], formula: '1 3 #5' },
  
  // Acordes sostenidos (sostenidos de las notas naturales)
  'C_sharp_major': { nota: 'C#', tipo: 'major', piano: [1, 5, 9], guitar: ['x', 4, 3, 1, 2, 1], formula: '1 3 5' },
  'D_sharp_major': { nota: 'D#', tipo: 'major', piano: [3, 7, 11], guitar: ['x', 'x', 1, 3, 4, 3], formula: '1 3 5' },
  'F_sharp_major': { nota: 'F#', tipo: 'major', piano: [6, 10, 1], guitar: [2, 4, 4, 3, 2, 2], formula: '1 3 5' },
  'G_sharp_major': { nota: 'G#', tipo: 'major', piano: [8, 0, 3], guitar: [4, 3, 1, 1, 4, 4], formula: '1 3 5' },
  'A_sharp_major': { nota: 'A#', tipo: 'major', piano: [10, 2, 6], guitar: ['x', 1, 3, 3, 3, 1], formula: '1 3 5' },
  
  // Acordes sostenidos menores
  'C_sharp_minor': { nota: 'C#', tipo: 'minor', piano: [1, 4, 8], guitar: ['x', 4, 2, 1, 2, 1], formula: '1 ♭3 5' },
  'D_sharp_minor': { nota: 'D#', tipo: 'minor', piano: [3, 6, 10], guitar: ['x', 'x', 1, 3, 4, 2], formula: '1 ♭3 5' },
  'F_sharp_minor': { nota: 'F#', tipo: 'minor', piano: [6, 9, 1], guitar: [2, 4, 4, 2, 2, 2], formula: '1 ♭3 5' },
  'G_sharp_minor': { nota: 'G#', tipo: 'minor', piano: [8, 11, 3], guitar: [4, 2, 1, 1, 4, 4], formula: '1 ♭3 5' },
  'A_sharp_minor': { nota: 'A#', tipo: 'minor', piano: [10, 1, 6], guitar: ['x', 1, 3, 3, 2, 1], formula: '1 ♭3 5' },
  
  // Acordes sostenidos de séptima
  'C_sharp_seventh': { nota: 'C#', tipo: 'seventh', piano: [1, 5, 8, 11], guitar: ['x', 4, 3, 4, 2, 2], formula: '1 3 5 ♭7' },
  'D_sharp_seventh': { nota: 'D#', tipo: 'seventh', piano: [3, 7, 10, 1], guitar: ['x', 'x', 2, 4, 3, 4], formula: '1 3 5 ♭7' },
  'F_sharp_seventh': { nota: 'F#', tipo: 'seventh', piano: [6, 10, 1, 4], guitar: [2, 4, 2, 3, 2, 2], formula: '1 3 5 ♭7' },
  'G_sharp_seventh': { nota: 'G#', tipo: 'seventh', piano: [8, 0, 3, 6], guitar: [4, 3, 2, 2, 4, 4], formula: '1 3 5 ♭7' },
  'A_sharp_seventh': { nota: 'A#', tipo: 'seventh', piano: [10, 2, 6, 9], guitar: ['x', 2, 4, 4, 4, 2], formula: '1 3 5 ♭7' },
  
  // Acordes sostenidos de séptima mayor
  'C_sharp_major_seventh': { nota: 'C#', tipo: 'major_seventh', piano: [1, 5, 8, 0], guitar: ['x', 4, 3, 1, 1, 1], formula: '1 3 5 7' },
  'D_sharp_major_seventh': { nota: 'D#', tipo: 'major_seventh', piano: [3, 7, 10, 2], guitar: ['x', 'x', 2, 4, 4, 3], formula: '1 3 5 7' },
  'F_sharp_major_seventh': { nota: 'F#', tipo: 'major_seventh', piano: [6, 10, 1, 5], guitar: [2, 4, 2, 3, 2, 2], formula: '1 3 5 7' },
  'G_sharp_major_seventh': { nota: 'G#', tipo: 'major_seventh', piano: [8, 0, 3, 7], guitar: [4, 3, 1, 1, 4, 4], formula: '1 3 5 7' },
  'A_sharp_major_seventh': { nota: 'A#', tipo: 'major_seventh', piano: [10, 2, 6, 10], guitar: ['x', 2, 4, 3, 2, 1], formula: '1 3 5 7' },
  
  // Acordes sostenidos disminuidos
  'C_sharp_diminished': { nota: 'C#', tipo: 'diminished', piano: [1, 4, 7], guitar: ['x', 4, 2, 1, 2, 1], formula: '1 ♭3 ♭5' },
  'D_sharp_diminished': { nota: 'D#', tipo: 'diminished', piano: [3, 6, 9], guitar: ['x', 'x', 1, 3, 2, 3], formula: '1 ♭3 ♭5' },
  'F_sharp_diminished': { nota: 'F#', tipo: 'diminished', piano: [6, 9, 0], guitar: [2, 4, 2, 2, 2, 2], formula: '1 ♭3 ♭5' },
  'G_sharp_diminished': { nota: 'G#', tipo: 'diminished', piano: [8, 11, 2], guitar: [4, 2, 1, 2, 4, 4], formula: '1 ♭3 ♭5' },
  'A_sharp_diminished': { nota: 'A#', tipo: 'diminished', piano: [10, 1, 4], guitar: ['x', 1, 3, 2, 3, 1], formula: '1 ♭3 ♭5' },
  
  // Acordes sostenidos aumentados
  'C_sharp_augmented': { nota: 'C#', tipo: 'augmented', piano: [1, 5, 9], guitar: ['x', 4, 3, 2, 2, 1], formula: '1 3 #5' },
  'D_sharp_augmented': { nota: 'D#', tipo: 'augmented', piano: [3, 7, 11], guitar: ['x', 'x', 2, 4, 4, 3], formula: '1 3 #5' },
  'F_sharp_augmented': { nota: 'F#', tipo: 'augmented', piano: [6, 10, 2], guitar: [2, 4, 3, 2, 2, 2], formula: '1 3 #5' },
  'G_sharp_augmented': { nota: 'G#', tipo: 'augmented', piano: [8, 0, 4], guitar: [4, 3, 2, 1, 4, 4], formula: '1 3 #5' },
  'A_sharp_augmented': { nota: 'A#', tipo: 'augmented', piano: [10, 2, 6], guitar: ['x', 2, 4, 3, 3, 2], formula: '1 3 #5' },
  
  // Acordes sostenidos (sostenidos de las notas naturales)
  'C_sharp_major': { nota: 'C#', tipo: 'major', piano: [1, 5, 9], guitar: ['x', 4, 3, 1, 2, 1], formula: '1 3 5' },
  'D_sharp_major': { nota: 'D#', tipo: 'major', piano: [3, 7, 11], guitar: ['x', 'x', 1, 3, 4, 3], formula: '1 3 5' },
  'F_sharp_major': { nota: 'F#', tipo: 'major', piano: [6, 10, 1], guitar: [2, 4, 4, 3, 2, 2], formula: '1 3 5' },
  'G_sharp_major': { nota: 'G#', tipo: 'major', piano: [8, 0, 3], guitar: [4, 3, 1, 1, 4, 4], formula: '1 3 5' },
  'A_sharp_major': { nota: 'A#', tipo: 'major', piano: [10, 2, 6], guitar: ['x', 1, 3, 3, 3, 1], formula: '1 3 5' },
  
  // Acordes sostenidos menores
  'C_sharp_minor': { nota: 'C#', tipo: 'minor', piano: [1, 4, 8], guitar: ['x', 4, 2, 1, 2, 1], formula: '1 ♭3 5' },
  'D_sharp_minor': { nota: 'D#', tipo: 'minor', piano: [3, 6, 10], guitar: ['x', 'x', 1, 3, 4, 2], formula: '1 ♭3 5' },
  'F_sharp_minor': { nota: 'F#', tipo: 'minor', piano: [6, 9, 1], guitar: [2, 4, 4, 2, 2, 2], formula: '1 ♭3 5' },
  'G_sharp_minor': { nota: 'G#', tipo: 'minor', piano: [8, 11, 3], guitar: [4, 2, 1, 1, 4, 4], formula: '1 ♭3 5' },
  'A_sharp_minor': { nota: 'A#', tipo: 'minor', piano: [10, 1, 6], guitar: ['x', 1, 3, 3, 2, 1], formula: '1 ♭3 5' }
};

// Mapeo de notas
const notasMap = {
  americano: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  europeo: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
};

// Mapeo inverso para búsqueda
const notasToIndex = {
  americano: {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  },
  europeo: {
    'Do': 0, 'Do#': 1, 'Re': 2, 'Re#': 3, 'Mi': 4, 'Fa': 5, 'Fa#': 6, 'Sol': 7, 'Sol#': 8, 'La': 9, 'La#': 10, 'Si': 11
  }
};

// Mapeo de tipos de acordes
const tiposMap = {
  major: 'Mayor',
  minor: 'Menor',
  seventh: 'Séptima',
  major_seventh: 'Séptima Mayor',
  diminished: 'Disminuido',
  augmented: 'Aumentado'
};

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
  initializeAcordes();
  generateNotasFilter();
  displayAcordes();
  
  console.log('✅ Centro de Acordes cargado');
});

function initializeAcordes() {
  // Configurar dark mode
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
}

// Seleccionar instrumento
function selectInstrument(instrument) {
  currentInstrument = instrument;
  
  // Actualizar botones
  document.querySelectorAll('.instrument-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-instrument="${instrument}"]`).classList.add('active');
  
  // Recargar acordes
  displayAcordes();
}

// Seleccionar cifrado
function selectCifrado(cifrado) {
  currentCifrado = cifrado;
  
  // Actualizar botones
  document.querySelectorAll('.cifrado-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-cifrado="${cifrado}"]`).classList.add('active');
  
  // Regenerar filtro de notas y acordes
  generateNotasFilter();
  displayAcordes();
}

// Generar filtro de notas
function generateNotasFilter() {
  const container = document.getElementById('notasFilter');
  const notas = notasMap[currentCifrado];
  
  container.innerHTML = `
    <button class="nota-btn active" data-nota="all" onclick="filterByNota('all')">Todas</button>
    ${notas.map((nota, index) => {
      const notaKey = notasMap.americano[index]; // Usar siempre la clave americana para buscar
      return `<button class="nota-btn" data-nota="${notaKey}" onclick="filterByNota('${notaKey}')">${nota}</button>`;
    }).join('')}
  `;
}

// Filtrar por nota
function filterByNota(nota) {
  currentFilter.nota = nota;
  
  // Actualizar botones
  document.querySelectorAll('.nota-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-nota="${nota}"]`).classList.add('active');
  
  displayAcordes();
}

// Filtrar por tipo
function filterByType(tipo) {
  currentFilter.tipo = tipo;
  
  // Actualizar botones
  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tipo="${tipo}"]`).classList.add('active');
  
  displayAcordes();
}

// Mostrar acordes
function displayAcordes() {
  const container = document.getElementById('acordesGrid');
  const filteredAcordes = getFilteredAcordes();
  
  if (filteredAcordes.length === 0) {
    container.innerHTML = `
      <div class="loading-acordes">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎼</div>
        <h3>No se encontraron acordes</h3>
        <p>Intenta con otros filtros</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredAcordes.map(([key, acorde]) => {
    return createAcordeCard(key, acorde);
  }).join('');
}

// Obtener acordes filtrados
function getFilteredAcordes() {
  return Object.entries(acordesData).filter(([key, acorde]) => {
    const matchNota = currentFilter.nota === 'all' || acorde.nota === currentFilter.nota;
    const matchTipo = currentFilter.tipo === 'all' || acorde.tipo === currentFilter.tipo;
    return matchNota && matchTipo;
  });
}

// Crear card de acorde
function createAcordeCard(key, acorde) {
  const notaDisplay = getNotaDisplay(acorde.nota);
  const tipoDisplay = tiposMap[acorde.tipo];
  const acordeName = `${notaDisplay}${acorde.tipo === 'major' ? '' : getTipoSuffix(acorde.tipo)}`;
  
  return `
    <div class="acorde-card">
      <div class="acorde-header">
        <div class="acorde-name">${acordeName}</div>
        <div class="acorde-type">${tipoDisplay}</div>
      </div>
      
      ${currentInstrument === 'piano' ? createPianoView(acorde) : createGuitarView(acorde)}
      
      <div class="acorde-info">
        <div class="acorde-notes">
          <strong>Notas:</strong> ${getNotesDisplay(acorde)}
        </div>
        <div class="acorde-formula">
          Fórmula: ${acorde.formula}
        </div>
      </div>
    </div>
  `;
}

// Obtener sufijo del tipo de acorde
function getTipoSuffix(tipo) {
  const suffixes = {
    minor: 'm',
    seventh: '7',
    major_seventh: 'maj7',
    diminished: 'dim',
    augmented: 'aug'
  };
  return suffixes[tipo] || '';
}

// Obtener display de nota
function getNotaDisplay(nota) {
  const index = notasMap.americano.indexOf(nota);
  return notasMap[currentCifrado][index];
}

// Obtener display de notas del acorde
function getNotesDisplay(acorde) {
  // Usar siempre las notas de piano para consistencia entre instrumentos
  const notes = acorde.piano.map(noteIndex => notasMap[currentCifrado][noteIndex]);
  return [...new Set(notes)].join(' - ');
}

// Crear vista de piano
function createPianoView(acorde) {
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const blackKeys = [1, 3, 6, 8, 10]; // C# D# F# G# A#
  
  let pianoHTML = `
    <div class="piano-container">
      <div class="piano-keyboard">
  `;
  
  // Teclas blancas
  whiteKeys.forEach((noteIndex, i) => {
    const isActive = acorde.piano.includes(noteIndex);
    const noteName = notasMap[currentCifrado][noteIndex];
    
    pianoHTML += `
      <div class="piano-key white ${isActive ? 'active' : ''}">
        <div class="key-label">${noteName}</div>
      </div>
    `;
  });
  
  // Teclas negras - posiciones corregidas
  const blackKeyPositions = {
    1: '14.2%',   // C# entre C y D
    3: '28.8%',  // D# entre D y E
    6: '57.4%',  // F# entre F y G
    8: '71.5%',  // G# entre G y A
    10: '86%'  // A# entre A y B
  };
  
  blackKeys.forEach((noteIndex) => {
    const isActive = acorde.piano.includes(noteIndex);
    const noteName = notasMap[currentCifrado][noteIndex];
    const position = blackKeyPositions[noteIndex];
    
    pianoHTML += `
      <div class="piano-key black ${isActive ? 'active' : ''}" style="left: ${position};">
        <div class="key-label">${noteName}</div>
      </div>
    `;
  });
  
  pianoHTML += `
      </div>
    </div>
  `;
  
  return pianoHTML;
}

// Crear vista de guitarra
function createGuitarView(acorde) {
  const stringNames = ['E', 'A', 'D', 'G', 'B', 'E'];
  const maxFret = Math.max(...acorde.guitar.filter(f => f !== 'x').map(f => parseInt(f)));
  const visibleFrets = Math.max(maxFret + 1, 5); // Mostrar al menos 5 trastes
  
  let guitarHTML = `
    <div class="guitar-container">
      <div class="guitar-fretboard">
        
        <div class="guitar-frets">
          ${Array.from({length: visibleFrets + 1}, (_, i) => `<div class="guitar-fret"></div>`).join('')}
        </div>
        
        <div class="guitar-strings">
  `;
  
  // Cuerdas y marcadores
  acorde.guitar.forEach((fret, stringIndex) => {
    guitarHTML += `<div class="guitar-string">`;
    
    if (fret !== 'x') {
      if (fret === 0) {
        // Cuerda al aire (0) - mostrar detrás del primer traste
        guitarHTML += `
          <div class="fret-marker open-string">
            <div class="fret-number">0</div>
          </div>
        `;
      } else {
        // Cuerda presionada - centrada entre trastes
        const fretPosition = ((parseInt(fret) - 0.5) / visibleFrets) * 100;
        
        guitarHTML += `
          <div class="fret-marker" style="top: ${fretPosition}%; left: 50%;">
            <div class="fret-number">${fret}</div>
          </div>
        `;
      }
    } else {
      // Cuerda muda (x)
      guitarHTML += `
        <div class="fret-marker muted">
          <div class="fret-number">×</div>
        </div>
      `;
    }
    
    guitarHTML += `</div>`;
  });
  
  guitarHTML += `
        </div>
      </div>
    </div>
  `;
  
  return guitarHTML;
}

console.log('✅ Centro de Acordes cargado correctamente');
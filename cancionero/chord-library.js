export const chordLibrary = {
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
  'F_diminished': { nota: 'F', tipo: 'diminished', piano: [5, 8, 11], guitar: [1, 2, 3, 1, 3, 1], formula: '1 ♭3 ♭5' },
  'G_diminished': { nota: 'G', tipo: 'diminished', piano: [7, 10, 1], guitar: ['x', 'x', 2, 3, 2, 3], formula: '1 ♭3 ♭5' },
  'A_diminished': { nota: 'A', tipo: 'diminished', piano: [9, 0, 3], guitar: ['x', 0, 1, 2, 1, 'x'], formula: '1 ♭3 ♭5' },
  'B_diminished': { nota: 'B', tipo: 'diminished', piano: [11, 2, 5], guitar: ['x', 2, 3, 4, 3, 'x'], formula: '1 ♭3 ♭5' },
  
  // Acordes aumentados
  'C_augmented': { nota: 'C', tipo: 'augmented', piano: [0, 4, 8], guitar: ['x', 3, 2, 1, 1, 0], formula: '1 3 #5' },
  'D_augmented': { nota: 'D', tipo: 'augmented', piano: [2, 6, 10], guitar: ['x', 'x', 0, 3, 3, 2], formula: '1 3 #5' },
  'E_augmented': { nota: 'E', tipo: 'augmented', piano: [4, 8, 0], guitar: [0, 3, 2, 1, 1, 0], formula: '1 3 #5' },
  'F_augmented': { nota: 'F', tipo: 'augmented', piano: [5, 9, 1], guitar: ['x', 'x', 3, 2, 2, 1], formula: '1 3 #5' },
  'G_augmented': { nota: 'G', tipo: 'augmented', piano: [7, 11, 3], guitar: ['x', 'x', 1, 0, 0, 3], formula: '1 3 #5' },
  'A_augmented': { nota: 'A', tipo: 'augmented', piano: [9, 1, 5], guitar: ['x', 0, 3, 2, 2, 1], formula: '1 3 #5' },
  'B_augmented': { nota: 'B', tipo: 'augmented', piano: [11, 3, 7], guitar: ['x', 2, 1, 0, 0, 3], formula: '1 3 #5' },
  
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

const ROOT_NAMES = { C: 'C', 'C#': 'C_sharp', Db: 'C_sharp', D: 'D', 'D#': 'D_sharp', Eb: 'D_sharp', E: 'E', F: 'F', 'F#': 'F_sharp', Gb: 'F_sharp', G: 'G', 'G#': 'G_sharp', Ab: 'G_sharp', A: 'A', 'A#': 'A_sharp', Bb: 'A_sharp', B: 'B' };

export function getChordShape(root, type = 'major') {
  const rootKey = ROOT_NAMES[root];
  if (!rootKey) return null;
  return chordLibrary[`${rootKey}_${type}`] || chordLibrary[`${rootKey}_major`] || null;
}

export const chordTypeLabels = {
  major: 'Mayor', minor: 'Menor', seventh: 'Séptima',
  major_seventh: 'Séptima mayor', diminished: 'Disminuido', augmented: 'Aumentado'
};


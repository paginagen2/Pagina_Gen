/**
 * Motor musical compartido para el cancionero.
 *
 * No depende del DOM y puede importarse directamente desde un <script type="module">.
 */

const NOTE_TOKEN_PATTERN = '(?:SOL|DO|RE|MI|FA|LA|SI|[A-GH])';
const CHORD_PATTERN = new RegExp(
  `^(${NOTE_TOKEN_PATTERN})(#{1,2}|b{1,2}|x|♯|♭)?(.*?)(?:\\/(${NOTE_TOKEN_PATTERN})(#{1,2}|b{1,2}|x|♯|♭)?)?$`,
  'i'
);

const BASE_PITCH = Object.freeze({
  C: 0, DO: 0,
  D: 2, RE: 2,
  E: 4, MI: 4,
  F: 5, FA: 5,
  G: 7, SOL: 7,
  A: 9, LA: 9,
  B: 11, H: 11, SI: 11
});

const AMERICAN_BASE = Object.freeze({
  C: 'C', DO: 'C', D: 'D', RE: 'D', E: 'E', MI: 'E',
  F: 'F', FA: 'F', G: 'G', SOL: 'G', A: 'A', LA: 'A',
  B: 'B', H: 'B', SI: 'B'
});

const SPANISH_BASE = Object.freeze({
  C: 'DO', DO: 'DO', D: 'RE', RE: 'RE', E: 'MI', MI: 'MI',
  F: 'FA', FA: 'FA', G: 'SOL', SOL: 'SOL', A: 'LA', LA: 'LA',
  B: 'SI', H: 'SI', SI: 'SI'
});

const SHARP_NAMES = Object.freeze({
  american: Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']),
  spanish: Object.freeze(['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI']),
  german: Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'])
});

const FLAT_NAMES = Object.freeze({
  american: Object.freeze(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']),
  spanish: Object.freeze(['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'SOLb', 'SOL', 'LAb', 'LA', 'SIb', 'SI']),
  // En el cifrado alemán, B es Si bemol y H es Si natural.
  german: Object.freeze(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'])
});

const VALID_SUFFIX = /^[0-9A-Za-zÀ-ÿ#b+−ΔøØ°()/.\-]*$/u;
const VALID_QUALITY_WORDS = /^(?:(?:maj|min|dim|aug|sus|add|omit|alt|dom|no|m|b)+)$/i;

function modulo12(value) {
  return ((value % 12) + 12) % 12;
}

function normalizeAccidental(accidental = '') {
  return accidental.replace(/♯/g, '#').replace(/♭/g, 'b');
}

function accidentalOffset(accidental) {
  if (accidental === 'x' || accidental === '##') return 2;
  if (accidental === 'bb') return -2;
  if (accidental === '#') return 1;
  if (accidental === 'b') return -1;
  return 0;
}

function detectNotation(token) {
  if (['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI'].includes(token)) return 'spanish';
  if (token === 'H') return 'german';
  return 'american';
}

function normalizeNotation(notation) {
  const value = String(notation || 'american').toLowerCase();
  if (['es', 'esp', 'espanol', 'español', 'latin', 'latino', 'spanish'].includes(value)) return 'spanish';
  if (['de', 'alemán', 'aleman', 'european', 'europeo', 'german'].includes(value)) return 'german';
  return 'american';
}

function normalizePreference(preference, parsed) {
  if (preference === 'sharp' || preference === 'sharps' || preference === '#') return 'sharp';
  if (preference === 'flat' || preference === 'flats' || preference === 'b') return 'flat';
  if (parsed?.accidental?.includes('b') || parsed?.bassAccidental?.includes('b')) return 'flat';
  return 'sharp';
}

function noteName(pitch, notation, preference) {
  const names = preference === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[normalizeNotation(notation)][modulo12(pitch)];
}

function isValidSuffix(suffix) {
  if (!VALID_SUFFIX.test(suffix) || suffix.includes('//')) return false;
  const words = suffix.match(/[A-Za-zÀ-ÿ]+/gu) || [];
  return words.every((word) => VALID_QUALITY_WORDS.test(word));
}

/**
 * Analiza un acorde completo. Devuelve null cuando el texto no es un acorde.
 */
export function parseChord(value) {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw || /[\[\]{}\s]/u.test(raw)) return null;

  const match = raw.match(CHORD_PATTERN);
  if (!match) return null;

  const rootToken = match[1].toUpperCase();
  const accidental = normalizeAccidental(match[2]);
  const suffix = match[3] || '';
  const bassToken = match[4]?.toUpperCase() || null;
  const bassAccidental = normalizeAccidental(match[5]);

  // Evita interpretar texto libre (por ejemplo "Coro") como si fuera un acorde.
  if (!isValidSuffix(suffix)) return null;

  const rootPitch = modulo12(BASE_PITCH[rootToken] + accidentalOffset(accidental));
  const bassPitch = bassToken == null
    ? null
    : modulo12(BASE_PITCH[bassToken] + accidentalOffset(bassAccidental));

  return Object.freeze({
    raw,
    root: `${rootToken}${accidental}`,
    rootToken,
    accidental,
    rootPitch,
    suffix,
    quality: suffix,
    bass: bassToken == null ? null : `${bassToken}${bassAccidental}`,
    bassToken,
    bassAccidental,
    bassPitch,
    notation: detectNotation(rootToken)
  });
}

/**
 * Formatea un acorde parseado (o un string) en el cifrado solicitado.
 */
export function formatChord(chord, options = {}) {
  const parsed = typeof chord === 'string' ? parseChord(chord) : chord;
  if (!parsed || !Number.isInteger(parsed.rootPitch)) return null;

  const notation = normalizeNotation(options.notation || parsed.notation);
  const preference = normalizePreference(options.accidentalPreference, parsed);
  const root = noteName(parsed.rootPitch, notation, preference);
  const bass = Number.isInteger(parsed.bassPitch)
    ? `/${noteName(parsed.bassPitch, notation, preference)}`
    : '';

  return `${root}${parsed.suffix || parsed.quality || ''}${bass}`;
}

/** Convierte entre cifrado americano, español y alemán/europeo. */
export function convertChordNotation(chord, notation = 'american', options = {}) {
  return formatChord(chord, { ...options, notation });
}

/** Alias breve para consumidores existentes o interfaces compactas. */
export const convertNotation = convertChordNotation;

/**
 * Transpone tanto la raíz como el bajo de un acorde slash (por ejemplo C/E).
 */
export function transposeChord(chord, semitones, options = {}) {
  const parsed = typeof chord === 'string' ? parseChord(chord) : chord;
  const steps = Number(semitones);
  if (!parsed || !Number.isFinite(steps) || !Number.isInteger(steps)) return null;

  return formatChord({
    ...parsed,
    rootPitch: modulo12(parsed.rootPitch + steps),
    bassPitch: Number.isInteger(parsed.bassPitch) ? modulo12(parsed.bassPitch + steps) : null
  }, options);
}

/**
 * Extrae acordes entre corchetes respetando el orden de aparición.
 * La unicidad es musical: DO y C se consideran el mismo acorde.
 */
export function extractChords(text, options = {}) {
  if (typeof text !== 'string' || !text) return [];

  const notation = options.notation ? normalizeNotation(options.notation) : null;
  const seen = new Set();
  const result = [];

  for (const match of text.matchAll(/\[([^\]\r\n]+)]/g)) {
    const parsed = parseChord(match[1]);
    if (!parsed) continue;

    const key = `${parsed.rootPitch}|${parsed.suffix.toLowerCase()}|${parsed.bassPitch ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push(formatChord(parsed, {
      ...options,
      notation: notation || parsed.notation
    }));
  }

  return result;
}

export const extractUniqueChords = extractChords;

/** Devuelve los objetos parseados cuando la UI necesita sus tonos numéricos. */
export function extractParsedChords(text) {
  if (typeof text !== 'string' || !text) return [];

  const seen = new Set();
  const result = [];
  for (const match of text.matchAll(/\[([^\]\r\n]+)]/g)) {
    const parsed = parseChord(match[1]);
    if (!parsed) continue;
    const key = `${parsed.rootPitch}|${parsed.suffix.toLowerCase()}|${parsed.bassPitch ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

export default Object.freeze({
  parseChord,
  formatChord,
  convertChordNotation,
  convertNotation,
  transposeChord,
  extractChords,
  extractUniqueChords,
  extractParsedChords
});

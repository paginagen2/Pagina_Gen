import { parseChord } from './chord-engine.js';
import { getChordShape, chordTypeLabels } from './chord-library.js';

const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const AMERICAN_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SPANISH_NOTES = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];

export function chordQualityType(chord) {
  const parsed = typeof chord === 'string' ? parseChord(chord) : chord;
  const suffix = (parsed?.suffix || '').toLowerCase();
  if (/maj7|ma7|Δ7/i.test(suffix)) return 'major_seventh';
  if (/dim|°|ø/i.test(suffix)) return 'diminished';
  if (/aug|\+/i.test(suffix)) return 'augmented';
  if (/^m(?!aj)|^min/i.test(suffix)) return 'minor';
  if (/7/.test(suffix)) return 'seventh';
  return 'major';
}

export function resolveChordShape(chord) {
  const parsed = typeof chord === 'string' ? parseChord(chord) : chord;
  if (!parsed) return null;
  const root = SHARP_ROOTS[parsed.rootPitch];
  const requestedType = chordQualityType(parsed);
  const shape = getChordShape(root, requestedType);
  return shape ? { ...shape, root, requestedType, parsed } : null;
}

export function renderPianoDiagram(chord, notation = 'american') {
  const resolved = resolveChordShape(chord);
  if (!resolved) return renderUnavailable();
  const noteNames = notation === 'spanish' ? SPANISH_NOTES : AMERICAN_NOTES;
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11];
  const blackKeys = [1, 3, 6, 8, 10];
  const positions = { 1: '14.2%', 3: '28.8%', 6: '57.4%', 8: '71.5%', 10: '86%' };
  const active = new Set(resolved.piano);

  return `
    <div class="diagram-piano" role="img" aria-label="Teclas para ${escapeHtml(String(chord))}">
      ${whiteKeys.map((note) => `<span class="diagram-key white ${active.has(note) ? 'active' : ''}"><small>${noteNames[note]}</small></span>`).join('')}
      ${blackKeys.map((note) => `<span class="diagram-key black ${active.has(note) ? 'active' : ''}" style="left:${positions[note]}"><small>${noteNames[note]}</small></span>`).join('')}
    </div>`;
}

export function renderGuitarDiagram(chord) {
  const resolved = resolveChordShape(chord);
  if (!resolved) return renderUnavailable();
  const frets = resolved.guitar;
  const numericFrets = frets.filter((fret) => fret !== 'x').map(Number);
  const maxFret = Math.max(5, ...numericFrets);
  const visibleFrets = Math.max(5, maxFret);

  return `
    <div class="diagram-guitar" role="img" aria-label="Posición de guitarra para ${escapeHtml(String(chord))}">
      <div class="diagram-frets">${Array.from({ length: visibleFrets + 1 }, () => '<span></span>').join('')}</div>
      <div class="diagram-strings">
        ${frets.map((fret) => {
          if (fret === 'x') return '<span class="diagram-string"><i class="diagram-marker muted">×</i></span>';
          if (Number(fret) === 0) return '<span class="diagram-string"><i class="diagram-marker open">○</i></span>';
          const top = ((Number(fret) - 0.5) / visibleFrets) * 100;
          return `<span class="diagram-string"><i class="diagram-marker" style="top:${top}%">${fret}</i></span>`;
        }).join('')}
      </div>
    </div>`;
}

export function renderChordDiagram(chord, instrument = 'guitar', notation = 'american') {
  return instrument === 'piano' ? renderPianoDiagram(chord, notation) : renderGuitarDiagram(chord);
}

export function chordShapeSummary(chord, notation = 'american') {
  const resolved = resolveChordShape(chord);
  if (!resolved) return null;
  const noteNames = notation === 'spanish' ? SPANISH_NOTES : AMERICAN_NOTES;
  return {
    type: resolved.requestedType,
    typeLabel: chordTypeLabels[resolved.requestedType],
    notes: [...new Set(resolved.piano.map((note) => noteNames[note]))],
    formula: resolved.formula
  };
}

function renderUnavailable() {
  return '<div class="diagram-unavailable">Todavía no tenemos una posición verificada para este acorde.</div>';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

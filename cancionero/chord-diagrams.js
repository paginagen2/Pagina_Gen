import { parseChord, convertChordNotation } from './chord-engine.js';
import { getChordShape, getSpecialChordShape, chordTypeLabels } from './chord-library.js?v=20260803-shared-chords-2';

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

export function resolveChordShape(chord, customShape = null) {
  const parsed = typeof chord === 'string' ? parseChord(chord) : chord;
  if (!parsed) return null;
  const root = SHARP_ROOTS[parsed.rootPitch];
  const requestedType = chordQualityType(parsed);
  const sharedName = typeof chord === 'string'
    ? (convertChordNotation(chord, 'american') || chord)
    : '';
  const sharedShape = getSpecialChordShape(sharedName);
  const preferredShape = sharedShape || customShape;
  if (preferredShape?.guitar || preferredShape?.piano) {
    return { ...preferredShape, root, requestedType: preferredShape.type || requestedType, parsed, custom: true };
  }
  const shape = getChordShape(root, requestedType);
  return shape ? { ...shape, root, requestedType, parsed } : null;
}

export function renderPianoDiagram(chord, notation = 'american', customShape = null) {
  const resolved = resolveChordShape(chord, customShape);
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

export function renderGuitarDiagram(chord, customShape = null) {
  const resolved = resolveChordShape(chord, customShape);
  if (!resolved) return renderUnavailable();
  const frets = resolved.guitar;
  if (!Array.isArray(frets) || frets.length !== 6) return renderUnavailable();
  const baseFret = Math.max(1, Number(resolved.baseFret) || 1);
  const visibleFrets = Math.max(4, Number(resolved.visibleFrets) || (baseFret > 1 ? 4 : 5));

  return `
    <div class="diagram-guitar" role="img" aria-label="Posición de guitarra para ${escapeHtml(String(chord))}">
      ${baseFret > 1 ? `<span class="diagram-base-fret">${baseFret}fr</span>` : ''}
      <div class="diagram-frets">${Array.from({ length: visibleFrets + 1 }, () => '<span></span>').join('')}</div>
      <div class="diagram-strings">
        ${frets.map((fret) => {
          if (fret === 'x') return '<span class="diagram-string"><i class="diagram-marker muted">×</i></span>';
          if (Number(fret) === 0) return '<span class="diagram-string"><i class="diagram-marker open">○</i></span>';
          const relativeFret = Number(fret) - baseFret + 1;
          const top = ((relativeFret - 0.5) / visibleFrets) * 100;
          return `<span class="diagram-string"><i class="diagram-marker" style="top:${top}%">${fret}</i></span>`;
        }).join('')}
      </div>
    </div>`;
}

export function renderChordDiagram(chord, instrument = 'guitar', notation = 'american', customShape = null) {
  return instrument === 'piano'
    ? renderPianoDiagram(chord, notation, customShape)
    : renderGuitarDiagram(chord, customShape);
}

export function chordShapeSummary(chord, notation = 'american', customShape = null) {
  const resolved = resolveChordShape(chord, customShape);
  if (!resolved) return null;
  const noteNames = notation === 'spanish' ? SPANISH_NOTES : AMERICAN_NOTES;
  return {
    type: resolved.requestedType,
    typeLabel: resolved.typeLabel || chordTypeLabels[resolved.requestedType] || 'Acorde especial',
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

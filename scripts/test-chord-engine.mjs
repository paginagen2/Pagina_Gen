import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El proyecto usa CommonJS, pero el motor es deliberadamente un ES module de navegador.
const sourceUrl = new URL('../cancionero/chord-engine.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const cSharpMinor = engine.parseChord('C#m7/G#');
assert.equal(cSharpMinor.rootPitch, 1);
assert.equal(cSharpMinor.suffix, 'm7');
assert.equal(cSharpMinor.bassPitch, 8);
assert.equal(engine.parseChord('C6/9').suffix, '6/9');
assert.equal(engine.parseChord('D♭maj7').rootPitch, 1);
assert.equal(engine.parseChord('G7alt').suffix, '7alt');
assert.equal(engine.parseChord('Emaj7/9').suffix, 'maj7/9');
assert.equal(engine.parseChord('Badd4(no5)').suffix, 'add4(no5)');
assert.equal(engine.parseChord('F#11').suffix, '11');

const spanish = engine.parseChord('SOL#m7/SI');
assert.equal(spanish.notation, 'spanish');
assert.equal(spanish.rootPitch, 8);
assert.equal(spanish.bassPitch, 11);

assert.equal(engine.convertChordNotation('C#m7/G#', 'spanish'), 'DO#m7/SOL#');
assert.equal(engine.convertChordNotation('REbmaj7/LAb', 'american'), 'Dbmaj7/Ab');
assert.equal(engine.convertChordNotation('H7', 'american'), 'B7');
assert.equal(engine.convertChordNotation('Bb', 'german', { accidentalPreference: 'flat' }), 'B');

assert.equal(engine.transposeChord('C/E', 2), 'D/F#');
assert.equal(engine.transposeChord('SIb/RE', -2, { notation: 'spanish', accidentalPreference: 'flat' }), 'LAb/DO');
assert.equal(engine.transposeChord('F#m7b5/C#', 12), 'F#m7b5/C#');

assert.deepEqual(
  engine.extractChords('[C]Hola [Am]mundo\n[DO]otra vez [G/B]fin [Coro]'),
  ['C', 'Am', 'G/B']
);
assert.deepEqual(
  engine.extractChords('[C] [F#m7] [Bb/D]', { notation: 'spanish', accidentalPreference: 'flat' }),
  ['DO', 'SOLbm7', 'SIb/RE']
);

assert.equal(engine.parseChord('Coro'), null);
assert.equal(engine.parseChord('estrofa'), null);
assert.equal(engine.transposeChord('no-es-acorde', 2), null);

console.log('Motor de acordes: todas las pruebas pasaron.');

import { parseChord } from './chord-engine.js';

const BRACKET_CHORD = /\[([^\]\r\n]+)]/g;
const TAB_STRING = /^\s*([EBGDAe])\|([^|]*)(?:\|\s*)?$/;

function chordTokens(line) {
  const tokens = [];
  const pattern = /\S+/g;
  let match;
  while ((match = pattern.exec(line))) {
    if (!parseChord(match[0])) return [];
    tokens.push({ raw: match[0], position: match.index });
  }
  return tokens;
}

function bracketLine(line) {
  let text = '';
  let cursor = 0;
  const chords = [];
  for (const match of line.matchAll(BRACKET_CHORD)) {
    text += line.slice(cursor, match.index);
    if (parseChord(match[1])) chords.push({ raw: match[1], position: text.length });
    else text += match[0];
    cursor = match.index + match[0].length;
  }
  text += line.slice(cursor);
  return { text, chords };
}

function isSixStringTab(lines, index) {
  if (index + 5 >= lines.length) return false;
  const expected = ['E', 'B', 'G', 'D', 'A', 'E'];
  return expected.every((name, offset) => {
    const match = lines[index + offset].match(TAB_STRING);
    return match && match[1].toUpperCase() === name;
  });
}

export function parseSongContent(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const allChords = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const possibleHeader = chordTokens(line);
    const tabStarts = isSixStringTab(lines, index);
    const tabAfterHeader = possibleHeader.length > 0 && isSixStringTab(lines, index + 1);
    if (tabStarts || tabAfterHeader) {
      const header = tabAfterHeader ? line : '';
      const start = tabAfterHeader ? index + 1 : index;
      const strings = lines.slice(start, start + 6).map(row => {
        const match = row.match(TAB_STRING);
        return { name: match[1], content: match[2] };
      });
      const width = Math.max(...strings.map(row => row.content.length));
      possibleHeader.forEach(chord => allChords.push(chord.raw));
      blocks.push({ type: 'tab', header, headerChords: possibleHeader, strings, width });
      index = start + 5;
      continue;
    }

    const bracket = bracketLine(line);
    if (bracket.chords.length) {
      bracket.chords.forEach(chord => allChords.push(chord.raw));
      if (!bracket.text.trim() && index + 1 < lines.length && !chordTokens(lines[index + 1]).length && !isSixStringTab(lines, index + 1)) {
        blocks.push({ type: 'line', text: lines[index + 1], chords: bracket.chords });
        index += 1;
      } else {
        blocks.push({ type: 'line', text: bracket.text, chords: bracket.chords });
      }
      continue;
    }

    const plainChords = chordTokens(line);
    let nextContentIndex = index + 1;
    while (nextContentIndex < lines.length && !lines[nextContentIndex].trim() && nextContentIndex - index <= 3) nextContentIndex += 1;
    if (plainChords.length && nextContentIndex < lines.length && !chordTokens(lines[nextContentIndex]).length && !isSixStringTab(lines, nextContentIndex)) {
      plainChords.forEach(chord => allChords.push(chord.raw));
      blocks.push({ type: 'line', text: lines[nextContentIndex], chords: plainChords });
      index = nextContentIndex;
      continue;
    }
    if (plainChords.length) {
      plainChords.forEach(chord => allChords.push(chord.raw));
      blocks.push({ type: 'line', text: '', chords: plainChords });
      continue;
    }
    blocks.push({ type: line.trim() ? 'text' : 'blank', text: line });
  }
  return { blocks, chords: [...new Set(allChords)] };
}

function appendChordRow(parent, chords, options) {
  if (!options.showChords || !chords.length) return;
  const row = document.createElement('div');
  row.className = 'chord-line';
  let cursor = 0;
  chords.forEach(({ raw, position }) => {
    const displayed = options.displayChord(raw);
    const gap = Math.max(position - cursor, cursor ? 1 : 0);
    if (gap) row.append(document.createTextNode(' '.repeat(gap)));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'acorde-compacto';
    button.textContent = displayed;
    button.setAttribute('aria-label', `Ver acorde ${displayed}`);
    button.addEventListener('click', () => options.onChordClick?.(displayed));
    row.append(button);
    cursor = Math.max(position, cursor + gap) + displayed.length;
  });
  parent.append(row);
}

function tabColumns(container) {
  const available = Math.max(220, container.clientWidth - 34);
  const fontSize = Number.parseFloat(getComputedStyle(container).fontSize) || 16;
  return Math.max(22, Math.min(52, Math.floor(available / (fontSize * .62)) - 2));
}

function renderTab(block, options, container) {
  const wrapper = document.createElement('section');
  wrapper.className = 'song-tab-block';
  const columns = tabColumns(container);
  const width = Math.max(block.width, 1);
  for (let start = 0; start < width; start += columns) {
    const size = Math.min(columns, width - start);
    const part = document.createElement('div');
    part.className = 'song-tab-fragment';
    if (options.showChords && block.header) {
      const header = document.createElement('div');
      header.className = 'song-tab-chords';
      const slicedChords = block.headerChords
        .filter(chord => chord.position >= start + 2 && chord.position < start + 2 + size)
        .map(chord => ({ ...chord, position: chord.position - start }));
      if (slicedChords.length) appendChordRow(header, slicedChords, options);
      part.append(header);
    }
    block.strings.forEach(string => {
      const row = document.createElement('div');
      row.className = 'song-tab-string';
      const content = string.content.padEnd(width, '-').slice(start, start + size).padEnd(size, '-');
      row.textContent = `${string.name}|${content}|`;
      part.append(row);
    });
    wrapper.append(part);
  }
  return wrapper;
}

export function renderSongContent(container, source, options = {}) {
  const parsed = parseSongContent(source);
  const settings = {
    showChords: options.showChords !== false,
    displayChord: options.displayChord || (value => value),
    onChordClick: options.onChordClick || null
  };
  const fragment = document.createDocumentFragment();
  let previousBlank = false;
  parsed.blocks.forEach(block => {
    if (block.type === 'tab') {
      fragment.append(renderTab(block, settings, container));
      previousBlank = false;
      return;
    }
    if (block.type === 'blank') {
      if (previousBlank) return;
      const blank = document.createElement('div');
      blank.className = 'lyrics-blank';
      fragment.append(blank);
      previousBlank = true;
      return;
    }
    previousBlank = false;
    const row = document.createElement('div');
    row.className = `lyrics-line${block.chords?.length ? ' has-chords' : ''}`;
    appendChordRow(row, block.chords || [], settings);
    const lyric = document.createElement('div');
    lyric.className = 'lyric-line';
    lyric.textContent = block.text || '\u00a0';
    row.append(lyric);
    fragment.append(row);
  });
  container.replaceChildren(fragment);
  return parsed.chords;
}

import { parseChord } from './chord-engine.js';

const BRACKET_CHORD = /\[([^\]\r\n]+)]/g;
const TAB_STRING = /^\s*([EBGDAe])\|([^|]*)\|\s*(\([^)]*\))?\s*$/;
const TAB_MARKER = /^\s*\[\[TAB:(.+?)]]\s*$/i;

function chordTokens(line) {
  const tokens = [];
  const pattern = /\S+/g;
  let match;
  let referenceNeedsNumber = false;
  while ((match = pattern.exec(line))) {
    const chord = parseChord(match[0]);
    const startsReference = /^(?:riff|tab)$/i.test(match[0]);
    const isReferenceNumber = referenceNeedsNumber && /^\d+$/i.test(match[0]);
    const isReference = startsReference || /^(?:riff|tab)[-_]?\d+$/i.test(match[0]) || /^\d+x$/i.test(match[0]) || isReferenceNumber;
    if (!chord && !isReference) return [];
    if (isReferenceNumber && tokens.at(-1)?.annotation) {
      tokens.at(-1).raw += ` ${match[0]}`;
    } else {
      tokens.push({ raw: match[0], position: match.index, annotation: !chord });
    }
    referenceNeedsNumber = startsReference;
  }
  return tokens;
}

function referenceKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function referenceLabel(value) {
  const match = String(value || '').match(/\b(riff|tab)\s*[-_ ]?\s*(\d+)\b/i);
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}` : String(value || '').trim();
}

function normalizedImportLine(value) {
  return String(value || '')
    .replace(/&nbsp;|&#x20;|&#32;/gi, ' ')
    .replace(/\u00a0/g, ' ');
}

function appendSplitChord(base, addition) {
  return `${base}${/[ \t]$/.test(base) ? '' : '  '}${addition}`;
}

function isSectionLine(value) {
  return /^\s*\[[^\]]+]\s*$/.test(value);
}

function isChordOrReferenceLine(value) {
  return chordTokens(value.trim()).length > 0 || /^\s*\(\s*(?:riff|tab)\b[^)]*\)\s*$/i.test(value);
}

/** Limpia el texto copiado desde sitios que duplican versos y separan acordes con líneas que empiezan en ">. */
export function normalizeImportedSong(source) {
  const rawLines = String(source || '').replace(/\r\n?/g, '\n').split('\n').map(normalizedImportLine);
  let detectedTone = '';
  let foundSplitLines = false;
  const lines = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const tone = line.match(/^\s*Tono\s*:\s*([A-G](?:#|b)?m?)\s*$/i);
    if (tone) {
      detectedTone ||= tone[1];
      continue;
    }
    const continuation = line.match(/^\s*["“”]?\s*>\s*(.+)$/);
    if (!continuation) {
      lines.push(line);
      continue;
    }
    foundSplitLines = true;

    const addition = continuation[1].trim();
    let previousIndex = lines.length - 1;
    while (previousIndex >= 0 && !lines[previousIndex].trim()) previousIndex -= 1;
    let nextIndex = index + 1;
    while (nextIndex < rawLines.length && !rawLines[nextIndex].trim()) nextIndex += 1;
    const previous = previousIndex >= 0 ? lines[previousIndex] : '';
    const next = nextIndex < rawLines.length ? rawLines[nextIndex] : '';

    let duplicatedLyricIndex = -1;
    if (next.trim() && !isChordOrReferenceLine(next) && !isSectionLine(next)) {
      for (let candidate = previousIndex; candidate >= 0; candidate -= 1) {
        if (lines[candidate].trim() === next.trim()) {
          duplicatedLyricIndex = candidate;
          break;
        }
      }
    }
    if (duplicatedLyricIndex >= 0) {
      let chordIndex = duplicatedLyricIndex - 1;
      while (chordIndex >= 0 && !lines[chordIndex].trim()) chordIndex -= 1;
      if (chordIndex >= 0 && isChordOrReferenceLine(lines[chordIndex])) {
        lines[chordIndex] = appendSplitChord(lines[chordIndex], addition);
      } else {
        lines.splice(duplicatedLyricIndex, 0, addition);
      }
      index = nextIndex;
      continue;
    }

    if (previousIndex >= 0 && isChordOrReferenceLine(previous)) {
      lines[previousIndex] = appendSplitChord(previous, addition);
    } else {
      lines.push(addition);
    }
  }
  let cleanedLines = lines;
  if (foundSplitLines) {
    cleanedLines = lines.filter((line, index) => line.trim() || (index > 0 && lines[index - 1].trim()));
    let changed = true;
    while (changed) {
      changed = false;
      for (let size = 1; size <= 6 && !changed; size += 1) {
        for (let start = size; start + size <= cleanedLines.length; start += 1) {
          const previousRun = cleanedLines.slice(start - size, start).map(value => value.trim());
          const nextRun = cleanedLines.slice(start, start + size).map(value => value.trim());
          if (previousRun.every((value, offset) => value === nextRun[offset]) && previousRun.some(Boolean)) {
            cleanedLines.splice(start, size);
            changed = true;
            break;
          }
        }
      }
    }
  }
  const text = cleanedLines.join('\n').replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '');
  return { text, tone: detectedTone };
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

function inferredTabTitle(block) {
  if (block?.type !== 'text') return '';
  const value = String(block.text || '').trim();
  if (!value || value.length > 50) return '';
  const letters = value.replace(/[^a-záéíóúüñ]/gi, '');
  const tabHeading = value.match(/^\[\s*Tab\s*-\s*(.+?)\s*]$/i);
  if (tabHeading) return tabHeading[1].trim();
  const looksLikeHeading = /:$/.test(value) || /^(intro|introducci[oó]n|riff|solo|puente|interludio|final|outro)(\b|\s)/i.test(value) || (letters && letters === letters.toUpperCase());
  return looksLikeHeading ? value.replace(/^\[|]$/g, '').replace(/:$/, '').trim() : '';
}

export function parseSongContent(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const allChords = [];
  let tabCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const standaloneReference = line.match(/^\s*\(\s*((?:riff|tab)\s*[-_ ]?\s*\d+)\s*\)\s*$/i);
    if (standaloneReference) {
      blocks.push({ type: 'reference', text: referenceLabel(standaloneReference[1]), reference: referenceKey(standaloneReference[1]) });
      continue;
    }
    const marker = line.match(TAB_MARKER);
    const markerTitle = marker?.[1]?.trim() || '';
    const contentIndex = marker ? index + 1 : index;
    const markerHeader = chordTokens(lines[contentIndex] || '');
    const markerTabStarts = isSixStringTab(lines, contentIndex);
    const markerTabAfterHeader = markerHeader.length > 0 && isSixStringTab(lines, contentIndex + 1);
    if (marker && (markerTabStarts || markerTabAfterHeader)) {
      const header = markerTabAfterHeader ? lines[contentIndex] : '';
      const start = markerTabAfterHeader ? contentIndex + 1 : contentIndex;
      const strings = lines.slice(start, start + 6).map(row => {
        const match = row.match(TAB_STRING);
        return { name: match[1], content: match[2], suffix: match[3] || '' };
      });
      const width = Math.max(...strings.map(row => row.content.length));
      markerHeader.forEach(chord => { if (!chord.annotation) allChords.push(chord.raw); });
      tabCount += 1;
      blocks.push({ type: 'tab', title: markerTitle || `Tablatura ${tabCount}`, header, headerChords: markerHeader, strings, width, sourceStart: index, sourceEnd: start + 5 });
      index = start + 5;
      continue;
    }
    const possibleHeader = chordTokens(line);
    const tabStarts = isSixStringTab(lines, index);
    const tabAfterHeader = possibleHeader.length > 0 && isSixStringTab(lines, index + 1);
    if (tabStarts || tabAfterHeader) {
      const header = tabAfterHeader ? line : '';
      const start = tabAfterHeader ? index + 1 : index;
      const strings = lines.slice(start, start + 6).map(row => {
        const match = row.match(TAB_STRING);
        return { name: match[1], content: match[2], suffix: match[3] || '' };
      });
      const width = Math.max(...strings.map(row => row.content.length));
      possibleHeader.forEach(chord => { if (!chord.annotation) allChords.push(chord.raw); });
      tabCount += 1;
      let titleLineIndex = index - 1;
      while (titleLineIndex >= 0 && !lines[titleLineIndex].trim()) titleLineIndex -= 1;
      const inferredTitle = inferredTabTitle({ type: 'text', text: lines[titleLineIndex] || '' });
      if (inferredTitle) {
        while (blocks.length && blocks.at(-1).type === 'blank') blocks.pop();
        if (blocks.length && blocks.at(-1).type === 'text' && blocks.at(-1).text === lines[titleLineIndex]) blocks.pop();
      }
      blocks.push({ type: 'tab', title: inferredTitle || `Tablatura ${tabCount}`, header, headerChords: possibleHeader, strings, width, sourceStart: inferredTitle ? titleLineIndex : index, sourceEnd: start + 5 });
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
      plainChords.forEach(chord => { if (!chord.annotation) allChords.push(chord.raw); });
      blocks.push({ type: 'line', text: lines[nextContentIndex], chords: plainChords });
      index = nextContentIndex;
      continue;
    }
    if (plainChords.length) {
      plainChords.forEach(chord => { if (!chord.annotation) allChords.push(chord.raw); });
      blocks.push({ type: 'line', text: '', chords: plainChords });
      continue;
    }
    blocks.push({ type: line.trim() ? 'text' : 'blank', text: line });
  }
  return { blocks, chords: [...new Set(allChords)] };
}

function scrollToTab(container, key) {
  const target = [...container.querySelectorAll('[data-tab-key]')].find(element => element.dataset.tabKey === key);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('song-tab-highlight');
  requestAnimationFrame(() => target.classList.add('song-tab-highlight'));
  window.setTimeout(() => target.classList.remove('song-tab-highlight'), 1500);
}

function makeReferenceButton(value, container, options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'song-musical-reference';
  button.textContent = referenceLabel(value);
  const key = referenceKey(value);
  button.setAttribute('aria-label', `Ir a la tablatura ${referenceLabel(value)}`);
  button.addEventListener('click', () => {
    if (typeof options.onTabReference === 'function') options.onTabReference(key);
    else scrollToTab(container, key);
  });
  return button;
}

function appendChordRow(parent, chords, options, container = parent.closest('.letra-content') || parent) {
  if (!options.showChords || !chords.length) return;
  const row = document.createElement('div');
  row.className = 'chord-line';
  let cursor = 0;
  chords.forEach(({ raw, position, annotation: isAnnotation }) => {
    const displayed = isAnnotation ? raw : options.displayChord(raw);
    const gap = Math.max(position - cursor, cursor ? 1 : 0);
    if (gap) row.append(document.createTextNode(' '.repeat(gap)));
    if (isAnnotation) {
      row.append(makeReferenceButton(raw, container, options));
    } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'acorde-compacto';
        button.textContent = displayed;
        button.setAttribute('aria-label', `Ver acorde ${displayed}`);
        button.addEventListener('click', () => options.onChordClick?.(displayed));
        row.append(button);
    }
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
  wrapper.dataset.tabKey = referenceKey(block.title);
  const summary = document.createElement('div');
  summary.className = 'song-tab-summary';
  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = block.title || 'Tablatura';
  const summaryMeta = document.createElement('span');
  summaryMeta.textContent = 'TAB';
  summary.append(summaryTitle, summaryMeta);
  wrapper.append(summary);
  const content = document.createElement('div');
  content.className = 'song-tab-content';
  content.hidden = options.tabMode !== 'expanded';
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
      if (slicedChords.length) appendChordRow(header, slicedChords, options, container);
      part.append(header);
    }
    block.strings.forEach(string => {
      const row = document.createElement('div');
      row.className = 'song-tab-string';
      const content = string.content.padEnd(width, '-').slice(start, start + size).padEnd(size, '-');
      row.textContent = `${string.name}|${content}|${start === 0 && string.suffix ? ` ${string.suffix}` : ''}`;
      part.append(row);
    });
    content.append(part);
  }
  wrapper.append(content);
  return wrapper;
}

export function renderSongContent(container, source, options = {}) {
  const parsed = parseSongContent(source);
  const settings = {
    showChords: options.showChords !== false,
    tabMode: options.tabMode === 'hidden' ? 'hidden' : 'expanded',
    displayChord: options.displayChord || (value => value),
    onChordClick: options.onChordClick || null,
    onTabReference: options.onTabReference || null
  };
  const fragment = document.createDocumentFragment();
  let previousBlank = false;
  parsed.blocks.forEach(block => {
    if (block.type === 'tab') {
      if (settings.tabMode !== 'hidden') fragment.append(renderTab(block, settings, container));
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
    if (block.type === 'reference') {
      const referenceRow = document.createElement('div');
      referenceRow.className = 'song-reference-line';
      referenceRow.append(makeReferenceButton(block.text, container, settings));
      fragment.append(referenceRow);
      previousBlank = false;
      return;
    }
    previousBlank = false;
    const row = document.createElement('div');
    row.className = `lyrics-line${block.chords?.length ? ' has-chords' : ''}`;
    const section = block.type === 'text' ? String(block.text || '').trim().match(/^\[([^\]]+)]$/) : null;
    if (section) row.classList.add('song-section-line');
    appendChordRow(row, block.chords || [], settings, container);
    const lyric = document.createElement('div');
    lyric.className = 'lyric-line';
    lyric.textContent = section ? section[1] : block.text || '\u00a0';
    row.append(lyric);
    fragment.append(row);
  });
  container.replaceChildren(fragment);
  return parsed.chords;
}

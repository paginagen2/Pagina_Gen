(function initPdvModel(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.PdvModel = model;
}(typeof window !== 'undefined' ? window : globalThis, function createPdvModel() {
  const MONTHS = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12'
  };

  function cleanText(value = '') {
    return String(value)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
  }

  function decodeEntities(value = '') {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const number = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : '';
      }
      return named[entity.toLowerCase()] ?? '';
    });
  }

  function stripHtml(value = '') {
    return cleanText(decodeEntities(value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')));
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeQuote(value = '') {
    return cleanText(value)
      .replace(/^[«“"]+/, '')
      .replace(/[»”"](?:\[\d+\])?\.?$/g, '')
      .trim();
  }

  function quoteKey(value = '') {
    return normalizeQuote(value).toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function extractParagraphsFromHtml(html = '') {
    const paragraphs = [];
    const blockPattern = /<(p|h[1-6]|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = blockPattern.exec(html))) {
      const inner = match[2].replace(/<img[^>]*>/gi, '');
      const text = stripHtml(inner);
      if (!text) continue;
      const compactInner = inner.trim();
      const allBold = /^<strong(?:\s[^>]*)?>[\s\S]*<\/strong>$/i.test(compactInner)
        && !/<\/strong>\s*[^<\s]/i.test(compactInner);
      paragraphs.push({ text, allBold, tag: match[1].toLowerCase() });
    }
    return paragraphs;
  }

  function monthPeriod(label = '') {
    const match = cleanText(label).toLocaleLowerCase('es').match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})/i);
    if (!match) return '';
    return `${match[2]}-${MONTHS[match[1]]}-01`;
  }

  function slugFromPeriod(period = '') {
    return period.match(/^\d{4}-\d{2}-\d{2}$/) ? `pdv_${period.slice(0, 7).replace('-', '_')}` : `pdv_${Date.now()}`;
  }

  function publicationDateForPeriod(period = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return null;
    const date = new Date(`${period}T00:00:00-03:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function pdvDate(value) {
    if (!value) return null;
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isAvailable(data = {}, now = new Date()) {
    if (!['publicado', 'programado'].includes(data.estado)) return false;
    const publicationDate = pdvDate(data.fechaPublicacion);
    return Boolean(publicationDate && publicationDate <= now);
  }

  function removeFootnoteMarkers(value = '') {
    return cleanText(value.replace(/\[\d+\]/g, ''));
  }

  function formatSource(value = '') {
    const source = cleanText(value)
      .replace(/\s*↑\s*$/, '')
      .replace(/\s+\.$/, '.');
    const classic = source.match(/^C\.\s*LUBICH,\s*Palabra de Vida(?:,|\s+de)?\s+(.+?)\.?$/i);
    if (classic) return `Chiara Lubich · Palabra de Vida, ${cleanText(classic[1]).replace(/\.$/, '')}`;
    const bibliography = source.match(/^LUBICH,\s*C\.\s*\((\d{4})\)\.\s*(.+?)(?:\.\s+[^.]+)?\.?$/i);
    if (bibliography) return `Chiara Lubich · ${cleanText(bibliography[2]).replace(/\.$/, '')}, ${bibliography[1]}`;
    return source;
  }

  function extractChiaraReflection(text = '', references = []) {
    if (!/Chiara Lubich/i.test(text)) return null;
    const footnote = text.match(/[»”"]\s*\[(\d+)\]/);
    const afterName = text.slice(text.search(/Chiara Lubich/i) + 'Chiara Lubich'.length);
    const quote = afterName.match(/[«“"]([\s\S]+)[»”"](?:\s*\[\d+\])?\.?$/);
    if (!quote) return null;
    const referenceIndex = footnote ? Number(footnote[1]) - 1 : -1;
    return {
      tipo: 'reflexion_autor',
      titulo: 'Escribe Chiara Lubich',
      texto: normalizeQuote(removeFootnoteMarkers(quote[1])),
      fuente: referenceIndex >= 0 ? formatSource(references[referenceIndex] || '') : ''
    };
  }

  function parseImportedHtml(html = '') {
    const paragraphs = extractParagraphsFromHtml(html);
    const titleIndex = paragraphs.findIndex(p => /^palabra de vida$/i.test(p.text));
    if (titleIndex >= 0) paragraphs.splice(titleIndex, 1);

    const monthIndex = paragraphs.findIndex(p => monthPeriod(p.text));
    const mes = monthIndex >= 0 ? paragraphs.splice(monthIndex, 1)[0].text : '';
    const periodo = monthPeriod(mes);

    const referenceIndex = paragraphs.findIndex(p => /^\([^)]+\)$/.test(p.text) && p.text.length < 80);
    let citaPrincipal = '';
    let citaReferencia = '';
    if (referenceIndex >= 0) {
      citaReferencia = paragraphs[referenceIndex].text.replace(/^\(|\)$/g, '').trim();
      let quoteStart = referenceIndex - 1;
      while (quoteStart > 0 && paragraphs[quoteStart - 1].allBold) quoteStart -= 1;
      const quoteParts = paragraphs.slice(quoteStart, referenceIndex).filter(item => item.allBold);
      if (quoteParts.length) {
        citaPrincipal = normalizeQuote(quoteParts.map(item => item.text).join(' '));
        paragraphs.splice(quoteStart, referenceIndex - quoteStart + 1);
      } else {
        paragraphs.splice(referenceIndex, 1);
      }
    }
    if (!citaPrincipal) {
      let quoteIndex = paragraphs.findIndex(p => p.allBold && p.text.length > 20);
      if (quoteIndex < 0) quoteIndex = paragraphs.findIndex(p => /^[«“"]/.test(p.text) && p.text.length > 20);
      citaPrincipal = quoteIndex >= 0 ? normalizeQuote(paragraphs.splice(quoteIndex, 1)[0].text) : '';
    }

    let autor = '';
    const authorIndex = paragraphs.findIndex(p => /equipo de (?:la )?palabra de vida/i.test(p.text));
    if (authorIndex >= 0) autor = paragraphs.splice(authorIndex, 1)[0].text;

    const references = paragraphs.filter(paragraph => paragraph.tag === 'li').map(paragraph => paragraph.text);
    const bloques = [];
    for (const paragraph of paragraphs) {
      if (paragraph.tag === 'li') continue;
      const originalText = cleanText(paragraph.text);
      const text = removeFootnoteMarkers(originalText);
      if (!text) continue;
      if (citaPrincipal && quoteKey(text) === quoteKey(citaPrincipal)) {
        bloques.push({ tipo: 'cita_destacada', texto: citaPrincipal });
        continue;
      }
      const chiaraReflection = extractChiaraReflection(originalText, references);
      if (chiaraReflection) {
        bloques.push(chiaraReflection);
        continue;
      }
      const authorReflection = originalText.match(/^Escribe\s+([^:]+):\s*[«“"]?([\s\S]+?)[»”"]?(?:\[\d+\])?\.?$/i);
      if (authorReflection) {
        const footnote = originalText.match(/[»”"]\s*\[(\d+)\]/);
        bloques.push({
          tipo: 'reflexion_autor',
          titulo: `Escribe ${cleanText(authorReflection[1])}`,
          texto: normalizeQuote(removeFootnoteMarkers(authorReflection[2])),
          fuente: footnote ? formatSource(references[Number(footnote[1]) - 1] || '') : ''
        });
        continue;
      }
      bloques.push({ tipo: 'parrafo', texto: text });
    }

    return { version: 2, mes, periodo, citaPrincipal, citaReferencia, bloques, autor };
  }

  function normalizeBlock(block = {}) {
    const allowed = ['parrafo', 'cita_destacada', 'cita_secundaria', 'reflexion_autor', 'conclusion'];
    return {
      tipo: allowed.includes(block.tipo) ? block.tipo : 'parrafo',
      texto: cleanText(block.texto),
      referencia: cleanText(block.referencia),
      titulo: cleanText(block.titulo),
      fuente: cleanText(block.fuente)
    };
  }

  function normalizeSavedBlocks(blocks = [], mainQuote = '') {
    const normalized = Array.isArray(blocks) ? blocks.map(normalizeBlock).filter(block => block.texto) : [];
    const references = normalized
      .filter(block => /\s↑\s*$/.test(block.texto) || /^(?:C\.\s*LUBICH|LUBICH,\s*C\.)/i.test(block.texto))
      .map(block => block.texto);
    const mainKey = quoteKey(mainQuote);
    const repaired = [];
    normalized.forEach((block, index) => {
      if (references.includes(block.texto)) return;
      if (block.tipo !== 'parrafo') {
        repaired.push(block);
        return;
      }
      const blockKey = quoteKey(block.texto);
      if (mainKey && blockKey === mainKey) {
        repaired.push({ ...block, tipo: 'cita_destacada', texto: mainQuote });
        return;
      }
      if (index === 0 && mainKey && blockKey.length > 20 && blockKey.length < mainKey.length && mainKey.endsWith(blockKey)) {
        return;
      }
      const reflection = extractChiaraReflection(block.texto, references);
      if (reflection) {
        repaired.push(reflection);
        return;
      }
      repaired.push({ ...block, texto: removeFootnoteMarkers(block.texto) });
    });
    return repaired;
  }

  function normalizePdv(data = {}) {
    const citaPrincipal = normalizeQuote(data.citaPrincipal);
    return {
      id: data.id || '',
      version: 2,
      mes: cleanText(data.mes),
      periodo: data.periodo || monthPeriod(data.mes),
      citaPrincipal,
      citaReferencia: cleanText(data.citaReferencia),
      bloques: normalizeSavedBlocks(data.bloques, citaPrincipal),
      autor: cleanText(data.autor) || 'Equipo de la Palabra de Vida',
      audioUrl: cleanText(data.audioUrl),
      audioPath: cleanText(data.audioPath),
      estado: ['publicado', 'programado'].includes(data.estado) ? data.estado : 'borrador',
      fechaPublicacion: data.fechaPublicacion || null
    };
  }

  function renderBlocks(blocks = []) {
    return blocks.map(block => {
      const item = normalizeBlock(block);
      const text = escapeHtml(item.texto);
      if (!text) return '';
      if (item.tipo === 'cita_destacada') {
        return `<aside class="pdv-highlight" aria-label="Cita para recordar"><p>${text}</p></aside>`;
      }
      if (item.tipo === 'cita_secundaria') {
        const reference = item.referencia ? ` (${escapeHtml(item.referencia)})` : '';
        return `<p class="pdv-paragraph">«${text}»${reference}</p>`;
      }
      if (item.tipo === 'reflexion_autor') {
        return `<aside class="pdv-author-reflection"><p class="pdv-reflection-label">${escapeHtml(item.titulo || 'Para profundizar')}</p><p>“${text}”</p>${item.fuente ? `<p class="pdv-reflection-source">${escapeHtml(item.fuente)}</p>` : ''}</aside>`;
      }
      const className = item.tipo === 'conclusion' ? 'pdv-paragraph pdv-conclusion' : 'pdv-paragraph';
      return `<p class="${className}">${text}</p>`;
    }).join('');
  }

  function renderArticle(data = {}, options = {}) {
    const pdv = normalizePdv(data);
    const archiveHref = options.archiveHref || 'pdv_todas.html';
    return `
      <article class="pdv-article">
        <header class="palabra-header pdv-hero">
          <p class="pdv-kicker">PALABRA DE VIDA</p>
          <h1>Palabra de Vida</h1>
          <p class="fecha-mes">${escapeHtml(pdv.mes)}</p>
        </header>
        <nav class="pdv-reader-nav" aria-label="Navegación de Palabra de Vida">
          <a href="${escapeHtml(archiveHref)}">← Ver otras publicaciones</a>
          <button type="button" data-pdv-share>Compartir</button>
        </nav>
        <section class="cita-principal pdv-main-quote" aria-labelledby="pdv-main-quote">
          <blockquote id="pdv-main-quote">«${escapeHtml(pdv.citaPrincipal)}»</blockquote>
          ${pdv.citaReferencia ? `<cite>${escapeHtml(pdv.citaReferencia)}</cite>` : ''}
        </section>
        ${pdv.audioUrl ? `<section class="audio-section pdv-audio" aria-label="Audio de la Palabra de Vida"><audio controls preload="metadata"><source src="${escapeHtml(pdv.audioUrl)}">Tu navegador no puede reproducir este audio.</audio></section>` : ''}
        <div class="palabra-contenido pdv-reading-body">${renderBlocks(pdv.bloques)}</div>
        <footer class="autor pdv-author"><p>${escapeHtml(pdv.autor)}</p></footer>
      </article>`;
  }

  return {
    cleanText,
    escapeHtml,
    extractParagraphsFromHtml,
    monthPeriod,
    slugFromPeriod,
    publicationDateForPeriod,
    pdvDate,
    isAvailable,
    parseImportedHtml,
    normalizePdv,
    renderBlocks,
    renderArticle
  };
}));

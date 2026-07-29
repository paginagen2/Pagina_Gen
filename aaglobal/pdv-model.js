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

  function splitInlineQuotes(text) {
    const output = [];
    const pattern = /[«“"]([^«»“”"]{8,})[»”"]\s*\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const before = cleanText(text.slice(lastIndex, match.index));
      if (before && !/^[,.;:!?]+$/.test(before)) output.push({ tipo: 'parrafo', texto: before });
      output.push({ tipo: 'cita_secundaria', texto: cleanText(match[1]), referencia: cleanText(match[2]) });
      lastIndex = pattern.lastIndex;
    }
    const after = cleanText(text.slice(lastIndex)).replace(/^[,.;:!?]+\s*/, '');
    if (after) output.push({ tipo: 'parrafo', texto: after[0].toLocaleUpperCase('es') + after.slice(1) });
    return output.length ? output : [{ tipo: 'parrafo', texto: cleanText(text) }];
  }

  function parseImportedHtml(html = '') {
    const paragraphs = extractParagraphsFromHtml(html);
    const titleIndex = paragraphs.findIndex(p => /^palabra de vida$/i.test(p.text));
    if (titleIndex >= 0) paragraphs.splice(titleIndex, 1);

    const monthIndex = paragraphs.findIndex(p => monthPeriod(p.text));
    const mes = monthIndex >= 0 ? paragraphs.splice(monthIndex, 1)[0].text : '';
    const periodo = monthPeriod(mes);

    let quoteIndex = paragraphs.findIndex(p => p.allBold && p.text.length > 30);
    if (quoteIndex < 0) quoteIndex = paragraphs.findIndex(p => /^[«“"]/.test(p.text) && p.text.length > 30);
    const citaPrincipal = quoteIndex >= 0 ? normalizeQuote(paragraphs.splice(quoteIndex, 1)[0].text) : '';

    const referenceIndex = paragraphs.findIndex(p => /^\([^)]+\)$/.test(p.text) && p.text.length < 80);
    const citaReferencia = referenceIndex >= 0
      ? paragraphs.splice(referenceIndex, 1)[0].text.replace(/^\(|\)$/g, '').trim()
      : '';

    let autor = '';
    const authorIndex = paragraphs.findIndex(p => /equipo de (?:la )?palabra de vida/i.test(p.text));
    if (authorIndex >= 0) autor = paragraphs.splice(authorIndex, 1)[0].text;

    const bloques = [];
    for (const paragraph of paragraphs) {
      const text = cleanText(paragraph.text);
      if (!text) continue;
      const sourceMatch = text.match(/^C\.\s*LUBICH,\s*Palabra de Vida,\s*(.+?)(?:\s*↑)?$/i);
      if (sourceMatch) {
        const reflection = bloques.find(block => block.tipo === 'reflexion_autor');
        if (reflection) reflection.fuente = `Chiara Lubich · Palabra de Vida, ${cleanText(sourceMatch[1])}`;
        continue;
      }
      if (citaPrincipal && quoteKey(text) === quoteKey(citaPrincipal)) {
        bloques.push({ tipo: 'cita_destacada', texto: citaPrincipal });
        continue;
      }
      const authorReflection = text.match(/^Escribe\s+([^:]+):\s*[«“"]?([\s\S]+?)[»”"]?\.?$/i);
      if (authorReflection) {
        bloques.push({
          tipo: 'reflexion_autor',
          titulo: `Escribe ${cleanText(authorReflection[1])}`,
          texto: normalizeQuote(authorReflection[2])
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

  function normalizePdv(data = {}) {
    return {
      id: data.id || '',
      version: 2,
      mes: cleanText(data.mes),
      periodo: data.periodo || monthPeriod(data.mes),
      citaPrincipal: cleanText(data.citaPrincipal),
      citaReferencia: cleanText(data.citaReferencia),
      bloques: Array.isArray(data.bloques) ? data.bloques.map(normalizeBlock).filter(b => b.texto) : [],
      autor: cleanText(data.autor) || 'Equipo de la Palabra de Vida',
      audioUrl: cleanText(data.audioUrl),
      audioPath: cleanText(data.audioPath),
      estado: data.estado === 'publicado' ? 'publicado' : 'borrador'
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
    parseImportedHtml,
    normalizePdv,
    renderBlocks,
    renderArticle
  };
}));

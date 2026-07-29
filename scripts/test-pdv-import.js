const mammoth = require('mammoth');
const PdvModel = require('../aaglobal/pdv-model.js');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Indicá la ruta de un archivo .docx.');

  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      ignoreEmptyParagraphs: true,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' }))
    }
  );
  const parsed = PdvModel.parseImportedHtml(result.value);
  const counts = parsed.bloques.reduce((summary, block) => {
    summary[block.tipo] = (summary[block.tipo] || 0) + 1;
    return summary;
  }, {});

  const assertions = [
    [parsed.mes === 'Junio 2026', `mes detectado: ${parsed.mes || 'vacío'}`],
    [parsed.periodo === '2026-06-01', `período detectado: ${parsed.periodo || 'vacío'}`],
    [/Por el camino/i.test(parsed.citaPrincipal), 'cita principal'],
    [/Mt\s*10/i.test(parsed.citaReferencia), 'referencia principal'],
    [(counts.cita_destacada || 0) === 3, `citas destacadas: ${counts.cita_destacada || 0}`],
    [(counts.cita_secundaria || 0) === 0, `citas secundarias destacadas: ${counts.cita_secundaria || 0}`],
    [(counts.reflexion_autor || 0) === 1, `reflexiones de autor: ${counts.reflexion_autor || 0}`],
    [/Chiara Lubich.+octubre de 1979/i.test(parsed.bloques.find(block => block.tipo === 'reflexion_autor')?.fuente || ''), 'fuente de Chiara'],
    [/Augusto Parody Reyes/i.test(parsed.autor), `autor: ${parsed.autor || 'vacío'}`]
  ];
  const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);
  if (failures.length) {
    console.error(JSON.stringify({ parsed, counts }, null, 2));
    throw new Error(`Falló la importación: ${failures.join('; ')}`);
  }
  console.log(JSON.stringify({
    mes: parsed.mes,
    periodo: parsed.periodo,
    referencia: parsed.citaReferencia,
    autor: parsed.autor,
    bloques: parsed.bloques.length,
    tipos: counts,
    avisosMammoth: result.messages.length
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

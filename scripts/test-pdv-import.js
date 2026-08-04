const path = require('node:path');
const mammoth = require('mammoth');
const PdvModel = require('../aaglobal/pdv-model.js');

const PROFILES = {
  '06': {
    mes: 'Junio 2026',
    periodo: '2026-06-01',
    cita: /Por el camino/i,
    referencia: /Mt\s*10/i,
    destacadas: 3,
    autor: /Augusto Parody Reyes/i,
    fuente: /Chiara Lubich.+octubre de 1979/i
  },
  '07': {
    mes: 'Julio 2026',
    periodo: '2026-07-01',
    cita: /Y el que la recibe.+que escucha la Palabra.+produce fruto/i,
    referencia: /Mt\s*13/i,
    destacadas: 2,
    autor: /Letizia Magri/i,
    fuente: /Chiara Lubich.+marzo de 2003/i
  },
  '08': {
    mes: 'Agosto 2026',
    periodo: '2026-08-01',
    cita: /Mi alma canta la grandeza del Señor/i,
    referencia: /Lc\s*1/i,
    destacadas: 3,
    autor: /Patrizia Mazzola/i,
    fuente: /Chiara Lubich.+Signo de contradicción.+1971/i
  }
};

async function importFile(filePath) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      ignoreEmptyParagraphs: true,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' }))
    }
  );
  return { result, parsed: PdvModel.parseImportedHtml(result.value) };
}

function validate(filePath, parsed) {
  const monthCode = path.basename(filePath).match(/PV-(\d{2})-/i)?.[1];
  const profile = PROFILES[monthCode];
  if (!profile) throw new Error(`No hay un perfil de prueba para ${path.basename(filePath)}.`);
  const counts = parsed.bloques.reduce((summary, block) => {
    summary[block.tipo] = (summary[block.tipo] || 0) + 1;
    return summary;
  }, {});
  const reflection = parsed.bloques.find(block => block.tipo === 'reflexion_autor');
  const visibleText = parsed.bloques.map(block => block.texto).join(' ');
  const assertions = [
    [parsed.mes === profile.mes, `mes detectado: ${parsed.mes || 'vacío'}`],
    [parsed.periodo === profile.periodo, `período detectado: ${parsed.periodo || 'vacío'}`],
    [profile.cita.test(parsed.citaPrincipal), `cita principal: ${parsed.citaPrincipal}`],
    [profile.referencia.test(parsed.citaReferencia), `referencia: ${parsed.citaReferencia}`],
    [(counts.cita_destacada || 0) === profile.destacadas, `citas destacadas: ${counts.cita_destacada || 0}`],
    [(counts.cita_secundaria || 0) === 0, `citas secundarias destacadas: ${counts.cita_secundaria || 0}`],
    [(counts.reflexion_autor || 0) === 1, `reflexiones de autor: ${counts.reflexion_autor || 0}`],
    [profile.fuente.test(reflection?.fuente || ''), `fuente de Chiara: ${reflection?.fuente || 'vacía'}`],
    [profile.autor.test(parsed.autor), `autor: ${parsed.autor || 'vacío'}`],
    [!/\[\d+\]|(?:^|\s)↑(?:\s|$)/.test(visibleText), 'quedaron llamadas o flechas de notas'],
    [!parsed.bloques.some(block => /^C\.\s*LUBICH|^LUBICH,\s*C\./i.test(block.texto)), 'quedó bibliografía cruda como párrafo']
  ];
  const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);
  if (failures.length) throw new Error(`${path.basename(filePath)}: ${failures.join('; ')}`);
  return counts;
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Indicá al menos un archivo .docx.');
  for (const filePath of files) {
    const { result, parsed } = await importFile(filePath);
    const counts = validate(filePath, parsed);
    console.log(JSON.stringify({
      archivo: path.basename(filePath),
      mes: parsed.mes,
      cita: parsed.citaPrincipal,
      referencia: parsed.citaReferencia,
      autor: parsed.autor,
      bloques: parsed.bloques.length,
      tipos: counts,
      avisosMammoth: result.messages.length
    }, null, 2));
  }

  const repaired = PdvModel.normalizePdv({
    mes: 'Julio 2026',
    citaPrincipal: '“Y el que la recibe en tierra fértil es el hombre que escucha la Palabra y la comprende. Este produce fruto."',
    citaReferencia: 'Mt 13, 23',
    bloques: [
      { tipo: 'parrafo', texto: 'que escucha la Palabra y la comprende. Este produce fruto.”' },
      { tipo: 'parrafo', texto: '“Y el que la recibe en tierra fértil es el hombre que escucha la Palabra y la comprende. Este produce fruto.”' },
      { tipo: 'parrafo', texto: 'Las palabras de Dios, como escribe Chiara Lubich, “son luz, amor y vida”[1].' },
      { tipo: 'parrafo', texto: 'C. LUBICH, Palabra de Vida de marzo de 2003. ↑' }
    ]
  });
  const repairedReflection = repaired.bloques.find(block => block.tipo === 'reflexion_autor');
  if (repaired.citaPrincipal.endsWith('"')
      || repaired.bloques.some(block => /^que escucha la Palabra/i.test(block.texto))
      || repaired.bloques.filter(block => block.tipo === 'cita_destacada').length !== 1
      || repairedReflection?.texto !== 'Las palabras de Dios son luz, amor y vida'
      || !/marzo de 2003/i.test(repairedReflection?.fuente || '')) {
    throw new Error('Falló la reparación automática de una publicación ya guardada.');
  }
  console.log('Reparación automática de publicaciones guardadas: correcta');

  const repairedSavedReflection = PdvModel.normalizePdv({
    bloques: [{
      tipo: 'reflexion_autor',
      titulo: 'Escribe Chiara Lubich',
      texto: 'son luz, amor y vida',
      fuente: 'Chiara Lubich · Palabra de Vida, marzo de 2003'
    }]
  });
  if (repairedSavedReflection.bloques[0]?.texto !== 'Las palabras de Dios son luz, amor y vida') {
    throw new Error('Falló la reparación del bloque de Chiara ya guardado en julio.');
  }
  console.log('Bloque de Chiara guardado en julio: reparado');

  const augustPublication = PdvModel.publicationDateForPeriod('2026-08-01');
  const scheduled = { estado: 'programado', fechaPublicacion: augustPublication };
  if (augustPublication?.toISOString() !== '2026-08-01T03:00:00.000Z'
      || PdvModel.isAvailable(scheduled, new Date('2026-08-01T02:59:59.999Z'))
      || !PdvModel.isAvailable(scheduled, new Date('2026-08-01T03:00:00.000Z'))) {
    throw new Error('Falló la programación a medianoche de Argentina.');
  }
  console.log('Programación mensual a las 00:00 de Argentina: correcta');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const file = process.argv[2];

if (!file) {
  console.error('Indicá el archivo de módulo que querés verificar.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
  input: readFileSync(file, 'utf8'),
  encoding: 'utf8'
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);

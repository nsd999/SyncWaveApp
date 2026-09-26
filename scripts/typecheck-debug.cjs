const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

fs.mkdirSync('public', { recursive: true });

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--no-install', 'tsc', '--noEmit', '--pretty', 'false'],
  { encoding: 'utf8', shell: false }
);

const report = [
  'SyncWave temporary TypeScript diagnostic',
  `exitCode=${result.status ?? 'null'} signal=${result.signal ?? 'none'}`,
  '',
  result.stdout || '',
  result.stderr || ''
].join('\n');

fs.writeFileSync('public/typecheck-report.txt', report, 'utf8');
console.log(report);
process.exit(0);

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const [from, to] = process.argv.slice(2).filter(a => /^\d{8}$/.test(a));
if (!from || !to) {
  console.error('사용법: node localdata_apicollect/main.js <시작일YYYYMMDD> <종료일YYYYMMDD>');
  console.error('  예시: node localdata_apicollect/main.js 20250101 20250201');
  process.exit(1);
}

const run = (script, ...args) => {
  execSync(
    `node ${path.join(__dirname, script)} ${args.join(' ')}`,
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
  );
};

console.log('=== [1/2] 수집 ===');
run('collect.js', from, to);

console.log('\n=== [2/2] 병합 ===');
run('merge.js', `${from}_${to}`);

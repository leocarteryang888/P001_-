const fs = require('node:fs');
const path = require('node:path');

function readFinalWorkbenchSource() {
  const moduleRoot = path.resolve(__dirname, '../../');
  const html = fs.readFileSync(path.join(moduleRoot, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']\/src\/03-整机选型工作台\/([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);
  const assets = refs.map(relative => {
    const file = path.resolve(moduleRoot, relative);
    if (!file.startsWith(moduleRoot + path.sep)) throw new Error(`Unexpected workbench source reference: ${relative}`);
    return fs.readFileSync(file, 'utf8');
  });
  return `${html}\n${assets.join('\n')}`;
}

module.exports = { readFinalWorkbenchSource };

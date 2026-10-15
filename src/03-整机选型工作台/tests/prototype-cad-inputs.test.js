const fs = require('fs');
const source = fs.readFileSync('src/03-整机选型工作台/js/prototype-cad-inputs.js', 'utf8');
if (!source.includes('G(s,false)') || !source.includes("face:''")) throw new Error('CAD render must be side-effect free and additions must require explicit face');
if (!source.includes("item.enabled = input.checked") && !source.includes('x.enabled=f.checked')) throw new Error('CAD enabled switch missing');
if (!source.includes("f.value===''?'':+f.value")) throw new Error('CAD zero offsets must remain numeric');
console.log('prototype-cad-inputs contract passed');

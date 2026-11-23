import {readFile,mkdir,writeFile} from 'node:fs/promises';
// Offline, dependency-free ES module flattening for the known WorkPulse source graph.
// Fail rather than silently bundling unsupported import/export syntax.
const ordered=['src/utils.js','src/data.js','src/icons.js','src/cloud.js','src/admin.js','src/reports.js','src/xlsx.js','src/report-ui.js','src/quick-entry.js','src/review-ui.js','src/app.js'];
let js='';
for (const name of ordered){
 let source=await readFile(name,'utf8');
 source=source.replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*$/gm,'');
 if (/^\s*import\s/m.test(source)) throw Error('Unsupported import in '+name);
 source=source.replace(/^export (async function|function|const|class) /gm,'$1 ');
 if (/^\s*export\s/m.test(source)) throw Error('Unsupported export in '+name);
 js+='\n// '+name+'\n'+source+'\n';
}
if (/<\/script\s*>/i.test(js)) throw Error('Unexpected script terminator in source');
const index=await readFile('index.html','utf8');
const css=await readFile('styles.css','utf8');
const html=index.replace(/\s*<link rel="icon"[^>]*>/,'')
 .replace(/<link rel="stylesheet"[^>]*>/,()=>`<style>\n${css}\n</style>`)
 .replace(/<script type="module"[^>]*><\/script>/,'')
 .replace('</body>',()=>`<script>\n${js}\n</script>\n</body>`);
if (html===index || html.includes('type="module"')) throw Error('Apps Script HTML template transformation failed');
await mkdir('dist-gas',{recursive:true});
await writeFile('dist-gas/Index.html',html);
await writeFile('dist-gas/Code.gs',await readFile('apps-script/Code.gs','utf8'));
await writeFile('dist-gas/Review.gs',await readFile('apps-script/Review.gs','utf8'));
await writeFile('dist-gas/appsscript.json',await readFile('apps-script/appsscript.json','utf8'));
console.log('Built dist-gas: Index.html + Code.gs + Review.gs + appsscript.json');

import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
// WorkPulse v0.8: produce physically separate public and administrator Apps Script projects.
// The public deployment MUST NOT include Owner.gs or the old Code.gs / Review.gs.
const ordered=['src/utils.js','src/data.js','src/icons.js','src/cloud.js','src/admin.js',
 'src/reports.js','src/xlsx.js','src/report-ui.js','src/quick-entry.js','src/attendance.js','src/attendance-state.js','src/attendance-ui.js','src/app.js'];
let js='';
for(const name of ordered){
 let source=await readFile(name,'utf8');
 source=source.replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*$/gm,'');
 if(/^\s*import\s/m.test(source))throw Error('Unsupported import in '+name);
 source=source.replace(/^export (async function|function|const|class) /gm,'$1 ');
 if(/^\s*export\s/m.test(source))throw Error('Unsupported export in '+name);
 js+='\n// '+name+'\n'+source+'\n';
}
if(/<\/script\s*>/i.test(js))throw Error('Unexpected script terminator');
const html=await readFile('index.html','utf8'),css=await readFile('styles.css','utf8');
const manifest=await readFile('apps-script/appsscript.json','utf8');
const core=await readFile('apps-script/Core.gs','utf8');
const monthly=await readFile('apps-script/Monthly.gs','utf8');
const simple=await readFile('apps-script/Simple.gs','utf8');
const owner=await readFile('apps-script/Owner.gs','utf8');
const attendance=await readFile('apps-script/Attendance.gs','utf8');
const attendanceSave=await readFile('apps-script/AttendanceSave.gs','utf8');
const attendanceOwner=await readFile('apps-script/OwnerAttendance.gs','utf8');
if(/function\s+wpOwner(?:Bootstrap|SaveEmployee|DeleteJournal)\s*\(/.test(core+'\n'+monthly+'\n'+simple))
 throw Error('Owner API accidentally included in public backend');
// Always remove old build outputs, preventing stale privileged files in a public bundle.
await rm('dist-gas',{recursive:true,force:true});
for(const [portal,isOwner] of [['public',false],['admin',true]]){
 const directory='dist-gas/'+portal;
 await mkdir(directory,{recursive:true});
 let output=html.replace(/\s*<link rel="icon"[^>]*>/,'')
   .replace(/<link rel="stylesheet"[^>]*>/,()=>'<style>\n'+css+'\n</style>')
   .replace(/<script type="module"[^>]*><\/script>/,'');
 output=output.replace('</body>',()=>{
   const guard=isOwner?'<script>window.WORKPULSE_ADMIN_PORTAL=true;</script>\n':'';
   return guard+'<script>\n'+js+'\n</script>\n</body>';
 });
 if(output===html||output.includes('type="module"'))throw Error('HTMLService transformation failed');
 await Promise.all([
   writeFile(directory+'/Index.html',output),
   writeFile(directory+'/Core.gs',core),
   writeFile(directory+'/Monthly.gs',monthly),
   writeFile(directory+'/Simple.gs',simple),
   writeFile(directory+'/Attendance.gs',attendance),
   writeFile(directory+'/AttendanceSave.gs',attendanceSave),
   writeFile(directory+'/appsscript.json',manifest)
 ]);
 if(isOwner){await writeFile(directory+'/Owner.gs',owner);
  await writeFile(directory+'/OwnerAttendance.gs',attendanceOwner);}
}
console.log('Built dist-gas/public (no admin endpoints) and dist-gas/admin (owner-only endpoints).');

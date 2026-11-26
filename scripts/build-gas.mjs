import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
// WorkPulse v0.8: produce physically separate public and administrator Apps Script projects.
// The public deployment MUST NOT include Owner.gs or the old Code.gs / Review.gs.
const ordered=['src/shared/utils.js','src/features/journals/data.js','src/features/journals/history-query.js','src/features/journals/migration-package.js','src/features/journals/categories.js','src/shared/icons.js','src/app/navigation.js','src/app/person.js','src/app/mobile-workflow.js','src/app/pwa-ui.js','src/app/loading.js','src/services/cloud.js','src/services/offline-vault.js','src/services/field-recovery.js','src/features/admin/rename.js','src/features/admin/admin.js','src/features/admin/migration-review.js',
 'src/features/reports/reports.js','src/features/reports/periods.js','src/shared/xlsx.js','src/features/reports/report-ui.js','src/features/journals/quick-entry.js','src/features/journals/description-memory.js','src/features/attendance/attendance.js','src/features/attendance/calendar.js','src/features/payroll/payroll.js','src/features/payroll/payroll-xlsx.js','src/features/attendance/attendance-draft.js','src/features/attendance/attendance-state.js','src/features/attendance/attendance-ui.js','src/features/payroll/payroll-ui.js','src/app/attendance-lifecycle.js','src/app/main.js'];
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
const html=await readFile('index.html','utf8');
// HTMLService embeds the same CSS layers in browser cascade order; no @import at runtime.
const styleFiles=["styles/base.css","styles/cloud.css","styles/admin.css","styles/reports.css","styles/stability.css","styles/legacy-review.css","styles/attendance.css","styles/payroll.css","styles/field-mobile.css"];
const css=(await Promise.all(styleFiles.map(path=>readFile(path,'utf8')))).join('\n');
const manifest=await readFile('apps-script/appsscript.json','utf8');
const core=await readFile('apps-script/shared/Core.gs','utf8');
const monthly=await readFile('apps-script/shared/Monthly.gs','utf8');
const simple=await readFile('apps-script/journals/Simple.gs','utf8');
const owner=await readFile('apps-script/admin/Owner.gs','utf8');
const ownerProjects=await readFile('apps-script/admin/OwnerProjects.gs','utf8');
const ownerCategories=await readFile('apps-script/admin/OwnerCategories.gs','utf8');
const attendance=await readFile('apps-script/attendance/Attendance.gs','utf8');
const attendanceSave=await readFile('apps-script/attendance/AttendanceSave.gs','utf8');
const attendanceRange=await readFile('apps-script/attendance/AttendanceRange.gs','utf8');
const attendanceOwner=await readFile('apps-script/admin/OwnerAttendance.gs','utf8');
if(/function\s+(?:workPulse(?:Initialize|InitializationCheck|DeploymentCheck|CompareRestoredMonth|InstallDailyBackup|RemoveDailyBackup|VerifyMonthFiles)|wpOwner(?:Bootstrap|Maintenance|MonthIntegrity|MigrationPreflight|RecoveryPreview|BackupWorkbook|SaveEmployee|DeleteJournal|AttendanceConfig|SaveAttendanceConfig))\s*\(/.test(core+'\n'+monthly+'\n'+simple+'\n'+attendance+'\n'+attendanceSave))
 throw Error('Owner API accidentally included in public backend');
// Always remove old build outputs, preventing stale privileged files in a public bundle.
await rm('dist-gas',{recursive:true,force:true});
for(const [portal,isOwner] of [['public',false],['admin',true],['unified',false]]){
 const unified=portal==='unified';
 const directory='dist-gas/'+portal;
 await mkdir(directory,{recursive:true});
 let output=html.replace('<!-- WORKPULSE_PWA_BUILD -->','')
   .replace(/\s*<link rel="icon"[^>]*>/,'')
   .replace(/<link rel="stylesheet"[^>]*>/,()=>'<style>\n'+css+'\n</style>')
   .replace(/<script type="module"[^>]*><\/script>/,'');
 output=output.replace('</body>',()=>{
   const guard=unified?'<script>window.WORKPULSE_UNIFIED_PORTAL=true;</script>\n':isOwner?'<script>window.WORKPULSE_ADMIN_PORTAL=true;</script>\n':'';
   return guard+'<script>\n'+js+'\n</script>\n</body>';
 });
 if(output===html||output.includes('type="module"'))throw Error('HTMLService transformation failed');
 if(unified){
  const code="var WP_PORTAL_KIND='unified';\n"+[core,monthly,simple,attendance,attendanceSave,attendanceRange,owner,ownerCategories,ownerProjects,attendanceOwner].join('\n\n');
  // Any newly exposed RPC must be deliberately audited. Trailing underscore functions are private.
  const names=[...code.matchAll(/^function\s+(\w+)\s*\(/gm)].map(x=>x[1]);
  const expected=['doGet','wpSharedBootstrap','wpSharedLoadMonth','wpSharedSaveJournal','wpSharedQueryReport','wpAttendanceLoad','wpAttendanceSave','wpAttendanceRange','wpOwnerBootstrap','wpOwnerSaveEmployee','wpOwnerDeleteJournal','workPulseInitialize','workPulseMigrateLegacy','wpOwnerMaintenance','wpOwnerBackupWorkbook','wpOwnerRecoveryPreview','workPulseInstallDailyBackup','workPulseRemoveDailyBackup','workPulsePauseFieldWrites','workPulseResumeFieldWrites','workPulseDeploymentCheck','workPulseVerifyMonthFiles','wpOwnerMigrationPreflight','workPulseInitializationCheck','wpOwnerMonthIntegrity','workPulseCompareRestoredMonth','wpOwnerSaveCategories','wpOwnerSaveProject','wpOwnerAttendanceConfig','wpOwnerSaveAttendanceConfig','workPulseUpgradeAttendance','wpOwnerSaveAttendanceSchedule'];
  if(new Set(names).size!==names.length||JSON.stringify(names.filter(n=>!n.endsWith('_')).sort())!==JSON.stringify(expected.sort()))throw Error('Unified exposed function inventory changed; audit before release');
  await Promise.all([writeFile(directory+'/Code.gs',code),writeFile(directory+'/Index.html',output),writeFile(directory+'/appsscript.json',JSON.stringify({...JSON.parse(manifest),oauthScopes:[...JSON.parse(manifest).oauthScopes,'https://www.googleapis.com/auth/script.scriptapp']},null,2)+'\n')]);
  continue;
 }
 await Promise.all([
   writeFile(directory+'/Index.html',output),
   writeFile(directory+'/Core.gs',"var WP_PORTAL_KIND='"+(isOwner?'admin':'public')+"';\n"+core),
   writeFile(directory+'/Monthly.gs',monthly),
   writeFile(directory+'/Simple.gs',simple),
   writeFile(directory+'/Attendance.gs',attendance),
   writeFile(directory+'/AttendanceSave.gs',attendanceSave),
   writeFile(directory+'/AttendanceRange.gs',attendanceRange),
   writeFile(directory+'/appsscript.json',isOwner?JSON.stringify({...JSON.parse(manifest),oauthScopes:[...JSON.parse(manifest).oauthScopes,'https://www.googleapis.com/auth/script.scriptapp']},null,2)+'\n':manifest)
 ]);
 if(isOwner){await writeFile(directory+'/OwnerCategories.gs',ownerCategories);
  await writeFile(directory+'/OwnerProjects.gs',ownerProjects);
  await writeFile(directory+'/Owner.gs',owner);
  await writeFile(directory+'/OwnerAttendance.gs',attendanceOwner);}
}
console.log('Built dist-gas/public (no admin endpoints) and dist-gas/admin (owner-only endpoints).');

console.log('Built dist-gas/unified (3 files; domain-only, primary-owner administration).');

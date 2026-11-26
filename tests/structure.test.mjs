import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');
const present=path=>existsSync(resolve(root,path));

test('front-end source files are categorized by responsibility',()=>{
 const expected=[
  'src/app.js','src/app/main.js','src/app/attendance-lifecycle.js',
  'src/shared/utils.js','src/shared/icons.js','src/shared/xlsx.js',
  'src/services/cloud.js',
  'src/features/journals/data.js','src/features/journals/quick-entry.js',
  'src/features/attendance/attendance.js',
  'src/features/attendance/attendance-state.js','src/features/attendance/attendance-ui.js',
  'src/features/payroll/payroll.js','src/features/payroll/payroll-ui.js',
  'src/features/payroll/payroll-xlsx.js',
  'src/features/reports/reports.js','src/features/reports/report-ui.js',
  'src/features/admin/admin.js'
 ];
 for(const path of expected)assert.ok(present(path),'Missing '+path);
 for(const old of ['src/data.js','src/attendance-ui.js','src/attendance-state.js',
    'src/payroll.js','src/cloud.js','src/admin.js','src/xlsx.js'])
  assert.equal(present(old),false,'Old flat source remains: '+old);
});
test('CSS browser imports and Apps Script inline CSS have identical ordering',()=>{
 const manifest=read('styles/index.css');
 const filenames=[...manifest.matchAll(/@import url\("\.\/([^"]+)"\);/g)].map(x=>x[1]);
 assert.deepEqual(filenames,[
  'base.css','cloud.css','admin.css','reports.css','stability.css',
  'legacy-review.css','attendance.css','payroll.css','field-mobile.css'
 ]);
 const gas=read('scripts/build-gas.mjs');
 const declared=gas.match(/const styleFiles=(\[[^\]]+\]);/);
 assert.ok(declared,'Missing CSS order declaration');
 assert.deepEqual(JSON.parse(declared[1]),filenames.map(x=>'styles/'+x));
 assert.match(read('index.html'),/styles\/index\.css/);
 assert.match(read('scripts/build.mjs'),/'styles'/);
});
test('Apps Script public/private and legacy sources remain physically isolated',()=>{
 const required=[
  'apps-script/shared/Core.gs','apps-script/shared/Monthly.gs',
  'apps-script/journals/Simple.gs',
  'apps-script/attendance/Attendance.gs','apps-script/attendance/AttendanceSave.gs',
  'apps-script/attendance/AttendanceRange.gs',
  'apps-script/admin/Owner.gs','apps-script/admin/OwnerCategories.gs','apps-script/admin/OwnerProjects.gs','apps-script/admin/OwnerAttendance.gs',
  'apps-script/legacy/Code.gs','apps-script/legacy/Review.gs'
 ];
 for(const path of required)assert.ok(present(path),'Missing '+path);
 for(const old of ['apps-script/Core.gs','apps-script/Monthly.gs','apps-script/Owner.gs',
  'apps-script/AttendanceSave.gs','apps-script/Code.gs'])
   assert.equal(present(old),false,'Old flat source remains: '+old);
 const gas=read('scripts/build-gas.mjs');
 assert.match(gas,/apps-script\/admin\/Owner\.gs/);
 assert.match(gas,/apps-script\/admin\/OwnerProjects\.gs/);
 assert.match(gas,/apps-script\/admin\/OwnerCategories\.gs/);
 assert.match(read('apps-script/shared/Core.gs'),/function wsCategories_/);
 assert.doesNotMatch(read('apps-script/admin/OwnerCategories.gs'),/function wsCategories_/);
 assert.match(read('apps-script/admin/OwnerCategories.gs'),/function wpOwnerSaveCategories/);
 assert.match(gas,/if\(isOwner\)/);
 assert.doesNotMatch(gas,/readFile\('apps-script\/legacy\/(?:Code|Review)\.gs'/);
});


test('Excel export interaction module is loaded by both browser and GAS entries',()=>{
 assert.match(read('src/app.js'),/import ['"]\.\/features\/payroll\/payroll-ui\.js['"]/);
 assert.match(read('scripts/build-gas.mjs'),/src\/features\/payroll\/payroll-ui\.js/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {shouldLoadAttendance,activateAttendance} from '../src/app/attendance-lifecycle.js';

test('attendance activation is permitted on local landing and after cloud bootstrap only',()=>{
 assert.equal(shouldLoadAttendance({view:'attendance',isCloud:false,cloudPhase:'local'}),true);
 assert.equal(shouldLoadAttendance({view:'attendance',isCloud:true,cloudPhase:'loading'}),false);
 assert.equal(shouldLoadAttendance({view:'attendance',isCloud:true,cloudPhase:'ready'}),true);
 assert.equal(shouldLoadAttendance({view:'overview',isCloud:false,cloudPhase:'local'}),false);
});
test('activation shows the loading state and repaints only while route remains active',async()=>{
 const events=[];
 let complete;
 const pending=new Promise(resolve=>{complete=resolve;});
 const job=activateAttendance({
  isActive:()=>true,
  load:()=>{events.push('loading');return pending;},
  render:()=>events.push('paint')
 });
 assert.deepEqual(events,['loading','paint']);
 complete();
 assert.equal(await job,true);
 assert.deepEqual(events,['loading','paint','paint']);
});
test('when user navigates away, pending attendance request does not repaint another page',async()=>{
 let complete;
 const pending=new Promise(resolve=>complete=resolve);
 let current=true,paints=0;
 const job=activateAttendance({isActive:()=>current,load:()=>pending,render:()=>paints++});
 current=false;complete();
 await job;
 assert.equal(paints,1);
});

function runBoot(mode){
 const code=String.raw`
  const root={innerHTML:'',addEventListener(){}};
  const storage=new Map();
  const store={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),
   removeItem:k=>storage.delete(k)};
  globalThis.localStorage=store;
  globalThis.sessionStorage=store;
  globalThis.location={hash:'#/attendance'};
  globalThis.window={addEventListener(){},scrollTo(){},sessionStorage:store,localStorage:store};
  globalThis.document={
    querySelector:selector=>selector==='#app'?root:null,
    querySelectorAll:()=>[],
    addEventListener(){},
    createElement(){return {innerHTML:'',style:{},addEventListener(){}};}
  };
  globalThis.confirm=()=>true;globalThis.alert=()=>{};
  if(process.env.WP_CLOUD_BOOT==='true'){
   const runner={
    withSuccessHandler(fn){this.success=fn;return this;},
    withFailureHandler(fn){this.failure=fn;return this;},
    wpSharedBootstrap(){this.success({store:{
      employees:[{id:'a',name:'測試員工',active:true}],projects:[],journals:[],mode:'cloud'
     },user:{name:'員工',email:'sample@example.com',role:'staff',canWriteIds:['a']}});},
    wpAttendanceLoad(){this.success({rows:[],expectedDays:null});}
   };
   globalThis.google={script:{run:runner}};
  }
  await import('./src/app.js');
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  if(root.innerHTML.includes('正在讀取出勤資料'))throw Error('Attendance page remained in loading state');
  if(!root.innerHTML.includes('每日出勤登記'))throw Error('Attendance form did not render after direct refresh');
  console.log('DIRECT_ATTENDANCE_BOOT_OK');
 `;
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 return spawnSync(process.execPath,['--input-type=module','-e',code],{
  cwd,encoding:'utf8',timeout:12000,env:{...process.env,WP_CLOUD_BOOT:mode==='cloud'?'true':'false'}
 });
}
test('a fresh reload at #/attendance loads the local demo without navigating away',()=>{
 const result=runBoot('local');
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/DIRECT_ATTENDANCE_BOOT_OK/);
});
test('a fresh reload at #/attendance waits for cloud bootstrap and then renders records',()=>{
 const result=runBoot('cloud');
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/DIRECT_ATTENDANCE_BOOT_OK/);
});

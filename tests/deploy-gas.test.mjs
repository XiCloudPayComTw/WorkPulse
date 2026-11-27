import test from 'node:test';
import assert from 'node:assert/strict';
import {deployGas,readDeployConfig,gasApi} from '../scripts/deploy-gas.mjs';
const c={scriptId:'test-script-id',deploymentId:'AKfy-test-deployment',projectTitle:'WorkPulse — Admin TEST',access:'DOMAIN',expectedVersion:3,action:'release',commit:'a'.repeat(40)};
const web={access:'DOMAIN',executeAs:'USER_DEPLOYING'};
const manifest={timeZone:'Asia/Taipei',runtimeVersion:'V8',oauthScopes:['scope']};
function files(value,config){return [{name:'Code',type:'SERVER_JS',source:"var WP_PORTAL_KIND='unified';\n"+value},{name:'Index',type:'HTML',source:'WORKPULSE_UNIFIED_PORTAL=true;'+value},{name:'appsscript',type:'JSON',source:JSON.stringify(config)}];}
function harness(){
 let head=files('old',{...manifest,webapp:web}),published=structuredClone(head),version=3,newVersion;
 const calls=[],logs=[];
 const d=()=>({deploymentId:c.deploymentId,deploymentConfig:{scriptId:c.scriptId,versionNumber:version,manifestFileName:'appsscript',description:'TEST'},entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/'+c.deploymentId+'/exec',entryPointConfig:web}}]});
 const api=async(method,path,body)=>{
  calls.push({method,path,body});
  if(path.endsWith('/deployments/'+c.deploymentId)){if(method==='PUT'){assert.equal(body.deploymentConfig.description,'TEST');version=body.deploymentConfig.versionNumber;}return d();}
  if(path.endsWith('/content?versionNumber=3'))return {files:structuredClone(published)};
  if(path.endsWith('/content?versionNumber=4'))return {files:structuredClone(newVersion)};
  if(path.endsWith('/content')){if(method==='PUT')head=structuredClone(body.files);return {files:structuredClone(head)};}
  if(path.endsWith('/versions')&&method==='POST'){newVersion=structuredClone(head);return {versionNumber:4};}
  if(path.endsWith('/'+c.scriptId))return {scriptId:c.scriptId,title:c.projectTitle};
  throw Error('unexpected endpoint');
 };
 return {api,calls,logs,bundle:files('new',manifest),edit:()=>head[0].source+='manual edit',extra:()=>{head.push({name:'extra',type:'HTML',source:'extra'});},run:(options={},fn=api)=>deployGas({...c,...options},files('new',manifest),fn,m=>logs.push(m))};
}
test('preflight is read only, validates version, never prints remote content or IDs',async()=>{
 const h=harness();assert.deepEqual(await h.run({action:'preflight'}),{status:'preflight',previousVersion:3});assert.ok(h.calls.every(x=>x.method==='GET'));assert.ok(!h.logs.join(' ').includes(c.scriptId));
});
test('release updates content, verifies immutable version and updates original deployment only',async()=>{
 const h=harness();assert.deepEqual(await h.run(),{status:'released',previousVersion:3,version:4});
 const writes=h.calls.filter(x=>x.method!=='GET');
 assert.deepEqual(writes.map(x=>[x.method,x.path.split('/').at(-1)]),[['PUT','content'],['POST','versions'],['PUT',c.deploymentId]]);
 assert.deepEqual(JSON.parse(writes[0].body.files[2].source).webapp,web);
 assert.equal(writes[2].body.deploymentConfig.versionNumber,4);
});
test('wrong version, wrong access, extra files and unpublished edits stop before writes',async()=>{
 for(const scenario of ['version','access','extra','edit']){
  const h=harness();if(scenario==='extra')h.extra();if(scenario==='edit')h.edit();
  await assert.rejects(h.run(scenario==='version'?{expectedVersion:2}:scenario==='access'?{access:'ANYONE_ANONYMOUS'}:{}));
  assert.ok(h.calls.every(x=>x.method==='GET'));
 }
});
test('wrong project title or non-web deployment refuses mutation',async()=>{
 for(const mode of ['project','deployment']){
  const h=harness();const fake=async(m,p,b)=>{const r=await h.api(m,p,b);if(mode==='project'&&r.title)r.title='Production';if(mode==='deployment'&&r.entryPoints)r.entryPoints[0].entryPointType='EXECUTION_API';return r;};
  await assert.rejects(h.run({},fake));assert.ok(h.calls.every(x=>x.method==='GET'));
 }
});
test('manifest scopes cannot change automatically',async()=>{
 const h=harness();const b=files('new',{...manifest,oauthScopes:['different']});await assert.rejects(deployGas(c,b,h.api,()=>{}),/Manifest/);assert.ok(h.calls.every(x=>x.method==='GET'));
});
test('uncertain update is not retried and deployment is not advanced',async()=>{
 const h=harness();await assert.rejects(h.run({},async(m,p,b)=>{if(m==='PUT'&&p.endsWith('/content')){await h.api(m,p,b);throw Error('timeout');}return h.api(m,p,b);}),/timeout/);
 assert.equal(h.calls.filter(x=>x.method!=='GET').length,1);
});
test('invalid config and non-TEST title rejected; OAuth failure does not print response',async()=>{
 assert.throws(()=>readDeployConfig({}),/Missing/);
 const env={GAS_SCRIPT_ID:'s'.repeat(30),GAS_DEPLOYMENT_ID:'AKfy'+'x'.repeat(30),GAS_PROJECT_TITLE:'WorkPulse — Admin TEST',GAS_EXPECTED_ACCESS:'DOMAIN',GAS_EXPECTED_VERSION:'3',GAS_ACTION:'preflight',GITHUB_SHA:'a'.repeat(40),GAS_OAUTH_CLIENT_ID:'fixture',GAS_OAUTH_CLIENT_SECRET:'fixture-secret',GAS_OAUTH_REFRESH_TOKEN:'fixture-refresh'};
 assert.equal(readDeployConfig(env).expectedVersion,3);assert.throws(()=>readDeployConfig({...env,GAS_PROJECT_TITLE:'Production'}));
 await assert.rejects(gasApi(c,async()=>({ok:false,status:401,json:()=>{throw Error('secret');}})),/HTTP 401/);
});

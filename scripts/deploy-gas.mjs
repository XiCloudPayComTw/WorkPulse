import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const API='https://script.googleapis.com/v1';
const TYPES={Code:'SERVER_JS',Index:'HTML',appsscript:'JSON'};
const NAMES=['Code','Index','appsscript'];
function fail(message){throw Error(message);}
function normalized(value){
 if(Array.isArray(value))return value.map(normalized);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])]));
 return value;
}
function same(a,b){return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));}
function manifest(source){try{return JSON.parse(source);}catch{fail('Manifest JSON invalid');}}
function sourceFiles(content){
 if(!Array.isArray(content?.files)||content.files.length!==3)fail('Expected exactly three GAS files; refusing to overwrite additional files');
 return NAMES.map(name=>{
  const f=content.files.find(x=>x.name===name&&x.type===TYPES[name]);
  if(!f||typeof f.source!=='string'||!f.source.trim())fail('Unexpected GAS file inventory');
  return {name,type:TYPES[name],source:f.source};
 });
}
function sameFiles(a,b){
 return a.every((x,i)=>x.name===b[i].name&&x.type===b[i].type&&(x.type==='JSON'?same(manifest(x.source),manifest(b[i].source)):x.source.replace(/\r\n/g,'\n').trimEnd()===b[i].source.replace(/\r\n/g,'\n').trimEnd()));
}
function configOf(d,c){
 if(d?.deploymentId!==c.deploymentId||d?.deploymentConfig?.scriptId!==c.scriptId||
    d.deploymentConfig.manifestFileName!=='appsscript'||!Number.isSafeInteger(d.deploymentConfig.versionNumber)||d.deploymentConfig.versionNumber<1)
  fail('Target must be the existing versioned deployment in the configured project');
 if(d.entryPoints?.length!==1||d.entryPoints[0].entryPointType!=='WEB_APP')fail('Target must be a single web app deployment');
 const w=d.entryPoints[0].webApp;
 if(!w?.url||!w.url.startsWith('https://script.google.com/')||!w.url.endsWith('/'+c.deploymentId+'/exec')||
    w.entryPointConfig?.executeAs!=='USER_DEPLOYING'||w.entryPointConfig?.access!==c.access)
  fail('Existing web app URL, execute-as or access mode does not match the approved target');
 return {version:d.deploymentConfig.versionNumber,url:w.url,web:w.entryPointConfig,description:d.deploymentConfig.description||''};
}
export function readDeployConfig(env){
 const c={scriptId:env.GAS_SCRIPT_ID,deploymentId:env.GAS_DEPLOYMENT_ID,projectTitle:env.GAS_PROJECT_TITLE,
  access:env.GAS_EXPECTED_ACCESS,expectedVersion:Number(env.GAS_EXPECTED_VERSION),action:env.GAS_ACTION,
  commit:env.GITHUB_SHA,clientId:env.GAS_OAUTH_CLIENT_ID,clientSecret:env.GAS_OAUTH_CLIENT_SECRET,refreshToken:env.GAS_OAUTH_REFRESH_TOKEN};
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(c.scriptId||'')||!/^AKfy[A-Za-z0-9_-]{16,196}$/.test(c.deploymentId||'')||
    c.projectTitle!=='WorkPulse — Admin TEST'||!['DOMAIN','ANYONE_ANONYMOUS','MYSELF'].includes(c.access)||
    !Number.isSafeInteger(c.expectedVersion)||c.expectedVersion<1||!['preflight','release'].includes(c.action)||
    !/^[a-f0-9]{40}$/.test(c.commit||'')||!c.clientId||!c.clientSecret||!c.refreshToken)
  fail('Missing or invalid TEST deployment configuration; see DEPLOY_GAS_V026.md');
 return c;
}
export async function readBundle(dir='dist-gas/unified'){
 const files=await readdir(dir,{withFileTypes:true});
 assert.deepEqual(files.map(x=>x.name).sort(),['Code.gs','Index.html','appsscript.json']);
 assert.ok(files.every(x=>x.isFile()));
 return sourceFiles({files:await Promise.all(NAMES.map(async name=>({name,type:TYPES[name],source:await readFile(resolve(dir,name+(name==='Code'?'.gs':name==='Index'?'.html':'.json')),'utf8')})))});
}
export async function gasApi(config,fetcher=fetch){
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)fail('Google OAuth refresh failed (HTTP '+response.status+'); check authorization privately');
 const auth=await response.json();if(typeof auth.access_token!=='string'||!auth.access_token)fail('Google OAuth response invalid');
 return async(method,path,body)=>{
  const r=await fetcher(API+path,{method,headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)fail('Apps Script API '+method+' failed (HTTP '+r.status+'); inspect private project and deployment before retry');
  return r.json();
 };
}
export async function deployGas(c,bundle,api,log=console.log){
 const base='/projects/'+encodeURIComponent(c.scriptId),deployment=base+'/deployments/'+encodeURIComponent(c.deploymentId);
 const project=await api('GET',base);
 if(project.scriptId!==c.scriptId||project.title!==c.projectTitle||project.parentId)fail('Target is not the expected standalone TEST project');
 const old=await api('GET',deployment),before=configOf(old,c);
 if(before.version!==c.expectedVersion)fail('Existing deployment version differs from approved version; refresh preflight');
 const head=sourceFiles(await api('GET',base+'/content')),published=sourceFiles(await api('GET',base+'/content?versionNumber='+before.version));
 if(!sameFiles(head,published))fail('Unpublished HEAD edits detected; reconcile manually before automated deployment');
 const target=sourceFiles({files:bundle});
 if(!target[0].source.startsWith("var WP_PORTAL_KIND='unified';")||!target[1].source.includes('WORKPULSE_UNIFIED_PORTAL=true'))fail('Not a unified build');
 const existingManifest=manifest(head[2].source),nextManifest=manifest(target[2].source);
 const {webapp:oldWeb,...oldRest}=existingManifest,{webapp:newWeb,...newRest}=nextManifest;
 if(newWeb!==undefined||!same(oldRest,newRest))fail('Manifest or OAuth scopes differ; use a reviewed manual upgrade');
 if(oldWeb!==undefined&&!same(oldWeb,before.web))fail('Manifest web app configuration differs from live entry point');
 target[2]={...target[2],source:JSON.stringify({...nextManifest,webapp:before.web},null,2)+'\n'};
 log('Preflight passed: existing TEST deployment version '+before.version+'; manifest, access and project verified.');
 if(c.action==='preflight')return {status:'preflight',previousVersion:before.version};
 const latest=configOf(await api('GET',deployment),c);
 if(latest.version!==before.version||!same(latest.web,before.web)||latest.url!==before.url||
    !sameFiles(sourceFiles(await api('GET',base+'/content')),head))fail('Target changed during preflight; stop');
 await api('PUT',base+'/content',{files:target});
 if(!sameFiles(sourceFiles(await api('GET',base+'/content')),target))fail('Updated HEAD verification failed; existing deployment not intentionally changed');
 const version=await api('POST',base+'/versions',{description:'WorkPulse '+c.commit.slice(0,12)});
 if(!Number.isSafeInteger(version.versionNumber)||version.versionNumber<=before.version)fail('New version response invalid; reconcile manually');
 if(!sameFiles(sourceFiles(await api('GET',base+'/content?versionNumber='+version.versionNumber)),target))fail('New immutable version does not match build');
 const again=configOf(await api('GET',deployment),c);
 if(again.version!==before.version||again.url!==before.url||!same(again.web,before.web))fail('Deployment changed concurrently; stop');
 await api('PUT',deployment,{deploymentConfig:{scriptId:c.scriptId,versionNumber:version.versionNumber,manifestFileName:'appsscript',description:before.description}});
 const after=configOf(await api('GET',deployment),c);
 if(after.version!==version.versionNumber||after.url!==before.url||!same(after.web,before.web))fail('Deployment verification failed; inspect live settings immediately');
 log('TEST deployment updated: '+before.version+' -> '+after.version+'. Existing URL and access configuration verified. Real browser acceptance still required.');
 return {status:'released',previousVersion:before.version,version:after.version};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const c=readDeployConfig(process.env);const bundle=await readBundle();const api=await gasApi(c);await deployGas(c,bundle,api);}
 catch(e){console.error(e instanceof Error&&/^(Google OAuth|Apps Script API|Missing or invalid|Target|Existing|Unexpected|Expected|Manifest|Unpublished|Not a unified|Preflight|Updated HEAD|New version|New immutable|Deployment)/.test(e.message)?e.message:'GAS operation stopped; check private configuration and target state before retrying.');process.exitCode=1;}
}

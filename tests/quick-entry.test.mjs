import test from 'node:test';
import assert from 'node:assert/strict';
import {readQuickDraft,saveQuickDraft,clearQuickDraft,readTemplates,addTemplate,removeTemplate,newTaskFromTemplate,recentPriorJournal,countExpiredQuickDrafts,pruneExpiredQuickDrafts} from '../src/features/journals/quick-entry.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const draft=()=>({date:'2026-11-23',employeeId:'me',note:'項目',tasks:[{title:'配置施工圖',project:'案場'}]});
test('draft persists and restores under same account',()=>{const db=storage();assert.equal(saveQuickDraft(db,'local',draft()),true);assert.equal(readQuickDraft(db,'local').tasks[0].title,'配置施工圖');assert.equal(readQuickDraft(db,'another'),null);});
test('clearing a saved draft does not erase other identity',()=>{const db=storage();saveQuickDraft(db,'a',draft());saveQuickDraft(db,'b',draft());clearQuickDraft(db,'a');assert.equal(readQuickDraft(db,'a'),null);assert.ok(readQuickDraft(db,'b'));});
test('malformed or expired draft is ignored',()=>{const db=storage();saveQuickDraft(db,'a',draft());assert.equal(readQuickDraft(db,'a',-1),null);assert.equal(saveQuickDraft(db,'b',{...draft(),date:'bad'}),false);});
test('template deduplicates, saves, and removes',()=>{const db=storage();const t={title:'檢查尺寸',project:'洗衣店',status:'done',hours:5};const a=addTemplate(db,'a',t);assert.equal(a.ok,true);assert.equal(addTemplate(db,'a',t).ok,false);assert.equal(readTemplates(db,'b').length,0);assert.equal(readTemplates(db,'a').length,1);assert.equal(removeTemplate(db,'a',a.item.id),true);assert.equal(readTemplates(db,'a').length,0);});
test('copying a template resets completion, result and hours',()=>{const value=newTaskFromTemplate({title:'舊工作',status:'done',result:'已結案',hours:8});assert.equal(value.title,'舊工作');assert.equal(value.status,'doing');assert.equal(value.result,'');assert.equal(value.hours,0);});
test('previous tasks only from same employee and earlier date',()=>{const r=recentPriorJournal([{date:'2026-11-23',employeeId:'me',tasks:[]},{date:'2026-11-22',employeeId:'other',tasks:[]},{date:'2026-11-21',employeeId:'me',tasks:[{title:'A'}]}],'2026-11-23','me');assert.equal(r.date,'2026-11-21');});
test('more than 10 templates capped',()=>{const db=storage();for(let i=0;i<15;i++)addTemplate(db,'a',{title:`工作 ${i}`});assert.equal(readTemplates(db,'a').length,10);});

test('distinct descriptions in same category are distinct templates',()=>{const db=storage();const a={title:'水電',category:'水電',project:'案場',description:'確認排水'};assert.equal(addTemplate(db,'a',a).ok,true);assert.equal(addTemplate(db,'a',{...a,description:'確認電力'}).ok,true);assert.equal(addTemplate(db,'a',a).ok,false);});

test('multiple dates and employees retain separate drafts and clearing one preserves others',()=>{
 const db=storage();saveQuickDraft(db,'local',draft());saveQuickDraft(db,'local',{...draft(),date:'2026-11-24',note:'第二天'});saveQuickDraft(db,'local',{...draft(),employeeId:'other',note:'另一人'});
 assert.equal(readQuickDraft(db,'local',86400000,'2026-11-24','me').note,'第二天');
 clearQuickDraft(db,'local','2026-11-23','me');assert.equal(readQuickDraft(db,'local',86400000,'2026-11-23','me'),null);assert.equal(readQuickDraft(db,'local',86400000,'2026-11-23','other').note,'另一人');
});
test('legacy draft upgrades without losing original day; cap does not evict',()=>{
 const db=storage();db.setItem('workpulse:v0.5:draft:local',JSON.stringify({account:'local',savedAt:Date.now(),draft:draft()}));
 for(let day=1;day<=31;day++){if(day===23)continue;assert.equal(saveQuickDraft(db,'local',{...draft(),date:'2026-12-'+String(day).padStart(2,'0')}),true);}
 assert.equal(saveQuickDraft(db,'local',{...draft(),date:'2027-01-01'}),false);assert.ok(readQuickDraft(db,'local',86400000,'2026-11-23','me'));
});

test('invalid calendar day rejected and explicit expired cleanup preserves valid drafts',()=>{
 const db=storage();db.setItem('workpulse:v0.5:draft:local',JSON.stringify({account:'local',savedAt:Date.now()-8*86400000,draft:draft()}));
 assert.equal(saveQuickDraft(db,'local',{...draft(),date:'2026-02-30'}),false);
 assert.equal(saveQuickDraft(db,'local',{...draft(),date:'2026-11-24'}),true);
 assert.equal(countExpiredQuickDrafts(db,'local'),1);assert.equal(pruneExpiredQuickDrafts(db,'local'),1);
 assert.ok(readQuickDraft(db,'local',86400000,'2026-11-24','me'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readSelectedPerson,writeSelectedPerson,resolvePerson,shortPersonName} from '../src/app/person.js';
import {addWorkCategory,renameWorkCategory,renameLocalWorkCategory} from '../src/features/journals/categories.js';
import {rememberDescriptions,readDescriptionMemory,descriptionSuggestions} from '../src/features/journals/description-memory.js';
import {demoState,validateState,saveJournal} from '../src/features/journals/data.js';
import {renderNavigationButton,visibleNavigation} from '../src/app/navigation.js';

const storage=()=>{
 const db=new Map();
 return {getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,String(v)),removeItem:k=>db.delete(k),db};
};
test('chosen worker uses stable employee ID and persists across reloads',()=>{
 const s=storage(),people=[{id:'e-1',name:'鄭大經理'},{id:'e-2',name:'陳琮凱'}];
 assert.equal(readSelectedPerson(s,people),'e-1');
 assert.equal(writeSelectedPerson(s,'e-2'),true);
 assert.equal(readSelectedPerson(s,people),'e-2');
 assert.equal(readSelectedPerson(s,[people[0]]),'e-1');
 assert.equal(resolvePerson(people,'not-found'),'e-1');
 assert.equal(shortPersonName('陳琮凱'),'琮凱');
 assert.equal(shortPersonName('😀阿凱'),'阿凱');
 assert.equal(shortPersonName('王'),'王');
});
test('per-person description memory avoids mixing up users on the same device',()=>{
 const s=storage();
 rememberDescriptions(s,'e1',[{description:'現場確認二樓給排水位置'},{description:'支援木作收邊'}]);
 rememberDescriptions(s,'e2',[{description:'修正前端 React 畫面'}]);
 assert.equal(readDescriptionMemory(s,'e1').length,2);
 assert.equal(descriptionSuggestions(s,'e1','給排水').length,1);
 assert.equal(descriptionSuggestions(s,'e2','給排水').length,0);
 assert.equal(descriptionSuggestions(s,'e2','React')[0],'修正前端 React 畫面');
 assert.ok([...s.db.keys()].every(key=>key.includes('description-memory')&&!key.includes('salary')));
});
test('editable work categories preserve historic task links in local mode',()=>{
 const old=demoState('2026-11-26');
 const added=addWorkCategory(old.categories,'水電驗收');
 assert.ok(added.includes('水電驗收'));
 assert.throws(()=>addWorkCategory(added,'水電驗收'),/重複/);
 const renamed=renameWorkCategory(added,'前端開發','前端整合');
 assert.ok(renamed.includes('前端整合'));
 assert.throws(()=>renameWorkCategory(renamed,'失效項','無效'),/找不到/);
 const current={...old,categories:added,mode:'local'};
 const next=renameLocalWorkCategory(current,'前端開發','前端整合');
 assert.equal(next.journals[0].tasks[0].category,'前端整合');
 assert.equal(next.journals[0].tasks[0].title,'調整工作日誌操作流程');
 assert.equal(current.journals[0].tasks[0].category,'前端開發');
 assert.equal(validateState(next).categories.includes('前端整合'),true);
 const previousBackup={...next};delete previousBackup.categories;
 assert.ok(validateState(previousBackup).categories.includes('前端開發'));
});
test('journal work category alone is enough; title is derived, and dynamic categories are accepted',()=>{
 const local={...demoState('2026-11-26'),mode:'local',journals:[],categories:['工務巡檢']};
 const stored=saveJournal(local,{date:'2026-11-26',employeeId:'me',tasks:[
  {category:'工務巡檢',description:'設備檢查完畢',status:'done',hours:3}
 ]});
 assert.equal(stored.journals[0].tasks[0].title,'工務巡檢');
 assert.equal(stored.journals[0].tasks[0].category,'工務巡檢');
});
test('mobile navigation will exclude insights and settings only, leaving field routes',()=>{
 const a=visibleNavigation(false,null);
 const mobile=a.filter(item=>!['insights','settings'].includes(item.id));
 assert.deepEqual(mobile.map(x=>x.id),['overview','attendance','entry','history']);
 assert.match(renderNavigationButton(mobile[1],'attendance',true),/aria-current="page"/);
});

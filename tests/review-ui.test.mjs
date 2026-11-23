import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewState, renderReviewWorkspace, reviewBadge, setReviewReason, loadReviewQueue, decideReview } from '../src/review-ui.js';

const example=()=>({
  id:'j-review-1',date:'2026-11-22',employeeId:'emp-a',
  employeeName:'設計同事 <script>alert(1)</script>',revision:2,
  note:'今日完成新配置',review:{status:'submitted'},
  tasks:[{title:'製作 <img src=x onerror=alert(1)> 平面圖',
    category:'展店設計',description:'核對給排水施工尺寸',result:'平面配置初稿',
    project:'洗衣店',hours:3,status:'doing'}]
});
test('review workspace only renders for supervisors',()=>{
  assert.match(renderReviewWorkspace({role:'staff'}),/沒有主管審核權限/);
});
test('review workspace renders approved status and escaped employee and work details',()=>{
  reviewState.phase='ready';reviewState.enabled=true;reviewState.records=[example()];
  const html=renderReviewWorkspace({role:'manager'});
  assert.match(html,/主管審核工作台/);
  assert.match(html,/設計同事 &lt;script&gt;/);
  assert.match(html,/&lt;img src=x/);
  assert.match(html,/平面配置初稿/);
  assert.match(html,/退回原因/);
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(reviewBadge({status:'approved'}),/已通過/);
});
test('review workspace gracefully handles empty queue and disabled configuration',()=>{
  reviewState.phase='ready';reviewState.enabled=true;reviewState.records=[];
  assert.match(renderReviewWorkspace({role:'admin'}),/沒有待審核/);
  reviewState.enabled=false;
  assert.match(renderReviewWorkspace({role:'admin'}),/尚未啟用審核功能/);
});
test('return reason trims to 500 characters',()=>{
  setReviewReason('abc','a'.repeat(900));
  assert.equal(reviewState.reasons.abc.length,500);
});
test('review API queue and decisions use allowlisted Apps Script calls',async()=>{
  const calls=[];
  const service={
    withSuccessHandler(fn){this.onSuccess=fn;return this;},
    withFailureHandler(fn){this.onFailure=fn;return this;},
    wpReviewQueue(month){calls.push(['queue',month]);this.onSuccess({month,enabled:true,records:[example()]});},
    wpReviewDecision(payload){calls.push(['decision',payload]);this.onSuccess({ok:true,review:{status:'approved'}});}
  };
  globalThis.google={script:{run:service}};
  try{
    await loadReviewQueue('2026-11');
    assert.equal(reviewState.records.length,1);
    assert.equal(reviewState.records[0].employeeName,example().employeeName);
    await decideReview(example(),'approved');
    assert.equal(calls.filter(x=>x[0]==='decision').length,1);
    assert.equal(calls[1][1].journalId,'j-review-1');
    assert.equal(calls[1][1].expectedRevision,2);
    assert.equal(reviewState.records.length,1);
  }finally{delete globalThis.google;}
});
test('returned decision demands a nonempty explanation before contacting backend',async()=>{
  reviewState.reasons={};
  await assert.rejects(decideReview(example(),'returned'),/至少 3/);
});

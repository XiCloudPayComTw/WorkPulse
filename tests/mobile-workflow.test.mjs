import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardObscures,mobileDockMarkup,mobileSkeleton} from '../src/app/mobile-workflow.js';
test('keyboard inference requires editable focus and significant occlusion',()=>{
 assert.equal(keyboardObscures(850,500,true),true);assert.equal(keyboardObscures(850,500,false),false);assert.equal(keyboardObscures(850,780,true),false);
});
test('dock proxies existing controls and skeleton exposes status',()=>{
 const dock=mobileDockMarkup();assert.match(dock,/data-dock="save"/);assert.match(dock,/data-dock="add"/);assert.doesNotMatch(dock,/data-action="save-journal"/);
 assert.match(mobileSkeleton('載入'),/role="status"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardObscures,mobileDockMarkup,mobileSkeleton,sheetMatches,fieldBottomSpace} from '../src/app/mobile-workflow.js';
test('keyboard inference requires editable focus and significant occlusion',()=>{
 assert.equal(keyboardObscures(850,500,true),true);assert.equal(keyboardObscures(850,500,false),false);assert.equal(keyboardObscures(850,780,true),false);
});
test('dock proxies existing controls and skeleton exposes status',()=>{
 const dock=mobileDockMarkup();assert.match(dock,/data-dock="save"/);assert.match(dock,/data-dock="add"/);assert.doesNotMatch(dock,/data-action="save-journal"/);
 assert.match(mobileSkeleton('載入'),/role="status"/);
});

test('sheet search normalizes width and case without interpreting regex',()=>{assert.equal(sheetMatches('ＡＢＣ 工務','abc'),true);assert.equal(sheetMatches('現場巡檢','巡檢'),true);assert.equal(sheetMatches('現場巡檢','.*'),false);assert.equal(sheetMatches('現場巡檢','  '),true);});

test('bottom clearance includes measured navigation and dock without double safe area',()=>{assert.equal(fieldBottomSpace(80,96),192);assert.equal(fieldBottomSpace(72,0),88);assert.equal(fieldBottomSpace(72.2,95.3,8),176);assert.equal(fieldBottomSpace(-1,0),16);});

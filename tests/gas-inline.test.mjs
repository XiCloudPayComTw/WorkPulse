import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {gasInlineScript,decodeGasInlineScript} from '../scripts/gas-inline.mjs';

test('GAS inline transport round-trips XML, markup, Unicode and escapes without raw application tokens',()=>{
 const source='const sample = '+JSON.stringify('<?xml version="1.0"?> 中文 </script> \\u0000 \n https://example.com')+';';
 const html=gasInlineScript(source,'v0.24.1');
 assert.equal(decodeGasInlineScript(html),source);
 assert.doesNotMatch(html,/<\?xml|https:\/\/example\.com/);
 assert.match(html,/^[\x00-\x7f]*$/);
 new vm.Script(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
 new vm.Script(decodeGasInlineScript(html));
});
test('GAS transport rejects missing and invalid base64 payloads',()=>{
 assert.throws(()=>decodeGasInlineScript(''));
 assert.throws(()=>decodeGasInlineScript('var chunks=["!!!"]; var binary=atob'));
 assert.throws(()=>decodeGasInlineScript('var chunks=["a"]; var binary=atob'));
});

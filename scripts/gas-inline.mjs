// HTMLService must not parse application JS containing markup, XML or escapes.
import {Buffer} from 'node:buffer';
export function gasInlineScript(source,version){
 const chunks=Buffer.from(source,'utf8').toString('base64').match(/.{1,120}/g)||[];
 return '<script data-workpulse-version="'+version+'">\n'+
  '(function(){\n'+
  'var root=document.getElementById("app");\n'+
  'function fail(){if(!root)return;root.textContent="";var panel=document.createElement("section");panel.id="wp-gas-boot-error";panel.className="boot-splash";panel.setAttribute("role","alert");var title=document.createElement("h2");title.textContent="WorkPulse \\u555f\\u52d5\\u5931\\u6557";var detail=document.createElement("p");detail.textContent="\\u8acb\\u91cd\\u65b0\\u6574\\u7406\\u7db2\\u9801\\uff1b\\u82e5\\u4ecd\\u5931\\u6557\\uff0c\\u8acb\\u806f\\u7d61\\u7ba1\\u7406\\u54e1\\u6838\\u5c0d\\u7248\\u672c\\u3002";var retry=document.createElement("button");retry.type="button";retry.className="soft-button";retry.textContent="\\u91cd\\u65b0\\u6574\\u7406";retry.addEventListener("click",function(){location.reload();});panel.append(title,detail,retry);root.appendChild(panel);}\n'+
  'var failed=false;function onError(){failed=true;}\n'+
  'try{if(!root||!window.google||!window.google.script||!window.google.script.run)throw Error("GAS bridge unavailable");\n'+
  'var chunks='+JSON.stringify(chunks).replace(/","/g,'",\n"')+';\n'+
  'var binary=atob(chunks.join(""));var bytes=Uint8Array.from(binary,function(c){return c.charCodeAt(0);});\n'+
  'var source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);\n'+
  'window.addEventListener("error",onError);var script=document.createElement("script");script.textContent=source;document.body.appendChild(script);\n'+
  'if(failed||!root.querySelector(".shell"))throw Error("Application startup incomplete");\n'+
  '}catch(error){console.error("WorkPulse GAS startup failed",error);fail();}finally{window.removeEventListener("error",onError);}\n'+
  '})();\n</script>\n';
}
export function decodeGasInlineScript(html){
 const match=html.match(/var chunks=(\[[\s\S]*?\]);\s*var binary=atob/);
 if(!match)throw Error('Missing encoded GAS application');
 const chunks=JSON.parse(match[1]);
 if(!Array.isArray(chunks)||!chunks.length||chunks.some(x=>typeof x!=='string'||!/^[A-Za-z0-9+/=]+$/.test(x)))throw Error('Invalid GAS payload');
 const bytes=Buffer.from(chunks.join(''),'base64');
 if(bytes.toString('base64')!==chunks.join(''))throw Error('Corrupted GAS payload');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {openFlavorWheel} from '../flavor-wheel.js';

function fixture(t){
 const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location};
 const listeners=new Map(),elements=[],messages=[];let restored=0;
 const active={isConnected:true,focus(){restored++}};
 const document={activeElement:active,body:{append(el){elements.push(el)}},createElement(tag){return {tag,style:{},attributes:{},children:[],contentWindow:tag==='iframe'?{postMessage:(data,origin)=>messages.push({data,origin})}:null,setAttribute(k,v){this.attributes[k]=v},append(el){this.children.push(el)},focus(){},remove(){this.removed=true}}}};
 const window={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type)}};
 globalThis.document=document;globalThis.window=window;globalThis.location={origin:'http://localhost:25123'};
 t.after(()=>{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}});
 return {elements,listeners,messages,get restored(){return restored},emit(data,{origin=location.origin,source=elements[0].children[0].contentWindow}={}){listeners.get('message')?.({data,origin,source})}};
}

test('flavor frame initializes only from its own same-origin ready message and preserves old values',t=>{
 const f=fixture(t);const values=['Stone fruit','sca:other:0:4'];const h=openFlavorWheel({values,locale:'en'});
 f.emit({type:'thiscup-flavor-ready'},{source:{}});f.emit({type:'thiscup-flavor-ready'},{origin:'https://other.invalid'});assert.equal(f.messages.length,0);
 f.emit({type:'thiscup-flavor-ready'});assert.deepEqual(f.messages,[{data:{type:'thiscup-flavor-init',values},origin:location.origin}]);
 assert.match(f.elements[0].children[0].src,/flavor-wheel\/index\.html\?lang=en&v=0\.2\.30$/);h.close();assert.equal(f.listeners.size,0);
});

test('flavor confirmation rejects malformed or foreign messages and accepts its own result only once',t=>{
 const f=fixture(t),saved=[],closed=[];openFlavorWheel({onConfirm:v=>saved.push(v),onClose:()=>closed.push(true)});
 const receive=f.listeners.get('message'),source=f.elements[0].children[0].contentWindow;
 for(const values of [null,'Floral',[{}],['Floral',5]])f.emit({type:'thiscup-flavor-confirm',values});
 f.emit({type:'thiscup-flavor-confirm',values:['sca:fruit:0:0']},{source:{}});assert.equal(saved.length,0);
 f.emit({type:'thiscup-flavor-confirm',values:['sca:fruit:0:0']});assert.deepEqual(saved,[['sca:fruit:0:0']]);assert.equal(closed.length,1);assert.equal(f.restored,1);
 receive({source,origin:location.origin,data:{type:'thiscup-flavor-confirm',values:['sca:fruit:0:1']}});assert.equal(saved.length,1);assert.equal(f.listeners.size,0);
});

test('flavor cancel or programmatic close never confirms and always removes the listener',t=>{
 const f=fixture(t);let saved=0,closed=0;const h=openFlavorWheel({onConfirm:()=>saved++,onClose:()=>closed++});
 f.emit({type:'thiscup-flavor-cancel'});h.close();assert.equal(saved,0);assert.equal(closed,1);assert.equal(f.listeners.size,0);assert.equal(f.elements[0].removed,true);
});

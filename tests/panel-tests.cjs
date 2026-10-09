const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {environment,section,sourcePath}=require('./controller-tests.cjs');
const results=[];

function mounted() {
  const env=environment();
  const created=[];
  class Node {
    constructor(tag,fragment=false){this.tagName=tag.toUpperCase();this.fragment=fragment;this.children=[];this.attributes={};this.events={};this.dataset={};this.style={};this._text='';this.className='';this.value='';this.disabled=false;this.hidden=false;this.classList={toggle:(token,flag)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean)); if(flag??!set.has(token))set.add(token);else set.delete(token);this.className=[...set].join(' ');}};created.push(this);}
    append(...nodes){for(const node of nodes){if(node.fragment){this.append(...node.children);continue;}node.parentNode=this;this.children.push(node);}}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    addEventListener(name,handler){(this.events[name]??=[]).push(handler);}
    attachShadow(){return this.shadowRoot=new Node('shadow-root');}
    async event(name){for(const handler of this.events[name]||[])await handler({target:this});}
    async click(){if(!this.disabled)await this.event('click');}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
  }
  const doc={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment',true),documentElement:new Node('html')};
  const sandbox={document:doc,navigator:{},console,formatMoney:env.actual.formatMoney};
  vm.runInNewContext(section('// src/panel.css','// src/content.js')+'\nglobalThis.mount=mountPanel;',sandbox,{filename:'actual-panel.js'});
  const mounted=sandbox.mount(env.controller);
  const get=predicate=>created.find(predicate);
  const input=get(x=>x.id==='jm-target-amount');
  const buttons={}; for(const name of ['scan','apply','verify','restore','stop'])buttons[name]=get(x=>x.dataset.action===name);
  const plus=get(x=>x.getAttribute('aria-label')==='目标金额增加0.01元');
  const minus=get(x=>x.getAttribute('aria-label')==='目标金额减少0.01元');
  const preview=get(x=>x.tagName==='TBODY');
  const footer=get(x=>x.className==='footer');
  return {...env,mounted,created,input,buttons,plus,minus,preview,footer};
}
async function test(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.stack);}}
(async()=>{
  await test('panel default and cent increment/decrement',async()=>{
    const env=mounted(); assert.equal(env.input.value,'0.01'); assert.equal(env.minus.disabled,true);
    await env.plus.click();assert.equal(env.input.value,'0.02');
    await env.plus.click();assert.equal(env.input.value,'0.03');
    await env.minus.click();assert.equal(env.input.value,'0.02');
    await env.minus.click();assert.equal(env.input.value,'0.01'); assert.equal(env.minus.disabled,true);
  });
  await test('target input event commits 0.03 and preview shows expected 0.03',async()=>{
    const env=mounted();env.input.value='0.03';await env.input.event('input');
    assert.equal(env.controller.getState().targetCents,3); assert.match(env.footer.textContent,/0\.03/);
    await env.buttons.scan.click();assert.equal(env.buttons.apply.disabled,false);
    assert.equal(env.preview.children[0].children[3].textContent,'0.03');
    assert.equal(env.preview.children[0].children[2].textContent,'99.97');
  });
  await test('invalid input disables scan/apply/verify but allows restore',async()=>{
    const env=mounted();env.input.value='0.03';await env.input.event('input');
    await env.buttons.scan.click();await env.buttons.apply.click();
    assert.equal(env.controller.getState().canRestore,true);
    for(const text of ['', '0','0.001','-1','1e2']){
      env.input.value=text;await env.input.event('input');
      assert.equal(env.input.getAttribute('aria-invalid'),'true');
      for(const button of ['scan','apply','verify'])assert.equal(env.buttons[button].disabled,true);
      assert.equal(env.buttons.restore.disabled,false);
    }
    await env.buttons.restore.click();assert.deepEqual(env.values(),['0.00','1.00']);
  });
  await test('busy phase disables target input and both cent buttons',async()=>{
    const env=mounted();env.adapter.pause=true;
    const ready=new Promise(resolve=>env.adapter.ready=resolve);
    const scanning=env.buttons.scan.click();await ready;
    assert.equal(env.input.disabled,true);assert.equal(env.plus.disabled,true);assert.equal(env.minus.disabled,true);
    await env.plus.click();assert.equal(env.controller.getState().targetCents,1);
    env.adapter.release();await scanning;assert.equal(env.input.disabled,false);
  });
  await test('action re-reads programmatically changed target and invalidates old preview',async()=>{
    const env=mounted();await env.buttons.scan.click();assert.equal(env.buttons.apply.disabled,false);
    env.input.value='0.03';// Autofill-like change with no input/change event.
    await env.buttons.apply.click();assert.equal(env.controller.getState().targetCents,3);
    assert.equal(env.controller.getState().canApply,false);assert.equal(env.controller.getState().rows.length,0);
    assert.deepEqual(env.metrics.writes,[]);assert.deepEqual(env.values(),['0.00','1.00']);
    await env.buttons.scan.click();await env.buttons.apply.click();assert.deepEqual(env.values(),['99.97','75.97']);
  });
  fs.writeFileSync(path.join(__dirname,'panel-results.json'),JSON.stringify({sourcePath,fixtureOnly:true,liveJingmai:false,execution:'actual mountPanel/render/handlers in Node VM; minimal document/element/event stub, no layout/rendering engine',results},null,2));
  if(results.some(x=>!x.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

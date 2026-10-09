const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : (fs.existsSync(path.join(__dirname, '../content.js')) ? path.join(__dirname, '../content.js') : path.join(__dirname, '../jd-helper-custom/content.js'));
const content = fs.readFileSync(sourcePath, 'utf8');
const results = [];

function section(start, end) {
  const from = content.indexOf(start);
  const to = content.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source section ${start}`);
  return content.slice(from, to);
}

function environment(options = {}) {
  const originalCents = options.originalCents || [10000, 7600];
  const values = options.values || ['0.00', '1.00'];
  const metrics = { reads: 0, writes: [], submitClicks: 0, actions: [] };
  const cellsByRow = [];
  const inputs = [];
  let loaded;
  const adapter = { pause: false, ready: null, release: null };
  class FakeEvent { constructor(type, opts) { this.type = type; Object.assign(this, opts); } }
  class FakeInput {
    constructor(value, index) {
      this._value = value;
      this.index = index;
      this.ownerDocument = doc;
      this.disabled = false;
      this.readOnly = false;
      this.isConnected = true;
    }
    get value() { return this._value; }
    set value(v) { this._value = String(v); }
    focus() { doc.activeElement = this; }
    blur() { doc.activeElement = null; }
    dispatchEvent(event) {
      metrics.actions.push(event.type);
      if (event.type === 'change') {
        const cents = this.value ? loaded.parseMoney(this.value) : 0;
        cellsByRow[this.index][4].textContent = loaded.formatMoney(originalCents[this.index] - cents);
        metrics.writes.push({ index: this.index, value: this.value });
      }
      return true;
    }
  }
  const doc = { defaultView: {
    location: { href: 'https://shop.jd.com/jdm/trade/orders/order-list?test=fixture' },
    HTMLInputElement: FakeInput, Event: FakeEvent, FocusEvent: FakeEvent,
  }, activeElement: null };
  const root = { isConnected: true, contains: () => true };
  const bodyTable = {};
  const tableComponent = {};
  const schema = { size: 5, columns: { name:0, quantity:1, original:2, reduction:3, actual:4 } };
  const rows = originalCents.map((cents, index) => {
    const input = new FakeInput(values[index] || '0.00', index);
    inputs.push(input);
    const cells = [
      { textContent: `Product-${index}` },
      { textContent: 'x1', quantity: options.quantity || 1 },
      { textContent: String(cents / 100) },
      { reductionInput: input, discountInput: { value: '10.00' } },
      { textContent: String((cents - Math.round(Number(input.value) * 100)) / 100) },
    ].map(c => ({ getAttribute: () => null, ...c }));
    cellsByRow.push(cells);
    return { cells, isConnected: true, contains: child => child === input,
      getAttribute: key => key === 'data-row-key' ? `sku-${index}` : null,
    };
  });
  const contextFor = (targetCents = 1) => {
    metrics.reads++;
    return { root, bodyTable, tableComponent, scrollContainer: null, orderContext: 'order-fixture',
      rows: rows.map((row, index) => loaded.rowOf(row, schema, index, targetCents)),
    };
  };
  const fakeInspect = (document, targetCents = 1) => contextFor(targetCents);
  const fakeCollect = async opts => {
    if (adapter.pause) {
      if (adapter.ready) adapter.ready();
      await new Promise(resolve => { adapter.release = resolve; });
    }
    if (opts.signal?.aborted) throw new Error(String(opts.signal.reason || 'stopped'));
    const context = contextFor(opts.targetCents ?? 1);
    opts.guard?.(context);
    opts.onProgress?.(context.rows);
    return { context, rows: context.rows };
  };
  const sandbox = {
    console, URL, AbortController, setTimeout, clearTimeout,
    document: doc, fakeInspect, fakeCollect,
    rowCells: row => row.cells,
    clean: x => String(x || '').replace(/\s+/g, ' ').trim(),
    quantityOf: cell => cell.quantity,
    reductionInputs: cell => ({ reductionInput: cell.reductionInput, discountInput: cell.discountInput }),
    visible: node => Boolean(node?.isConnected),
    collectDiagnostics: () => ({}),
  };
  const source = section('// src/money.js', '// src/adapter.js')
    + section('  function rowOf(', '  function commonAncestor(')
    + section('  function sameContext(', '  async function collectRows(')
    + '\nconst inspect = fakeInspect; const collectRows = fakeCollect;\n'
    + section('// src/policy.js', '// src/panel.css')
    + '\nglobalThis.actual = { parseMoney, parseTargetAmount, formatMoney, reductionFor, rowOf, createController };';
  vm.runInNewContext(source, sandbox, { filename: 'actual-controller.js' });
  loaded = sandbox.actual;
  const controller = loaded.createController(doc);
  const valuesNow = () => inputs.map(x => x.value);
  return { controller, metrics, values: valuesNow, adapter, inputs, cellsByRow, actual: loaded };
}

async function attempt(controller, method) {
  try { return { error: null, state: await controller[method]() }; }
  catch (error) { return { error: String(error.message || error), state: controller.getState() }; }
}
async function test(name, fn) {
  try { await fn(); results.push({ name, passed:true }); console.log('PASS',name); }
  catch (error) { results.push({name,passed:false,error:error.stack}); console.error('FAIL',name,error.stack); }
}
const plain = x => JSON.parse(JSON.stringify(x));
const noSubmit = env => assert.equal(env.metrics.submitClicks, 0, 'must never submit order');

async function main() {
  for (const [text,cents] of [['0.01',1],['0.02',2],['0.03',3],['1.25',125]]) {
    await test(`target ${text} scan/apply/verify/restore`, async () => {
      const env = environment(); const c = env.controller;
      assert.equal(typeof c.setTargetAmount, 'function');
      c.setTargetAmount(text);
      assert.equal(c.getState().targetCents,cents);
      const before = env.values();
      const scan = await attempt(c,'scan');
      assert.equal(scan.error,null); assert.equal(scan.state.phase,'ready');
      assert.deepEqual(plain(scan.state.rows.map(x=>x.reductionCents)),[10000-cents,7600-cents]);
      assert.deepEqual(env.values(),before,'scan is read only');
      const applied = await attempt(c,'apply');
      assert.equal(applied.error,null); assert.equal(applied.state.phase,'complete');
      assert.deepEqual(env.values(),[(10000-cents)/100,(7600-cents)/100].map(x=>x.toFixed(2)));
      assert.deepEqual(plain(applied.state.rows.map(x=>x.actualCents)),[cents,cents]);
      assert.equal(applied.state.canRestore,true);
      const verified = await attempt(c,'verify');
      assert.equal(verified.error,null); assert.equal(verified.state.phase,'complete');
      assert.deepEqual(plain(verified.state.rows.map(x=>x.actualCents)),[cents,cents]);
      const restored = await attempt(c,'restore');
      assert.equal(restored.error,null); assert.equal(restored.state.canRestore,false);
      assert.deepEqual(env.values(),before); noSubmit(env);
    });
  }
  await test('default remains 0.01', async()=>{
    const env=environment();
    assert.equal(env.controller.getState().targetCents,1);
    assert.equal(env.controller.getState().targetInput,'0.01');
    noSubmit(env);
  });
  for (const text of ['', '0','0.00','-1','0.001','1.234','1e2','NaN','Infinity','90071992547409.92']) {
    await test(`invalid target ${JSON.stringify(text)} blocks scan/apply/verify`,async()=>{
      const env=environment(); const c=env.controller;
      await c.scan(); c.setTargetAmount(text);
      assert.equal(c.getState().targetCents,null);
      assert.ok(c.getState().targetError);
      assert.equal(c.getState().canApply,false);
      const before=env.values();
      for(const action of ['scan','apply','verify']){
        const reads=env.metrics.reads; const result=await attempt(c,action); assert.equal(result.state.phase,'error',`${action} rejects invalid target`); assert.equal(env.metrics.reads,reads,'invalid target does not read adapter');
      }
      assert.deepEqual(env.values(),before); assert.deepEqual(env.metrics.writes,[]); noSubmit(env);
    });
  }
  await test('100 -> 0.03 fills 99.97 exactly',async()=>{
    const env=environment({originalCents:[10000],values:['0.00']}); const c=env.controller;
    c.setTargetAmount('0.03'); await c.scan(); await c.apply();
    assert.deepEqual(env.values(),['99.97']); assert.equal(c.getState().rows[0].actualCents,3); noSubmit(env);
  });
  await test('target exceeds one row blocks whole batch before writes',async()=>{
    const env=environment({originalCents:[10000,2],values:['0.00','0.00']}); const c=env.controller;
    c.setTargetAmount('0.03'); const scanned=await attempt(c,'scan');
    assert.equal(scanned.state.phase,'error'); assert.equal(scanned.state.canApply,false);
    const applied=await attempt(c,'apply'); assert.equal(applied.state.phase,'error'); assert.deepEqual(env.values(),['0.00','0.00']);
    assert.deepEqual(env.metrics.writes,[]); noSubmit(env);
  });
  await test('equal original clears previous reduction to 0.00',async()=>{
    const env=environment({originalCents:[3],values:['0.01']}); const c=env.controller;
    c.setTargetAmount('0.03'); const scan=await c.scan();
    assert.equal(scan.rows[0].reductionCents,0); assert.equal(scan.canApply,true);
    const applied=await attempt(c,'apply'); assert.equal(applied.error,null);
    assert.deepEqual(env.values(),['0.00']); assert.equal(applied.state.rows[0].actualCents,3);
    await c.restore(); assert.deepEqual(env.values(),['0.01']); noSubmit(env);
  });
  await test('changing target invalidates preview and requires scan',async()=>{
    const env=environment(); const c=env.controller;
    c.setTargetAmount('0.02'); await c.scan(); c.setTargetAmount('0.03');
    assert.equal(c.getState().canApply,false); assert.equal(c.getState().rows.length,0);
    const bad=await attempt(c,'apply'); assert.equal(bad.state.phase,'error'); assert.deepEqual(env.metrics.writes,[]);
    await c.scan(); await c.apply(); assert.deepEqual(env.values(),['99.97','75.97']); noSubmit(env);
  });
  await test('running operation forbids target change',async()=>{
    const env=environment(); const c=env.controller;
    env.adapter.pause=true;
    const ready=new Promise(resolve=>{env.adapter.ready=resolve;});
    const run=c.scan(); await ready;
    const before=c.getState().targetCents;
    c.setTargetAmount('0.03');
    assert.equal(c.getState().targetCents,before);
    env.adapter.release(); await run; noSubmit(env);
  });
  await test('invalid or too-high later target preserves restoration',async()=>{
    for(const next of ['', '200.00']){
      const env=environment(); const c=env.controller; const before=env.values();
      c.setTargetAmount('0.03'); await c.scan(); await c.apply();
      c.setTargetAmount(next); assert.equal(c.getState().canRestore,true);
      const restored=await attempt(c,'restore'); assert.equal(restored.error,null,restored.error||'');
      assert.deepEqual(env.values(),before); assert.equal(restored.state.canRestore,false); noSubmit(env);
    }
  });
  await test('re-apply different target still restores first original values',async()=>{
    const env=environment(); const c=env.controller; const before=env.values();
    c.setTargetAmount('0.02'); await c.scan(); await c.apply();
    c.setTargetAmount('0.03'); await c.scan(); await c.apply();
    const restored=await attempt(c,'restore'); assert.equal(restored.error,null);
    assert.deepEqual(env.values(),before); noSubmit(env);
  });
  await test('quantity greater than 1 remains blocked',async()=>{
    const env=environment({quantity:2}); const c=env.controller;
    c.setTargetAmount('0.03'); const scanned=await attempt(c,'scan');
    assert.equal(scanned.state.phase,'error'); assert.equal(scanned.state.canApply,false);
    const applied=await attempt(c,'apply'); assert.equal(applied.state.phase,'error'); assert.deepEqual(env.metrics.writes,[]); noSubmit(env);
  });
  await test('new target after second apply preserves original restore record',async()=>{
    const env=environment(); const c=env.controller; const before=env.values();
    c.setTargetAmount('0.02'); await c.scan(); await c.apply();
    c.setTargetAmount('0.03'); await c.scan(); await c.apply();
    c.setTargetAmount('');
    const restored=await attempt(c,'restore'); assert.equal(restored.error,null);
    assert.deepEqual(env.values(),before); noSubmit(env);
  });
  await test('verify wrong resulting amount reports failure without writing',async()=>{
    const env=environment(); const c=env.controller;
    c.setTargetAmount('0.03'); await c.scan(); await c.apply();
    env.cellsByRow[1][4].textContent='0.02';
    const before=env.metrics.writes.length;
    const verified=await attempt(c,'verify');
    assert.equal(verified.state.phase,'error');
    assert.equal(verified.state.rows[1].status,'校验失败');
    assert.equal(env.metrics.writes.length,before); noSubmit(env);
  });
  await test('restore preserves later manual input change',async()=>{
    const env=environment(); const c=env.controller;
    c.setTargetAmount('0.03'); await c.scan(); await c.apply();
    env.inputs[0].value='5.00';
    const restored=await attempt(c,'restore'); assert.equal(restored.error,null);
    assert.equal(env.values()[0],'5.00'); assert.equal(env.values()[1],'1.00');
    assert.equal(restored.state.canRestore,false); noSubmit(env);
  });
  await test('strict target parser rejects money decorations and exponent syntax',async()=>{
    const env=environment();
    for(const text of ['¥0.03','0.03元','1,000.00','+0.03','2e-2','.03','0.']) {
      assert.throws(()=>env.actual.parseTargetAmount(text),text);
    }
    assert.equal(env.actual.parseTargetAmount(' 1.25 '),125);
    assert.equal(env.actual.parseTargetAmount('90071992547409.91'),Number.MAX_SAFE_INTEGER);
    noSubmit(env);
  });
  await test('complete content script contains no click/submit/requestSubmit calls',async()=>{
    assert.equal(/\.\s*(?:click|submit|requestSubmit)\s*\(/.test(content),false);
  });
  fs.writeFileSync(path.join(__dirname,'controller-results.json'),JSON.stringify({
    sourcePath, sourceSha256:crypto.createHash('sha256').update(content).digest('hex'),
    execution:'Node VM actual money functions, actual rowOf and actual controller; table discovery/layout stubbed',
    fixtureOnly:true, liveJingmai:false, results,
  },null,2));
  if(results.some(x=>!x.passed)) process.exitCode=1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
module.exports = { environment, content, section, sourcePath };

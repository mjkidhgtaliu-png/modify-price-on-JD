const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '', 'playwright'));
const sourcePath=process.argv[2]?path.resolve(process.argv[2]):(fs.existsSync(path.join(__dirname,'../content.js'))?path.join(__dirname,'../content.js'):path.join(__dirname,'../jd-helper-custom/content.js'));
const content = fs.readFileSync(sourcePath,'utf8');
const results=[];
const privateNames=['PRIVATE_PRODUCT_A','PRIVATE_PRODUCT_B'];
const amounts=['100.00','76.00'];
const URL='https://shop.jd.com/jdm/trade/orders/order-list?fixture=1';
function headers(role = false, hidden = false) {
  const names = ['商品信息', '单价/数量', '原商品应付', '降价', '改后商品应付'];
  return role
    ? `<div role="row">${names.map(x => `<div role="columnheader">${x}</div>`).join('')}</div>`
    : `<thead${hidden ? ' style="display:none"' : ''}><tr>${names.map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
}

function rows(opts, role = false, suffix = '') {
  return amounts.map((amount, i) => {
    const tag = role ? 'div' : 'td';
    const attr = role ? ' role="cell"' : '';
    const cell = (content, extra = '') => `<${tag}${attr}${extra}>${content}</${tag}>`;
    const quantity = opts.quantity && i === 1 ? opts.quantity : 1;
    const originalMoney = opts.badMoney && i === 1 ? '金额待计算' : `¥${amount}`;
    const actualMoney = opts.badActual && i === 1 ? '¥76.00 ¥76.00' : `¥${amount}`;
    const relation = opts.badRelation && i === 1 ? '折 = 加' : '折 = 减';
    const input = `<input class="discount" type="text" value="10.00">${relation}<input class="reduction" type="text" value="${i === 1 ? '1.00' : '0.00'}">元`;
    let cells = [
      cell(`<span>${privateNames[i]}</span><small>SKU-${i}</small>`),
      cell(`<span>¥${amount}</span><div>x${quantity}</div>`),
      cell(originalMoney, ' class="original"'),
      cell(input, ' class="reduce-cell"'),
      cell(actualMoney, ' class="actual"')
    ];
    if (opts.badColumnCount && i === 1) cells.pop();
    const rtag = role ? 'div' : 'tr';
    const rattr = role ? ' role="row"' : '';
    return `<${rtag}${rattr} data-row-key="sku-${i}${suffix}" data-cents="${Math.round(Number(amount)*100)}"${opts.contents ? ' style="display:contents"' : ''}>${cells.join('')}</${rtag}>`;
  }).join('');
}

function fixture(opts = {}) {
  let table;
  if (opts.role) {
    table = `<div class="ant-table"><div role="table">${headers(true)}${rows(opts, true)}</div></div>`;
  } else if (opts.split) {
    const body = `<div class="ant-table-body"><table>${opts.hiddenHead ? headers(false, true) : ''}<tbody>${rows(opts)}</tbody></table></div>`;
    const other = opts.doubleBody ? `<div class="other-body"><table><tbody>${rows(opts, false, '-other')}</tbody></table></div>` : '';
    table = `<div class="ant-table"><div class="ant-table-header"><table>${headers()}</table></div>${body}${other}</div>`;
  } else {
    table = `<div class="ant-table"><table>${headers()}<tbody>${rows(opts)}</tbody></table></div>`;
  }
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
    body{font:14px sans-serif;margin:0;padding:20px}#dialog{margin-left:880px;width:800px;padding:20px;border:1px solid #aaa}
    table{border-collapse:collapse;width:100%}th,td,[role="cell"],[role="columnheader"]{padding:10px;border:1px solid #ddd}
    input{width:65px}small{display:block}button{padding:8px}
    [role="table"]{display:grid;grid-template-columns:repeat(5,1fr)}[role="row"]{display:contents}
    [role="columnheader"]{font-weight:bold;background:#eee}.original,.actual{white-space:nowrap}
    </style></head><body>
    <main>PRIVATE_ACCOUNT</main><section id="dialog" data-order-id="PRIVATE_ORDER_123"><h2>改价</h2>
    <label><input type="radio" name="mode"${opts.orderMode ? '' : ' checked'}>商品改价</label>
    <label><input type="radio" name="mode"${opts.orderMode ? ' checked' : ''}>订单改价</label>
    ${table}<button id="submit">确定改价</button></section>
    <script>
      window.fixtureEvents={submit:0,changes:[]};
      document.getElementById('submit').addEventListener('click',()=>fixtureEvents.submit++);
      document.querySelectorAll('.reduction').forEach(input=>{
        input.addEventListener('input',()=>fixtureEvents.changes.push(input.value));
        input.addEventListener('change',()=>{
          const row=input.closest('[data-row-key]');
          const actual=row.querySelector('.actual');
          if(actual)actual.textContent='¥'+((Number(row.dataset.cents)-Math.round(Number(input.value)*100))/100).toFixed(2);
        });
      });
    </script></body></html>`;
}

async function runCase(browser, name, opts, test) {
  const page=await browser.newPage({viewport:{width:1800,height:1100}});
  const errors=[];
  page.on('pageerror',err=>errors.push(String(err)));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture(opts)}));
  await page.goto(URL);
  await page.addScriptTag({content});
  try {
    await page.waitForFunction(()=>Boolean(window.__JD_PRICE_HELPER_CONTROLLER__));
    await test(page);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>fixtureEvents.submit),0,'must never click Jingmai submit');
    results.push({name,passed:true}); console.log('PASS',name);
  } catch(error) { results.push({name,passed:false,error:error.stack}); console.error('FAIL',name,error.message); }
  finally { await page.close(); }
}
const state=page=>page.evaluate(()=>window.__JD_PRICE_HELPER_CONTROLLER__.getState());
const call=(page,action)=>page.evaluate(async action=>{
  const c=window.__JD_PRICE_HELPER_CONTROLLER__;
  try{return {error:null,state:await c[action]()};}catch(error){return {error:error.message,state:c.getState()};}
},action);
const values=page=>page.locator('#dialog .reduction').evaluateAll(inputs=>inputs.map(x=>x.value));
const panel=page=>page.locator('#jm-price-helper');

async function lifecycle(page) {
  const before=await values(page);
  await panel(page).locator('#jm-target-amount').fill('0.03');
  assert.equal((await state(page)).targetCents,3);
  const scanned=await call(page,'scan');
  assert.equal(scanned.error,null); assert.equal(scanned.state.canApply,true);
  assert.deepEqual(scanned.state.rows.map(x=>x.reductionCents),[9997,7597]);
  assert.deepEqual(scanned.state.rows.map(x=>x.expectedCents),[3,3]);
  assert.deepEqual(await values(page),before,'scan is read only');
  const applied=await call(page,'apply');
  assert.equal(applied.error,null); assert.equal(applied.state.phase,'complete');
  assert.deepEqual(await values(page),['99.97','75.97']);
  assert.deepEqual(await page.locator('#dialog .discount').evaluateAll(inputs=>inputs.map(x=>x.value)),['10.00','10.00']);
  const verified=await call(page,'verify'); assert.equal(verified.error,null); assert.equal(verified.state.phase,'complete');
  await panel(page).locator('#jm-target-amount').fill('');
  assert.equal((await state(page)).canRestore,true);
  assert.equal(await panel(page).locator('button[data-action="restore"]').isDisabled(),false);
  const restored=await call(page,'restore'); assert.equal(restored.error,null);
  assert.deepEqual(await values(page),before);
}
async function blocker(page) {
  const before=await values(page);
  await panel(page).locator('#jm-target-amount').fill('0.03');
  const scanned=await call(page,'scan'); assert.equal(scanned.state.phase,'error'); assert.equal(scanned.state.canApply,false);
  const applied=await call(page,'apply'); assert.equal(applied.state.phase,'error');
  assert.deepEqual(await values(page),before); assert.deepEqual(await page.evaluate(()=>fixtureEvents.changes),[]);
}
async function main() {
  // Files are reusable in an actual browser but are synthetic fixtures, not snapshots of Jingmai.
  fs.mkdirSync(path.join(__dirname,'fixtures'),{recursive:true});
  for(const [name,opts] of [
    ['same-table',{}],['split-table',{split:true}],['hidden-repeated-head',{split:true,hiddenHead:true}],['display-contents',{role:true,contents:true}]
  ])fs.writeFileSync(path.join(__dirname,'fixtures',`${name}.html`),fixture(opts));
  let browser;
  try {
    const launch={headless:true}; if(process.env.JD_TEST_BROWSER)launch.executablePath=process.env.JD_TEST_BROWSER;
    browser=await chromium.launch(launch);
  }catch(error){
    if(/Executable doesn't exist|executable.*does not exist/i.test(error.message)){
      const report={fixtureOnly:true,liveJingmai:false,execution:'NOT EXECUTED: Playwright browser binary unavailable',reason:error.message.split('\n')[0],results:[]};
      fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(report,null,2));
      console.log(report.execution);return;
    }
    throw error;
  }
  try {
    for(const [name,opts] of [
      ['same-table',{}],['split-table',{split:true}],['split-table hidden repeated header',{split:true,hiddenHead:true}],['display:contents role rows',{role:true,contents:true}]
    ])await runCase(browser,`custom target ${name} lifecycle`,opts,lifecycle);
    for(const [name,opts] of [
      ['ambiguous two body tables',{split:true,doubleBody:true}],['quantity>1',{quantity:2}],
      ['invalid original amount',{badMoney:true}],['wrong column count',{badColumnCount:true}],
      ['incorrect input-label relation',{badRelation:true}],['order price mode',{orderMode:true}]
    ])await runCase(browser,name,opts,blocker);
    await runCase(browser,'UI default, +0.01/-0.01, invalid input and preview reset',{},async page=>{
      const p=panel(page); const input=p.locator('#jm-target-amount');
      assert.equal(await input.inputValue(),'0.01');
      assert.equal(await p.getByRole('button',{name:'目标金额减少0.01元',exact:true}).isDisabled(),true);
      await p.getByRole('button',{name:'目标金额增加0.01元',exact:true}).click();
      assert.equal(await input.inputValue(),'0.02');
      await p.getByRole('button',{name:'目标金额增加0.01元',exact:true}).click();
      assert.equal(await input.inputValue(),'0.03');
      await p.getByRole('button',{name:'目标金额减少0.01元',exact:true}).click();
      assert.equal(await input.inputValue(),'0.02');
      await call(page,'scan');
      await input.fill('1.25');
      assert.equal(await p.locator('[data-action="apply"]').isDisabled(),true);
      assert.equal((await state(page)).rows.length,0);
      for(const invalid of ['', '0','-1','0.001','1e2']){
        await input.fill(invalid);
        assert.equal(await input.getAttribute('aria-invalid'),'true');
        assert.equal(await p.locator('[data-action="scan"]').isDisabled(),true);
        assert.equal(await p.locator('[data-action="verify"]').isDisabled(),true);
      }
      assert.deepEqual(await page.evaluate(()=>fixtureEvents.changes),[]);
    });
  }finally {
    await browser.close();
    fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify({fixtureOnly:true,liveJingmai:false,execution:'Playwright Chromium synthetic DOM fixtures',results},null,2));
  }
  if(results.some(x=>!x.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});

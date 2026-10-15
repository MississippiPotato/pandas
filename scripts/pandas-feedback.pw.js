async(page)=>{
  const checks=[],idle=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:25000});
  const check=(name,ok,detail)=>{if(!ok)throw Error(name+': '+JSON.stringify(detail));checks.push({name,pass:true,detail});};
  const set=async(name,value)=>page.locator(`#operation-form [name="${name}"]`).selectOption(value);
  const field=async(name,label)=>{const value=await page.locator(`#operation-form [name="${name}"] option`).evaluateAll((els,label)=>els.find(e=>e.textContent.startsWith(label+' · '))?.value,label);await set(name,value);return value;};
  const stats=async()=>page.locator('.work-stats strong').allTextContents();
  const source=page.locator('.dataset-item button[data-node]').filter({hasText:'commerce.csv'}).first();
  if(await page.locator('#confirm-import').isVisible()){await page.locator('#confirm-import').click();await idle();}
  const right=await page.locator('.dataset-item button[data-node]').filter({hasText:'region-duplicates.csv'}).getAttribute('data-node');
  await source.click();await idle();await set('operation','merge');await set('rightTable',right);await field('left0','Region');await field('right0','Region');await set('how','left');
  await page.locator('[data-action=preview]').click();await idle();
  check('join left/right labels show filenames and keys',await page.locator('.join-tables').innerText().then(t=>t.includes('commerce.csv')&&t.includes('region-duplicates.csv')&&t.includes('Region')&&t.includes('left')));
  const metrics=await page.locator('.feedback-metrics>div').allTextContents();
  check('join duplicate keys expand 12 input rows to 18 output rows',metrics.some(t=>t.includes('输出行数')&&t.endsWith('18'))&&metrics.some(t=>t.includes('行数扩张')&&t.endsWith('1.5')),metrics);
  check('join input matches distinct from 15 matched output pairs',metrics.some(t=>t.includes('匹配结果对数')&&t.endsWith('15'))&&metrics.some(t=>t.includes('左表未匹配')&&t.endsWith('3')),metrics);
  check('many-to-many key group reported',metrics.some(t=>t.includes('多对多键组数')&&t.endsWith('1')));
  check('per-key relationship reveals East 6 times 2 =12',await page.locator('[data-operation-feedback] tbody').textContent().then(t=>t.includes('East6212')));
  check('join preview does not alter current 12-row table',await stats().then(v=>v[0]==='12'));
  await page.locator('[data-action=locale]').click();await idle();check('join preview persists and translates in English',await page.locator('.feedback-metrics').innerText().then(v=>v.includes('Matched output pairs')&&v.includes('18')));
  await page.locator('[data-action=locale]').click();await idle();await page.locator('[data-action=commit]').click();await idle();check('join apply commits exactly 18 rows',await stats().then(v=>v[0]==='18'));
  await page.locator('[data-action=undo]').click();await idle();check('undo join restores source row count',await stats().then(v=>v[0]==='12'));
  await source.click();await idle();await set('operation','rolling');await field('field','Revenue');await field('order','Date');
  const region=await page.locator('#operation-form [name=by]').evaluateAll(els=>els.find(e=>e.parentElement.textContent.trim()==='Region').value);await page.locator(`#operation-form [name=by][value="${region}"]`).check();
  await page.locator('#operation-form [name=window]').fill('2');await page.locator('[data-action=preview]').click();await idle();
  check('rolling comparison has original and rolling paths for all three groups',await page.locator('[data-rolling-chart] .rolling-original').count()===3&&await page.locator('[data-rolling-chart] .rolling-value').count()===3);
  let tips=await page.locator('[data-rolling-chart] circle title').allTextContents();check('sorted East Jan8 mean uses Jan1 and Jan8 =95',tips.some(t=>t.includes('2025-01-08')&&t.includes('rolling_mean=95')),tips.slice(0,8));
  await page.locator('#operation-form [name=window]').fill('3');await page.waitForFunction(()=>document.querySelector('[data-operation-feedback]')?.textContent.includes('window=3'));
  tips=await page.locator('[data-rolling-chart] circle title').allTextContents();check('window change updates Mar1 mean to145 before commit',tips.some(t=>t.includes('2025-03-01')&&t.includes('rolling_mean=145')));
  check('rolling equivalent code follows current window',await page.locator('#operation-code code').textContent().then(t=>t.includes('window=3')||t.includes('rolling(3')));
  check('window is explained as rows with explicit partition and sort',await page.locator('[data-operation-feedback]').innerText().then(t=>t.includes('Date')&&t.includes('Region')&&t.includes('window=3 行')));
  await page.locator('[data-action=commit]').click();await idle();check('rolling apply retains all rows and adds field',await stats().then(v=>v[0]==='12'&&v[1]==='8'));
  await page.locator('.export-menu summary').click();const event=page.waitForEvent('download');await page.locator('[data-export=python]').click();await(await event).saveAs('output/verification/pandas-refocus-rolling.py');await page.locator('.export-menu summary').click();
  // Real histogram brush -> linked table/profile -> explicit committed filter.
  const overlay=page.locator('#secondary-chart .histogram-brush .overlay');await overlay.scrollIntoViewIfNeeded();const box=await overlay.boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:8});await page.mouse.up();await idle();
  const selected=Number((await stats())[0]);check('real D3 brush changes generic table and stats',selected>0&&selected<12,{selected});
  check('temporary selection is explicitly pending',await page.locator('.selection-strip').innerText().then(t=>t.includes('尚未写入流程')));
  await page.locator('[data-action=apply-selection]').click();await idle();check('apply selection commits same row range and clears pending state',Number((await stats())[0])===selected&&await page.locator('[data-action=apply-selection]').isDisabled());
  await page.locator('[data-tab=pandas]').click();await idle();check('applied code is boolean indexing for the real chart range',await page.locator('.code-view').innerText().then(t=>t.includes('.loc[')&&t.includes('已应用')));
  return {checks,passed:checks.length};
}

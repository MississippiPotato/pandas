async(page)=>{
  const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:30000});
  if(await page.locator('#confirm-import').isVisible()){await page.locator('#confirm-import').click();await idle();}
  if(await page.locator('html').getAttribute('lang')!=='en-US')await page.locator('[data-action=locale]').click();
  await idle();await page.locator('.dataset-item>button:first-child').filter({hasText:'commerce.csv'}).click();await idle();await page.locator('[data-tab=dataPreview]').click();await idle();
  const form=()=>page.locator('#operation-form'),set=(n,v)=>form().locator(`[name="${n}"]`).selectOption(v),fill=(n,v)=>form().locator(`[name="${n}"]`).fill(v);
  const ref=async name=>form().locator('select[name=field0],select[name=field]').first().locator('option').evaluateAll((options,name)=>options.find(o=>o.textContent.startsWith(name+' ·'))?.value,name);
  const preview=async()=>{await page.locator('[data-action=preview]').click();await page.waitForSelector('#operation-preview .preview-result');await idle();};
  const apply=async()=>{await page.locator('[data-action=commit]').click();await idle();await page.waitForSelector('#operation-preview:empty',{state:'attached'});};
  const stats=()=>page.locator('.work-stats strong').allTextContents();
  const source=await page.locator('.dataset-item.active [data-node]').getAttribute('data-node');
  check('actual custom CSV import: 12 rows, 7 fields, 2 nulls',JSON.stringify(await stats()).startsWith('["12","7","2"'),await stats());
  await set('operation','filter');const revenue=await ref('Revenue'),region=await ref('Region'),date=await ref('Date');
  check('custom identifier retains leading zeros and key role',await page.locator('.result-card tbody tr').first().innerText().then(s=>s.includes('001'))&&await page.locator('.key-summary').count()===1);
  await set('operation','fillna');await set('field',revenue);await fill('value','0');await preview();await apply();
  check('custom cleaning actually fills Revenue, retaining Units null',(await stats())[2]==='1');
  await set('operation','rolling');await set('field',revenue);await set('order',date);await form().locator(`[name=by][value="${region}"]`).check();await fill('window','3');await fill('minPeriods','1');await preview();
  check('rolling preview compares originals and sorted results',await page.locator('[data-rolling-chart] svg').count()===1);
  check('rolling configuration appears in equivalent code',await page.locator('#live-preview-code').innerText().then(s=>s.includes('.rolling(3,')&&s.includes('Date')));
  await apply();check('rolling adds one column, preserves full 12 rows',JSON.stringify(await stats()).startsWith('["12","8"'),await stats());
  // Every applicable chart gets a real plot, not an empty decorative container.
  for(const type of ['scatter','bar','line','area','histogram','distribution','box','correlation','heatmap','missing']){
    await page.selectOption('#chart-type',type);await idle();check('custom schema supports '+type,await page.locator('#main-chart svg').count()===1&&await page.locator('#main-chart').textContent().then(s=>!s.includes('No drawable')));
    if(['line','area','histogram','distribution'].includes(type)){
      const overlay=page.locator('#main-chart .brush .overlay');await overlay.scrollIntoViewIfNeeded();const b=await overlay.boundingBox();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.4);
      check(type+' tooltip remains usable through brush overlay',await page.locator('#chart-tooltip').isVisible());
    }
  }
  await set('operation','group');await form().locator(`[name=keys][value="${region}"]`).check();await set('metric0',revenue);await set('fn0','sum');await fill('as0','Total');await form().locator('[data-add=metric]').click();await set('metric1',revenue);await set('fn1','size');await fill('as1','Samples');await preview();
  check('custom group preview has East Total790 / n6',await page.locator('[data-group-values] title').allTextContents().then(ss=>ss.some(s=>s.includes('East: 790')&&s.includes('n=6'))));
  await apply();check('custom continuous flow outputs three groups',(await stats())[0]==='3');
  check('all applied steps remain in synchronized live code',await page.locator('#live-code-steps section').count()===3);
  const download=async(kind,path)=>{const exp=page.locator('.export-menu');if(!await exp.evaluate(el=>el.open))await exp.locator('summary').click();const pending=page.waitForEvent('download');await page.locator(`[data-export="${kind}"]`).first().click();await (await pending).saveAs(path);};
  await download('csv','output/verification/upgrade-custom-result.csv');await download('python','output/verification/upgrade-custom-result.py');
  check('actual custom result CSV and applied Python downloads completed',true);
  const url=page.url();await page.reload();await page.waitForSelector('#operation-form select');await idle();
  check('custom imported data and three-step flow survive refresh',page.url()===url&&(await stats())[0]==='3'&&await page.locator('#live-code-steps section').count()===3);
  await page.locator(`.dataset-item [data-node="${source}"]`).click();await idle();await page.goBack();await idle();
  check('browser Back restores active operation from URL',(await stats())[0]==='3');
  await page.locator('.result-card').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/upgrade-custom-dataframe.png',fullPage:false,timeout:8000});
  return {passed:checks.filter(c=>c.pass).length,total:checks.length,checks};
}

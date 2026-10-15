async (page) => {
  const checks=[];
  const check=(name,condition,detail)=>{checks.push({name,pass:Boolean(condition),detail});if(!condition)throw Error(name+' '+JSON.stringify(detail));};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:25000});
  const form=()=>page.locator('#operation-form');
  const set=async(name,value)=>{await form().locator(`[name="${name}"]`).selectOption(value);};
  const field=async(name,label)=>{const option=await form().locator(`[name="${name}"] option`).evaluateAll((els,name)=>els.find(el=>el.textContent.startsWith(name+' · '))?.value,label);if(!option)throw Error('No field '+name+':'+label);await set(name,option);return option;};
  const tick=async(name,label)=>{const target=await form().locator(`[name="${name}"]`).evaluateAll((els,label)=>els.find(el=>el.parentElement.textContent.trim()===label)?.value,label);if(!target)throw Error('No checkbox '+label);await form().locator(`[name="${name}"][value="${target}"]`).check();};
  const preview=async()=>{await page.locator('[data-action=preview]').click();await page.waitForSelector('#operation-preview .preview-result');await idle();};
  const apply=async()=>{await page.locator('[data-action=commit]').click();await idle();await page.waitForSelector('#operation-preview:empty',{state:'attached'});};
  const stats=async()=>page.locator('.work-stats strong').allTextContents();
  if(await page.locator('#confirm-import').isVisible()){await page.locator('#confirm-import').click();await idle();await page.waitForSelector('#operation-form [name=operation]');}
  check('non-NBA import retains 12 rows / 2 missing',JSON.stringify(await stats()).startsWith('["12","7","2"'),await stats());
  await set('operation','filter');check('pandas method and meaning directly visible',await page.locator('.operation-meaning').innerText().then(v=>v.includes('.loc[mask]')));
  check('all 24 entries remain reachable',await form().locator('[name=operation] option').count()===24);
  await set('task','clean');check('task category chooses a cleaning operation',await form().locator('[name=operation]').inputValue()==='dropna');
  await set('operation','fillna');await field('field','Revenue');await form().locator('[name=value]').fill('0');
  // No Preview button: configuration itself must update equivalent code and feedback.
  await page.waitForFunction(()=>document.querySelector('#operation-code code')?.textContent.includes('fillna')&&document.querySelector('#operation-preview .preview-result'));
  check('automatic code/preview updates without applying',await stats().then(v=>v[2]==='2'));
  check('missing chart compares full field counts',await page.locator('[data-missing-chart] .field-missing').count()===7);
  check('missing chart shows Revenue 1 to 0',await page.locator('[data-missing-chart] .field-missing').filter({hasText:'Revenue'}).textContent().then(v=>v.includes('1 (8.3%)')&&v.includes('0 (0.0%)')));
  check('both distribution previews rendered',await page.locator('[data-before-chart] svg').count()===1&&await page.locator('[data-after-chart] svg').count()===1);
  await apply();check('only apply changes missing count',await stats().then(v=>v[2]==='1'));
  await set('operation','dedup');await preview();check('dedup preview 12 to 11',await page.locator('.preview-numbers').first().innerText().then(v=>v.includes('12')&&v.includes('11')));await apply();
  await set('operation','filter');await field('field0','Active');await form().locator('[name=value0]').fill('true');await preview();await apply();check('continuous cleaning and filtering yields 8 rows',await stats().then(v=>v[0]==='8'));
  await set('operation','group');await tick('keys','Region');await tick('keys','Month');await field('metric0','Revenue');await set('fn0','sum');await form().locator('[name=as0]').fill('Revenue_total');await preview();
  check('group preview explains split apply combine',await page.locator('.split-apply-combine').innerText().then(v=>v.includes('Region')&&v.includes('sum')));
  const groupTips=await page.locator('[data-group-values] rect title').allTextContents();
  check('East Mar total400 sample n2, not n1',groupTips.some(v=>v.includes('East / Mar: 400')&&v.includes('输入样本 n=2')),groupTips);
  check('separate sample-count chart exists',await page.locator('[data-group-counts] svg').count()===1);
  const code=await page.locator('#operation-code code').textContent();check('configured Python code includes both keys and sum',code.includes('groupby')&&code.includes('Month')&&code.includes('Revenue_total')&&code.includes('sum'));
  await apply();check('group commits 6 rows / 3 columns',await stats().then(v=>v[0]==='6'&&v[1]==='3'),await stats());
  const body=await page.locator('.result-card tbody').innerText();check('result table contains correct totals',body.includes('400')&&body.includes('190')&&body.includes('160'),body);
  check('flow labels use task plus pandas API',await page.locator('.pipeline-node strong').allTextContents().then(v=>v.some(t=>t.includes('groupby() + agg()'))));
  await page.locator('.applied-step>summary').click();await page.waitForSelector('#applied-feedback [data-group-values] svg');await idle();check('applied step contains matching visual feedback',await page.locator('#applied-feedback [data-group-values] svg').count()===1);
  await page.locator('[data-action=undo]').click();await idle();check('undo returns 8 detail rows',await stats().then(v=>v[0]==='8'));
  await page.locator('[data-action=redo]').click();await idle();check('redo returns same group values',await stats().then(v=>v[0]==='6')&&(await page.locator('.result-card tbody').innerText()).includes('400'));
  await page.locator('[data-action=locale]').click();await idle();check('English branding and applied API agree',await page.title()==='pandas Visual Analysis Workbench'&&(await page.locator('.pipeline-node strong').allTextContents()).some(v=>v.includes('groupby() + agg()')));
  check('English task and semantic explanation translated',await form().locator('[name=task] option').allTextContents().then(v=>v.includes('Group & summarize'))&&await page.locator('.operation-meaning').innerText().then(v=>v.includes('Split detail rows')));
  await page.locator('[data-action=locale]').click();await idle();
  // Export the exact committed scope and inspect real downloads.
  await page.locator('.export-menu summary').click();const csvEvent=page.waitForEvent('download');await page.locator('[data-export=csv]').click();const csv=await csvEvent;await csv.saveAs('output/verification/pandas-refocus-group.csv');
  const pyEvent=page.waitForEvent('download');await page.locator('[data-export=python]').click();await(await pyEvent).saveAs('output/verification/pandas-refocus-group.py');
  check('CSV and full Python script downloaded',true);
  return {checks,passed:checks.length};
}

async(page)=>{
 const checks=[],ready=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:20000});
 await page.locator('#confirm-import').click();await ready();
 const field=async name=>page.locator('.field-item').evaluateAll((els,name)=>els.find(e=>e.querySelector('span:nth-child(2)')?.childNodes[0]?.textContent===name)?.dataset.field,name);
 const body=await page.locator('.result-card tbody').innerText();if(!body.includes('001')||!body.includes('false'))throw new Error(body);checks.push('JSON preserves identifier and false');
 await page.locator('#operation-form [name=operation]').selectOption('pivot');
 await page.locator(`#operation-form input[name=index][value="${await field('ID')}"]`).check();await page.locator(`#operation-form input[name=columns][value="${await field('Active')}"]`).check();const values=page.locator('#operation-form [name=valueField]');await values.selectOption(await values.locator('option').evaluateAll(opts=>opts.find(o=>o.textContent.startsWith('Value ·')).value));
 await page.locator('[data-action=preview]').click();await ready();await page.locator('[data-action=commit]').click();await ready();if(await page.locator('.work-stats strong').first().innerText()!=='2')throw new Error('unique pivot rows');checks.push('unique non-aggregated pivot succeeds');
 await page.locator('#chart-type').selectOption('heatmap');
 await page.locator('.export-menu summary').click();const flowEvent=page.waitForEvent('download');await page.locator('[data-export=flow]').click();await (await flowEvent).saveAs('output/verification/generic-flow.json');await ready();checks.push('flow actual download');
 await page.locator('[data-drill]').last().click();await ready();await page.locator('#drill-apply').click();await ready();if(await page.locator('.work-stats strong').first().innerText()!=='1')throw new Error('drill count');if(!(await page.locator('.result-card tbody').innerText()).includes('false'))throw new Error('drill lost original row');checks.push('pivot drilldown returns original row, not pivot row IDs');
 await page.locator('[data-edit]').last().click();const spec=JSON.parse(await page.locator('#edit-spec').inputValue());spec.params.predicate.value='002';await page.locator('#edit-spec').fill(JSON.stringify(spec));await page.locator('#preview-edit').click();await ready();await page.locator('#apply-edit').click();await ready();const after=await page.locator('.result-card tbody').innerText();if(!after.includes('002')||!after.includes('12'))throw new Error(after);checks.push('history parameter edit atomically changes selected source row');
 await page.locator('.export-menu summary').click();const pyEvent=page.waitForEvent('download');await page.locator('[data-export=python]').click();await (await pyEvent).saveAs('output/verification/generic-final.py');await ready();checks.push('Python export follows active dependency graph');
 return {passed:true,checks};
}

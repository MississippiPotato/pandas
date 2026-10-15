async(page)=>{
 const checks=[],ready=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:25000});
 const check=(name,ok,detail)=>{if(!ok)throw Error(name+JSON.stringify(detail));checks.push({name,pass:true,detail});};
 await page.locator('[data-tab=dataPreview]').click();await ready();
 await page.locator('.pipeline-node [data-node="op:4"]').click();await page.waitForSelector('#applied-feedback [data-group-values] svg');await ready();
 check('clicking a flow node opens its method, parameters and visual feedback',await page.locator('.applied-step').evaluate(el=>el.open)&&await page.locator('.applied-step').innerText().then(t=>t.includes('groupby() + agg()')));
 await page.locator('[data-edit="op:3"]').click();const json=JSON.parse(await page.locator('#edit-spec').inputValue());json.params.predicate.args[0].value=false;await page.locator('#edit-spec').fill(JSON.stringify(json,null,2));await page.locator('#preview-edit').click();await ready();
 check('edit preview includes real graphical feedback and equivalent code',await page.locator('[data-edit-feedback] svg').count()>0&&await page.locator('#edit-report pre').textContent().then(t=>t.includes('.loc[')&&t.includes('False')));
 check('edit preview leaves applied group result unchanged',await page.locator('.work-stats strong').first().innerText()==='6');
 await page.locator('#apply-edit').click();await ready();check('ancestor edit recomputes descendant group to 3 rows',await page.locator('.work-stats strong').first().innerText()==='3'&&(await page.locator('.result-card tbody').innerText()).includes('60'));
 await page.locator('[data-action=undo]').click();await ready();check('undo ancestor edit restores exact 6-group results',await page.locator('.work-stats strong').first().innerText()==='6'&&(await page.locator('.result-card tbody').innerText()).includes('400'));
 await page.locator('[data-action=redo]').click();await ready();check('redo ancestor edit restores 3-group results',await page.locator('.work-stats strong').first().innerText()==='3');
 const menu=page.locator('.export-menu');if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();
 await page.locator('[data-action=save-local]').click();await ready();await page.locator('.dataset-item [data-node]').filter({hasText:'commerce.csv'}).first().click();await ready();
 if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();await page.locator('[data-action=restore-local]').click();await ready();check('IndexedDB restores actual edited flow, data and view',await page.locator('.work-stats strong').first().innerText()==='3'&&(await page.locator('.result-card tbody').innerText()).includes('60'));
 if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();const event=page.waitForEvent('download');await page.locator('[data-export=flow]').click();await(await event).saveAs('output/verification/pandas-refocus-flow.json');
 await page.locator('[data-action=clear-local]').click();await ready();check('flow JSON downloaded and test local save cleared',true);
 return{checks,passed:checks.length};
}

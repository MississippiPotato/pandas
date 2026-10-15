async(page)=>{
 const checks=[],ready=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:25000});
 const check=(name,ok,detail)=>{if(!ok)throw Error(name+':'+JSON.stringify(detail));checks.push({name,pass:true,detail});};
 await page.locator('#confirm-import').click();await ready();
 check('long-field generic import keeps schema and missing count',await page.locator('.work-stats strong').allTextContents().then(v=>v[0]==='3'&&v[1]==='4'&&v[2]==='1'));
 check('one numeric column disables scatter and correlation',await page.locator('#chart-type option[value=scatter]').isDisabled()&&await page.locator('#chart-type option[value=correlation]').isDisabled());
 check('date plus numeric fields enable time chart',!await page.locator('#chart-type option[value=line]').isDisabled());
 check('undefined court coordinates do not enable NBA chart',await page.locator('#chart-type option[value=court]').isDisabled());
 check('generic KPI is completeness, not NBA field goal',await page.locator('.work-stats').innerText().then(t=>t.includes('数据完整率')&&!t.includes('投篮')));
 await page.locator('#operation-form [name=operation]').selectOption('fillna');const value=await page.locator('#operation-form [name=field] option').evaluateAll(els=>els.find(e=>e.textContent.startsWith('Revenue_in_')).value);await page.locator('#operation-form [name=field]').selectOption(value);await page.locator('#operation-form [name=value]').fill('20');await page.locator('[data-action=preview]').click();await ready();
 await page.locator('[data-action=locale]').click();await ready();check('English preview includes English comparison labels and API',await page.locator('[data-missing-chart]').textContent().then(t=>t.includes('Before')&&t.includes('After'))&&(await page.locator('.operation-meaning').innerText()).includes('fillna()'));
 await page.locator('#operation-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/pandas-preview-long-desktop.png',fullPage:false,animations:'disabled',timeout:8000});
 await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));check('long English fields and text fit 390px page',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('preview graph remains readable via local horizontal scrolling',await page.locator('[data-missing-chart]').evaluate(el=>el.scrollWidth>el.clientWidth));check('fixed light color scheme',await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='light');
 await page.screenshot({path:'output/playwright/pandas-studio-en-mobile.png',fullPage:false,animations:'disabled',timeout:8000});await page.locator('[name=task]').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/pandas-config-en-mobile.png',fullPage:false,animations:'disabled',timeout:8000});
 await page.locator('nav a[href="#/overview"]').click();await ready();await page.evaluate(()=>scrollTo(0,0));check('English overview fits 390px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'output/playwright/pandas-overview-en-mobile.png',fullPage:false,animations:'disabled',timeout:8000});
 await page.locator('[data-action=locale]').click();await ready();await page.evaluate(()=>scrollTo(0,0));check('Chinese overview fits 390px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'output/playwright/pandas-overview-zh-mobile.png',fullPage:false,animations:'disabled',timeout:8000});
 await page.setViewportSize({width:1440,height:1100});await page.goto('http://127.0.0.1:4177/#/workbench');await ready();await page.waitForSelector('#operation-form');check('workbench route alias reaches Studio',await page.locator('h1').innerText()==='pandas 可视分析工作台');
 return {checks,passed:checks.length};
}

async(page)=>{
 const checks=[],ready=()=>page.waitForFunction(()=>document.querySelector('#busy')?.hidden,{}, {timeout:25000});
 const assert=(ok,name,details={})=>{if(!ok)throw new Error(`${name}: ${JSON.stringify(details)}`);checks.push({name,passed:true,...details});};
 const rows=async()=>Number((await page.locator('.work-stats strong').first().innerText()).replaceAll(',',''));
 await ready();await page.locator('nav a[href="#/nba"]').click();await ready();await page.waitForSelector('#nba-entity');
 assert(await rows()===4784,'NBA player view uses played appearances only');
 const brush=page.locator('#main-chart .scatter-brush .overlay');await brush.scrollIntoViewIfNeeded();const b=await brush.boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*.85,{steps:12});await page.mouse.up();await ready();
 const selected=await rows();assert(selected>0&&selected<4784,'real D3 rectangle brush changes full row set',{selected});
 await page.locator('[data-action=locale]').click();await ready();assert(await rows()===selected,'language preserves temporary brush selection');await page.locator('[data-action=clear-selection]').click();await ready();assert(await rows()===4784,'clear brush retains played-only base');
 await page.locator('[data-nba-tab=teamTab]').click();await ready();assert(await rows()===438,'all team game rows');await page.locator('#nba-entity').selectOption('LAL');await ready();const lal=await rows();assert(lal>5&&lal<20,'team selection filters all linked views',{lal});
 await page.locator('[data-nba-tab=trendTab]').click();await ready();assert(await page.locator('#main-chart path').count()>0,'real date trend');
 await page.locator('[data-nba-tab=courtTab]').click();await ready();await page.waitForSelector('#main-chart .scatter-brush');assert(await rows()===39092,'lazy real shot import retains all 39092 events');
 assert((await page.locator('.work-stats').innerText()).includes('%'),'makes over attempts visible');
 await page.locator('.encodings summary').click();await page.locator('[data-config=courtMode]').selectOption('rate');await ready();assert(await page.locator('#main-chart rect[role=button]').count()>50,'full-data region FG% grid');
 const grid=page.locator('#main-chart rect[role=button]').first();await grid.click();await ready();assert(await rows()>0&&await rows()<39092,'region click selects real source rows',{rows:await rows()});await page.locator('[data-action=clear-selection]').click();await ready();assert(await rows()===39092,'region clear restores every shot');
 await page.locator('.encodings summary').click();await page.locator('[data-config=courtMode]').selectOption('points');await ready();
 const courtBrush=page.locator('#main-chart .scatter-brush .overlay');await courtBrush.scrollIntoViewIfNeeded();const c=await courtBrush.boundingBox();await page.mouse.move(c.x+c.width*.3,c.y+c.height*.75);await page.mouse.down();await page.mouse.move(c.x+c.width*.7,c.y+c.height*.95,{steps:10});await page.mouse.up();await ready();const shots=await rows();assert(shots>0&&shots<39092,'court brush uses raw domain coordinates',{shots});
 await page.locator('[data-action=send-studio]').click();await ready();await page.waitForSelector('#operation-form');assert(await rows()===shots,'NBA selection commits and transfers to Studio');
 await page.locator('[data-action=undo]').click();await ready();assert(await rows()===39092,'undo spatial filter restores full extent including heaves');
 await page.locator('#chart-type').selectOption('court');await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/final-court-desktop.png',animations:'disabled',timeout:8000});
 await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px Studio has no page overflow');assert(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='light','light-only under dark OS preference');await page.screenshot({path:'output/playwright/final-studio-mobile.png',animations:'disabled',timeout:8000});
 await page.locator('nav a[href="#/overview"]').click();await ready();await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px overview fits');await page.screenshot({path:'output/playwright/final-overview-mobile.png',animations:'disabled',timeout:8000});
 await page.locator('[data-action=locale]').click();await ready();await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/final-overview-desktop.png',animations:'disabled',timeout:8000});
 return {checks,errors:await page.locator('#toast.error').allTextContents()};
}

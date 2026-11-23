const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 const tap=async selector=>{const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/cube/steps.html'});await until("document.querySelectorAll('.guide-stage').length===7&&document.querySelectorAll('.guide-sequence').length===1");
 const initial=await evaluate("({nodes:document.querySelectorAll('*').length,cubies:document.querySelectorAll('.cubie').length,figures:document.querySelectorAll('.step-diagram,.face-diagram').length,words:document.body.innerText.length,frames:document.querySelectorAll('.guide-frame').length})");
 const old=JSON.parse(fs.readFileSync(path.join(qa,'manual-baseline.json'),'utf8'));assert.ok(initial.nodes<old.nodes*.1);assert.equal(initial.cubies,0);assert.equal(initial.frames,3);
 await evaluate("localStorage.setItem('cube-coach/progress1','saved-untouched')");await shot('manual-desktop');
 for(const width of [390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await shot('manual-'+width);
 }
 const keys=await evaluate('CubeStepDiagrams.STAGES.map(s=>s.key)');
 for(const key of keys){
  if(key!=='cross')await tap('#step-'+key+' > summary');await until('document.querySelector("#step-'+key+' .guide-sequence")!==null');
  const recipes=await evaluate('CubeStepDiagrams.STAGES.find(s=>s.key==='+JSON.stringify(key)+').recipes.map(r=>({id:r.id,count:CubeStepDiagrams.lesson(r).length}))');
  for(const recipe of recipes){
   if(recipes.length>1)await tap('#step-'+key+' [data-case="'+recipe.id+'"]');
   const actual=await evaluate('({count:document.querySelectorAll("#step-'+key+' .guide-frame").length,arrows:document.querySelectorAll("#step-'+key+' .diagram-arrowhead").length,result:document.querySelector("#step-'+key+' .guide-frame:last-child").classList.contains("is-result")})');
   assert.equal(actual.count,recipe.count);assert.ok(actual.arrows>0&&actual.result);
  }
 }
 await tap('[data-guide-stage="yellowCross"]');await until('document.querySelector("[aria-current=step]").dataset.guideStage==="yellowCross"');await shot('manual-yellow-cross');
 const before=await evaluate('({cases:[...document.querySelectorAll(".guide-case[aria-pressed=true]")].map(e=>e.dataset.case),open:[...document.querySelectorAll(".guide-stage[open]")].map(e=>e.id)})');
 await click('lang-switch');await sleep(100);assert.equal(await evaluate('document.querySelector(".guide-header h1").textContent'),'Solve with pictures');assert.equal(await evaluate('document.querySelector("[aria-current=step]").dataset.guideStage'),'yellowCross');
 const after=await evaluate('({cases:[...document.querySelectorAll(".guide-case[aria-pressed=true]")].map(e=>e.dataset.case),open:[...document.querySelectorAll(".guide-stage[open]")].map(e=>e.id)})');assert.deepEqual(after,before);
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
 assert.equal(await evaluate("localStorage.getItem('cube-coach/progress1')"),'saved-untouched');
 const allOpen=await evaluate('document.querySelectorAll("*").length');assert.ok(allOpen<old.nodes*.2);
 await tap('#step-corners > summary');await until('!document.getElementById("step-corners").open');
 await tap('[data-guide-stage="corners"]');await until('document.getElementById("step-corners").open');assert.equal(await evaluate('document.querySelectorAll("#step-corners .guide-sequence").length'),1);
 await tap('.guide-home');await until('!!window.CubeProgress&&!!document.getElementById("screen-start")');assert.equal(await evaluate('document.getElementById("screen-start").hidden'),false);
 const report={initial,old,allOpen,nodeReduction:Math.round((1-initial.nodes/old.nodes)*100),allRecipes:true,languagePreservesChoices:true,mobile:true,backToChooser:true};fs.writeFileSync(path.join(qa,'manual-report.json'),JSON.stringify(report));console.log(JSON.stringify(report));await send('Browser.close');
`+cleanup);

const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 const tap=async selector=>{const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 const report=[];await send('Page.enable');
 for(const [width,height] of [[1280,900],[390,844],[320,640]])for(const lang of ['vi','en']){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin+'/cube/steps.html'});await until('document.querySelectorAll(".guide-centre-card").length===6');await evaluate('CubeLang.set('+JSON.stringify(lang)+')');
  assert.equal(await evaluate('document.getElementById("stages").hidden'),true);assert.equal(await evaluate('document.querySelectorAll(".guide-stage").length'),0);assert.equal(await evaluate('[...document.querySelectorAll(".guide-mini-centre .is-centre")].every(e=>e.style.background==="transparent")'),true);assert.equal(await evaluate('document.querySelectorAll("[data-centre-colour]").length'),6);assert.equal(await evaluate('[...document.querySelectorAll("[data-centre-colour],.guide-centre-card")].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})'),true);
  await evaluate('localStorage.setItem("cube-coach/progress1","saved-lesson");localStorage.setItem("cube-coach/cube2","saved-colours")');if(lang==='vi')await shot('all-centres-empty-'+width);
  const desired={D:'blue',U:'red',F:'yellow',R:'green',B:'white',L:'orange'},order=['D','U','F','R','B','L'];
  for(let i=0;i<order.length;i++){
   const face=order[i],colour=desired[face];await tap('[data-centre-colour="'+colour+'"]');
   assert.equal(await evaluate('document.querySelector("[data-face='+face+'] .guide-centre-value").textContent'),await evaluate('CubeLang.colour('+JSON.stringify(colour)+')'));
   if(i<5){assert.equal(await evaluate('document.getElementById("stages").hidden'),true);const next=order[i+1];assert.equal(await evaluate('document.querySelector(".guide-centre-card[aria-pressed=true]").dataset.face'),next);assert.equal(await evaluate('document.querySelector("[data-face='+next+'] .is-centre").style.background'),'transparent');}
  }
  await until('document.querySelectorAll(".guide-stage").length===7');const expected=await evaluate('CubeStepDiagrams.schemeForCentres('+JSON.stringify(desired)+')');
  const validate=async scheme=>{
   const actual=await evaluate('(()=>{const G=CubeStepDiagrams,poly=document.querySelectorAll("#guide-configured-cube [data-facelet]"),fills=Object.fromEntries([...poly].filter(e=>[4,13,22].includes(+e.dataset.facelet)).map(e=>[e.dataset.facelet,e.getAttribute("fill")]));return{fills,base:document.querySelector("#step-cross h2").textContent.toLowerCase(),top:document.querySelector("#step-yellowCross h2").textContent.toLowerCase(),goal:[...document.querySelectorAll("#step-yellowCross .guide-goal rect")].map(e=>e.getAttribute("fill")),overflow:document.documentElement.scrollWidth>innerWidth}})()');
   assert.deepEqual(actual.fills,{'4':scheme.colours[0],'13':scheme.colours[1],'22':scheme.colours[2]});assert.ok(actual.base.includes(await evaluate('CubeLang.colour('+JSON.stringify(scheme.base)+')')));assert.ok(actual.top.includes(await evaluate('CubeLang.colour('+JSON.stringify(scheme.top)+')')));assert.equal(actual.goal.filter(c=>c===scheme.colours[0]).length,5);assert.equal(actual.overflow,false);
  };await validate(expected);if(lang==='vi')await shot('all-centres-custom-'+width);
  await evaluate('document.querySelector("[data-guide-stage=corners]").click()');await until('document.querySelector("#step-corners [data-case=front]")!==null');await sleep(500);await tap('#step-corners [data-case=front]');
  await tap('[data-face=F]');await tap('[data-centre-colour=red]');const edited={...desired,F:'red',U:'yellow'};await validate(await evaluate('CubeStepDiagrams.schemeForCentres('+JSON.stringify(edited)+')'));assert.equal(await evaluate('document.getElementById("guide-face-status").textContent.length>0'),true);assert.equal(await evaluate('document.querySelector("#step-corners [data-case=front]").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector("[data-face=B]").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert.equal(await evaluate('document.querySelector(".guide-centre-card[aria-pressed=true]").dataset.face'),'B');
  await click('lang-switch');await sleep(100);await validate(await evaluate('CubeStepDiagrams.schemeForCentres('+JSON.stringify(edited)+')'));assert.equal(await evaluate('document.querySelector("#step-corners [data-case=front]").getAttribute("aria-pressed")'),'true');
  assert.equal(await evaluate('localStorage.getItem("cube-coach/progress1")'),'saved-lesson');assert.equal(await evaluate('localStorage.getItem("cube-coach/cube2")'),'saved-colours');
  await click('guide-centre-reset');assert.equal(await evaluate('document.getElementById("stages").hidden'),true);assert.equal(await evaluate('[...document.querySelectorAll(".guide-mini-centre .is-centre")].every(e=>e.style.background==="transparent")'),true);
  report.push({width,lang,customOpposites:true,allSixFaces:true,noAutomaticColours:true,swaps:true,keyboard:true,language:true});
 }
 console.log(JSON.stringify(report));await send('Browser.close');
`+cleanup);

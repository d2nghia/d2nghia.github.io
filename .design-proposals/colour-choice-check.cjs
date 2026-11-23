const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 const tap=async selector=>{const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 await send('Page.enable');const results=[];
 for(const [width,height] of [[1280,900],[390,844],[320,640]])for(const lang of ['vi','en']){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin+'/cube/steps.html'});await until('!!window.CubeStepDiagrams&&!!window.CubeLang');await evaluate('CubeLang.set('+JSON.stringify(lang)+')');
  assert.equal(await evaluate('document.querySelector("input[name=guide-base]:checked")'),null);assert.equal(await evaluate('document.getElementById("stages").hidden'),true);assert.equal(await evaluate('document.getElementById("guide-nav").hidden'),true);assert.equal(await evaluate('document.querySelectorAll(".guide-stage").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("input[name=guide-base]").length'),6);await evaluate('localStorage.setItem("cube-coach/progress1","keep-the-lesson");localStorage.setItem("cube-coach/cube2","keep-the-colours")');
  if(lang==='vi')await shot('colour-choice-empty-'+width);
  const colours=await evaluate('CubeStepDiagrams.NAMES');
  for(const base of colours){
   await tap('label:has(input[value="'+base+'"])');await until('document.querySelectorAll(".guide-stage").length===7');
   const result=await evaluate('(()=>{const b='+JSON.stringify(base)+',G=CubeStepDiagrams,s=G.orientation(b),baseName=CubeLang.colour(b),topName=CubeLang.colour(s.top),stage4=document.getElementById("step-yellowCross");return{selected:document.querySelector("input[name=guide-base]:checked").value,base:document.querySelector("#step-cross h2").textContent.toLowerCase().includes(baseName),top:stage4.querySelector("h2").textContent.toLowerCase().includes(topName),goal:[...stage4.querySelectorAll(".guide-goal rect")].filter(n=>n.getAttribute("fill")===G.HEX[s.top]).length,orientation:document.getElementById("guide-base-name").textContent===baseName&&document.getElementById("guide-top-name").textContent===topName&&document.getElementById("guide-front-name").textContent===CubeLang.colour(s.front),placeholders:/\\{(?:base|top|front)\\}/.test(document.getElementById("stages").textContent),overflow:document.documentElement.scrollWidth>innerWidth,local:localStorage.getItem("cube-coach/progress1"),legacy:localStorage.getItem("cube-coach/cube2")}})()');
   assert.equal(result.selected,base);assert.ok(result.base&&result.top&&result.orientation);assert.equal(result.goal,5);assert.ok(!result.placeholders&&!result.overflow);assert.equal(result.local,'keep-the-lesson');assert.equal(result.legacy,'keep-the-colours');
   if(base==='green'){
    await evaluate('document.querySelector("[data-guide-stage=corners]").click()');await until('document.querySelector("#step-corners [data-case=front]")!==null');await sleep(500);await tap('#step-corners [data-case=front]');assert.equal(await evaluate('document.querySelector("#step-corners [data-case=front]").getAttribute("aria-pressed")'),'true','Selecting the front case');
    await evaluate('document.querySelector("[data-guide-stage=yellowCross]").click()');await until('document.querySelectorAll("#step-yellowCross .guide-pattern").length===4');await sleep(500);assert.equal(await evaluate('[...document.querySelectorAll("#step-yellowCross .guide-pattern rect")].some(n=>n.getAttribute("fill")==="#1769d6")'),true);
    if(lang==='vi')await shot('colour-choice-green-'+width);
   }
   if(base==='blue')assert.equal(await evaluate('document.querySelector("#step-corners [data-case=front]").getAttribute("aria-pressed")'),'true');
  }
  await tap('label:has(input[value="green"])');await evaluate('document.querySelector("input[value=green]").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await until('document.querySelector("input[name=guide-base]:checked").value==="blue"');
  await click('lang-switch');await sleep(100);assert.equal(await evaluate('document.querySelector("input[name=guide-base]:checked").value'),'blue');assert.equal(await evaluate('document.querySelector("#step-corners [data-case=front]").getAttribute("aria-pressed")'),'true');assert.equal(await evaluate('document.querySelector("[aria-current=step]").dataset.guideStage'),'yellowCross');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);results.push({width,lang,allSixColours:true,keyboard:true,preservesChoices:true});
 }
 console.log(JSON.stringify(results));await send('Browser.close');
`+cleanup);

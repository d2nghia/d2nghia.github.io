const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 const tap=async selector=>{const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 const report=[];await send('Page.enable');
 for(const width of [1100,390,320])for(const option of ['a','b','c']){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin+'/.design-proposals/colour-picker.html?option='+option});await until('!!window.CubeStepDiagrams&&document.querySelectorAll("[data-choices] button").length===18');
  assert.equal(await evaluate('document.querySelectorAll("[data-choices] [aria-pressed=true]").length'),0);assert.equal(await evaluate('document.querySelectorAll("[data-design]:not([hidden])").length'),1);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  if(width===1100)await shot('colour-'+option+'-empty');
  const colours=await evaluate('CubeStepDiagrams.NAMES');for(const colour of colours){
   await tap('[data-choices="'+option+'"] [data-colour="'+colour+'"]');
   const state=await evaluate('(()=>{const o='+JSON.stringify(option)+',b='+JSON.stringify(colour)+',s=CubeStepDiagrams.orientation(b),response=document.querySelector("[data-response="+o+"]"),buttons=[...document.querySelectorAll("[data-choices="+o+"] button")];return{selected:buttons.filter(e=>e.getAttribute("aria-pressed")==="true").map(e=>e.dataset.colour),goals:[...response.querySelectorAll(".preview-goal .face-diagram")].map(e=>[...e.querySelectorAll("rect")].filter(n=>n.getAttribute("fill")===CubeStepDiagrams.HEX[s.top]).length),overflow:document.documentElement.scrollWidth>innerWidth,storage:localStorage.length,targets:buttons.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})}})()');
   assert.deepEqual(state.selected,[colour]);assert.equal(state.goals[1],5);assert.equal(state.overflow,false);assert.equal(state.storage,0);assert.equal(state.targets,true);
  }
  await tap('[data-choices="'+option+'"] [data-colour="green"]');await shot('colour-'+option+'-'+(width===1100?'desktop':width===390?'mobile':'narrow'));
  await evaluate('document.querySelector("[data-choices='+option+'] [data-colour=blue]").focus()');assert.equal(await evaluate('document.activeElement.dataset.colour'),'blue');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert.equal(await evaluate('document.querySelector("[data-choices='+option+'] [aria-pressed=true]").dataset.colour'),'blue');report.push({width,option,allSixChoices:true,keyboard:true,noStorageChanges:true});
 }
 await tap('[data-option=b]');assert.equal(await evaluate('document.querySelector("[data-design=b]").hidden'),false);
 console.log(JSON.stringify(report));await send('Browser.close');
`+cleanup);

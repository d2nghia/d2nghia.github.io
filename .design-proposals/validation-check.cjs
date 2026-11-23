// Browser regression checks using the existing local CDP harness.
const fs = require('node:fs');
const harness = fs.readFileSync(require.resolve('./production-check.cjs'), 'utf8');
const setup = harness.slice(0, harness.indexOf(" await send('Page.enable');"));
const cleanup = harness.slice(harness.indexOf('})().catch'));
const actions = String.raw`
 await send('Page.enable');
 await send('Runtime.enable');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 const errors=[];ws.addEventListener('message',({data})=>{const v=JSON.parse(data);if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails);});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await home();
 const loadInvalid=async(kind,n=0)=>{
   const hash=await evaluate('(()=>{const L=CubeLib,names=Array.from(L.solvedState(),i=>["white","red","green","yellow","orange","blue"][i]),old=names.slice();const p=L.'+(kind==='flip'?'EDGES':'CORNERS')+'['+n+'];if("'+kind+'"!=="paint")p.forEach((i,k)=>names[i]=old[p[(k+1)%p.length]]);if("'+kind+'"==="count")names[1]="green";if("'+kind+'"==="paint")names[0]="red";return CubeProgress.encode({view:"capture",names})})()');
   await send('Page.navigate',{url:base+hash});await until('!!window.CubeValidation&&!document.getElementById("screen-capture").hidden');
   await evaluate('CubeLang.set("vi")');await click('cap-solve');await until('!document.getElementById("cap-issue").hidden');return hash;
 };
 const hash=await loadInvalid('twist');
 console.log('Corner diagnosis:',await evaluate('({phase:document.getElementById("cap-cube").dataset.validationPhase,title:document.getElementById("cap-issue-title").textContent,suggestions:CubeValidation.inspect(CubeProgress.decode(location.hash).names).suggestions.length,reduced:matchMedia("(prefers-reduced-motion: reduce)").matches})'));
 await until('document.getElementById("cap-cube").dataset.validationPhase==="turn"');await sleep(500);
 const turn=await evaluate('({title:document.getElementById("cap-issue-title").textContent,phase:document.getElementById("cap-cube").dataset.validationPhase,targets:document.querySelectorAll("#cap-cube .validation-target").length,arrows:document.querySelectorAll("#cap-cube .validation-arrow").length,rotating:[...document.querySelectorAll("#cap-cube .cubie")].filter(e=>e.style.transform.includes("rotate3d")).length,hash:location.hash,netHidden:document.getElementById("screen-check").hidden})');
 assert.equal(turn.targets,3);assert.equal(turn.arrows,3);assert.equal(turn.rotating,1);assert.ok(turn.netHidden);assert.equal(turn.hash,hash);assert.match(turn.title,/góc/);
 await shot('validation-corner-turn-desktop');
 await until('document.getElementById("cap-cube").dataset.validationPhase==="preview"');await shot('validation-corner-preview-desktop');
 assert.equal(await evaluate('location.hash'),hash);
 await click('cap-issue-next');assert.match(await evaluate('document.getElementById("cap-issue-option").textContent'),/2 \/ 8/);
 await click('cap-issue-prev');
 await click('cap-issue-apply');
 assert.equal(await evaluate('CubeValidation.assess(CubeProgress.decode(location.hash).names).ok'),true);
 assert.equal(await evaluate('document.getElementById("cap-issue").hidden'),true);
 assert.equal(await evaluate('document.querySelectorAll("#cap-cube .validation-arrow").length'),0);
 await click('cap-solve');await until('!document.getElementById("screen-coach").hidden');
 for(const width of [390,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
   await loadInvalid('flip',2);await until('document.getElementById("cap-cube").dataset.validationPhase==="turn"');await sleep(500);
   assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
   assert.equal(await evaluate('document.querySelectorAll("#cap-cube .validation-target").length'),2);
   await shot('validation-edge-turn-'+width);
   await evaluate('CubeLang.set("en")');assert.match(await evaluate('document.getElementById("cap-issue-title").textContent'),/edge/);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await loadInvalid('count');assert.equal(await evaluate('document.querySelectorAll("#cap-issue-counts > span").length'),6);
 assert.equal(await evaluate('document.getElementById("cap-issue-compare").hidden'),true);await shot('validation-count-mobile');
 const paintHash=await loadInvalid('paint');await until('document.getElementById("cap-cube").dataset.validationPhase==="preview"');
 assert.equal(await evaluate('getComputedStyle([...document.querySelectorAll("#cap-cube [data-facelet]")].find(e=>e.dataset.facelet==="0")).backgroundColor'),'rgb(250, 250, 250)');
 assert.equal(await evaluate('location.hash'),paintHash);await click('cap-issue-apply');
 assert.equal(await evaluate('CubeValidation.assess(CubeProgress.decode(location.hash).names).ok'),true);
 await loadInvalid('twist');
 // A trusted paint tap cancels an in-flight preview before hit-testing the true sticker.
 await evaluate('document.querySelector("#cap-palette .sw-orange").click()');
 await until('document.getElementById("cap-cube").dataset.validationPhase==="turn"');
 const point=await evaluate('(()=>{for(const e of document.querySelectorAll("#cap-cube [data-facelet]")){const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit&&hit.dataset.facelet!=null&&r.width>10)return{x,y}}return null})()');assert.ok(point);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until('document.getElementById("cap-issue").hidden');assert.equal(await evaluate('document.querySelectorAll("#cap-cube .validation-arrow").length'),0);
 const paintedHash=await evaluate('location.hash');await sleep(2200);assert.equal(await evaluate('location.hash'),paintedHash);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await loadInvalid('flip');assert.equal(await evaluate('document.getElementById("cap-cube").dataset.validationPhase'),'preview');
 assert.equal(await evaluate('[...document.querySelectorAll("#cap-cube .cubie")].some(e=>e.style.transform.includes("rotate3d"))'),false);
 await click('cap-issue-replay');await until('document.getElementById("cap-cube").dataset.validationPhase==="turn"');
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log(JSON.stringify({sameScreen:true,cornerAnimation:turn,verifiedApply:true,ambiguousCandidateNavigation:true,mobileWidths:[390,320],english:true,countDiagnosis:true,touchPaintingCancelsPreview:true,reducedMotion:true,errors},null,2));
 await send('Browser.close');
`;
eval(setup + actions + cleanup);

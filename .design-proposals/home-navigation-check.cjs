const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 const snapshots=[];
 const viewportShot=async name=>{fs.writeFileSync(path.join(qa,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));};
 const measure=()=>evaluate('(()=>{const e=document.getElementById("go-home"),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:innerHeight-r.bottom,label:e.textContent.trim(),href:e.href,icon:!!e.querySelector("svg"),position:getComputedStyle(e.parentElement).position,border:s.borderRadius,background:s.backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth}})()');
 await send('Page.enable');
 for(const [width,height] of [[1280,900],[390,844],[320,640]])for(const lang of ['vi','en']){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  await send('Page.navigate',{url:origin+'/cube/steps.html'});await until('document.querySelectorAll(".guide-stage").length===7');await evaluate('CubeLang.set('+JSON.stringify(lang)+')');
  const manual=await measure();assert.equal(manual.label,lang==='vi'?'Về trang chính':'Back to start');assert.ok(manual.icon&&manual.position==='fixed'&&manual.height>=44&&manual.bottom===12&&!manual.overflow);assert.equal(manual.href,base);
  await evaluate('scrollTo(0,document.documentElement.scrollHeight)');const scrolled=await measure();assert.equal(scrolled.y,manual.y);assert.equal(scrolled.x,manual.x);
  if(lang==='vi')await viewportShot('home-button-manual-'+width);
  await click('go-home');await until('!!window.CubeProgress&&!document.getElementById("screen-start").hidden');assert.equal(await evaluate('document.getElementById("go-home").hidden'),true);
  await click('go-camera');await until('!document.getElementById("screen-capture").hidden');const capture=await measure();for(const key of ['x','y','width','height','label','border','background'])assert.equal(capture[key],manual[key],key+JSON.stringify({capture,manual}));
  await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.equal((await measure()).y,manual.y);
  if(lang==='vi')await viewportShot('home-button-assisted-'+width);
  await click('go-demo');await until('!document.getElementById("screen-coach").hidden');await sleep(100);const coach=await measure();for(const key of ['x','y','width','height','label','border','background'])assert.equal(coach[key],manual[key],key);
  let overlap=await evaluate('document.getElementById("coach-controls").getBoundingClientRect().bottom>document.getElementById("go-home").getBoundingClientRect().top');assert.equal(overlap,false);
  const p=await evaluate('(()=>{const r=document.getElementById("coach-resize").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+1000,y:p.y+1000,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+1000,y:p.y+1000,button:'left',clickCount:1});await sleep(100);
  overlap=await evaluate('document.getElementById("coach-controls").getBoundingClientRect().bottom>document.getElementById("go-home").getBoundingClientRect().top');assert.equal(overlap,false,'Resizing must leave room for Home');if(lang==='vi'){await evaluate('scrollTo(0,0)');await sleep(100);await viewportShot('home-button-coach-'+width);console.log(await evaluate('({inner:innerHeight,scroll:scrollY,visual:visualViewport.height,offset:visualViewport.offsetTop,rect:document.getElementById("go-home").getBoundingClientRect().toJSON()})'));}
  await click('go-home');await until('!!window.CubeProgress&&!document.getElementById("screen-start").hidden');snapshots.push({width,height,lang,consistent:true,noOverlap:true});
 }
 console.log(JSON.stringify(snapshots));await send('Browser.close');
`+cleanup);

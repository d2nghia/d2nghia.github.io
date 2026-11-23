const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=process.cwd(),qa=__dirname,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(data);}catch{res.writeHead(404).end();}});
let edge,ws;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,profile=path.join(qa,'.browser-'+Date.now());
 edge=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await sleep(100);}}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let serial=0;const pending=new Map();ws.addEventListener('message',({data})=>{const v=JSON.parse(data);if(v.id){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expr=>{for(let i=0;i<80;i++){if(await evaluate(expr))return;await sleep(100);}throw Error(expr);};
 await send('Page.enable');const report=[];
 for(const width of [1100,390])for(const option of ['a','b','c']){
  await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin+'/.design-proposals/cube-home.html?option='+option});await until(`!!window.CubeView&&!!document.querySelector('[data-option="${option}"][aria-pressed="true"]')`);await sleep(100);
  const check=await evaluate(`({visible:[...document.querySelectorAll('[data-proposal]')].filter(e=>!e.hidden).length,choices:document.querySelector('[data-proposal="${option}"]').querySelectorAll('.choice').length,overflow:document.documentElement.scrollWidth>innerWidth,storage:localStorage.length,height:document.documentElement.scrollHeight})`);
  assert.equal(check.visible,1);assert.equal(check.choices,2);assert.equal(check.overflow,false);assert.equal(check.storage,0);
  const data=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.max(960,check.height),scale:1}});fs.writeFileSync(path.join(qa,option+(width<500?'-mobile':'-desktop')+'.png'),Buffer.from(data.data,'base64'));report.push({option,width,...check});
 }
 await evaluate(`document.querySelector('[data-option="b"]').click()`);assert.equal(await evaluate(`document.querySelector('[data-proposal="b"]').hidden`),false);
 console.log(JSON.stringify(report));await send('Browser.close');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(ws)ws.close();if(edge)edge.kill();server.close();});

const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./production-check.cjs'),'utf8');
const setup=source.slice(0,source.indexOf(" await send('Page.enable');"));
const cleanup=source.slice(source.indexOf('})().catch'));
eval(setup+`
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/cube/steps.html'});await until("document.querySelectorAll('.stage-card').length===7");
 const metrics=await evaluate("({nodes:document.querySelectorAll('*').length,cubies:document.querySelectorAll('.cubie').length,figures:document.querySelectorAll('.fig').length,words:document.body.innerText.length})");
 fs.writeFileSync(path.join(qa,'manual-baseline.json'),JSON.stringify(metrics));console.log(JSON.stringify(metrics));await send('Browser.close');
`+cleanup);

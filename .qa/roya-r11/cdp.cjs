const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=__dirname;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){
 let saved;
 try {saved=JSON.parse(await fs.readFile(path.join(root,'session.json'),'utf8'));}catch{}
 if(!saved){
  const profile=await fs.mkdtemp(path.join(root,'chrome-profile-'));
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=1440,1000',`--user-data-dir=${profile}`,'about:blank'],{detached:true,stdio:'ignore',windowsHide:true});
  child.unref();
  let lines;
  for(let i=0;i<100;i++){try{lines=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await pause(100);}}
  if(!lines)throw new Error('Isolated Chrome did not start');
  saved={ws:`ws://127.0.0.1:${lines[0]}${lines[1]}`,profile,pid:child.pid};
  await fs.writeFile(path.join(root,'session.json'),JSON.stringify(saved));
 }
 const ws=new WebSocket(saved.ws);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let seq=0,session;
 const waiting=new Map();
 const events=[];
 ws.addEventListener('message',async e=>{
  const m=JSON.parse(e.data);
  if(m.id){const p=waiting.get(m.id);if(p){waiting.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}return;}
  if(m.method==='Fetch.requestPaused'){
   const req=m.params.request;
   const method=['GET','HEAD'].includes(req.method)?'Fetch.continueRequest':'Fetch.failRequest';
   if(method==='Fetch.failRequest')events.push({blockedMethod:req.method,url:req.url.split('?')[0]});
   void send(method,{requestId:m.params.requestId,...(method==='Fetch.failRequest'?{errorReason:'BlockedByClient'}:{})},m.sessionId).catch(()=>{});
  }
  if(m.method==='Runtime.exceptionThrown')events.push({pageError:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});
 });
 function send(method,params={},sid=session){return new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
 const targets=(await send('Target.getTargets')).targetInfos;
 const target=targets.find(x=>x.type==='page');
 const targetId=target?.targetId||(await send('Target.createTarget',{url:'about:blank'})).targetId;
 session=(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 await send('Page.enable');await send('Runtime.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Tehran'});
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async function until(expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate('!!('+expression+')'))return true;}catch(e){if(!/context|navigat/i.test(e.message))throw e;}await pause(150);}throw new Error('Wait failed: '+expression);}
 async function click(expression){const rect=await evaluate(`(()=>{const e=(${expression});if(!e)throw Error('Control missing');e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:!!e.disabled};})()`);if(rect.disabled)throw new Error('Control disabled');await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});await pause(200);}
 async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(root,name),Buffer.from(r.data,'base64'));}
 return {send,evaluate,until,click,screenshot,events,pause,async close(){await send('Browser.close',{},null).catch(()=>{});await fs.unlink(path.join(root,'session.json')).catch(()=>{});ws.close();},disconnect(){ws.close();}};
}
module.exports={connect};
if(require.main===module){(async()=>{const c=await connect();try{await require(path.resolve(process.argv[2]))(c);}finally{c.disconnect();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});}

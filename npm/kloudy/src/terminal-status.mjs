// stderr only: structured stdout and MCP transports must remain machine-readable.
export function terminalStatus({stream=process.stderr,enabled=stream.isTTY&&!process.env.CI&&!process.env.NO_COLOR,interval=setInterval,clear=clearInterval}={}){
 let timer=null,index=0;
 const stop=()=>{if(timer){clear(timer);timer=null;}if(enabled)stream.write('\r\u001b[2K');};
 return {update(event){if(!enabled||event?.schema!=='kloudy.activity/1'||event.source!=='kloudy')return;stop();if(event.state==='thinking'){const tick=()=>stream.write('\rKloudy is working'+['.  ','.. ','...'][index++%3]);tick();timer=interval(tick,600);timer.unref?.();}else if(event.state==='waiting')stream.write('Kloudy needs your approval.\n');else if(event.state==='error')stream.write('Kloudy could not finish.\n');},dispose:stop};
}

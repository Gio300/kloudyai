import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {KloudyError} from './client.mjs';
const hash=x=>createHash('sha256').update(x).digest();
export function createWrapper({command,args=[],tools,token,env={},timeout=10000,maxConcurrent=2}){
  if(typeof command!=='string'||!command||!Array.isArray(args)||args.some(x=>typeof x!=='string')||!Array.isArray(tools)||!tools.length||tools.length>8||tools.some(x=>typeof x!=='string'||!/^[-\w.]{1,100}$/.test(x))||typeof token!=='string'||token.length<24)throw new KloudyError('invalid_wrapper','Specify an approved command, 1–8 selected tools and a strong bearer from the local host.');
  const allowed=new Set(tools);let active=0;
  return createServer(async(req,res)=>{
    const send=(status,error)=>{if(!res.headersSent){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error}));}};
    // Loopback-only host and no browser-origin requests. TLS/public grant policy belongs at the owning deployment edge.
    if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host||'')||req.headers.origin)return send(403,'origin_not_allowed');
    if(req.url!=='/mcp')return send(404,'not_found');
    if(!timingSafeEqual(hash(req.headers.authorization||''),hash('Bearer '+token)))return send(401,'unauthorized');
    if(req.method!=='POST')return send(405,'method_not_allowed');
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,'json_required');
    if(active>=maxConcurrent)return send(429,'busy');
    active++;let upstream,server,transport,timer;
    try{
      let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>65536)return send(413,'too_large');}
      let body;try{body=JSON.parse(data);}catch{return send(400,'invalid_json');}
      if(Array.isArray(body)||!body||body.jsonrpc!=='2.0')return send(400,'invalid_request');
      if(body.method==='tools/call'&&!allowed.has(body.params?.name))return send(403,'tool_not_selected');
      if(!['initialize','notifications/initialized','tools/list','tools/call','ping'].includes(body.method))return send(400,'unsupported_method');
      const client=new Client({name:'kloudy-httpk-wrap',version:'0.1.0'});
      upstream=new StdioClientTransport({command,args,env,stderr:'pipe'});
      // No upstream stderr or credential values are reflected into HTTP responses or logs.
      upstream.stderr?.on('data',()=>{});
      timer=setTimeout(()=>{send(504,'upstream_timeout');upstream.close().catch(()=>{});},timeout);
      await client.connect(upstream);
      let callResult;
      if(body.method==='tools/call')callResult=await client.callTool(body.params,undefined,{timeout});
      server=new Server({name:'kloudy-httpk',version:'0.1.0'},{capabilities:{tools:{}}});
      server.setRequestHandler(ListToolsRequestSchema,async()=>{
        const selected=[];let cursor;
        for(let page=0;page<10;page++){
          const value=await client.listTools(cursor?{cursor}:undefined);
          for(const tool of value.tools)if(allowed.has(tool.name))selected.push({name:tool.name,description:tool.description,inputSchema:tool.inputSchema});
          cursor=value.nextCursor;if(!cursor)break;
          if(page===9)throw new Error('Catalog limit');
        }
        return {tools:selected};
      });
      server.setRequestHandler(CallToolRequestSchema,async request=>{
        if(!allowed.has(request.params.name))throw new Error('Tool not selected');
        return callResult;
      });
      transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      await server.connect(transport);
      await transport.handleRequest(req,res,body);
    }catch{send(502,'upstream_unavailable');}
    finally{clearTimeout(timer);await transport?.close().catch(()=>{});await server?.close().catch(()=>{});await upstream?.close().catch(()=>{});active--;}
  });
}

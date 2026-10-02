import { readFileSync, writeFileSync } from "node:fs";
// Development-only Miniflare egress through the managed session's proxy.
// External AI fixtures never affect the deployed Worker.
const path = new URL(
  "../node_modules/@cloudflare/vite-plugin/dist/index.mjs",
  import.meta.url,
);
const source = readFileSync(path, "utf8");
const marker = "async startOrUpdateMiniflare(options) {";
const hook =
  "    if(process.env.JARVIS_DEV_PROXY === '1') for(const worker of options.workers ?? []) {\n      worker.dev={...worker.dev,outboundService:{type:'fetcher',handler:async(request)=>{\n        if(process.env.JARVIS_TEST_AI==='1'&&new URL(request.url).pathname==='/api/proxy/openai/v1/chat/completions'){\n          const body=await request.json();const hasResult=body.messages.some(m=>m.role==='tool');\n          const delta=hasResult?{content:'The current time was retrieved successfully.'}:{tool_calls:[{index:0,id:'call_fixture_time',type:'function',function:{name:'get_current_time',arguments:JSON.stringify({timezone:'UTC'})}}]};\n          const chunk={id:'chatcmpl_fixture',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:body.model,choices:[{index:0,delta,finish_reason:null}]};\n          const final={...chunk,choices:[{index:0,delta:{},finish_reason:hasResult?'stop':'tool_calls'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};\n          return new Response(`data: ${JSON.stringify(chunk)}\\n\\ndata: ${JSON.stringify(final)}\\n\\ndata: [DONE]\\n\\n`,{headers:{'Content-Type':'text/event-stream'}});\n        }\n        const response=await globalThis.fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:request.method==='GET'||request.method==='HEAD'?undefined:await request.arrayBuffer(),redirect:'manual'});\n        return new Response(response.body,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)});\n      }}};\n    }";
if (!source.includes("process.env.JARVIS_DEV_PROXY === '1'")) {
  if (!source.includes(marker))
    throw new Error("Unsupported local runtime; update adapter before testing");
  writeFileSync(path, source.replace(marker, marker + "\n" + hook));
}
console.log("Local proxy adapter ready; production source is unchanged.");

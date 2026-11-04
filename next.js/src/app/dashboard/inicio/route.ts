import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic="force-dynamic";
export async function GET(){
 const api=new URL(process.env.NEXT_PUBLIC_API_URL||"https://novai-production-0d2f.up.railway.app").origin;
 const html=(await readFile(path.join(process.cwd(),"public","painel","index.html"),"utf8")).replaceAll("__DASHBOARD_API__",api+"/api/novai/dashboard");
 return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"}});
}

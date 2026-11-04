import { readFile } from "node:fs/promises";
import path from "node:path";
export async function presentation(file: string) {
  let html = await readFile(path.join(process.cwd(), "public", "site-apresentacao", file), "utf8");
  const base=new URL(process.env.NEXT_PUBLIC_API_URL || "https://novai-production-0d2f.up.railway.app");
  html=html.replaceAll("__NOVAI_API__",base.origin+"/api/novai/billing");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}

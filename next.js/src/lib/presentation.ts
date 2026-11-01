import { readFile } from "node:fs/promises";
import path from "node:path";
export async function presentation(file: string) {
  const html = await readFile(path.join(process.cwd(), "public", "site-apresentacao", file), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}

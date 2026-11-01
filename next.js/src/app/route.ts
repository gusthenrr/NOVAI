import { presentation } from "../lib/presentation";
export const runtime = "nodejs";
export async function GET() { return presentation("index.html"); }

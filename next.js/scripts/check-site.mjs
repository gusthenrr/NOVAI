import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const base=process.env.SITE_URL||'http://127.0.0.1:3106';
const routes=['/','/login','/cadastro','/conectado','/dashboard/inicio','/dashboard/Promotion','/dashboard/claims','/dashboard/ExtensaoNovai','/Manager','/planos','/como-funciona','/demonstracao'];
let checked=0;
for(const route of routes){
 const response=await fetch(base+route);assert.equal(response.status,200,route);
 const html=await response.text();assert.ok(html.includes('<html'),route);
 if(route==='/')assert.ok(html.includes('Calcule seu lucro real.')&&html.includes('href="/login"'));
 if(route==='/cadastro'){
  assert.match(html,/action="https:\/\/novai-production-0d2f.up.railway.app\/add-usuario"/);
  for(const name of ['usuario','email','senha'])assert.ok(html.includes(`name="${name}"`));
 }
 const assets=[...html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?)(?:\?[^"#]*)?)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/'));
 for(const path of new Set(assets)){const asset=await fetch(base+path);assert.equal(asset.status,200,path);checked++;}
}
for(const filename of await readdir('public/site-apresentacao')){
 if(!filename.endsWith('.js'))continue;
 const source=await readFile('public/site-apresentacao/'+filename,'utf8');
 for(const match of source.matchAll(/\/site-apresentacao\/assets\/[\w/.-]+/g)){await readFile('public'+match[0]);checked++;}
}
console.log(`${routes.length} rotas válidas; ${checked} recursos verificados; contrato de cadastro preservado.`);

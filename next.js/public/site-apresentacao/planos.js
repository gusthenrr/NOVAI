'use strict';
const buttons=document.querySelectorAll('.choose-plan');
const selection=document.querySelector('#selection');
const periods=document.querySelectorAll('[data-period]');
const prices={monthly:{Pro:5799,Max:7999,precify:3199},annual:{Pro:5599,Max:7599,precify:2799}};
const brl=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let period='annual',selected=null;
try{const saved=sessionStorage.getItem('novai-billing');if(saved==='monthly'||saved==='annual')period=saved;}catch{}
function billing(name){return period==='annual'?`${brl(prices[period][name]*12)} cobrados anualmente`:'Cobrança mensal'}
function renderSelection(){if(!selected)return;window.dispatchEvent(new CustomEvent('novai:selection-changed'));document.querySelector('#selection-title').textContent=selected==='Max'?'Max — Sua conta + Precify Pro':'Pro — Extensão Novai';document.querySelector('#selection-copy').textContent=selected==='Max'?'Extensão, painel da sua conta, análises das suas vendas e Precify Pro no celular.':'Extensão e análises dos anúncios dos concorrentes no Mercado Livre.';document.querySelector('#selection-price').textContent=`${brl(prices[period][selected])}/mês · ${billing(selected)}`;}
function renderPrices(){periods.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===period)));document.querySelectorAll('[data-price]').forEach(el=>el.textContent=brl(prices[period][el.dataset.price]));document.querySelectorAll('[data-billing]').forEach(el=>el.textContent=billing(el.dataset.billing));const p=prices[period],saving=p.Pro+p.precify-p.Max;document.querySelector('#precify-separate').textContent=period==='annual'?`Precify Pro separado: ${brl(p.precify)}/mês no anual (${brl(p.precify*12)}/ano).`:`Precify Pro separado: ${brl(p.precify)}/mês.`;document.querySelector('#bundle-savings').textContent=period==='annual'?`Economize ${brl(saving*12)}/ano com o pacote.`:`Economize ${brl(saving)}/mês com o pacote.`;renderSelection();}
function choose(name,scroll=true){selected=name;buttons.forEach(button=>{const active=button.dataset.plan===name;button.setAttribute('aria-pressed',String(active));button.closest('.plan-card').classList.toggle('selected',active)});renderSelection();selection.hidden=false;if(scroll)(document.querySelector('#web-checkout')||selection).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'nearest'});history.replaceState(null,'',`#${name.toLowerCase()}`)}
buttons.forEach(button=>button.addEventListener('click',()=>choose(button.dataset.plan)));
periods.forEach(button=>button.addEventListener('click',()=>{period=button.dataset.period;try{sessionStorage.setItem('novai-billing',period);}catch{}renderPrices()}));
document.querySelector('#change-plan').addEventListener('click',()=>{selection.hidden=true;const previous=document.querySelector('.choose-plan[aria-pressed="true"]');previous?.focus();selected=null;buttons.forEach(button=>{button.setAttribute('aria-pressed','false');button.closest('.plan-card').classList.remove('selected')});history.replaceState(null,'',location.pathname)});
renderPrices();
if(location.hash==='#pro'||location.hash==='#max')choose(location.hash==='#pro'?'Pro':'Max');

window.addEventListener('novai:catalog',event=>{
 for(const p of event.detail.plans||[]){const name=p.code==='max'?'Max':p.code==='pro'?'Pro':null;if(name){prices.monthly[name]=p.monthly_cents;prices.annual[name]=p.annual_cents/12;}}
 const p=event.detail.precifyPro;if(p){prices.monthly.precify=p.monthly_cents;prices.annual.precify=p.annual_cents/12;}
 renderPrices();
});
const resumed=new URLSearchParams(location.search);const resumePlan=resumed.get('plano'),resumeCycle=resumed.get('ciclo');
if(['monthly','annual'].includes(resumeCycle)){period=resumeCycle;renderPrices();}
if(['pro','max'].includes(resumePlan))choose(resumePlan==='max'?'Max':'Pro',false);

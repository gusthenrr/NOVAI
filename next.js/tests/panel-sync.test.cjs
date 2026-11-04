const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,describe}=require('../public/painel/connection-sync.js');
const progress=(jobs,collecting=false)=>({jobs,collecting,monthsCompleted:2,monthsTotal:2});
const order={kind:'orders',state:'done',collected:true,error:null};
test('unavailable Ads are partial when orders are already collected',()=>{
 const r=describe(progress([order,{kind:'ads',state:'unavailable',collected:false,error:'ml_resource_unavailable'}]));
 assert.equal(r.status,'partial');assert.match(r.copy,/publicidade/);assert.match(r.detail,/2 de 2/);assert.match(r.detail,/recurso/);
});
test('pending jobs remain collecting even when another source is unavailable',()=>{
 const r=describe(progress([{...order,state:'running',collected:false},{kind:'ads',state:'unavailable',error:'ml_permission_required'}],true));
 assert.equal(r.status,'syncing');assert.match(r.detail,/publicidade/);
});
test('rate limiting is a retry wait instead of a disconnected account',()=>{
 const r=describe(progress([order,{kind:'ads',state:'retry',error:'ml_rate_limited'}],true));
 assert.equal(r.status,'syncing');assert.match(r.detail,/Aguardando/);
});
test('expected retention/no-Ads warnings do not become failures',()=>{
 const r=describe(progress([order,{kind:'ads',state:'done',error:'ads_retention_90_days'}]));assert.equal(r.status,'ready');
});
test('expired ML authorization is explicitly identified even with other pending jobs',()=>{
 const r=describe(progress([order,{kind:'ads',state:'blocked',error:'ml_reconnect_required'}],true));assert.equal(r.status,'error');assert.match(r.copy,/autorização/);
});
test('network status failure and NOVAI login expiry do not become collection success',()=>{
 assert.equal(describe(progress([order]),{code:'network'}).status,'error');
 assert.match(describe(progress([order]),{code:'session_required'}).copy,/NOVAI/);
 assert.equal(describe(progress([{kind:'catalog',state:'unavailable',error:'ml_permission_required'}])).status,'error');
});
test('partial state preserves connected session and rejects stale run updates',()=>{
 const s=create(),id=s.start({mode:'live'});assert.equal(s.partial(id,'2 meses'),true);assert.equal(s.snapshot().status,'partial');assert.equal(s.progress(id,'old'),false);const next=s.start();assert.equal(s.complete(id),false);assert.equal(s.complete(next),true);
});

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NovaiConnectionSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // UI state only. A real synchronization must be driven by the authenticated backend.
  function describe(progress,error){
    const jobs=progress?.jobs||[],expected=new Set(['ads_retention_90_days','orders_retention_12_months','no_ads_account']);
    const failed=jobs.filter(j=>j.error&&!expected.has(j.error));
    const labels={profile:'conta',catalog:'produtos',orders:'pedidos',ads:'publicidade'};
    const affected=[...new Set(failed.map(j=>labels[j.kind]||'dados'))].join(', ');
    const pending=jobs.filter(j=>['queued','running','retry'].includes(j.state));
    const counts=progress?`${progress.monthsCompleted} de ${progress.monthsTotal} meses de pedidos coletados.`:'Preparando coleta…';
    const partial=failed.length>0;
    const hasData=jobs.some(j=>j.collected);
    const reason=failed.some(j=>j.error==='ml_rate_limited')?' O Mercado Livre pediu para reduzir as requisições.':failed.some(j=>j.error==='ml_permission_required')?' O Mercado Livre não autorizou parte das consultas.':failed.some(j=>j.error==='ml_resource_unavailable')?' Um recurso não foi disponibilizado pelo Mercado Livre.':'';
    const terminal=failed.some(j=>['ml_account_changed','ml_reconnect_required','ml_connection_required','ml_owner_mismatch'].includes(j.error));
    if(error)return {status:'error',title:'Não foi possível atualizar o painel',copy:['session_required','session_expired'].includes(error.code)?'Entre novamente na sua conta NOVAI.':'Não conseguimos consultar o status agora. Os dados já salvos foram preservados.',detail:counts};
    if(terminal)return {status:'error',title:'A conexão com o Mercado Livre precisa de atenção',copy:'Abra Conexões para verificar a autorização da conta.',detail:counts};
    if(progress?.collecting||pending.length)return {status:'syncing',title:'Recebendo dados do Mercado Livre',copy:'Você pode continuar usando o painel.',detail:counts+(partial?' Há pendências em '+affected+'.':'')+(failed.some(j=>j.error==='ml_rate_limited')?' Aguardando para tentar novamente após o limite do Mercado Livre.':'')};
    if(partial)return {status:hasData?'partial':'error',title:hasData?'Parte dos dados ainda está indisponível':'A coleta está pendente',copy:'Pendências em '+affected+'.'+(hasData?' Os dados já coletados continuam disponíveis.':' Abra Conexões para tentar novamente.'),detail:counts+reason};
    return {status:'ready',title:'Coleta concluída para os dados disponíveis',copy:'Você já pode acompanhar sua operação.',detail:counts};
  }
  function create({onChange=()=>{},now=()=>new Date().toISOString()}={}){
    let state={status:'disconnected',mode:'preview',stage:'',updatedAt:null},runId=0;
    const snapshot=()=>({...state});
    const emit=()=>{onChange(snapshot());return snapshot();};
    const valid=id=>id===runId&&state.status==='syncing';
    return Object.freeze({
      snapshot,
      connect({mode='live'}={}){runId++;state={status:'connected',mode,stage:'',updatedAt:null};return emit();},
      start({mode='live',stage='Preparando os dados…'}={}){runId++;state={...state,status:'syncing',mode,stage,updatedAt:null};emit();return runId;},
      progress(id,stage){if(!valid(id)||typeof stage!=='string')return false;state.stage=stage.slice(0,160);emit();return true;},
      complete(id){if(!valid(id))return false;state={...state,status:'ready',stage:'',updatedAt:now()};emit();return true;},
      partial(id,stage=''){if(!valid(id))return false;state={...state,status:'partial',stage};emit();return true;},
      fail(id){if(!valid(id))return false;state={...state,status:'error',stage:''};emit();return true;},
      disconnect(){runId++;state={status:'disconnected',mode:state.mode,stage:'',updatedAt:null};return emit();}
    });
  }
  return Object.freeze({create,describe});
});

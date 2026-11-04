'use strict';
(() => {
  const box=document.querySelector('#web-checkout');
  if(!box)return;
  const action=box.querySelector('#checkout-action'),consent=box.querySelector('#billing-consent');
  const notice=box.querySelector('#checkout-notice'),terms=box.querySelector('#checkout-terms');
  const accountLabel=box.querySelector('#checkout-account'),manager=box.querySelector('#subscription-manager');
  let catalog=null,account=null,accountKnown=false,expired=false,busy=false;
  const api=document.querySelector('meta[name="novai-billing-api"]')?.content;
  const brl=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const token=()=>{try{return localStorage.getItem('authToken')||'';}catch{return '';}};
  const selection=()=>({tier:document.querySelector('.choose-plan[aria-pressed="true"]')?.dataset.plan?.toLowerCase(),cycle:document.querySelector('[data-period][aria-pressed="true"]')?.dataset.period||'annual'});
  const message=(text,error=false)=>{notice.textContent=text;notice.classList.toggle('error',error);};
  const errors={session_required:'Sua sessão expirou. Entre novamente para continuar.',subscription_exists:'Você já possui uma assinatura ou checkout em andamento. Consulte sua assinatura abaixo antes de alterar o plano.',bundle_subscription_conflict:'O Max já inclui Precify Pro. Existe outra assinatura em andamento para este pacote. Gerencie a assinatura atual antes de contratar, para evitar duas cobranças.',trial_already_used:'O teste grátis desta conta já foi utilizado. Confira o plano atual antes de continuar.',trial_in_progress:'Seu teste grátis está em andamento. Confira a assinatura abaixo.',billing_terms_required:'As condições foram atualizadas. Confira e aceite novamente.',price_changed:'O preço mudou. Atualizamos o resumo; confira e aceite as condições novamente.',payments_not_configured:'Os pagamentos estão temporariamente indisponíveis.',payment_provider_unavailable:'O Mercado Pago não respondeu. Tente novamente em instantes.',subscription_not_found:'Não foi possível encontrar esta assinatura.',rate_limited:'Aguarde um pouco antes de tentar novamente.'};
  async function request(path,{body,auth=true}={}){
    const base=new URL(api);
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('invalid_api');
    const headers={Accept:'application/json'};
    if(auth)headers.Authorization='Bearer '+token();
    if(body)headers['Content-Type']='application/json';
    const response=await fetch(base.href+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    if(!response.ok){const error=Error(data.error||'unavailable');error.status=response.status;throw error;}
    return data;
  }
  function chosen(){const pick=selection();return {pick,plan:catalog?.plans?.find(p=>p.code===pick.tier)};}
  function render(){
    const {pick,plan}=chosen();box.hidden=!pick.tier&&!account?.subscriptions?.length&&new URLSearchParams(location.search).get('retorno')!=='1';
    action.hidden=!pick.tier;box.querySelector('label').hidden=!pick.tier;
    const loggedIn=!!token()&&!expired;
    const trial=loggedIn&&account?.plan?.trialAvailable===true;
    box.querySelector('#checkout-title').textContent=plan?'Assinatura '+plan.name:'Sua assinatura NOVAI';
    if(plan){
      const amount=pick.cycle==='annual'?plan.annual_cents:plan.monthly_cents;
      const interval=pick.cycle==='annual'?'ano':'mês';
      const prefix=trial?`${plan.trial_days} dias grátis após autorizar o cartão no Mercado Pago. Depois, `:loggedIn?'':'Se esta conta tiver direito ao teste, os primeiros 7 dias serão grátis. Depois, ';
      terms.textContent=`${prefix}${brl(amount)} por ${interval}, com renovação automática. ${pick.cycle==='annual'?'A cobrança anual é do valor integral, não de parcelas mensais. ':''}Você pode cancelar a renovação nesta página. ${pick.tier==='max'?'O Max inclui Precify Pro na mesma conta NOVAI.':''}`;
    } else terms.textContent=pick.tier?'Carregando valores e condições da assinatura…':'Selecione um plano acima para conferir uma nova assinatura.';
    accountLabel.textContent=loggedIn?(account?.user?.email?`Conta: ${account.user.email}`:accountKnown?'Entre novamente para continuar.':'Verificando sua conta…'):'Entre na sua conta NOVAI para vincular a assinatura.';
    action.textContent=busy?'Aguarde…':!loggedIn?'Entrar para continuar':trial?'Autorizar cartão e iniciar 7 dias grátis':'Continuar no Mercado Pago';
    action.disabled=busy||!catalog||catalog.paymentsEnabled!==true||(loggedIn&&(!accountKnown||!account||!consent.checked));
    consent.disabled=busy||!catalog;
  }
  function manage(){
    manager.replaceChildren();manager.hidden=!account;
    if(!account)return;
    const title=document.createElement('h3');title.textContent='Sua assinatura';manager.append(title);
    const state=document.createElement('p');
    const names={free:'Sem plano NOVAI ativo',pro:'NOVAI Pro',max:'NOVAI Max'};
    state.textContent=names[account.plan?.tier]||'Conta NOVAI';
    if(account.plan?.validUntil)state.textContent+=' · acesso até '+new Date(account.plan.validUntil).toLocaleDateString('pt-BR');
    manager.append(state);
    const statusNames={pending:'Aguardando autorização',creating:'Checkout em preparação',authorized:'Renovação autorizada',paused:'Renovação pausada',cancelled:'Renovação cancelada'};
    for(const sub of account.subscriptions||[]){
      const row=document.createElement('div');row.className='subscription-row';
      const label=document.createElement('p');label.textContent=`NOVAI ${sub.tier==='max'?'Max':'Pro'} · ${brl(sub.amount_cents)}/${sub.cycle==='annual'?'ano':'mês'} · ${statusNames[sub.status]||'Em verificação'}`;row.append(label);
      if(['pending','creating','authorized','paused'].includes(sub.status)){
        const cancel=document.createElement('button');cancel.type='button';cancel.className='billing-secondary';cancel.textContent='Cancelar renovação';cancel.disabled=busy;
        cancel.addEventListener('click',async()=>{
          if(busy||!confirm('Cancelar a renovação desta assinatura? O acesso já confirmado continua até o término do período válido.'))return;
          busy=true;render();
          try{await request('/cancel',{body:{subscriptionId:sub.id}});await loadAccount();message('Renovação cancelada. Confira o período de acesso acima.');}
          catch(error){message(errors[error.message]||'Não conseguimos cancelar agora. Tente novamente.',true);}
          finally{busy=false;render();manage();}
        });row.append(cancel);
      }
      manager.append(row);
    }
    const refresh=document.createElement('button');refresh.type='button';refresh.className='billing-secondary';refresh.textContent='Verificar pagamento';refresh.disabled=busy;
    refresh.addEventListener('click',()=>void synchronize());manager.append(refresh);
  }
  async function loadAccount(){
    if(!token()||expired){account=null;accountKnown=true;render();manage();return;}
    try{account=await request('/account');accountKnown=true;}
    catch(error){accountKnown=true;account=null;if(error.status===401){expired=true;}else message('Não conseguimos consultar sua assinatura agora. Recarregue a página.',true);}
    render();manage();
  }
  async function synchronize(){
    if(busy||!token()||expired)return;
    busy=true;render();manage();message('Conferindo a confirmação com o Mercado Pago…');
    try{
      await request('/sync',{body:{}});await loadAccount();
      const status=account?.plan?.status;
      message(status==='active'?'Pagamento confirmado. Sua assinatura está ativa.':status==='trialing'?'Cartão autorizado. Seu teste grátis está ativo.':'A autorização ou o pagamento ainda não foi confirmado. Você pode verificar novamente em instantes.');
    }catch(error){message(errors[error.message]||'Ainda não foi possível confirmar. Tente verificar novamente em instantes.',true);}
    finally{busy=false;render();manage();}
  }
  async function loadCatalog(){
    catalog=await request('/plans',{auth:false});
    if(!catalog?.plans?.some(p=>p.code==='pro')||!catalog.plans.some(p=>p.code==='max')||!catalog.billingTermsVersion)throw Error('invalid_catalog');
    window.dispatchEvent(new CustomEvent('novai:catalog',{detail:catalog}));
    if(!catalog.paymentsEnabled)message('Os pagamentos estão temporariamente indisponíveis.',true);
    render();
  }
  action.addEventListener('click',async()=>{
    const {pick,plan}=chosen();if(busy||!plan)return;
    if(!token()||expired){
      try{sessionStorage.setItem('novaiPendingCheckout',JSON.stringify(pick));}catch{}
      location.assign('/login?plano='+pick.tier+'&ciclo='+pick.cycle);return;
    }
    if(!consent.checked||!account)return;
    busy=true;render();manage();message('Preparando o checkout seguro do Mercado Pago…');
    try{
      const result=await request('/checkout',{body:{tier:pick.tier,cycle:pick.cycle,trial:account.plan.trialAvailable===true,billingTermsVersion:catalog.billingTermsVersion,acceptedBillingTerms:true,expectedAmountCents:pick.cycle==='annual'?plan.annual_cents:plan.monthly_cents}});
      const target=new URL(result.url);
      if(target.protocol!=='https:'||target.username||target.password||target.port||!['www.mercadopago.com.br','mercadopago.com.br'].includes(target.hostname))throw Error('invalid_checkout');
      location.assign(target.href);
    }catch(error){
      if(error.status===401){expired=true;}
      if(error.message==='price_changed'){consent.checked=false;try{await loadCatalog();}catch{catalog=null;}}
      message(errors[error.message]||'Não conseguimos abrir o pagamento agora. Tente novamente.',true);
      busy=false;render();manage();
    }
  });
  document.querySelector('#change-plan').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('novai:selection-changed')));
  consent.addEventListener('change',render);
  window.addEventListener('novai:selection-changed',()=>{consent.checked=false;message('');render();});
  window.addEventListener('focus',()=>{if(!busy)void loadAccount();});
  Promise.all([loadCatalog(),loadAccount()]).then(()=>{
    if(new URLSearchParams(location.search).get('retorno')==='1'&&account)void synchronize();
  }).catch(()=>{catalog=null;message('Não foi possível carregar os pagamentos. Recarregue a página para tentar novamente.',true);render();});
  render();
})();

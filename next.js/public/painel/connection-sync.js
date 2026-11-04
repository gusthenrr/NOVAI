(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NovaiConnectionSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // UI state only. A real synchronization must be driven by the authenticated backend.
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
      fail(id){if(!valid(id))return false;state={...state,status:'error',stage:''};emit();return true;},
      disconnect(){runId++;state={status:'disconnected',mode:state.mode,stage:'',updatedAt:null};return emit();}
    });
  }
  return Object.freeze({create});
});

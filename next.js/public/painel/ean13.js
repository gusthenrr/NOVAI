/* EAN-13: cálculo local do dígito e desenho de uma numeração informada. Não atribui GTIN. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NovaiEAN=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  const normalize=value=>String(value??'').replace(/\s/g,'');
  function checkDigit(base){
    if(!/^\d{12}$/.test(base))throw Error('Informe os 12 primeiros dígitos do GTIN.');
    return String((10-[...base].reduce((sum,n,i)=>sum+Number(n)*(i%2?3:1),0)%10)%10);
  }
  function resolve(input){
    const value=normalize(input);
    if(!/^\d{12,13}$/.test(value))throw Error('Informe 12 ou 13 dígitos, somente números.');
    const digit=checkDigit(value.slice(0,12));
    if(value.length===13&&value[12]!==digit)throw Error('Dígito verificador incorreto. Para esta base, o último dígito é '+digit+'.');
    return value.slice(0,12)+digit;
  }
  function generate(existing=[],random=globalThis.crypto){
    if(!random||typeof random.getRandomValues!=='function')throw Error('Não foi possível gerar agora. Tente novamente.');
    const used=new Set(existing);
    for(let attempt=0;attempt<50;attempt++){
      const bytes=random.getRandomValues(new Uint8Array(12));
      const base='789'+Array.from(bytes.slice(0,9),n=>n%10).join(''),code=resolve(base);
      if(!/^0+$/.test(code)&&!used.has(code))return code;
    }
    throw Error('Não foi possível gerar um novo código. Tente novamente.');
  }
  function bits(input){
    const code=resolve(input),pattern=parity[Number(code[0])];
    return '101'+[...code.slice(1,7)].map((n,i)=>(pattern[i]==='L'?L:G)[Number(n)]).join('')+'01010'+[...code.slice(7)].map(n=>L[Number(n)].replace(/[01]/g,b=>b==='0'?'1':'0')).join('')+'101';
  }
  function previewSvg(input){
    const code=resolve(input),encoded=bits(code),guards=new Set([0,2,46,48,92,94]);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 30" preserveAspectRatio="none" role="img" aria-label="Código de barras EAN-13 '+code+'"><title>EAN-13 '+code+'</title><g fill="currentColor" shape-rendering="crispEdges">'+[...encoded].map((b,i)=>b==='1'?'<rect x="'+(11+i)+'" y="2" width="1" height="'+(guards.has(i)?26:24)+'"/>':'').join('')+'</g></svg>';
  }
  function svg(input){
    const code=resolve(input),encoded=bits(code),guards=new Set([0,2,46,48,92,94]);
    const bars=[...encoded].map((b,i)=>b==='1'?'<rect x="'+(11+i)+'" y="5" width="1" height="'+(guards.has(i)?60:54)+'"/>':'').join('');
    const digits='<text x="6" y="74">'+code[0]+'</text>'+[...code.slice(1)].map((d,i)=>'<text x="'+(i<6?14.5+i*7:61.5+(i-6)*7)+'" y="74">'+d+'</text>').join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="339" height="246" viewBox="0 0 113 82" role="img" aria-label="Código de barras EAN-13 '+code+'"><title>EAN-13 '+code+'</title><rect width="113" height="82" fill="white"/><g fill="black" shape-rendering="crispEdges">'+bars+'</g><g fill="black" font-family="monospace" font-size="8" text-anchor="middle">'+digits+'</g></svg>';
  }
  return Object.freeze({checkDigit,resolve,generate,bits,svg,previewSvg});
});

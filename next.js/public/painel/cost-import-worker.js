importScripts('cost-import.js');
let sheets=[];
function checkArchive(buffer){
 const v=new DataView(buffer);let total=0,entries=0;
 for(let i=0;i+46<v.byteLength;i++)if(v.getUint32(i,true)===0x02014b50){
  const size=v.getUint32(i+24,true);total+=size;entries++;
  if(size>20*1024*1024||total>40*1024*1024||entries>2000)throw Error('A planilha é muito grande. Divida em arquivos menores.');
  i+=45+v.getUint16(i+28,true)+v.getUint16(i+30,true)+v.getUint16(i+32,true);
 }
}
onmessage=async({data})=>{
 try{
  if(data.type==='read'){
   if(data.buffer.byteLength>5*1024*1024)throw Error('O arquivo deve ter até 5 MB.');
   if(data.name.toLowerCase().endsWith('.csv')){
    let text=new TextDecoder('utf-8').decode(data.buffer);if(text.includes('\ufffd'))text=new TextDecoder('windows-1252').decode(data.buffer);
    sheets=[{sheet:'Custos',data:NovaiCostImport.csvRows(text)}];
   }else if(data.name.toLowerCase().endsWith('.xlsx')){
    checkArchive(data.buffer);if(!self.NovaiXlsx)importScripts('assets/vendor/read-excel-file-universal-9.3.14.js');
    sheets=await NovaiXlsx.readAll(data.buffer);
   }else throw Error('Selecione um arquivo Excel (.xlsx) ou CSV.');
   if(!sheets.length)throw Error('Não encontramos dados na planilha.');
   postMessage({type:'sheets',names:sheets.map(s=>s.sheet)});
  }else if(data.type==='analyze'){
   const sheet=sheets.find(s=>s.sheet===data.sheet);if(!sheet)throw Error('Selecione uma aba da planilha.');
   postMessage({type:'report',report:NovaiCostImport.analyze(sheet.data,data.products,{overwrite:data.overwrite})});
  }
 }catch(error){postMessage({type:'error',message:error.message||'Não foi possível ler a planilha.'});}
};

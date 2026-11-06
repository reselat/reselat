export type QuoteCandidate={product:string;specification:string;unitPrice:string;currency:string;unit:string;page:number;conditions:string;sourceVersion:string};
// Strict field equality, including decimal spelling: never normalize money with floats.
const key=(q:QuoteCandidate)=>JSON.stringify([q.product,q.specification,q.unitPrice,q.currency,q.unit,q.page,q.conditions,q.sourceVersion]);
export function compareQuote(actual:QuoteCandidate[],expected:QuoteCandidate[]):{exact:boolean;differences:string[];publishable:false}{
 const remaining=actual.map(key),differences:string[]=[];
 if(!expected.length)differences.push('No reviewed baseline rows');
 for(const [i,row] of expected.entries()){
  const index=remaining.indexOf(key(row));
  if(index<0)differences.push(`Missing or changed baseline row ${i+1}`);else remaining.splice(index,1);
 }
 for(let i=0;i<remaining.length;i++)differences.push(`Unexpected or duplicate candidate row ${i+1}`);
 return {exact:differences.length===0,differences,publishable:false};
}

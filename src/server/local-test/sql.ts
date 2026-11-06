import type postgres from 'postgres';
import type {PGlite} from '@electric-sql/pglite';
type Runner={query:PGlite['query'];transaction?:PGlite['transaction']};
const fragment=Symbol('local-sql');
type Fragment={[fragment]:{text:string;values:unknown[]}};
function isFragment(v:unknown):v is Fragment{return typeof v==='object'&&v!==null&&fragment in v;}
/** Parameterized adapter used only by the development-only local test runtime. */
export function localSql(db:Runner):ReturnType<typeof postgres>{
 function sql(first:TemplateStringsArray|Record<string,unknown>,...values:unknown[]):unknown{
  if(!Array.isArray(first)){const entries=Object.entries(first);if(entries.some(([k])=>!/^[a-z_]+$/.test(k)))throw new Error('INVALID_IDENTIFIER');return {[fragment]:{text:entries.map(([k],i)=>'"'+k+'"=$'+(i+1)).join(','),values:entries.map(([,v])=>v)}};}
  const parameters:unknown[]=[];let text=first[0];for(let i=0;i<values.length;i++){const value=values[i];if(isFragment(value)){const shift=parameters.length;text+=value[fragment].text.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+shift));parameters.push(...value[fragment].values);}else{parameters.push(value);text+='$'+parameters.length;}text+=first[i+1];}
  let result:Promise<unknown>|undefined;const run=()=>result??=db.query(text,parameters).then(r=>r.rows);return {[fragment]:{text,values:parameters},then:(ok:unknown,fail:unknown)=>run().then(ok as never,fail as never)};
 }
 return Object.assign(sql,{json:(value:unknown)=>JSON.stringify(value),begin:async<T>(fn:(tx:ReturnType<typeof postgres>)=>Promise<T>)=>{if(!db.transaction)throw new Error('NESTED_TRANSACTION');return db.transaction(tx=>fn(localSql(tx)));}}) as unknown as ReturnType<typeof postgres>;
}

import {zipSync} from 'fflate';
export function csvCell(value:string){const safe=/^[\s]*[=+@\-\t\r\n]/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"';}
export function buildZip(files:{name:string;bytes:Uint8Array}[]){
 if(files.length>100||files.reduce((n,f)=>n+f.bytes.length,0)>50*1024*1024)throw new Error('EXPORT_LIMIT');
 const entries:Record<string,Uint8Array>={};
 for(const file of files){if(!file.name||file.name.startsWith('/')||file.name.includes('..')||/[\\\x00-\x1f]/.test(file.name)||Object.hasOwn(entries,file.name)||file.name==='__proto__')throw new Error('EXPORT_LIMIT');entries[file.name]=file.bytes;}
 return zipSync(entries,{level:1,mtime:new Date('2000-01-01T00:00:00Z')});
}

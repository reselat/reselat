import {expect,it} from 'vitest';
import {mkdtemp,readFile,readdir,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
import config from '../next.config';
it('renders a PDF using only traced runtime files and configured deployment includes',async()=>{
 const nft:unknown=createRequire(import.meta.url)('next/dist/compiled/@vercel/nft');if(typeof nft!=='object'||nft===null||!('nodeFileTrace'in nft)||typeof nft.nodeFileTrace!=='function')throw new Error('NFT_NOT_AVAILABLE');
 const traced:unknown=await nft.nodeFileTrace(['node_modules/pdfkit/js/pdfkit.node.mjs'],{base:process.cwd(),conditions:['node','import']});if(typeof traced!=='object'||traced===null||!('fileList'in traced)||!(traced.fileList instanceof Set))throw new Error('INVALID_TRACE');
 const files=new Set(z.array(z.string()).parse([...traced.fileList]));
 for(const pattern of config.outputFileTracingIncludes?.['/api/*']??[]){const match=/^\.\/(node_modules\/pdfkit\/js\/standard-fonts\/)(?:\*\*\/)?\*\.cjs$/.exec(pattern);if(match){for(const file of await readdir(match[1],{recursive:true}))if(file.endsWith('.cjs'))files.add(match[1]+file);}}
 const directory=await mkdtemp(path.join(tmpdir(),'trade-pdf-package-'));try{for(const file of files){const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}const source=pathToFileURL(path.join(directory,'node_modules/pdfkit/js/pdfkit.node.mjs')).href;
 const output=execFileSync(process.execPath,['--input-type=module','-e',`import PDFDocument from ${JSON.stringify(source)};const parts=[];const doc=new PDFDocument({autoFirstPage:false});doc.on('data',part=>parts.push(part));doc.on('end',()=>process.stdout.write(Buffer.concat(parts).subarray(0,5)));doc.addPage();doc.text('SYNTHETIC PDF PACKAGING TEST');doc.end();`],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']});expect(output).toBe('%PDF-');
 const manifest=JSON.parse(await readFile(path.join(directory,'node_modules/pdfkit/package.json'),'utf8'));expect(manifest.version).toBe('0.20.1');
 }finally{await rm(directory,{recursive:true,force:true});}
});

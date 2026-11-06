// OpenNext embeds .env / .env.local / .env.production(.local) values into the Worker bundle.
// Refuse to build for Cloudflare while any such file exists, so local/test secrets never ship.
import {readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function blockedEnvFiles(names){return names.filter(name=>/^\.env(\..+)?$/.test(name)&&name!=='.env.example');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const blocked=blockedEnvFiles(readdirSync(process.cwd()));
 if(blocked.length){console.error(`CF_BUILD_BLOCKED: 发现 ${blocked.join(', ')}；OpenNext 会把其中变量打进 Worker。请在干净目录（无 .env* 文件）构建，生产变量用 wrangler secret / vars。`);process.exit(1);}
}

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityChecks } from './quality-checks.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const { id: label, args } of qualityChecks){
  console.log(`\n[check] ${label}`);
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});child.on('error',reject);child.on('close',resolve);});
  if(code!==0){console.error(`\nFAILED: ${label}`);process.exit(1);}
}
console.log(`\nPASS: ${qualityChecks.length} checks. No publication was performed.`);

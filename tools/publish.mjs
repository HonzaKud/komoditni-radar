import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSnapshot} from './validate.mjs';
import {assertPreserved} from './accept.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// git show reads the complete historical snapshot (already over 2 MB).
// Node's default 1 MB output buffer otherwise aborts before validation.
function git(...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trimEnd();}
function run(...args){execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});}
function pushExact(commit){try{git('push','origin',commit+':refs/heads/main');}catch(error){const remote=git('ls-remote','origin','refs/heads/main').split(/\s/)[0];if(remote!==commit)throw error;}}
function onlySnapshot(commit){return git('diff-tree','--no-commit-id','--name-only','-r',commit)==='data/snapshot.json';}
try{
  if(git('branch','--show-current')!=='main')throw Error('Publikování je povoleno pouze z main.');
  if(git('remote','get-url','origin')!=='https://github.com/HonzaKud/komoditni-radar.git')throw Error('Neočekávaný Git remote.');
  if(git('diff','--cached','--name-only'))throw Error('Git index obsahuje jiné připravené změny.');
  const dirty=git('status','--porcelain','--untracked-files=normal').split('\n').filter(Boolean);
  if(dirty.some(line=>line.slice(3)!=='data/snapshot.json'))throw Error('Projekt obsahuje změny mimo datový snímek; automatické publikování zastaveno.');
  git('fetch','origin','main');
  const ahead=git('rev-parse','HEAD'),remote=git('rev-parse','origin/main');
  if(ahead!==remote){
    if(git('rev-list','--parents','-n','1',ahead)!==ahead+' '+remote||!onlySnapshot(ahead)||!git('show','-s','--format=%s',ahead).startsWith('Aktualizace kovů '))throw Error('HEAD obsahuje neznámou historii; automaticky neslučuji.');
    const pending=JSON.parse(git('show',ahead+':data/snapshot.json'));const check=validateSnapshot(pending);if(!check.ok)throw Error(check.errors.join('\n'));
    assertPreserved(JSON.parse(git('show',remote+':data/snapshot.json')),pending);
    run('--test');pushExact(ahead);console.log('Dokončeno nahrání dřívějšího ověřeného datového commitu '+ahead+'.');
  }
  const parent=git('rev-parse','HEAD');
  if(parent!==git('rev-parse','origin/main'))throw Error('Místní HEAD neodpovídá origin/main; automaticky neslučuji.');
  if(!dirty.length){console.log('Datový snímek se nezměnil a HEAD odpovídá origin/main.');process.exit(0);}
  const previous=JSON.parse(git('show','HEAD:data/snapshot.json'));
  const candidateText=readFileSync(path.join(root,'data/snapshot.json'),'utf8');
  const next=JSON.parse(candidateText);
  assertPreserved(previous,next);
  run('--test');run('tools/validate.mjs');run('tools/build.mjs');
  if(readFileSync(path.join(root,'data/snapshot.json'),'utf8')!==candidateText)throw Error('Datový snímek se během kontrol změnil; opakuj validaci.');
  if(git('diff','--cached','--name-only'))throw Error('Během kontrol byly do Git indexu připraveny další změny.');
  if(git('rev-parse','HEAD')!==parent||git('status','--porcelain','--untracked-files=normal').split('\n').filter(Boolean).some(line=>line.slice(3)!=='data/snapshot.json'))throw Error('Git stav se během kontrol změnil; nic nenahrávám.');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  git('commit','--only','-m',`Aktualizace kovů ${day}`,'--','data/snapshot.json');
  const commit=git('rev-parse','HEAD');
  if(git('rev-list','--parents','-n','1',commit)!==commit+' '+parent||!onlySnapshot(commit))throw Error('Nový commit nemá očekávaný rozsah a rodiče; nic nenahrávám.');
  pushExact(commit);
  console.log('Nahrán datový commit '+commit+'. Nasazení Pages je ještě nutné ověřit.');
}catch(error){console.error('Publikování zastaveno: '+error.message);process.exitCode=1;}

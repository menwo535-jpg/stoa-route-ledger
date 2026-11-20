import {collect} from './ledger.mjs';
const block=process.argv[2];
const result=await collect(block === undefined ? undefined : Number(block));
process.stdout.write(JSON.stringify(result,null,2)+'\n');

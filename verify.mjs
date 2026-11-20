import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collect,decode,rpc,summarize,ROUTER,TOPIC} from './ledger.mjs';
const snapshot=JSON.parse(await readFile(new URL('./snapshot.json',import.meta.url),'utf8'));
const replay=await collect(snapshot.block);
assert.deepEqual(replay,snapshot,'Pinned-block replay differs');
for(let i=0;i<replay.swaps.length;i+=4) {
  await Promise.all(replay.swaps.slice(i,i+4).map(async row=>{
    const rec=await rpc('eth_getTransactionReceipt',[row.tx]);
    assert.equal(rec.status,'0x1');assert.equal(rec.blockHash,row.blockHash);
    const event=rec.logs.find(l=>l.address.toLowerCase()===ROUTER && l.topics[0]===TOPIC && Number(BigInt(l.logIndex))===row.index);
    assert.ok(event,'Missing receipt event: '+row.tx);
    const {time,quoteMicro,quoteLeg,...fields}=row;
    assert.deepEqual(decode(event),fields);
  }));
}
console.log('Pinned replay and '+replay.swaps.length+' receipt events verified at block '+snapshot.block);
console.log(JSON.stringify(summarize(replay.swaps,replay.ethMark),null,2));

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {valueSwap,summarize,decode,USDG,ZERO,WETH,venue} from './ledger.mjs';
const snapshot=JSON.parse(await readFile(new URL('./snapshot.json',import.meta.url),'utf8'));
const old='0x8965140fb51b2e99a0cd31a0e99eae01d36517b8',current='0x27958279f95225b2a5517e7dd12b6fc0317e5c5d';
const row={recipient:'r',adapters:[old,current],time:3600,tokenIn:USDG,rawIn:'1234567',tokenOut:ZERO,rawOut:'1'};
test('stable notional takes precedence over a native mark',()=>assert.deepEqual(valueSwap(row,1800),{usd:1.234567,basis:'USDG in'}));
test('wrapped native amount uses 18 decimals',()=>assert.equal(valueSwap({...row,tokenIn:WETH,rawIn:'500000000000000000'},1700).usd,850));
test('unknown valuation remains missing; zero stable amount is still priced',()=>{
  assert.equal(valueSwap({...row,tokenIn:'x',tokenOut:'y'},1800).usd,null);
  assert.equal(valueSwap({...row,rawIn:'0'},1800).usd,0);
});
test('dynamic token quote uses six USDG decimals',()=>assert.equal(valueSwap({...row,tokenIn:'x',tokenOut:'y',quoteLeg:'out',quoteMicro:'500000'},1700).usd,.5));
test('a repeated venue counts once per event; a repeated recipient counts once overall',()=>{
  const s=summarize([row,row],1800);
  assert.equal(s.traders,1);assert.deepEqual(s.counts,[['Uniswap v4',2]]);assert.equal(s.total,2.469134);
});
test('unknown venues retain individual identities and unpriced recipients still count',()=>{
  const other={...row,recipient:'other',tokenIn:'x',tokenOut:'y',adapters:['a','b']};
  const s=summarize([row,other],1700);
  assert.equal(s.priced,1);assert.equal(s.traders,2);assert.equal(s.counts.length,3);assert.equal(venue('a'),'a');
});
test('zero-recipient and empty-window boundaries',()=>{
  assert.equal(summarize([{...row,recipient:ZERO}],1800).traders,0);
  assert.deepEqual(summarize([],0),{total:0,priced:0,traders:0,counts:[],daily:[]});
});
test('reject an incompatible event before decoding',()=>assert.throws(()=>decode({address:ZERO,topics:[],data:'0x'})));
test('published rows have distinct log IDs, valid times and reverse block order',()=>{
  const ids=new Set();
  snapshot.swaps.forEach((s,i)=>{
    assert.ok(s.time>0 && s.time<=snapshot.time); assert.ok(s.block>=snapshot.fromBlock && s.block<=snapshot.block);
    assert.ok(i===0 || snapshot.swaps[i-1].block>=s.block);
    ids.add(s.tx+'/'+s.index);
  });
  assert.equal(ids.size,snapshot.swaps.length);
});

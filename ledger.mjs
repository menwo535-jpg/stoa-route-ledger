export const RPC = 'https://rpc.mainnet.chain.robinhood.com';
export const ROUTER = '0x2f2804fad735a38015650f32f95ad5e08d6b3ee5';
export const START = 114244443;
export const TOPIC = '0x2bbce25631e8fa58085b7ea5929726c3acdf2df8d6b1f099eb32fb7425a4f6da';
export const ZERO = '0x' + '0'.repeat(40);
export const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
export const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const tokens = new Map([[ZERO,'ETH'],[WETH,'WETH'],[USDG,'USDG'],['0x13e6993417616de724f2b337d65063f229e96718','STOA']]);
tokens.set('0x1dd577f4c1b9a201cb099af9af74dcac012395c9','STOA · 95c9');
tokens.set('0x51250b135174ca09450ec01c4aff73cf69dbb590','NOVAAI');
tokens.set('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea','SPCX');
tokens.set('0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3','GOOGL');
export const short = s => s.slice(0,6) + '…' + s.slice(-4);
export const symbol = addr => tokens.get(addr) ?? short(addr);
const venues = new Map([
  ['0x5c8537e7d755884326de0969ce7bdb14195f56be','Uniswap v2'],
  ['0x28802ad6f9859d14dfc6226ea9a8b60686d3a2e6','Uniswap v3'],
  ['0x27958279f95225b2a5517e7dd12b6fc0317e5c5d','Uniswap v4'],
  ['0x8965140fb51b2e99a0cd31a0e99eae01d36517b8','Uniswap v4'],
  ['0xf0904b95d66f565de215cc7dc58b6054f72a9352','Aero'],
  ['0x87b3b896beabdc421f9d9b0a3fd3dbbae1ddd568','Ramses'],
  ['0x58c2c83b66088b57b9dd487ba1090992bc9eebe0','Pons'],
  ['0x1341db53ed69ce1def86bdbfc60d5fd92cf9004f','Metric'],
  ['0xb40892c77bc4a1aba744c1afd96fce048d6456c3','UP']
]);
export const venue = address => venues.get(address) ?? address;
export const hex = n => '0x' + n.toString(16);
const pad = s => s.replace(/^0x/,'').padStart(64,'0');
const address = word => '0x' + word.slice(-40).toLowerCase();
const integer = raw => Number(BigInt(raw));
export async function rpc(method, params = []) {
  const response = await fetch(RPC, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method,params,id:1}),signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('RPC returned HTTP ' + response.status);
  const data = await response.json();
  if (data.error || data.result == null) throw Error(method + ': ' + (data.error?.message ?? 'no result'));
  return data.result;
}
export function decode(log) {
  if (log.address.toLowerCase() !== ROUTER || log.topics[0] !== TOPIC || log.topics.length !== 4 || !/^0x[0-9a-f]{448}$/i.test(log.data)) throw Error('Unexpected Routed log layout');
  const [tin,tout,rawIn,rawOut,mid,v1,v2] = log.data.slice(2).match(/.{64}/g);
  return {tx:log.transactionHash,index:integer(log.logIndex),block:integer(log.blockNumber),blockHash:log.blockHash,sender:address(log.topics[1]),recipient:address(log.topics[2]),referrer:address(log.topics[3]),tokenIn:address(tin),tokenOut:address(tout),rawIn:BigInt('0x'+rawIn).toString(),rawOut:BigInt('0x'+rawOut).toString(),mid:address(mid),adapters:[address(v1),address(v2)].filter(a=>a!==ZERO)};
}
export function valueSwap(s, mark) {
  if (s.tokenIn === USDG) return {usd:Number(s.rawIn)/1e6,basis:'USDG in'};
  if (s.tokenOut === USDG) return {usd:Number(s.rawOut)/1e6,basis:'USDG out'};
  if (Number.isFinite(mark) && mark > 0) {
    if ([ZERO,WETH].includes(s.tokenIn)) return {usd:Number(s.rawIn)/1e18*mark,basis:'ETH mark (in)'};
    if ([ZERO,WETH].includes(s.tokenOut)) return {usd:Number(s.rawOut)/1e18*mark,basis:'ETH mark (out)'};
  }
  if (s.quoteMicro && BigInt(s.quoteMicro)>0n) return {usd:Number(s.quoteMicro)/1e6,basis:'Token quote ('+s.quoteLeg+')'};
  return {usd:null,basis:'Unpriced'};
}
async function quoteToUsdg(token,raw,tag) {
  const data='0xb6466384'+pad(token)+pad(USDG)+pad(hex(BigInt(raw)));
  const out=await rpc('eth_call',[{to:ROUTER,data},tag]);
  if (!/^0x[0-9a-f]{64,}$/i.test(out)) throw Error('Router returned an invalid quote');
  return BigInt('0x'+out.slice(2,66)).toString();
}
export function summarize(swaps,mark) {
  const traders=new Set(), counts=new Map(), daily=new Map();
  let total=0,priced=0;
  for (const s of swaps) {
    const {usd}=valueSwap(s,mark);
    if (usd !== null) {total+=usd;priced++;}
    if (s.recipient!==ZERO) traders.add(s.recipient);
    for (const name of new Set(s.adapters.map(venue))) counts.set(name,(counts.get(name) ?? 0)+1);
    const day=new Date(s.time*1000).toISOString().slice(0,10);
    const d=daily.get(day) ?? {swaps:0,usd:0};
    d.swaps++; d.usd+=usd ?? 0; daily.set(day,d);
  }
  return {total,priced,traders:traders.size,counts:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),daily:[...daily].sort((a,b)=>a[0].localeCompare(b[0]))};
}
export async function collect(targetBlock) {
  if (integer(await rpc('eth_chainId'))!==4663) throw Error('Unexpected chain ID');
  const end = targetBlock ?? integer(await rpc('eth_blockNumber'))-256;
  if (!Number.isSafeInteger(end) || end<START) throw Error('Invalid snapshot block');
  const tag=hex(end);
  const header=await rpc('eth_getBlockByNumber',[tag,false]);
  const unique=new Map();
  for (let lo=START;lo<=end;lo+=9000000) {
    const raw=await rpc('eth_getLogs',[{address:ROUTER,topics:[TOPIC],fromBlock:hex(lo),toBlock:hex(Math.min(end,lo+8999999))}]);
    for (const l of raw) {
      if (l.removed) continue;
      const row=decode(l); unique.set(row.tx+'/'+row.index,row);
    }
  }
  const swaps=[...unique.values()].sort((a,b)=>b.block-a.block||b.index-a.index);
  const blocks=[...new Set(swaps.map(s=>s.block))], headers=new Map();
  for (let i=0;i<blocks.length;i+=4) {
    await Promise.all(blocks.slice(i,i+4).map(async n=>headers.set(n,await rpc('eth_getBlockByNumber',[hex(n),false]))));
  }
  for (const s of swaps) {
    const b=headers.get(s.block);
    if(b.hash!==s.blockHash) throw Error('Block changed; refresh again');
    s.time=integer(b.timestamp);
  }
  const quotedMicroUSDG=await quoteToUsdg(ZERO,10n**16n,tag);
  const ethMark=Number(quotedMicroUSDG)/10000 || null;
  for (const s of swaps.filter(s=>valueSwap(s,ethMark).usd===null)) {
    for (const [leg,token,raw] of [['in',s.tokenIn,s.rawIn],['out',s.tokenOut,s.rawOut]]) {
      const value=await quoteToUsdg(token,raw,tag);
      if (BigInt(value)>0n) {s.quoteMicro=value; s.quoteLeg=leg; break;}
    }
  }
  if ((await rpc('eth_getBlockByNumber',[tag,false])).hash!==header.hash) throw Error('Snapshot block changed');
  return {chainId:4663,router:ROUTER,fromBlock:START,block:end,blockHash:header.hash,time:integer(header.timestamp),quotedMicroUSDG,ethMark,swaps};
}

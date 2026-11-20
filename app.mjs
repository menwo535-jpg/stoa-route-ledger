import {collect,short,symbol,venue,valueSwap,summarize} from './ledger.mjs';
const explorer='https://robinhoodchain.blockscout.com';
const el=id=>document.getElementById(id);
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
let snapshot,days=0;
const selected=()=>snapshot.swaps.filter(s=>!days || s.time>snapshot.time-days*86400);
function node(tag,text,cls) {
  const n=document.createElement(tag);
  if (text!==undefined) n.textContent=text;
  if (cls) n.className=cls;
  return n;
}
function link(path,label) {
  const n=node('a',label); n.href=explorer+path; n.target='_blank'; n.rel='noopener';return n;
}
function barChart(data) {
  const chart=el('chart');chart.replaceChildren();
  if (!data.length) {chart.append(node('p','No swaps in this window.'));return;}
  const start=Date.parse(data[0][0]+'T00:00Z'), end=Date.parse(data.at(-1)[0]+'T00:00Z');
  const span=Math.round((end-start)/86400000)+1,step=Math.ceil(span/12),bins=[];
  const byDay=new Map(data);
  for(let offset=0;offset<span;offset+=step) {
    const day=n=>new Date(start+n*86400000).toISOString().slice(0,10);
    const last=Math.min(span-1,offset+step-1);
    let usd=0,count=0;
    for(let i=offset;i<=last;i++){const d=byDay.get(day(i));if(d){usd+=d.usd;count+=d.swaps;}}
    bins.push({label:day(offset),end:day(last),usd,count});
  }
  const max=Math.max(1,...bins.map(b=>b.usd));
  for(const b of bins) {
    const col=node('div',undefined,'barCol'),bar=node('div',undefined,'bar');
    col.title=b.label+(b.end===b.label?'':' to '+b.end)+' · '+money.format(b.usd)+' · '+b.count+' swaps';
    col.setAttribute('aria-label',col.title); col.setAttribute('role','img');
    bar.style.height=(b.usd/max*89)+'px';
    col.append(bar,node('span',b.label.slice(5), 'axis'));chart.append(col);
  }
}
function render() {
  const rows=selected(), m=summarize(rows,snapshot.ethMark);
  el('volume').textContent=money.format(m.total);el('coverage').textContent=m.priced+' of '+rows.length+' swaps priced';
  el('swaps').textContent=rows.length;el('traders').textContent=m.traders;el('venues').textContent=m.counts.length;
  const stamp=new Date(snapshot.time*1000).toISOString();
  const block=link('/block/'+snapshot.block,'#'+snapshot.block);
  el('checkpoint').replaceChildren(block,document.createTextNode(' · '+stamp.slice(0,16).replace('T',' ')+' UTC'));
  barChart(m.daily);
  const routes=el('routes');routes.replaceChildren();
  if (!m.counts.length) routes.append(node('p','No venue routes in this window.'));
  for(const [name,count] of m.counts) {
    const row=node('div',undefined,'venue'),line=node('div',undefined,'venueLine'),track=node('div',undefined,'track'),fill=node('div',undefined,'fill');
    line.append(node('span',name.startsWith('0x')?short(name):name),node('strong',count+' / '+rows.length));
    fill.style.width=(count/rows.length*100)+'%';track.append(fill);row.append(line,track);routes.append(row);
  }
  const body=el('tbody');body.replaceChildren();el('rowscount').textContent=rows.length+' settled events · newest first';
  for(const s of rows) {
    const tr=node('tr'),date=node('td',new Date(s.time*1000).toISOString().slice(0,16).replace('T',' '),'mono');
    const pair=node('td',symbol(s.tokenIn)+' → '+symbol(s.tokenOut));
    pair.title=s.tokenIn+' → '+s.tokenOut;
    pair.append(node('small',s.adapters.map(a=>{const v=venue(a);return v.startsWith('0x')?short(v):v;}).join(' → '),'meta'));
    const who=node('td');who.append(link('/address/'+s.recipient,short(s.recipient)));
    const price=valueSwap(s,snapshot.ethMark),notional=node('td',price.usd===null?'—':money.format(price.usd));
    notional.append(node('small',price.basis,'meta'));
    const receipt=node('td');receipt.append(link('/tx/'+s.tx,short(s.tx)+' ↗'));receipt.title='Log '+s.index;
    tr.append(date,pair,who,notional,receipt);body.append(tr);
  }
  el('csv').disabled=false;
}
function download() {
  const records=[['tx','log_index','block','utc','sender','recipient','referrer','token_in','token_out','amount_in_raw','amount_out_raw','middle_token','adapters','venues','usd_estimate','basis','valuation_block']];
  for (const s of selected()) {
    const price=valueSwap(s,snapshot.ethMark);
    records.push([s.tx,s.index,s.block,new Date(s.time*1000).toISOString(),s.sender,s.recipient,s.referrer,s.tokenIn,s.tokenOut,s.rawIn,s.rawOut,s.mid,s.adapters.join('|'),s.adapters.map(venue).join('|'),price.usd??'',price.basis,snapshot.block]);
  }
  const url=URL.createObjectURL(new Blob([records.map(x=>x.join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));
  const anchor=node('a');anchor.href=url;anchor.download='stoa-swaps-'+snapshot.block+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function refresh() {
  el('refresh').disabled=true;el('status').textContent='Reading settled events from the chain…';
  try {
    const next=await collect();
    if (snapshot && next.block<snapshot.block) throw Error('RPC head is older than the current snapshot');
    snapshot=next;render();el('status').textContent='Updated directly from Robinhood Chain.';
  } catch(e) {el('status').textContent=(snapshot?'Showing the last loaded block. ':'')+'Refresh failed: '+e.message;}
  finally {el('refresh').disabled=false;}
}
el('refresh').addEventListener('click',refresh);
el('csv').addEventListener('click',download);
el('ranges').addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn || !snapshot)return;
  days=Number(btn.dataset.days);for(const b of el('ranges').querySelectorAll('button')) b.setAttribute('aria-pressed',String(b===btn));
  render();
});
try {
  const response=await fetch('./snapshot.json');
  if(!response.ok) throw Error('snapshot unavailable');
  snapshot=await response.json();render();el('status').textContent='Published snapshot · refresh for the latest settled block.';
  if(Date.now()/1000-snapshot.time>6*3600) void refresh();else el('refresh').disabled=false;
} catch {await refresh();}

# Stoa Route Ledger

[Open the dashboard](https://menwo535-jpg.github.io/stoa-route-ledger/) · [Published snapshot](./snapshot.json) · [Executable query](./ledger.mjs)

A read-only dashboard for settled Stoa swaps on Robinhood Chain (chain ID 4663). Filter by time, compare venue use, inspect a trader or transaction on Blockscout, or download the filtered rows as CSV. No account, API key or wallet is required.

## Replay

Use Node 22+ and the public Robinhood Chain RPC. There are no npm dependencies.

```sh
node --test ledger.test.mjs
node verify.mjs
node refresh.mjs 119118136 > replay.json
node refresh.mjs > latest.json
python -m http.server 8000
```

Open http://localhost:8000 after starting the server. The site first shows the published dataset, then queries the chain automatically if the snapshot is more than six hours old. The refresh button runs the same query at the current head minus 256 blocks. A failed refresh leaves the previously loaded snapshot visible. The UTC timestamp and block link always describe the displayed dataset.

## How to audit a number

The [router deployment](https://github.com/StoaDex/Stoa/blob/ca2ebb790f74fea5cb3f946c93101d2b1e268a87/web/lib/deployments-4663.json) supplies the start block and adapter identities. The [contract](https://github.com/StoaDex/Stoa/blob/ca2ebb790f74fea5cb3f946c93101d2b1e268a87/contracts/src/StoaRouter.sol) defines the event and quote. All calls below use https://rpc.mainnet.chain.robinhood.com.

1. Check `eth_chainId` equals 4663. Use `eth_getLogs` from deployment block 114244443 through the selected block, in inclusive non-overlapping chunks of at most 9,000,000 blocks. Filter on router `0x2f2804fad735a38015650f32f95ad5e08d6b3ee5` and the `Routed` topic `0x2bbce25631e8fa58085b7ea5929726c3acdf2df8d6b1f099eb32fb7425a4f6da`.
2. Decode indexed sender, payout recipient and referrer, then token in/out, raw amounts, intermediate token and the two adapters. Keep one event per transaction hash and log index. Fetch each event block with `eth_getBlockByNumber` for its UTC time and verify its hash. The second read of the cutoff block checks for a reorg during collection.
3. Count unique nonzero output recipients for traders. This follows Stoa’s [trader convention](https://github.com/StoaDex/Stoa/blob/ca2ebb790f74fea5cb3f946c93101d2b1e268a87/web/lib/routerStats.ts). Several people may share one recipient, or one person may use several. Venue counts are swap touches: both v4 adapter versions count as Uniswap v4. Two visits to the same venue in a single event count once. A two-venue route counts once for each venue. The dashboard’s swap count and notional count the event just once.
4. Value a USDG leg using its six-decimal amount, at $1 per USDG. Otherwise mark ETH/WETH using the router’s read-only quote for 0.01 ETH into USDG. For other pairs quote the actual input amount into USDG at the same block, trying the output amount if the input quote returns zero. Missing routes are marked unpriced. The selector is `0xb6466384` for `quote(address,address,uint256)`; the first word is the raw output quote. Non-stable valuations are snapshot estimates and can differ from execution-time prices and other dashboards. The JSON and CSV expose raw amounts, adapter addresses and transaction/log identifiers. The JSON also includes the raw valuation quotes.
5. Run `node verify.mjs` to rebuild the complete published snapshot at its exact block and cross-check every decoded event against its successful transaction receipt. Large archive ranges require an RPC retaining the referenced block state. Date filters use rolling windows ending at the displayed block time.

The published checkpoint at block **119118136** contains 31 events, 18 distinct recipients and four venues, with approximately **$635.24** estimated notional. The snapshot includes receipts for routes through five adapter addresses. This project reads swaps settled by the Stoa router; it does not initiate transactions.

// Usage: bun tools/balance.ts [profiles=24] [runs=60] [out=out/meta-curve.json]
// Owner DMs 1794626233.833599 and 1794626251.975969 replace the old
// fresh-profile win-rate target with an account progression curve.
import { measureMeta } from "./meta-balance";

await measureMeta(Number(process.argv[2] ?? 24), Number(process.argv[3] ?? 60), process.argv[4] ?? "out/meta-curve.json");

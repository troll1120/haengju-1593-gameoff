import { BPH_GENERALS, DIM_TIERS, measureDim } from "./skill-dim-fixture";

const rows = BPH_GENERALS.flatMap(general => DIM_TIERS.map(({ level, awakened }) => measureDim(general, level, awakened)));
await Bun.write(process.argv[2], JSON.stringify(rows, null, 2));
for (const { general, level, awakened, showEnd, overlayEnd, gaps } of rows)
  console.log(`${general} Lv${level} A${awakened}: show=${showEnd.toFixed(1)} veil=${overlayEnd.toFixed(1)} gaps=${gaps}`);

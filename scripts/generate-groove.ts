import { writeFileSync } from "node:fs";
import { generateGroove } from "../src/game/simulation/groove";

const groove = generateGroove({
  bpm: Number(process.argv[2] ?? 112),
  loopBeats: Number(process.argv[3] ?? 8),
  density: Number(process.argv[4] ?? 0.5),
  lanes: ["drums", "perc"],
  timbres: ["kick", "snare", "hat"],
  seed: Number(process.argv[5] ?? 1),
});

const output = JSON.stringify(groove, null, 2);
if (process.argv[6]) {
  writeFileSync(process.argv[6], output, "utf8");
} else {
  console.log(output);
}

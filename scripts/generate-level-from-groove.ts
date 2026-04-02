import { readFileSync } from "node:fs";
import { generateLevelFromGroove } from "../src/game/simulation/levelGenerator";
import type { RhythmEvent } from "../src/game/types";

const source = process.argv[2];
if (!source) {
  throw new Error("Expected a groove json path");
}

const rhythm = JSON.parse(readFileSync(source, "utf8")) as RhythmEvent[];
console.log(JSON.stringify(generateLevelFromGroove("generated-cli", rhythm), null, 2));

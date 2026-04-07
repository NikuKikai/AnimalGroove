import { generateLevelFromPaths } from "../src/game/simulation/pathFirstLevelGenerator";

const seedArg = process.argv[2];
const loopBeatsArg = process.argv[3];
const animalCountArg = process.argv[4];

const seed = seedArg ? Number(seedArg) : undefined;
const loopBeats = loopBeatsArg ? Number(loopBeatsArg) : undefined;
const animalCount = animalCountArg ? Number(animalCountArg) : undefined;

console.log(
  JSON.stringify(
    generateLevelFromPaths("generated-path-first", {
      seed,
      loopBeats,
      animalCount,
    }),
    null,
    2,
  ),
);

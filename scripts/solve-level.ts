import { ensembleLevel, tutorialLevel } from "../src/data/levels";
import { solveLevel } from "../src/game/simulation/solver";

const levelId = process.argv[2] ?? "tutorial";
const level = levelId === "ensemble" ? ensembleLevel : tutorialLevel;
console.log(JSON.stringify(solveLevel(level), null, 2));

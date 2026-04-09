import { defaultAnimalModelRegistry } from "../game/assets/modelAssets";
import { defineLevel } from "../game/engine/levelDsl";
import { materializeLevelLayout } from "../game/simulation/levelBlockLayout";
import { generateGroove } from "../game/simulation";

const tutorialAnimals = [
  {
    id: "fox-1",
    name: "Fox",
    animalType: "fox",
    timbre: "kick",
    path: {
      waypoints: [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ],
      cycleBeats: 4,
    },
  },
] as const;

const tutorialLayout = materializeLevelLayout([...tutorialAnimals], [
  {
    blockId: "kick-single",
    name: "Kick Pad",
    width: 1,
    height: 1,
    timbre: "kick",
    canRotate: true,
    color: "#ffb347",
    solutionOrigin: { x: 1, y: 1 },
    solutionRotation: 0,
  },
  {
    blockId: "kick-single",
    name: "Kick Pad",
    width: 1,
    height: 1,
    timbre: "kick",
    canRotate: true,
    color: "#ffb347",
    solutionOrigin: { x: 3, y: 3 },
    solutionRotation: 0,
  },
  {
    blockId: "hat-domino",
    name: "Hat Domino",
    width: 2,
    height: 1,
    timbre: "hat",
    canRotate: true,
    color: "#7fd1b9",
    solutionOrigin: { x: 4, y: 1 },
    solutionRotation: 90,
  },
]);

export const tutorialLevel = defineLevel({
  id: "tutorial",
  name: "Forest Warmup",
  description: "One fox circles the clearing. Rebuild the terrain so the loop lands on the kick pattern.",
  bpm: 108,
  loopBeats: 4,
  board: tutorialLayout.board,
  animals: tutorialLayout.animals,
  blocks: tutorialLayout.blocks,
  targetRhythm: [
    { id: "t-1", lane: "drums", beat: 0, timbre: "kick", velocity: 1 },
    { id: "t-2", lane: "drums", beat: 2, timbre: "kick", velocity: 0.95 },
  ],
  judge: {
    beatTolerance: 0.12,
  },
  models: defaultAnimalModelRegistry,
  referenceSolution: tutorialLayout.referenceSolution,
});

const ensembleGroove = generateGroove({
  bpm: 112,
  loopBeats: 8,
  density: 0.55,
  lanes: ["drums", "perc"],
  timbres: ["kick", "snare", "hat"],
  seed: 12,
});

const ensembleAnimals = [
  {
    id: "panda-1",
    name: "Panda",
    animalType: "panda",
    timbre: "kick",
    path: {
      waypoints: [
        { x: 1, y: 1 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 5, y: 1 },
        { x: 5, y: 2 },
        { x: 4, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 2 },
      ],
      cycleBeats: 8,
    },
  },
  {
    id: "cat-1",
    name: "Cat",
    animalType: "cat",
    timbre: "snare",
    path: {
      waypoints: [
        { x: 2, y: 3 },
        { x: 3, y: 2 },
        { x: 5, y: 2 },
        { x: 6, y: 3 },
        { x: 6, y: 5 },
        { x: 5, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 4 },
      ],
      cycleBeats: 8,
      startPhaseBeat: 0.5,
    },
  },
] as const;

const ensembleLayout = materializeLevelLayout(
  [...ensembleAnimals],
  [
    {
      blockId: "kick-tile",
      name: "Kick Tile",
      width: 1,
      height: 1,
      timbre: "kick",
      canRotate: true,
      color: "#ff9f68",
      solutionOrigin: { x: 1, y: 1 },
      solutionRotation: 0,
    },
    {
      blockId: "kick-tile",
      name: "Kick Tile",
      width: 1,
      height: 1,
      timbre: "kick",
      canRotate: true,
      color: "#ff9f68",
      solutionOrigin: { x: 5, y: 2 },
      solutionRotation: 0,
    },
    {
      blockId: "kick-tile",
      name: "Kick Tile",
      width: 1,
      height: 1,
      timbre: "kick",
      canRotate: true,
      color: "#ff9f68",
      solutionOrigin: { x: 6, y: 3 },
      solutionRotation: 0,
    },
    {
      blockId: "snare-tile",
      name: "Snare Tile",
      width: 1,
      height: 1,
      timbre: "snare",
      canRotate: true,
      color: "#ffc857",
      solutionOrigin: { x: 3, y: 2 },
      solutionRotation: 0,
    },
    {
      blockId: "snare-tile",
      name: "Snare Tile",
      width: 1,
      height: 1,
      timbre: "snare",
      canRotate: true,
      color: "#ffc857",
      solutionOrigin: { x: 5, y: 5 },
      solutionRotation: 0,
    },
    {
      blockId: "hat-bar",
      name: "Hat Bar",
      width: 2,
      height: 1,
      timbre: "hat",
      canRotate: true,
      color: "#5ec2b7",
      solutionOrigin: { x: 2, y: 0 },
      solutionRotation: 0,
    },
    {
      blockId: "hat-bar",
      name: "Hat Bar",
      width: 2,
      height: 1,
      timbre: "hat",
      canRotate: true,
      color: "#5ec2b7",
      solutionOrigin: { x: 4, y: 5 },
      solutionRotation: 0,
    },
  ],
  {
    blockedCells: [{ x: 7, y: 5 }],
  },
);

export const ensembleLevel = defineLevel({
  id: "ensemble",
  name: "Meadow Ensemble",
  description: "Two animals circle overlapping loops. Reshape the terrain so both lines interlock correctly.",
  bpm: 112,
  loopBeats: 8,
  board: ensembleLayout.board,
  animals: ensembleLayout.animals,
  blocks: ensembleLayout.blocks,
  targetRhythm: ensembleGroove,
  judge: {
    beatTolerance: 0.16,
  },
  models: defaultAnimalModelRegistry,
  referenceSolution: ensembleLayout.referenceSolution,
});

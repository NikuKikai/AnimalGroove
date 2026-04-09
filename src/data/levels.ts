import { defineLevel } from "../game/engine/levelDsl";
import { defaultAnimalModelRegistry } from "../game/assets/modelAssets";
import { generateGroove } from "../game/simulation";

export const tutorialLevel = defineLevel({
  id: "tutorial",
  name: "Forest Warmup",
  description: "One fox circles the clearing. Drag pads into the loop to rebuild the groove.",
  bpm: 108,
  loopBeats: 4,
  board: {
    width: 6,
    height: 5,
  },
  animals: [
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
  ],
  inventory: [
    {
      id: "kick-single",
      name: "Kick Pad",
      width: 1,
      height: 1,
      timbre: "kick",
      quantity: 2,
      canRotate: true,
      color: "#ffb347",
    },
    {
      id: "hat-domino",
      name: "Hat Domino",
      width: 2,
      height: 1,
      timbre: "hat",
      quantity: 1,
      canRotate: true,
      color: "#7fd1b9",
    },
  ],
  targetRhythm: [
    { id: "t-1", lane: "drums", beat: 0, timbre: "kick", velocity: 1 },
    { id: "t-2", lane: "drums", beat: 2, timbre: "kick", velocity: 0.95 },
  ],
  judge: {
    beatTolerance: 0.12,
  },
  models: defaultAnimalModelRegistry,
  referenceSolution: [
    { blockId: "kick-single", origin: { x: 1, y: 1 }, rotation: 0 },
    { blockId: "kick-single", origin: { x: 3, y: 3 }, rotation: 0 },
  ],
});

const ensembleGroove = generateGroove({
  bpm: 112,
  loopBeats: 8,
  density: 0.55,
  lanes: ["drums", "perc"],
  timbres: ["kick", "snare", "hat"],
  seed: 12,
});

export const ensembleLevel = defineLevel({
  id: "ensemble",
  name: "Meadow Ensemble",
  description: "Two animals circle separate rings and interlock the groove.",
  bpm: 112,
  loopBeats: 8,
  board: {
    width: 8,
    height: 6,
    blockedCells: [{ x: 7, y: 5 }],
  },
  animals: [
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
  ],
  inventory: [
    {
      id: "kick-tile",
      name: "Kick Tile",
      width: 1,
      height: 1,
      timbre: "kick",
      quantity: 3,
      canRotate: true,
      color: "#ff9f68",
    },
    {
      id: "snare-tile",
      name: "Snare Tile",
      width: 1,
      height: 1,
      timbre: "snare",
      quantity: 2,
      canRotate: true,
      color: "#ffc857",
    },
    {
      id: "hat-bar",
      name: "Hat Bar",
      width: 2,
      height: 1,
      timbre: "hat",
      quantity: 2,
      canRotate: true,
      color: "#5ec2b7",
    },
  ],
  targetRhythm: ensembleGroove,
  judge: {
    beatTolerance: 0.16,
  },
  models: defaultAnimalModelRegistry,
  referenceSolution: [
    { blockId: "kick-tile", origin: { x: 1, y: 1 }, rotation: 0 },
    { blockId: "kick-tile", origin: { x: 5, y: 2 }, rotation: 0 },
    { blockId: "snare-tile", origin: { x: 3, y: 2 }, rotation: 0 },
    { blockId: "hat-bar", origin: { x: 2, y: 0 }, rotation: 0 },
    { blockId: "hat-bar", origin: { x: 4, y: 5 }, rotation: 0 },
  ],
});

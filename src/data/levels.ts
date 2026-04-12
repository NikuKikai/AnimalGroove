import { defaultAnimalModelRegistry } from "../game/assets/modelAssets";
import { defineLevel } from "../game/engine/levelDsl";
import { evaluatePlacements } from "../game/simulation";

export const tutorialLevel = defineLevel({
    id: "tutorial",
    name: "Forest Warmup",
    description: "One fox circles the clearing. Rebuild the terrain so the loop lands on the sand pattern.",
    bpm: 108,
    loopBeats: 4,
    board: {
        width: 6,
        height: 5,
    },
    staticObstacles: [
        {
            obstacleId: "rock_tallA",
            origin: { x: 2, y: 2 },
            rotation: 0,
        },
    ],
    animals: [
        {
            id: "fox-1",
            name: "Fox",
            animalType: "fox",
            path: {
                waypoints: [
                    { x: 1, y: 1 },
                    { x: 3, y: 1 },
                    { x: 3, y: 3 },
                    { x: 1, y: 3 },
                ],
            },
        },
    ],
    blocks: [
        {
            blockId: "sand-single",
            pieceId: "sand-single-0",
            name: "Sand Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#d4b483",
            initialPlacement: {
                origin: { x: 0, y: 4 },
                rotation: 0,
            },
        },
        {
            blockId: "sand-single",
            pieceId: "sand-single-1",
            name: "Sand Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#d4b483",
            initialPlacement: {
                origin: { x: 5, y: 0 },
                rotation: 0,
            },
        },
        {
            blockId: "hat-domino",
            pieceId: "hat-domino-0",
            name: "Hat Domino",
            width: 2,
            height: 1,
            canRotate: true,
            color: "#7fd1b9",
            initialPlacement: {
                origin: { x: 4, y: 4 },
                rotation: 0,
            },
        },
    ],
    targetRhythm: [
        { id: "t-1", lane: "foley", beat: 0, timbre: "sand", velocity: 1 },
        { id: "t-2", lane: "foley", beat: 2, timbre: "sand", velocity: 0.95 },
    ],
    judge: {
        beatTolerance: 0.12,
    },
    models: defaultAnimalModelRegistry,
    referenceSolution: [
        { blockId: "sand-single", pieceId: "sand-single-0", origin: { x: 1, y: 1 }, rotation: 0 },
        { blockId: "sand-single", pieceId: "sand-single-1", origin: { x: 3, y: 3 }, rotation: 0 },
    ],
});

const ensembleBaseLevel = defineLevel({
    id: "ensemble",
    name: "Meadow Ensemble",
    description: "Two animals circle overlapping loops. Reshape the terrain so both lines interlock correctly.",
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
            },
        },
        {
            id: "cat-1",
            name: "Cat",
            animalType: "cat",
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
                startPhaseBeat: 0.5,
            },
        },
    ],
    blocks: [
        {
            blockId: "sand-tile",
            pieceId: "sand-tile-0",
            name: "Sand Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#d6bc8f",
            initialPlacement: { origin: { x: 0, y: 5 }, rotation: 0 },
        },
        {
            blockId: "sand-tile",
            pieceId: "sand-tile-1",
            name: "Sand Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#d6bc8f",
            initialPlacement: { origin: { x: 7, y: 0 }, rotation: 0 },
        },
        {
            blockId: "sand-tile",
            pieceId: "sand-tile-2",
            name: "Sand Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#d6bc8f",
            initialPlacement: { origin: { x: 0, y: 0 }, rotation: 0 },
        },
        {
            blockId: "puddle-tile",
            pieceId: "puddle-tile-0",
            name: "Puddle Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#5f9ed6",
            initialPlacement: { origin: { x: 7, y: 4 }, rotation: 0 },
        },
        {
            blockId: "puddle-tile",
            pieceId: "puddle-tile-1",
            name: "Puddle Tile",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#5f9ed6",
            initialPlacement: { origin: { x: 1, y: 5 }, rotation: 0 },
        },
        {
            blockId: "hat-bar",
            pieceId: "hat-bar-0",
            name: "Hat Bar",
            width: 2,
            height: 1,
            canRotate: true,
            color: "#5ec2b7",
            initialPlacement: { origin: { x: 6, y: 1 }, rotation: 90 },
        },
        {
            blockId: "hat-bar",
            pieceId: "hat-bar-1",
            name: "Hat Bar",
            width: 2,
            height: 1,
            canRotate: true,
            color: "#5ec2b7",
            initialPlacement: { origin: { x: 0, y: 4 }, rotation: 90 },
        },
        {
            blockId: "kick-pad",
            pieceId: "kick-pad-0",
            name: "Kick Pad",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#ffaf45",
            initialPlacement: { origin: { x: 7, y: 2 }, rotation: 0 },
        },
        {
            blockId: "snare-pad",
            pieceId: "snare-pad-0",
            name: "Snare Pad",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#58c4dd",
            initialPlacement: { origin: { x: 0, y: 1 }, rotation: 0 },
        },
        {
            blockId: "snare-pad",
            pieceId: "snare-pad-1",
            name: "Snare Pad",
            width: 1,
            height: 1,
            canRotate: true,
            color: "#58c4dd",
            initialPlacement: { origin: { x: 6, y: 0 }, rotation: 0 },
        },
    ],
    targetRhythm: [],
    judge: {
        beatTolerance: 0.16,
    },
    models: defaultAnimalModelRegistry,
    referenceSolution: [
        { blockId: "kick-pad", pieceId: "kick-pad-0", origin: { x: 1, y: 1 }, rotation: 0 },
        { blockId: "snare-pad", pieceId: "snare-pad-0", origin: { x: 3, y: 2 }, rotation: 0 },
        { blockId: "snare-pad", pieceId: "snare-pad-1", origin: { x: 6, y: 5 }, rotation: 0 },
        { blockId: "puddle-tile", pieceId: "puddle-tile-0", origin: { x: 1, y: 2 }, rotation: 0 },
        { blockId: "hat-bar", pieceId: "hat-bar-0", origin: { x: 2, y: 0 }, rotation: 0 },
        { blockId: "hat-bar", pieceId: "hat-bar-1", origin: { x: 4, y: 5 }, rotation: 0 },
    ],
});

const ensembleSolved = evaluatePlacements(
    ensembleBaseLevel,
    ensembleBaseLevel.referenceSolution ?? [],
);

export const ensembleLevel = defineLevel({
    ...ensembleBaseLevel,
    targetRhythm: ensembleSolved.producedTriggers
        .slice()
        .sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id))
        .map((trigger, index) => ({
            id: `ensemble-note-${index}`,
            lane:
                trigger.timbre === "hat"
                    ? "perc"
                    : trigger.timbre === "sand" || trigger.timbre === "puddle"
                        ? "foley"
                        : "drums",
            beat: Number(trigger.beat.toFixed(3)),
            timbre: trigger.timbre,
            velocity: Math.min(1.2, 0.6 + trigger.weight * 0.3),
        })),
});

export const levels = [tutorialLevel, ensembleLevel];

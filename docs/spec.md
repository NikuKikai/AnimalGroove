# Spec

This doc defines how to use 3D models and audio tones.

## File location

- `public/3Dmodels/`
  - `Animals/`: Animal models
  - `Blocks/`: Models of blocks which form field and trigger sound.
  - `Plants/`: Models for decoration or additive sound effect.
- `public/SE/`: sound effect audio files

## Sound definition

Generally, sounds of instruments are directly from tone.js; foley sounds are from audio files.

Sound Name | Source/Tone
-- | --
Kick | Kick(tone.js)
Snare | Snare(tone.js)
Sand | step_sand.mp3
Puddle | step_puddle.mp3


## Block Models

Every single block model file is sized 1 cell x 1 cell (surface).
Following table show how to use 3D models to form a certain entity, and what sound it produces.

Entity | 3D models | Sound name
-- | -- | --
Field 1x1 | ground_grass.glb | None
Sand 1x1 | ground_pathTile.glb | Sand
Sand 1x2 | ground_pathEndClosed.glb and 180deg-rotated ground_pathEndClosed.glb combined | Sand
Sand 1x3 | ground_pathEndClosed.glb, ground_pathStraight.glb and 180deg-rotated ground_pathEndClosed.glb combined | Sand
Sand 2x2 | 4 ground_pathCorner.glb, each rotated 0deg/90deg/180deg/270deg combined | Sand
Puddle 1x1 | ground_riverTile.glb | Puddle
Puddle 1x2 | ground_riverEndClosed.glb and 180deg-rotated ground_riverEndClosed.glb combined | Puddle
Puddle 1x3 | ground_riverEndClosed.glb, ground_riverStraight.glb and 180deg-rotated ground_riverEndClosed.glb combined | Puddle
Puddle 2x2 | 4 ground_riverCorner.glb, each rotated 0deg/90deg/180deg/270deg combined | Puddle
instruments(Kick, Snare, ...)(any size) | Button block (cuboid creacted with three.js) | corresponding sound from tone.js

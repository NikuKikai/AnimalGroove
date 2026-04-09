# Spec

This doc defines how to use 3D models and audio tones.

## File location

- public/3Dmodels
  - /Animals: Animal models
  - /Blocks: Models of blocks which form field and trigger sound.
  - /Plants: Models for decoration or additive sound effect.

## Block Models

Every single block model file is sized 1 cell x 1 cell (surface).
Following table show how to use 3D models to form a certain entity, and what sound it produces.

Entity | 3D models | Sound(tone)
-- | -- | --
field 1x1 | ground_grass.glb | None
inventory 1x1 | ground_pathOpen.glb | None
Kick 1x1 | ground_pathTile.glb | Kick drum
Kick 1x2 | ground_pathEndClosed.glb and 180deg-rotated ground_pathEndClosed.glb combined | Kick drum
Kick 1x3 | ground_pathEndClosed.glb, ground_pathStraight.glb and 180deg-rotated ground_pathEndClosed.glb combined | Kick drum
Kick 2x2 | 4 ground_pathCorner.glb, each rotated 0deg/90deg/180deg/270deg combined | Kick drum
Snare 1x1 | ground_riverTile.glb | Snare drum
Snare 1x2 | ground_riverEndClosed.glb and 180deg-rotated ground_riverEndClosed.glb combined | Snare drum
Snare 1x3 | ground_riverEndClosed.glb, ground_riverStraight.glb and 180deg-rotated ground_riverEndClosed.glb combined | Snare drum
Snare 2x2 | 4 ground_riverCorner.glb, each rotated 0deg/90deg/180deg/270deg combined | Snare drum

> For now, other tone also use the models of snare.


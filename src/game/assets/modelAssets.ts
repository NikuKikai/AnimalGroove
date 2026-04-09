import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type * as THREE from "three";
import type { ModelRegistry } from "../types";

export type ModelAssetCategory = "Animals" | "Blocks" | "Plants";

export type ModelAssetEntry = {
  path: string;
  yOffset?: number;
};

export type BlockTileModelPaths = {
  grass: ModelAssetEntry;
  inventory: ModelAssetEntry;
  pathEnd: ModelAssetEntry;
  pathStraight: ModelAssetEntry;
  pathCorner: ModelAssetEntry;
  pathTile: ModelAssetEntry;
  riverEnd: ModelAssetEntry;
  riverStraight: ModelAssetEntry;
  riverCorner: ModelAssetEntry;
  riverTile: ModelAssetEntry;
};

const modelTemplateCache = new Map<string, Promise<THREE.Object3D>>();

/** Builds a relative URL to a model asset under public/3Dmodels. */
export function buildModelAssetPath(category: ModelAssetCategory, filename: string) {
  return `./3Dmodels/${category}/${filename}`;
}

/** Builds a model asset entry with optional manual Y correction for uneven source meshes. */
export function defineModelAsset(category: ModelAssetCategory, filename: string, yOffset = 0): ModelAssetEntry {
  return {
    path: buildModelAssetPath(category, filename),
    yOffset,
  };
}

/** Canonical animal model registry used by authored and generated levels. */
export const defaultAnimalModelRegistry: ModelRegistry = {
  beaver: buildModelAssetPath("Animals", "animal-beaver.glb"),
  bee: buildModelAssetPath("Animals", "animal-bee.glb"),
  bunny: buildModelAssetPath("Animals", "animal-bunny.glb"),
  cat: buildModelAssetPath("Animals", "animal-cat.glb"),
  chick: buildModelAssetPath("Animals", "animal-chick.glb"),
  cow: buildModelAssetPath("Animals", "animal-cow.glb"),
  crab: buildModelAssetPath("Animals", "animal-crab.glb"),
  deer: buildModelAssetPath("Animals", "animal-deer.glb"),
  dog: buildModelAssetPath("Animals", "animal-dog.glb"),
  elephant: buildModelAssetPath("Animals", "animal-elephant.glb"),
  fox: buildModelAssetPath("Animals", "animal-fox.glb"),
  giraffe: buildModelAssetPath("Animals", "animal-giraffe.glb"),
  koala: buildModelAssetPath("Animals", "animal-koala.glb"),
  lion: buildModelAssetPath("Animals", "animal-lion.glb"),
  monkey: buildModelAssetPath("Animals", "animal-monkey.glb"),
  panda: buildModelAssetPath("Animals", "animal-panda.glb"),
  parrot: buildModelAssetPath("Animals", "animal-parrot.glb"),
  penguin: buildModelAssetPath("Animals", "animal-penguin.glb"),
  pig: buildModelAssetPath("Animals", "animal-pig.glb"),
  tiger: buildModelAssetPath("Animals", "animal-tiger.glb"),
};

/** Canonical block tile model paths defined by docs/spec.md. */
export const blockTileModelPaths: BlockTileModelPaths = {
  grass: defineModelAsset("Blocks", "ground_grass.glb"),
  inventory: defineModelAsset("Blocks", "ground_pathOpen.glb"),
  pathEnd: defineModelAsset("Blocks", "ground_pathEndClosed.glb"),
  pathStraight: defineModelAsset("Blocks", "ground_pathStraight.glb"),
  pathCorner: defineModelAsset("Blocks", "ground_pathCorner.glb"),
  pathTile: defineModelAsset("Blocks", "ground_pathTile.glb"),
  riverEnd: defineModelAsset("Blocks", "ground_riverEndClosed.glb"),
  riverStraight: defineModelAsset("Blocks", "ground_riverStraight.glb"),
  riverCorner: defineModelAsset("Blocks", "ground_riverCorner.glb"),
  riverTile: defineModelAsset("Blocks", "ground_riverTile.glb"),
};

/** Loads and caches one model template by path for later cloning. */
export function loadModelTemplate(asset: string | ModelAssetEntry) {
  const path = typeof asset === "string" ? asset : asset.path;
  const cached = modelTemplateCache.get(path);
  if (cached) {
    return cached;
  }

  const loader = new GLTFLoader();
  const pending = loader.loadAsync(path).then((gltf: GLTF) => gltf.scene);
  modelTemplateCache.set(path, pending);
  return pending;
}

/** Preloads a set of model templates and reports simple completion progress. */
export async function preloadModelTemplates(assets: Array<string | ModelAssetEntry>, onProgress?: (progress: number) => void) {
  const uniquePaths = [...new Set(assets.map((asset) => (typeof asset === "string" ? asset : asset.path)))];
  if (uniquePaths.length === 0) {
    onProgress?.(1);
    return;
  }

  let completed = 0;
  onProgress?.(0);
  await Promise.all(
    uniquePaths.map(async (path) => {
      await loadModelTemplate(path);
      completed += 1;
      onProgress?.(completed / uniquePaths.length);
    }),
  );
}

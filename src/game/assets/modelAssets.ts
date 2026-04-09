import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type * as THREE from "three";
import type { ModelRegistry } from "../types";

export type ModelAssetCategory = "Animals" | "Blocks" | "Plants";

export type BlockTileModelPaths = {
  grass: string;
  inventory: string;
  pathEnd: string;
  pathStraight: string;
  pathCorner: string;
  pathTile: string;
  riverEnd: string;
  riverStraight: string;
  riverCorner: string;
  riverTile: string;
};

const modelTemplateCache = new Map<string, Promise<THREE.Object3D>>();

/** Builds a relative URL to a model asset under public/3Dmodels. */
export function buildModelAssetPath(category: ModelAssetCategory, filename: string) {
  return `./3Dmodels/${category}/${filename}`;
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
  grass: buildModelAssetPath("Blocks", "ground_grass.glb"),
  inventory: buildModelAssetPath("Blocks", "ground_pathOpen.glb"),
  pathEnd: buildModelAssetPath("Blocks", "ground_pathEndClosed.glb"),
  pathStraight: buildModelAssetPath("Blocks", "ground_pathStraight.glb"),
  pathCorner: buildModelAssetPath("Blocks", "ground_pathCorner.glb"),
  pathTile: buildModelAssetPath("Blocks", "ground_pathTile.glb"),
  riverEnd: buildModelAssetPath("Blocks", "ground_riverEndClosed.glb"),
  riverStraight: buildModelAssetPath("Blocks", "ground_riverStraight.glb"),
  riverCorner: buildModelAssetPath("Blocks", "ground_riverCorner.glb"),
  riverTile: buildModelAssetPath("Blocks", "ground_riverTile.glb"),
};

/** Loads and caches one model template by path for later cloning. */
export function loadModelTemplate(path: string) {
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
export async function preloadModelTemplates(paths: string[], onProgress?: (progress: number) => void) {
  const uniquePaths = [...new Set(paths)];
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

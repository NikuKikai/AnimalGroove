import type { ModelRegistry } from "../types";

function modelPath(filename: string) {
  return new URL(`3Dmodels/${filename}`, document.baseURI).toString();
}

export const defaultModelRegistry: ModelRegistry = {
  beaver: modelPath("animal-beaver.glb"),
  bee: modelPath("animal-bee.glb"),
  bunny: modelPath("animal-bunny.glb"),
  cat: modelPath("animal-cat.glb"),
  chick: modelPath("animal-chick.glb"),
  cow: modelPath("animal-cow.glb"),
  crab: modelPath("animal-crab.glb"),
  deer: modelPath("animal-deer.glb"),
  dog: modelPath("animal-dog.glb"),
  elephant: modelPath("animal-elephant.glb"),
  fox: modelPath("animal-fox.glb"),
  giraffe: modelPath("animal-giraffe.glb"),
  koala: modelPath("animal-koala.glb"),
  lion: modelPath("animal-lion.glb"),
  monkey: modelPath("animal-monkey.glb"),
  panda: modelPath("animal-panda.glb"),
  parrot: modelPath("animal-parrot.glb"),
  penguin: modelPath("animal-penguin.glb"),
  pig: modelPath("animal-pig.glb"),
  tiger: modelPath("animal-tiger.glb"),
};

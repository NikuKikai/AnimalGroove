import type { AnimalProfile } from "../types";

const fallbackProfile: AnimalProfile = {
  animalType: "default",
  weight: 1,
  speed: 1.5,
  effect: "dry",
};

export const defaultAnimalProfiles: Record<string, AnimalProfile> = {
  beaver: { animalType: "beaver", weight: 1.2, speed: 1.35, effect: "wood" },
  bee: { animalType: "bee", weight: 0.55, speed: 4, effect: "buzzy" },
  bunny: { animalType: "bunny", weight: 0.7, speed: 2, effect: "soft" },
  cat: { animalType: "cat", weight: 0.95, speed: 1.5303300858899107, effect: "dry" },
  chick: { animalType: "chick", weight: 0.45, speed: 2.05, effect: "peep" },
  cow: { animalType: "cow", weight: 1.45, speed: 1.1, effect: "heavy" },
  crab: { animalType: "crab", weight: 0.85, speed: 1.45, effect: "clicky" },
  deer: { animalType: "deer", weight: 1, speed: 1.75, effect: "airy" },
  dog: { animalType: "dog", weight: 1.05, speed: 2, effect: "dry" },
  elephant: { animalType: "elephant", weight: 1.8, speed: 0.95, effect: "boomy" },
  fox: { animalType: "fox", weight: 0.9, speed: 2, effect: "tight" },
  giraffe: { animalType: "giraffe", weight: 1.15, speed: 1.25, effect: "hollow" },
  koala: { animalType: "koala", weight: 1.1, speed: 1.2, effect: "mellow" },
  lion: { animalType: "lion", weight: 1.5, speed: 1.3, effect: "roar" },
  monkey: { animalType: "monkey", weight: 0.8, speed: 1.9, effect: "springy" },
  panda: { animalType: "panda", weight: 1.35, speed: 1.4571067811865475, effect: "mellow" },
  parrot: { animalType: "parrot", weight: 0.6, speed: 4, effect: "bright" },
  penguin: { animalType: "penguin", weight: 0.95, speed: 1.4, effect: "flappy" },
  pig: { animalType: "pig", weight: 1.25, speed: 1.2, effect: "round" },
  tiger: { animalType: "tiger", weight: 1.4, speed: 4, effect: "sharp" },
};

/** Returns the global movement and audio profile for an animal type. */
export function getAnimalProfile(animalType: string) {
  return defaultAnimalProfiles[animalType] ?? { ...fallbackProfile, animalType };
}

declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  import { Group, Loader, LoadingManager } from "three";

  export type GLTF = {
    scene: Group;
  };

  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    loadAsync(url: string): Promise<GLTF>;
  }
}

declare module "three/examples/jsm/utils/SkeletonUtils.js" {
  import { Object3D } from "three";

  export function clone<T extends Object3D>(source: T): T;
}

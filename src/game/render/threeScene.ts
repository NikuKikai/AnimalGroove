import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { blockTileModelPaths, getStaticObstacleDefinition, loadModelTemplate, preloadModelTemplates } from "../assets/modelAssets";
import { gameConfig } from "../config/gameConfig";
import { getAnimalProfile } from "../engine/animalRegistry";
import { resolveBlockTimbre } from "../engine/blockTimbre";
import type { LevelDefinition, Placement } from "../types";
import { placementInstanceKey } from "../simulation";
import {
  applyPickData,
  createBlockMesh,
  createBlockModelMesh,
  createHitPulseMesh,
  getDisplayOffset,
} from "./sceneMeshes";
import { getBlockVisualKind } from "./blockVisuals";
import { computePathOffset, normalizedBeatDelta, sampleAnimalPosition } from "./sceneMotion";
import type { BlockTileTemplates } from "./sceneMeshes";
import type { HitPulse, PreviewPlacement, SceneHit } from "./sceneTypes";

export type { HitPulse, PreviewPlacement, SceneHit } from "./sceneTypes";

type SceneState = {
  animalRoots: Map<string, THREE.Object3D>;
  animalFallbacks: Map<string, THREE.Object3D>;
  pathLines: THREE.Line[];
  blockMeshes: Map<string, THREE.Object3D>;
  hitPulseMeshes: Map<string, THREE.Mesh>;
  terrainRoot?: THREE.Object3D;
  terrainCells: Map<string, THREE.Object3D>;
  terrainHiddenSignature?: string;
  iconTextureCache: Map<string, THREE.Texture>;
  staticObstacleMeshes: Map<string, THREE.Object3D>;
};

type CameraDragMode = "pan" | "rotate";

/** Hosts the Three.js scene, persistent block meshes, and camera controls for one board view. */
export class ThreeScene {
  private loadVersion = 0;

  private scene = new THREE.Scene();

  private camera = new THREE.PerspectiveCamera(
    gameConfig.scene.camera.fov,
    1,
    gameConfig.scene.camera.near,
    gameConfig.scene.camera.far,
  );

  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private topPointLight = new THREE.PointLight(
    gameConfig.scene.lights.topPoint.color,
    gameConfig.scene.lights.topPoint.intensity,
    gameConfig.scene.lights.topPoint.distance,
    gameConfig.scene.lights.topPoint.decay,
  );
  private keyDirectionalLight = new THREE.DirectionalLight(
    gameConfig.scene.lights.keyDirectional.color,
    gameConfig.scene.lights.keyDirectional.intensity,
  );
  private topDirectionalLight = new THREE.DirectionalLight(
    gameConfig.scene.lights.topDirectional.color,
    gameConfig.scene.lights.topDirectional.intensity,
  );

  private raycaster = new THREE.Raycaster();

  private pointer = new THREE.Vector2();

  private boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private orbitTarget = new THREE.Vector3(
    gameConfig.scene.camera.initialTarget.x,
    gameConfig.scene.camera.initialTarget.y,
    gameConfig.scene.camera.initialTarget.z,
  );

  private orbitYaw = gameConfig.scene.camera.initialYaw;

  private orbitPitch = gameConfig.scene.camera.initialPitch;

  private orbitDistance = gameConfig.scene.camera.initialDistance;

  private activeCameraDrag?: {
    mode: CameraDragMode;
    pointerX: number;
    pointerY: number;
  };

  private mountedElement?: HTMLDivElement;

  private blockTiles?: BlockTileTemplates;

  private currentBoardSize = { width: 8, height: 8 };

  private state: SceneState = {
    animalRoots: new Map(),
    animalFallbacks: new Map(),
    pathLines: [],
    blockMeshes: new Map(),
    hitPulseMeshes: new Map(),
    terrainCells: new Map(),
    iconTextureCache: new Map(),
    staticObstacleMeshes: new Map(),
  };

  private staticObstacleTemplates = new Map<string, THREE.Object3D>();

  /** Creates the renderer, camera, and shared lighting rig. */
  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.background = new THREE.Color(gameConfig.scene.backgroundColor);
    this.scene.fog = new THREE.FogExp2(gameConfig.scene.backgroundColor, gameConfig.scene.fogDensity);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.updateCamera();

    const ambientLight = new THREE.AmbientLight(
      gameConfig.scene.lights.ambient.color,
      gameConfig.scene.lights.ambient.intensity,
    );
    this.keyDirectionalLight.position.set(
      gameConfig.scene.lights.keyDirectional.position.x,
      gameConfig.scene.lights.keyDirectional.position.y,
      gameConfig.scene.lights.keyDirectional.position.z,
    );
    this.keyDirectionalLight.castShadow = true;
    this.keyDirectionalLight.shadow.mapSize.set(
      gameConfig.scene.lights.keyDirectional.shadowMapSize,
      gameConfig.scene.lights.keyDirectional.shadowMapSize,
    );
    this.keyDirectionalLight.shadow.radius = gameConfig.scene.lights.keyDirectional.shadowRadius;
    this.keyDirectionalLight.shadow.bias = gameConfig.scene.lights.keyDirectional.shadowBias;
    this.keyDirectionalLight.shadow.normalBias = gameConfig.scene.lights.keyDirectional.shadowNormalBias;
    this.topDirectionalLight.position.set(
      gameConfig.scene.lights.topDirectional.position.x,
      gameConfig.scene.lights.topDirectional.position.y,
      gameConfig.scene.lights.topDirectional.position.z,
    );
    this.topDirectionalLight.target.position.set(0, 0, 0);
    this.topDirectionalLight.castShadow = false;
    this.topPointLight.position.set(0, gameConfig.scene.lights.topPoint.height, 0);
    this.scene.add(
      ambientLight,
      this.keyDirectionalLight,
      this.topDirectionalLight,
      this.keyDirectionalLight.target,
      this.topDirectionalLight.target,
      this.topPointLight,
    );
  }

  /** Preloads unique model assets so later level switches can reuse them. */
  static async preloadModels(paths: string[], onProgress?: (progress: number) => void) {
    await preloadModelTemplates(paths, onProgress);
  }

  /** Mounts the renderer canvas into a host element. */
  mount(element: HTMLDivElement) {
    this.mountedElement = element;
    element.appendChild(this.renderer.domElement);
    this.resize();
  }

  /** Returns the renderer DOM node so callers can wire pointer events. */
  getDomElement() {
    return this.renderer.domElement;
  }

  /** Starts a camera drag gesture for either panning or orbit rotation. */
  beginCameraDrag(mode: CameraDragMode, clientX: number, clientY: number) {
    this.activeCameraDrag = {
      mode,
      pointerX: clientX,
      pointerY: clientY,
    };
  }

  /** Applies one camera drag step and clamps the resulting target and pitch. */
  updateCameraDrag(clientX: number, clientY: number) {
    if (!this.activeCameraDrag || !this.mountedElement) {
      return;
    }

    const deltaX = clientX - this.activeCameraDrag.pointerX;
    const deltaY = clientY - this.activeCameraDrag.pointerY;
    this.activeCameraDrag.pointerX = clientX;
    this.activeCameraDrag.pointerY = clientY;

    if (this.activeCameraDrag.mode === "rotate") {
      this.orbitYaw += deltaX * gameConfig.scene.camera.rotateYawSpeed;
      this.orbitPitch = THREE.MathUtils.clamp(
        this.orbitPitch - deltaY * gameConfig.scene.camera.rotatePitchSpeed,
        gameConfig.scene.camera.pitchMin,
        gameConfig.scene.camera.pitchMax,
      );
      this.updateCamera();
      return;
    }

    const panScale = this.orbitDistance * gameConfig.scene.camera.panDistanceFactor;
    const forward = new THREE.Vector3(
      this.camera.position.x - this.orbitTarget.x,
      0,
      this.camera.position.z - this.orbitTarget.z,
    ).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    const flatForward = new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize();
    this.orbitTarget.addScaledVector(right, -deltaX * panScale);
    this.orbitTarget.addScaledVector(flatForward, -deltaY * panScale);
    this.clampCameraTarget();
    this.updateCamera();
  }

  /** Ends any active camera drag gesture. */
  endCameraDrag() {
    this.activeCameraDrag = undefined;
  }

  /** Zooms the orbit camera in or out while staying within the configured distance range. */
  zoomCamera(deltaY: number) {
    const zoomFactor = Math.exp(deltaY * gameConfig.scene.camera.zoomFactor);
    this.orbitDistance = THREE.MathUtils.clamp(
      this.orbitDistance * zoomFactor,
      gameConfig.scene.camera.minDistance,
      gameConfig.scene.camera.maxDistance,
    );
    this.updateCamera();
  }

  /** Resizes the renderer and perspective camera to match the mount element. */
  resize() {
    if (!this.mountedElement) {
      return;
    }

    const { clientWidth, clientHeight } = this.mountedElement;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.composer.setSize(clientWidth, clientHeight);
  }

  /** Reconfigures terrain, paths, and animals for a newly loaded level. */
  async loadLevel(level: LevelDefinition, onProgress?: (progress: number) => void) {
    const version = ++this.loadVersion;
    this.clearDynamicLevel();
    await this.ensureBlockTileTemplates((progress) => onProgress?.(progress * 0.18));
    await this.ensureStaticObstacleTemplates(level, (progress) => onProgress?.(0.18 + progress * 0.1));
    this.configureBoard(level);
    this.fitCameraToBoard(level);
    onProgress?.(0.22);
    this.addPaths(level);
    onProgress?.(0.4);
    await this.addAnimals(level, version, onProgress);
  }

  /** Renders one frame from the current gameplay state and transient drag preview. */
  update(
    level: LevelDefinition,
    beat: number,
    placements: Placement[],
    showPaths: boolean,
    pressedPlacementIds: Set<string>,
    hitPulses: HitPulse[],
    preview?: PreviewPlacement,
  ) {
    const renderedPlacements = applyPreviewPlacement(placements, preview);
    this.updateAnimals(level, beat);
    this.updateTerrain(level, renderedPlacements);
    this.updateBlocks(level, renderedPlacements, pressedPlacementIds, preview);
    this.updateHitPulses(level, beat, hitPulses);
    for (const pathLine of this.state.pathLines) {
      pathLine.visible = showPaths;
    }
    this.composer.render();
  }

  /** Converts a pointer position into a board cell in integer grid coordinates. */
  getCellFromPointer(clientX: number, clientY: number, level: LevelDefinition) {
    if (!this.mountedElement) {
      return undefined;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint);
    if (!hit) {
      return undefined;
    }

    const x = Math.floor(hitPoint.x + 0.5);
    const y = Math.floor(hitPoint.z + 0.5);
    if (x < 0 || x > level.board.width - 1 || y < 0 || y > level.board.height - 1) {
      return undefined;
    }

    return { x, y };
  }

  /** Returns the first placed block hit by a pointer ray. */
  pickSceneObject(clientX: number, clientY: number): SceneHit | undefined {
    if (!this.mountedElement) {
      return undefined;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects([...this.state.blockMeshes.values()], true);
    let first = hits[0]?.object;
    if (!first) {
      return undefined;
    }

    while (first.parent && !first.userData.kind) {
      first = first.parent;
    }

    if (first.userData.kind === "placement") {
      return {
        kind: "placement",
        placement: first.userData.placement as Placement,
      };
    }

    return undefined;
  }

  /** Releases scene resources and detaches the renderer canvas. */
  dispose() {
    this.activeCameraDrag = undefined;
    this.clearLevel();
    this.renderer.dispose();
    if (this.mountedElement?.contains(this.renderer.domElement)) {
      this.mountedElement.removeChild(this.renderer.domElement);
    }
  }

  /** Removes all persistent and per-level scene objects. */
  private clearLevel() {
    this.clearDynamicLevel();
    this.removeObject(this.state.terrainRoot);
    for (const texture of this.state.iconTextureCache.values()) {
      texture.dispose();
    }
    this.state = {
      animalRoots: new Map(),
      animalFallbacks: new Map(),
      pathLines: [],
      blockMeshes: new Map(),
      hitPulseMeshes: new Map(),
      terrainRoot: undefined,
      terrainCells: new Map(),
      terrainHiddenSignature: undefined,
      iconTextureCache: new Map(),
      staticObstacleMeshes: new Map(),
    };
  }

  /** Clears the current level's dynamic content while preserving reusable scene infrastructure. */
  private clearDynamicLevel() {
    for (const object of [
      ...this.state.animalRoots.values(),
      ...this.state.animalFallbacks.values(),
      ...this.state.pathLines,
      ...this.state.blockMeshes.values(),
      ...this.state.staticObstacleMeshes.values(),
      ...this.state.hitPulseMeshes.values(),
    ]) {
      this.disposeSceneObject(object);
    }
    this.state.animalRoots.clear();
    this.state.animalFallbacks.clear();
    this.state.pathLines = [];
    this.state.blockMeshes.clear();
    this.state.staticObstacleMeshes.clear();
    this.state.hitPulseMeshes.clear();
  }

  /** Builds one grass-tile mesh per board cell so terrain visibility can be toggled cheaply. */
  private configureBoard(level: LevelDefinition) {
    this.currentBoardSize = { width: level.board.width, height: level.board.height };
    this.removeObject(this.state.terrainRoot);
    this.state.terrainCells.clear();
    this.state.terrainHiddenSignature = undefined;

    if (!this.blockTiles) {
      return;
    }

    const terrainRoot = new THREE.Group();
    for (let y = 0; y < level.board.height; y += 1) {
      for (let x = 0; x < level.board.width; x += 1) {
        const cellMesh = this.blockTiles.grass.clone(true);
        cellMesh.position.set(x, gameConfig.scene.terrain.y, y);
        applyShadowFlags(cellMesh, { cast: false, receive: true });
        terrainRoot.add(cellMesh);
        this.state.terrainCells.set(`${x},${y}`, cellMesh);
      }
    }

    this.state.terrainRoot = terrainRoot;
    this.scene.add(terrainRoot);
    this.addStaticObstacles(level);
  }

  /** Fits the orbit camera target and distance to the active board bounds. */
  private fitCameraToBoard(level: LevelDefinition) {
    this.orbitTarget.set((level.board.width - 1) / 2, 0, (level.board.height - 1) / 2);
    this.topPointLight.position.set(
      (level.board.width - 1) / 2,
      gameConfig.scene.lights.topPoint.height,
      (level.board.height - 1) / 2,
    );
    this.keyDirectionalLight.target.position.set((level.board.width - 1) / 2, 0, (level.board.height - 1) / 2);
    this.topDirectionalLight.target.position.set((level.board.width - 1) / 2, 0, (level.board.height - 1) / 2);
    const shadowSpan =
      Math.max(level.board.width, level.board.height) * gameConfig.scene.lights.keyDirectional.shadowSpanFactor +
      gameConfig.scene.lights.keyDirectional.shadowSpanPadding;
    this.keyDirectionalLight.shadow.camera.left = -shadowSpan;
    this.keyDirectionalLight.shadow.camera.right = shadowSpan;
    this.keyDirectionalLight.shadow.camera.top = shadowSpan;
    this.keyDirectionalLight.shadow.camera.bottom = -shadowSpan;
    this.keyDirectionalLight.shadow.camera.near = gameConfig.scene.lights.keyDirectional.shadowNear;
    this.keyDirectionalLight.shadow.camera.far = gameConfig.scene.lights.keyDirectional.shadowFar;
    this.keyDirectionalLight.shadow.camera.updateProjectionMatrix();
    this.orbitDistance = THREE.MathUtils.clamp(
      Math.max(level.board.width, level.board.height) * gameConfig.scene.camera.fitDistanceFactor,
      gameConfig.scene.camera.fitDistanceMin,
      gameConfig.scene.camera.fitDistanceMax,
    );
    this.clampCameraTarget(level);
    this.updateCamera();
  }

  /** Keeps the camera target inside a padded rectangle around the current board. */
  private clampCameraTarget(level?: LevelDefinition) {
    const boardWidth = level?.board.width ?? this.currentBoardSize.width;
    const boardHeight = level?.board.height ?? this.currentBoardSize.height;
    const padding = gameConfig.scene.camera.targetPadding;
    this.orbitTarget.x = THREE.MathUtils.clamp(this.orbitTarget.x, -padding, boardWidth - 1 + padding);
    this.orbitTarget.z = THREE.MathUtils.clamp(this.orbitTarget.z, -padding, boardHeight - 1 + padding);
  }

  /** Recomputes the camera transform from the current orbit state. */
  private updateCamera() {
    const sinPitch = Math.sin(this.orbitPitch);
    const cosPitch = Math.cos(this.orbitPitch);
    this.camera.position.set(
      this.orbitTarget.x + Math.cos(this.orbitYaw) * sinPitch * this.orbitDistance,
      this.orbitTarget.y + cosPitch * this.orbitDistance,
      this.orbitTarget.z + Math.sin(this.orbitYaw) * sinPitch * this.orbitDistance,
    );
    this.camera.lookAt(this.orbitTarget);
  }

  /** Draws closed loop hints for every animal path. */
  private addPaths(level: LevelDefinition) {
    for (let index = 0; index < level.animals.length; index += 1) {
      const animal = level.animals[index];
      const color = gameConfig.scene.pathPalette[index % gameConfig.scene.pathPalette.length];
      const offsetStrength = ((index % 5) - 2) * gameConfig.scene.path.overlapOffsetStep;
      const points = animal.path.waypoints.map((point, pointIndex, waypoints) => {
        const offset = computePathOffset(waypoints, pointIndex, offsetStrength);
        return new THREE.Vector3(
          point.x + offset.x,
          gameConfig.scene.path.verticalOffset + index * gameConfig.scene.path.perPathLift,
          point.y + offset.y,
        );
      });
      const firstOffset = computePathOffset(animal.path.waypoints, 0, offsetStrength);
      points.push(
        new THREE.Vector3(
          animal.path.waypoints[0].x + firstOffset.x,
          gameConfig.scene.path.verticalOffset + index * gameConfig.scene.path.perPathLift,
          animal.path.waypoints[0].y + firstOffset.y,
        ),
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: gameConfig.scene.path.opacity }),
      );
      this.state.pathLines.push(line);
      this.scene.add(line);
    }
  }

  /** Loads and instantiates animal meshes for the active level. */
  private async addAnimals(level: LevelDefinition, version: number, onProgress?: (progress: number) => void) {
    if (level.animals.length === 0) {
      onProgress?.(1);
      return;
    }

    for (let index = 0; index < level.animals.length; index += 1) {
      const animal = level.animals[index];
      const fallbackColor = gameConfig.scene.pathPalette[index % gameConfig.scene.pathPalette.length];
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(
          gameConfig.scene.animal.fallbackRadius,
          gameConfig.scene.animal.fallbackSegments,
          gameConfig.scene.animal.fallbackSegments,
        ),
        new THREE.MeshStandardMaterial({ color: fallbackColor }),
      );
      fallback.castShadow = true;
      fallback.receiveShadow = true;
      fallback.position.set(0, gameConfig.scene.animal.fallbackY, 0);
      this.state.animalFallbacks.set(animal.id, fallback);
      this.scene.add(fallback);

      const path = level.models[animal.animalType];
      if (!path) {
        onProgress?.(0.4 + ((index + 1) / level.animals.length) * 0.6);
        continue;
      }

      try {
        const template = await loadModelTemplate(path);
        if (version !== this.loadVersion) {
          return;
        }

        const root = cloneSkinned(template);
        normalizeImportedModelMaterials(root);
        applyShadowFlags(root, { cast: true, receive: true });
        root.scale.setScalar(gameConfig.scene.animal.modelScale);
        root.position.set(0, gameConfig.scene.animal.modelY, 0);
        this.state.animalRoots.set(animal.id, root);
        this.scene.add(root);
        fallback.visible = false;
      } catch {
        fallback.visible = true;
      }

      onProgress?.(0.4 + ((index + 1) / level.animals.length) * 0.6);
    }
  }

  /** Updates animal transforms so they move continuously and jump at each landing. */
  private updateAnimals(level: LevelDefinition, beat: number) {
    for (const animal of level.animals) {
      const point = sampleAnimalPosition(
        animal.path.waypoints,
        getAnimalProfile(animal.animalType).speed,
        beat,
        animal.path.startPhaseBeat ?? 0,
      );
      const nextPoint = sampleAnimalPosition(
        animal.path.waypoints,
        getAnimalProfile(animal.animalType).speed,
        beat + gameConfig.scene.animal.lookAheadBeat,
        animal.path.startPhaseBeat ?? 0,
      );
      const root = this.state.animalRoots.get(animal.id) ?? this.state.animalFallbacks.get(animal.id);
      if (!root) {
        continue;
      }

      root.position.set(point.x, point.jumpHeight, point.y);
      root.lookAt(nextPoint.x, root.position.y, nextPoint.y);
    }
  }

  /** Updates placed block meshes in place, reusing one scene object per block piece. */
  private updateBlocks(
    level: LevelDefinition,
    placements: Placement[],
    pressedPlacementIds: Set<string>,
    preview?: PreviewPlacement,
  ) {
    if (!this.blockTiles) {
      return;
    }

    const blockMap = new Map(level.blocks.map((block) => [block.pieceId, block]));
    const nextKeys = new Set<string>();

    for (const placement of placements) {
      const block = blockMap.get(placement.pieceId);
      if (!block) {
        continue;
      }

      const meshKey = block.pieceId;
      const previewState =
        preview?.placement.pieceId === block.pieceId ? (preview.valid ? "valid" : "invalid") : "none";
      const visualKind = getBlockVisualKind(block);
      const renderSignature = `${visualKind}:${placement.rotation}:${previewState}`;
      nextKeys.add(meshKey);

      let mesh = this.state.blockMeshes.get(meshKey);
      if (mesh && mesh.userData.renderSignature !== renderSignature) {
        this.disposeSceneObject(mesh);
        this.state.blockMeshes.delete(meshKey);
        mesh = undefined;
      }

      if (!mesh) {
        const timbre = resolveBlockTimbre(block.blockId);
        const previewColor =
          previewState === "invalid"
            ? gameConfig.scene.preview.invalidColor
            : previewState === "valid"
              ? lightenHexColor(block.color, gameConfig.scene.preview.validLightenAmount)
              : block.color;
        mesh =
          visualKind === "terrain"
            ? createBlockModelMesh(this.blockTiles, timbre, block, placement.rotation, 1, previewState)
            : createBlockMesh(
              this.state.iconTextureCache,
              timbre,
              previewColor,
              block,
              placement.rotation,
              1,
            );
        applyShadowFlags(mesh, { cast: visualKind === "button", receive: true });
        mesh.userData.renderSignature = renderSignature;
        mesh.userData.pickPlacementKey = "";
        mesh.userData.lastPressed = false;
        mesh.userData.lastScaleY = 1;
        mesh.userData.lastPosX = Number.NaN;
        mesh.userData.lastPosY = Number.NaN;
        mesh.userData.lastPosZ = Number.NaN;
        this.state.blockMeshes.set(meshKey, mesh);
        this.scene.add(mesh);
      }

      const isPressed = previewState === "none" && pressedPlacementIds.has(placementKey(placement));
      const pressDepth = visualKind === "button" && isPressed ? gameConfig.scene.blockPress.depth : 0;
      const nextScaleY = visualKind === "button" && isPressed ? gameConfig.scene.blockPress.scaleY : 1;
      if (mesh.userData.lastScaleY !== nextScaleY) {
        mesh.scale.y = nextScaleY;
        mesh.userData.lastScaleY = nextScaleY;
      }

      const offset = getDisplayOffset(block, placement.rotation);
      const nextPosX = placement.origin.x + offset.x;
      const nextPosY = -pressDepth;
      const nextPosZ = placement.origin.y + offset.y;
      if (
        mesh.userData.lastPosX !== nextPosX ||
        mesh.userData.lastPosY !== nextPosY ||
        mesh.userData.lastPosZ !== nextPosZ
      ) {
        mesh.position.set(nextPosX, nextPosY, nextPosZ);
        mesh.userData.lastPosX = nextPosX;
        mesh.userData.lastPosY = nextPosY;
        mesh.userData.lastPosZ = nextPosZ;
      }

      const nextPickKey = placementKey(placement);
      if (mesh.userData.pickPlacementKey !== nextPickKey || mesh.userData.lastPressed !== isPressed) {
        applyPickData(mesh, {
          kind: "placement",
          placement,
        });
        mesh.userData.pickPlacementKey = nextPickKey;
        mesh.userData.lastPressed = isPressed;
      }
    }

    for (const [meshKey, mesh] of this.state.blockMeshes) {
      if (nextKeys.has(meshKey)) {
        continue;
      }
      this.disposeSceneObject(mesh);
      this.state.blockMeshes.delete(meshKey);
    }
  }

  /** Updates expanding pulse meshes at each animal landing point. */
  private updateHitPulses(level: LevelDefinition, beat: number, hitPulses: HitPulse[]) {
    const durationBeats = gameConfig.scene.hitPulse.durationBeats;
    for (const mesh of this.state.hitPulseMeshes.values()) {
      mesh.visible = false;
    }

    for (const pulse of hitPulses) {
      const age = normalizedBeatDelta(beat, pulse.beat, level.loopBeats);
      if (age < 0 || age > durationBeats) {
        continue;
      }

      let effectMesh = this.state.hitPulseMeshes.get(pulse.id);
      if (!effectMesh) {
        effectMesh = createHitPulseMesh(pulse.state);
        this.state.hitPulseMeshes.set(pulse.id, effectMesh);
        this.scene.add(effectMesh);
      }

      const progress = Math.max(0, Math.min(1, age / durationBeats));
      const material = effectMesh.material as THREE.MeshBasicMaterial;
      const color =
        pulse.state === "matched"
          ? gameConfig.scene.hitPulse.colors.matched
          : pulse.state === "wrong"
            ? gameConfig.scene.hitPulse.colors.wrong
            : gameConfig.scene.hitPulse.colors.empty;
      material.color.set(color);
      const isEmpty = pulse.state === "empty";
      const baseOpacity = isEmpty ? gameConfig.scene.hitPulse.emptyOpacity : gameConfig.scene.hitPulse.defaultOpacity;
      const baseScale = isEmpty ? gameConfig.scene.hitPulse.emptyScale : gameConfig.scene.hitPulse.defaultScale;
      const growth = isEmpty ? gameConfig.scene.hitPulse.emptyGrowth : gameConfig.scene.hitPulse.defaultGrowth;
      material.opacity = (1 - progress) * (1 - progress) * baseOpacity;
      effectMesh.scale.setScalar(baseScale + progress * growth);
      effectMesh.position.set(pulse.cell.x, gameConfig.scene.hitPulse.y, pulse.cell.y);
      effectMesh.visible = true;
    }
  }

  /** Hides board terrain cells that are replaced by terrain-style blocks. */
  private updateTerrain(level: LevelDefinition, placements: Placement[]) {
    if (!this.blockTiles) {
      return;
    }

    const blockMap = new Map(level.blocks.map((block) => [block.pieceId, block]));
    const hiddenCells = new Set<string>();

    for (const placement of placements) {
      const block = blockMap.get(placement.pieceId);
      if (!block || getBlockVisualKind(block) !== "terrain") {
        continue;
      }

      for (const cell of getFootprintCells(block, placement.origin.x, placement.origin.y, placement.rotation)) {
        hiddenCells.add(`${cell.x},${cell.y}`);
      }
    }

    const hiddenSignature = [...hiddenCells].sort().join("|");
    if (hiddenSignature === this.state.terrainHiddenSignature) {
      return;
    }

    for (const [key, cellMesh] of this.state.terrainCells) {
      cellMesh.visible = !hiddenCells.has(key);
    }
    this.state.terrainHiddenSignature = hiddenSignature;
  }

  /** Adds static obstacle meshes for the active level and keeps one mesh per obstacle instance. */
  private addStaticObstacles(level: LevelDefinition) {
    for (const mesh of this.state.staticObstacleMeshes.values()) {
      this.disposeSceneObject(mesh);
    }
    this.state.staticObstacleMeshes.clear();

    for (const obstaclePlacement of level.staticObstacles ?? []) {
      const definition = getStaticObstacleDefinition(obstaclePlacement.obstacleId);
      if (!definition) {
        continue;
      }

      const template = this.staticObstacleTemplates.get(obstaclePlacement.obstacleId);
      const obstacleMesh = template
        ? template.clone(true)
        : new THREE.Mesh(
          new THREE.BoxGeometry(definition.width, gameConfig.scene.mesh.obstacleFallbackHeight, definition.height),
          new THREE.MeshStandardMaterial({
            color: definition.color ?? "#5d7a63",
            roughness: gameConfig.scene.mesh.obstacleFallbackRoughness,
            metalness: gameConfig.scene.mesh.obstacleFallbackMetalness,
          }),
        );
      normalizeImportedModelMaterials(obstacleMesh);
      applyShadowFlags(obstacleMesh, { cast: true, receive: true });

      const width = obstaclePlacement.rotation === 90 ? definition.height : definition.width;
      const height = obstaclePlacement.rotation === 90 ? definition.width : definition.height;
      obstacleMesh.position.set(
        obstaclePlacement.origin.x + (width - 1) * 0.5,
        0,
        obstaclePlacement.origin.y + (height - 1) * 0.5,
      );
      obstacleMesh.rotation.y = obstaclePlacement.rotation === 90 ? Math.PI / 2 : 0;
      this.scene.add(obstacleMesh);
      this.state.staticObstacleMeshes.set(obstaclePlacementKey(obstaclePlacement), obstacleMesh);
    }
  }

  /** Removes one optional scene object. */
  private removeObject(object?: THREE.Object3D) {
    if (!object) {
      return;
    }
    this.scene.remove(object);
  }

  /** Disposes a scene object and any owned geometry or material resources. */
  private disposeSceneObject(object?: THREE.Object3D) {
    if (!object) {
      return;
    }
    this.scene.remove(object);
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material?.dispose();
      }
    });
  }

  /** Loads and normalizes all terrain and terrain-block tile templates. */
  private async ensureBlockTileTemplates(onProgress?: (progress: number) => void) {
    const entries = Object.entries(blockTileModelPaths) as Array<
      [keyof typeof blockTileModelPaths, (typeof blockTileModelPaths)[keyof typeof blockTileModelPaths]]
    >;
    const loaded = await Promise.all(
      entries.map(async ([key, asset], index) => {
        const template = await loadModelTemplate(asset);
        onProgress?.((index + 1) / entries.length);
        return [key, this.normalizeBlockTileTemplate(template, asset.yOffset ?? 0)] as const;
      }),
    );
    this.blockTiles = Object.fromEntries(loaded) as BlockTileTemplates;
  }

  /** Preloads and normalizes static obstacle templates for the current level. */
  private async ensureStaticObstacleTemplates(level: LevelDefinition, onProgress?: (progress: number) => void) {
    const obstacleIds = [...new Set((level.staticObstacles ?? []).map((obstacle) => obstacle.obstacleId))];
    if (obstacleIds.length === 0) {
      onProgress?.(1);
      return;
    }

    let completed = 0;
    for (const obstacleId of obstacleIds) {
      const definition = getStaticObstacleDefinition(obstacleId);
      if (!definition?.model) {
        completed += 1;
        onProgress?.(completed / obstacleIds.length);
        continue;
      }

      const template = await loadModelTemplate(definition.model);
      const yOffset = typeof definition.model === "string" ? 0 : (definition.model.yOffset ?? 0);
      this.staticObstacleTemplates.set(obstacleId, this.normalizeBlockTileTemplate(template, yOffset));
      completed += 1;
      onProgress?.(completed / obstacleIds.length);
    }
  }

  /** Normalizes one imported tile so it fills one grid cell and rests on y=0. */
  private normalizeBlockTileTemplate(template: THREE.Object3D, yOffset: number) {
    const normalized = template.clone(true);
    normalizeImportedModelMaterials(normalized);
    const initialBounds = new THREE.Box3().setFromObject(normalized);
    const initialSize = new THREE.Vector3();
    initialBounds.getSize(initialSize);
    const dominantXZ = Math.max(initialSize.x, initialSize.z, gameConfig.scene.blockModel.minimumScaleAxis);
    const uniformScale = 1 / dominantXZ;
    normalized.scale.multiplyScalar(uniformScale);

    const bounds = new THREE.Box3().setFromObject(normalized);
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    normalized.position.x -= center.x;
    normalized.position.z -= center.z;
    normalized.position.y -= bounds.min.y;
    normalized.position.y += yOffset;

    return normalized;
  }
}

/** Replaces one block placement with its drag preview while preserving array order. */
function applyPreviewPlacement(placements: Placement[], preview?: PreviewPlacement) {
  if (!preview) {
    return placements;
  }

  return placements.map((placement) =>
    placement.pieceId === preview.placement.pieceId ? preview.placement : placement,
  );
}

/** Enumerates the integer cells covered by one axis-aligned block footprint. */
function getFootprintCells(
  block: { width: number; height: number },
  originX: number,
  originY: number,
  rotation: 0 | 90,
) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x: originX + x, y: originY + y });
    }
  }
  return cells;
}

/** Returns a stable key for one static obstacle placement instance. */
function obstaclePlacementKey(obstaclePlacement: NonNullable<LevelDefinition["staticObstacles"]>[number]) {
  return `${obstaclePlacement.obstacleId}:${obstaclePlacement.origin.x}:${obstaclePlacement.origin.y}:${obstaclePlacement.rotation}`;
}

/** Lightens a hex color toward white while preserving some of the original hue. */
function lightenHexColor(hex: string, amount: number) {
  const color = new THREE.Color(hex);
  color.lerp(new THREE.Color("#ffffff"), amount);
  return `#${color.getHexString()}`;
}

/** Returns the stable key used to identify one placed block event instance. */
export function placementKey(placement: Placement) {
  return placementInstanceKey(placement);
}

/** Normalizes imported lit materials so blocks and animals share the same scene lighting. */
function normalizeImportedModelMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material;
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      mesh.material = material.map((item) => normalizeImportedMaterial(item));
      return;
    }

    mesh.material = normalizeImportedMaterial(material);
  });
}

/** Converts unlit materials to lit PBR materials, then removes emissive bias. */
function normalizeImportedMaterial(material: THREE.Material) {
  let nextMaterial: THREE.Material = material;

  if (material instanceof THREE.MeshBasicMaterial) {
    nextMaterial = new THREE.MeshStandardMaterial({
      color: material.color.clone(),
      map: material.map ?? null,
      transparent: material.transparent,
      opacity: material.opacity,
      alphaTest: material.alphaTest,
      side: material.side,
      roughness: 0.86,
      metalness: 0.04,
      depthWrite: material.depthWrite,
      depthTest: material.depthTest,
      name: material.name,
    });
    material.dispose();
  }

  const litMaterial = nextMaterial as THREE.MeshStandardMaterial;
  if ("emissive" in litMaterial && litMaterial.emissive) {
    litMaterial.emissive.set("#000000");
    litMaterial.emissiveIntensity = 0;
  }
  return nextMaterial;
}

/** Applies cast/receive shadow flags to every mesh within an object hierarchy. */
function applyShadowFlags(root: THREE.Object3D, options: { cast: boolean; receive: boolean }) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.castShadow = options.cast;
    mesh.receiveShadow = options.receive;
  });
}

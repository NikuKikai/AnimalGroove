import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { blockTileModelPaths, loadModelTemplate, preloadModelTemplates } from "../assets/modelAssets";
import { getAnimalProfile } from "../engine/animalRegistry";
import type { LevelDefinition, Placement } from "../types";
import { placementInstanceKey } from "../simulation";
import {
  applyPickData,
  createBlockModelMesh,
  createHitPulseMesh,
  createTiledAreaMesh,
  getDisplayOffset,
} from "./sceneMeshes";
import { computePathOffset, normalizedBeatDelta, sampleAnimalPosition } from "./sceneMotion";
import type { HitPulse, PreviewPlacement, SceneHit, StashPiece } from "./sceneTypes";
import type { BlockTileTemplates } from "./sceneMeshes";

export type { HitPulse, PreviewPlacement, SceneHit, StashPiece } from "./sceneTypes";

type SceneState = {
  animalRoots: Map<string, THREE.Object3D>;
  animalFallbacks: Map<string, THREE.Object3D>;
  pathLines: THREE.Line[];
  blockMeshes: Map<string, THREE.Object3D>;
  stashMeshes: Map<string, THREE.Object3D>;
  hitPulseMeshes: Map<string, THREE.Mesh>;
  previewMesh?: THREE.Object3D;
  previewSignature?: string;
  reserveMesh?: THREE.Mesh;
  boardMesh?: THREE.Mesh;
  reserveTiles?: THREE.Object3D;
  boardTiles?: THREE.Object3D;
  boardGrid?: THREE.LineSegments;
  reserveGrid?: THREE.LineSegments;
  iconTextureCache: Map<string, THREE.Texture>;
};

type CameraDragMode = "pan" | "rotate";

const pathPalette = ["#ffaf45", "#58c4dd", "#ffc857", "#ff7f7f", "#b291ff", "#7bd389"];
export const RESERVE_MARGIN = 8;

export class ThreeScene {
  private loadVersion = 0;

  private scene = new THREE.Scene();

  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  private raycaster = new THREE.Raycaster();

  private pointer = new THREE.Vector2();

  private boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private orbitTarget = new THREE.Vector3(3.5, 0, 2.5);

  private orbitYaw = Math.PI / 4;

  private orbitPitch = 0.82;

  private orbitDistance = 13.5;

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
    stashMeshes: new Map(),
    hitPulseMeshes: new Map(),
    iconTextureCache: new Map(),
  };

  /** Creates the scene, camera, renderer, and shared lights. */
  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.background = new THREE.Color("#0f1718");
    this.updateCamera();

    const ambientLight = new THREE.AmbientLight("#ffffff", 1);
    const directionalLight = new THREE.DirectionalLight("#ffffff", 3);
    directionalLight.position.set(6, 12, 4);
    this.scene.add(ambientLight, directionalLight);
  }

  /** Preloads unique model assets so later level switches can reuse them. */
  static async preloadModels(paths: string[], onProgress?: (progress: number) => void) {
    await preloadModelTemplates(paths, onProgress);
  }

  /** Mounts the WebGL canvas into a host element. */
  mount(element: HTMLDivElement) {
    this.mountedElement = element;
    element.appendChild(this.renderer.domElement);
    this.resize();
  }

  /** Returns the renderer canvas used for pointer event wiring. */
  getDomElement() {
    return this.renderer.domElement;
  }

  /** Starts a camera drag gesture for panning or orbit rotation. */
  beginCameraDrag(mode: CameraDragMode, clientX: number, clientY: number) {
    this.activeCameraDrag = {
      mode,
      pointerX: clientX,
      pointerY: clientY,
    };
  }

  /** Updates the active camera drag gesture and applies constrained motion. */
  updateCameraDrag(clientX: number, clientY: number) {
    if (!this.activeCameraDrag || !this.mountedElement) {
      return;
    }

    const deltaX = clientX - this.activeCameraDrag.pointerX;
    const deltaY = clientY - this.activeCameraDrag.pointerY;
    this.activeCameraDrag.pointerX = clientX;
    this.activeCameraDrag.pointerY = clientY;

    if (this.activeCameraDrag.mode === "rotate") {
      this.orbitYaw += deltaX * 0.0035;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - deltaY * 0.003, 0.35, 1.22);
      this.updateCamera();
      return;
    }

    const panScale = this.orbitDistance * 0.00115;
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

  /** Zooms the camera in or out while keeping distance and target inside limits. */
  zoomCamera(deltaY: number) {
    const zoomFactor = Math.exp(deltaY * 0.0012);
    this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance * zoomFactor, 6.5, 28);
    this.updateCamera();
  }

  /** Resizes the renderer and camera to match the mounted element. */
  resize() {
    if (!this.mountedElement) {
      return;
    }

    const { clientWidth, clientHeight } = this.mountedElement;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  /** Reconfigures the board and animal content for a new level. */
  async loadLevel(level: LevelDefinition, onProgress?: (progress: number) => void) {
    const version = ++this.loadVersion;
    this.clearDynamicLevel();
    await this.ensureBlockTileTemplates((progress) => onProgress?.(progress * 0.18));
    this.configureBoard(level);
    this.fitCameraToBoard(level);
    onProgress?.(0.22);
    this.addPaths(level);
    onProgress?.(0.4);
    await this.addAnimals(level, version, onProgress);
  }

  /** Renders the current frame from gameplay state and transient preview state. */
  update(
    level: LevelDefinition,
    beat: number,
    placements: Placement[],
    showPaths: boolean,
    stashPieces: StashPiece[],
    pressedPlacementIds: Set<string>,
    hitPulses: HitPulse[],
    preview?: PreviewPlacement,
  ) {
    this.updateAnimals(level, beat);
    this.updateBlocks(level, placements, pressedPlacementIds);
    this.updateHitPulses(level, beat, hitPulses);
    this.updateStash(level, stashPieces);
    this.updatePreview(level, preview);
    for (const pathLine of this.state.pathLines) {
      pathLine.visible = showPaths;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Converts a screen-space pointer position into a board or reserve cell. */
  getCellFromPointer(clientX: number, clientY: number, level: LevelDefinition, includeReserve = false) {
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
    const minX = includeReserve ? -RESERVE_MARGIN : 0;
    const maxX = includeReserve ? level.board.width + RESERVE_MARGIN - 1 : level.board.width - 1;
    const minY = includeReserve ? -RESERVE_MARGIN : 0;
    const maxY = includeReserve ? level.board.height + RESERVE_MARGIN - 1 : level.board.height - 1;
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return undefined;
    }

    return { x, y };
  }

  /** Returns the first stash or placement object hit by a pointer ray. */
  pickSceneObject(clientX: number, clientY: number): SceneHit | undefined {
    if (!this.mountedElement) {
      return undefined;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(
      [...this.state.stashMeshes.values(), ...this.state.blockMeshes.values()],
      true,
    );
    let first = hits[0]?.object;
    if (!first) {
      return undefined;
    }

    while (first.parent && !first.userData.kind) {
      first = first.parent;
    }

    const kind = first.userData.kind as string | undefined;
    if (kind === "stash") {
      return {
        kind: "stash",
        pieceId: first.userData.pieceId as string,
        blockId: first.userData.blockId as string,
      };
    }

    if (kind === "placement") {
      return {
        kind: "placement",
        placement: first.userData.placement as Placement,
      };
    }

    return undefined;
  }

  /** Releases scene resources and detaches the canvas. */
  dispose() {
    this.activeCameraDrag = undefined;
    this.clearLevel();
    this.renderer.dispose();
    if (this.mountedElement?.contains(this.renderer.domElement)) {
      this.mountedElement.removeChild(this.renderer.domElement);
    }
  }

  /** Clears both persistent and dynamic scene content. */
  private clearLevel() {
    this.clearDynamicLevel();
    this.removeObject(this.state.boardGrid);
    this.removeObject(this.state.reserveGrid);
    this.removeObject(this.state.reserveMesh);
    this.removeObject(this.state.boardMesh);
    this.removeObject(this.state.reserveTiles);
    this.removeObject(this.state.boardTiles);
    for (const texture of this.state.iconTextureCache.values()) {
      texture.dispose();
    }
    this.state = {
      animalRoots: new Map(),
      animalFallbacks: new Map(),
      pathLines: [],
      blockMeshes: new Map(),
      stashMeshes: new Map(),
      hitPulseMeshes: new Map(),
      previewMesh: undefined,
      previewSignature: undefined,
      reserveMesh: undefined,
      boardMesh: undefined,
      reserveTiles: undefined,
      boardTiles: undefined,
      boardGrid: undefined,
      reserveGrid: undefined,
      iconTextureCache: new Map(),
    };
  }

  /** Clears level-specific meshes while preserving reusable board objects. */
  private clearDynamicLevel() {
    for (const object of [
      ...this.state.animalRoots.values(),
      ...this.state.animalFallbacks.values(),
      ...this.state.pathLines,
      ...this.state.blockMeshes.values(),
      ...this.state.stashMeshes.values(),
      ...this.state.hitPulseMeshes.values(),
    ]) {
      this.disposeSceneObject(object);
    }
    if (this.state.previewMesh) {
      this.disposeSceneObject(this.state.previewMesh);
    }
    this.state.animalRoots.clear();
    this.state.animalFallbacks.clear();
    this.state.pathLines = [];
    this.state.blockMeshes.clear();
    this.state.stashMeshes.clear();
    this.state.hitPulseMeshes.clear();
    this.state.previewMesh = undefined;
    this.state.previewSignature = undefined;
  }

  /** Creates or updates the board meshes and grids for the active level. */
  private configureBoard(level: LevelDefinition) {
    this.currentBoardSize = { width: level.board.width, height: level.board.height };
    if (this.blockTiles) {
      this.removeObject(this.state.boardTiles);
      this.removeObject(this.state.reserveTiles);
      this.state.boardTiles = createTiledAreaMesh(this.blockTiles.grass, level.board.width, level.board.height);
      this.state.boardTiles.position.set((level.board.width - 1) / 2, 0, (level.board.height - 1) / 2);
      this.scene.add(this.state.boardTiles);

      const reserveWidth = level.board.width + RESERVE_MARGIN * 2;
      const reserveHeight = level.board.height + RESERVE_MARGIN * 2;
      this.state.reserveTiles = createTiledAreaMesh(this.blockTiles.inventory, reserveWidth, reserveHeight, 0.96);
      this.state.reserveTiles.position.set((level.board.width - 1) / 2, -0.04, (level.board.height - 1) / 2);
      this.scene.add(this.state.reserveTiles);

      this.removeObject(this.state.reserveMesh);
      this.removeObject(this.state.boardMesh);
      this.removeObject(this.state.boardGrid);
      this.removeObject(this.state.reserveGrid);
      this.state.reserveMesh = undefined;
      this.state.boardMesh = undefined;
      this.state.boardGrid = undefined;
      this.state.reserveGrid = undefined;
      return;
    }

    const reserveWidth = level.board.width + RESERVE_MARGIN * 2;
    const reserveHeight = level.board.height + RESERVE_MARGIN * 2;

    if (!this.state.reserveMesh) {
      this.state.reserveMesh = new THREE.Mesh(
        new THREE.BoxGeometry(reserveWidth, 0.12, reserveHeight),
        new THREE.MeshStandardMaterial({ color: "#31424a", roughness: 0.9 }),
      );
      this.scene.add(this.state.reserveMesh);
    } else {
      this.state.reserveMesh.geometry.dispose();
      this.state.reserveMesh.geometry = new THREE.BoxGeometry(reserveWidth, 0.12, reserveHeight);
    }
    this.state.reserveMesh.position.set((level.board.width - 1) / 2, -0.18, (level.board.height - 1) / 2);

    if (!this.state.boardMesh) {
      this.state.boardMesh = new THREE.Mesh(
        new THREE.BoxGeometry(level.board.width, 0.2, level.board.height),
        new THREE.MeshStandardMaterial({ color: "#20303a", roughness: 0.85 }),
      );
      this.scene.add(this.state.boardMesh);
    } else {
      this.state.boardMesh.geometry.dispose();
      this.state.boardMesh.geometry = new THREE.BoxGeometry(level.board.width, 0.2, level.board.height);
    }
    this.state.boardMesh.position.set((level.board.width - 1) / 2, -0.1, (level.board.height - 1) / 2);

    this.state.boardGrid = this.replaceGrid(
      this.state.boardGrid,
      -0.5,
      level.board.width - 0.5,
      -0.5,
      level.board.height - 0.5,
      "#6fa4a8",
      0.95,
    );
    this.removeObject(this.state.reserveGrid);
    this.state.reserveGrid = undefined;
  }

  /** Fits the orbit target and distance to the active board while keeping motion bounded. */
  private fitCameraToBoard(level: LevelDefinition) {
    this.orbitTarget.set((level.board.width - 1) / 2, 0, (level.board.height - 1) / 2);
    this.orbitDistance = THREE.MathUtils.clamp(Math.max(level.board.width, level.board.height) * 1.7, 8, 26);
    this.clampCameraTarget(level);
    this.updateCamera();
  }

  /** Keeps the camera target inside a padded rectangle around the board. */
  private clampCameraTarget(level?: LevelDefinition) {
    const boardWidth = level?.board.width ?? this.currentBoardSize.width;
    const boardHeight = level?.board.height ?? this.currentBoardSize.height;
    const padding = 3.5;
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

  /** Creates or updates a line grid mesh for the given rectangular bounds. */
  private replaceGrid(
    existing: THREE.LineSegments | undefined,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    color: string,
    opacity: number,
  ) {
    const geometry = new THREE.BufferGeometry();
    const points: number[] = [];
    const y = 0.02;

    for (let x = minX; x <= maxX; x += 1) {
      points.push(x, y, minZ, x, y, maxZ);
    }

    for (let z = minZ; z <= maxZ; z += 1) {
      points.push(minX, y, z, maxX, y, z);
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    if (!existing) {
      const next = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      this.scene.add(next);
      return next;
    }

    existing.geometry.dispose();
    existing.geometry = geometry;
    return existing;
  }

  /** Draws debug path lines for every animal loop. */
  private addPaths(level: LevelDefinition) {
    for (let index = 0; index < level.animals.length; index += 1) {
      const animal = level.animals[index];
      const color = pathPalette[index % pathPalette.length];
      const offsetStrength = ((index % 5) - 2) * 0.06;
      const points = animal.path.waypoints.map((point, pointIndex, waypoints) => {
        const offset = computePathOffset(waypoints, pointIndex, offsetStrength);
        return new THREE.Vector3(point.x + offset.x, 0.08 + index * 0.003, point.y + offset.y);
      });
      const firstOffset = computePathOffset(animal.path.waypoints, 0, offsetStrength);
      points.push(
        new THREE.Vector3(
          animal.path.waypoints[0].x + firstOffset.x,
          0.08 + index * 0.003,
          animal.path.waypoints[0].y + firstOffset.y,
        ),
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
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
      const fallbackColor = pathPalette[index % pathPalette.length];
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: fallbackColor }),
      );
      fallback.position.set(0, 0.3, 0);
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
        root.scale.setScalar(0.35);
        root.position.set(0, 0.18, 0);
        this.state.animalRoots.set(animal.id, root);
        this.scene.add(root);
        fallback.visible = false;
      } catch {
        fallback.visible = true;
      }

      onProgress?.(0.4 + ((index + 1) / level.animals.length) * 0.6);
    }
  }

  /** Updates animal transforms for the current beat position. */
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
        beat + 0.05,
        animal.path.startPhaseBeat ?? 0,
      );
      const root = this.state.animalRoots.get(animal.id) ?? this.state.animalFallbacks.get(animal.id);
      if (!root) {
        continue;
      }

      root.position.set(point.x, 0.22 + point.jumpHeight, point.y);
      root.lookAt(nextPoint.x, root.position.y, nextPoint.y);
    }
  }

  /** Syncs placed block meshes with gameplay placements and hit states. */
  private updateBlocks(level: LevelDefinition, placements: Placement[], pressedPlacementIds: Set<string>) {
    if (!this.blockTiles) {
      return;
    }

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    const nextKeys = new Set<string>();
    for (const placement of placements) {
      const block = blockMap.get(placement.blockId);
      if (!block) {
        continue;
      }

      const meshKey = placementKey(placement);
      nextKeys.add(meshKey);
      let mesh = this.state.blockMeshes.get(meshKey);
      const expectedRenderMode = "model";
      const needsRebuild = Boolean(mesh && mesh.userData.renderMode !== expectedRenderMode);
      if (mesh && needsRebuild) {
        this.disposeSceneObject(mesh);
        this.state.blockMeshes.delete(meshKey);
        mesh = undefined;
      }
      if (!mesh) {
        mesh = createBlockModelMesh(this.blockTiles, block.timbre, block, placement.rotation);
        mesh.userData.renderMode = expectedRenderMode;
        this.state.blockMeshes.set(meshKey, mesh);
        this.scene.add(mesh);
      }

      const isPressed = pressedPlacementIds.has(placementKey(placement));
      const pressDepth = isPressed ? 0.1 : 0;
      mesh.scale.y = isPressed ? 0.52 : 1;
      mesh.position.set(
        placement.origin.x + getDisplayOffset(block, placement.rotation).x,
        0.12 - pressDepth,
        placement.origin.y + getDisplayOffset(block, placement.rotation).y,
      );
      applyPickData(mesh, {
        kind: "placement",
        placement,
      });
    }

    for (const [meshKey, mesh] of this.state.blockMeshes) {
      if (nextKeys.has(meshKey)) {
        continue;
      }
      this.disposeSceneObject(mesh);
      this.state.blockMeshes.delete(meshKey);
    }
  }

  /** Renders expanding hit rings below blocks for matched and wrong notes. */
  private updateHitPulses(level: LevelDefinition, beat: number, hitPulses: HitPulse[]) {
    const durationBeats = 0.52;
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
      const color = pulse.state === "matched" ? "#1db65f" : pulse.state === "wrong" ? "#d63b35" : "#f1f1f1";
      material.color.set(color);
      const isEmpty = pulse.state === "empty";
      const baseOpacity = isEmpty ? 0.5 : 1.0;
      const baseScale = isEmpty ? 0.1 : 0.9;
      const growth = isEmpty ? 0.6 : 1.3;
      material.opacity = (1 - progress) * (1 - progress) * baseOpacity;
      effectMesh.scale.setScalar(baseScale + progress * growth);
      effectMesh.position.set(pulse.cell.x, 0.02, pulse.cell.y);
      effectMesh.visible = true;
    }
  }

  /** Syncs reserve-ring block meshes with the currently unused inventory. */
  private updateStash(level: LevelDefinition, stashPieces: StashPiece[]) {
    if (!this.blockTiles) {
      return;
    }

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    const nextKeys = new Set<string>();
    for (const piece of stashPieces) {
      const block = blockMap.get(piece.blockId);
      if (!block) {
        continue;
      }

      const meshKey = piece.pieceId;
      nextKeys.add(meshKey);
      let mesh = this.state.stashMeshes.get(meshKey);
      const expectedRenderMode = "model";
      const needsRebuild = Boolean(mesh && mesh.userData.renderMode !== expectedRenderMode);
      if (mesh && needsRebuild) {
        this.disposeSceneObject(mesh);
        this.state.stashMeshes.delete(meshKey);
        mesh = undefined;
      }
      if (!mesh) {
        mesh = createBlockModelMesh(this.blockTiles, block.timbre, block, piece.rotation, 0.92);
        mesh.userData.renderMode = expectedRenderMode;
        this.state.stashMeshes.set(meshKey, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(
        piece.worldX + getDisplayOffset(block, piece.rotation).x,
        0.12,
        piece.worldZ + getDisplayOffset(block, piece.rotation).y,
      );
      applyPickData(mesh, {
        kind: "stash",
        pieceId: piece.pieceId,
        blockId: piece.blockId,
      });
    }

    for (const [meshKey, mesh] of this.state.stashMeshes) {
      if (nextKeys.has(meshKey)) {
        continue;
      }
      this.disposeSceneObject(mesh);
      this.state.stashMeshes.delete(meshKey);
    }
  }

  /** Updates the ghost placement mesh shown while dragging a block. */
  private updatePreview(level: LevelDefinition, preview?: PreviewPlacement) {
    if (!preview) {
      if (this.state.previewMesh) {
        this.disposeSceneObject(this.state.previewMesh);
        this.state.previewMesh = undefined;
        this.state.previewSignature = undefined;
      }
      return;
    }

    const block = level.inventory.find((entry) => entry.id === preview.placement.blockId);
    if (!block) {
      return;
    }

    const previewSignature = `${preview.placement.blockId}:${preview.placement.rotation}:${preview.valid}`;
    let mesh = this.state.previewMesh;
    if (!mesh || this.state.previewSignature !== previewSignature) {
      if (mesh) {
        this.disposeSceneObject(mesh);
      }
      if (!this.blockTiles) {
        return;
      }
      mesh = createBlockModelMesh(this.blockTiles, block.timbre, block, preview.placement.rotation, 0.55, !preview.valid);
      this.state.previewMesh = mesh;
      this.state.previewSignature = previewSignature;
      this.scene.add(mesh);
    }

    mesh.position.set(
      preview.placement.origin.x + getDisplayOffset(block, preview.placement.rotation).x,
      0.18,
      preview.placement.origin.y + getDisplayOffset(block, preview.placement.rotation).y,
    );
  }

  /** Removes an object from the scene when it exists. */
  private removeObject(object?: THREE.Object3D) {
    if (!object) {
      return;
    }
    this.scene.remove(object);
  }

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

  /** Loads all block tile templates defined in docs/spec.md from the shared asset registry. */
  private async ensureBlockTileTemplates(onProgress?: (progress: number) => void) {
    const entries = Object.entries(blockTileModelPaths) as Array<[keyof typeof blockTileModelPaths, string]>;
    const loaded = await Promise.all(
      entries.map(async ([key, path], index) => {
        const template = await loadModelTemplate(path);
        onProgress?.((index + 1) / entries.length);
        return [key, this.normalizeBlockTileTemplate(template)] as const;
      }),
    );
    this.blockTiles = Object.fromEntries(loaded) as BlockTileTemplates;
  }

  /** Normalizes one tile template so each model occupies roughly one cell, is centered, and sits on y=0. */
  private normalizeBlockTileTemplate(template: THREE.Object3D) {
    const normalized = template.clone(true);
    const initialBounds = new THREE.Box3().setFromObject(normalized);
    const initialSize = new THREE.Vector3();
    initialBounds.getSize(initialSize);
    const dominantXZ = Math.max(initialSize.x, initialSize.z, 1e-6);
    const uniformScale = 1 / dominantXZ;
    normalized.scale.multiplyScalar(uniformScale);

    const bounds = new THREE.Box3().setFromObject(normalized);
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    normalized.position.x -= center.x;
    normalized.position.z -= center.z;
    normalized.position.y -= bounds.min.y;

    return normalized;
  }
}

/** Returns the stable key used to identify a placed block instance. */
export function placementKey(placement: Placement) {
  return placementInstanceKey(placement);
}

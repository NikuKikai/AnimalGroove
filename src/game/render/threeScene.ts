import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { LevelDefinition, Placement } from "../types";
import { computePathMetrics, placementInstanceKey } from "../simulation";

export type PreviewPlacement = {
  placement: Placement;
  valid: boolean;
};

export type StashPiece = {
  pieceId: string;
  blockId: string;
  rotation: 0 | 90;
  worldX: number;
  worldZ: number;
};

export type SceneHit =
  | { kind: "stash"; pieceId: string; blockId: string }
  | { kind: "placement"; placement: Placement };

type PickData =
  | { kind: "stash"; pieceId: string; blockId: string }
  | { kind: "placement"; placement: Placement };

type SceneState = {
  animalRoots: Map<string, THREE.Object3D>;
  animalFallbacks: Map<string, THREE.Object3D>;
  pathLines: THREE.Line[];
  blockMeshes: THREE.Object3D[];
  stashMeshes: THREE.Object3D[];
  previewMesh?: THREE.Object3D;
  reserveMesh?: THREE.Mesh;
  boardMesh?: THREE.Mesh;
  boardGrid?: THREE.LineSegments;
  reserveGrid?: THREE.LineSegments;
  iconTextureCache: Map<string, THREE.Texture>;
};

export class ThreeScene {
  private static modelTemplateCache = new Map<string, Promise<THREE.Object3D>>();

  private readonly reserveInset = 2;

  private loadVersion = 0;

  private scene = new THREE.Scene();

  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  private raycaster = new THREE.Raycaster();

  private pointer = new THREE.Vector2();

  private boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private mountedElement?: HTMLDivElement;

  private state: SceneState = {
    animalRoots: new Map(),
    animalFallbacks: new Map(),
    pathLines: [],
    blockMeshes: [],
    stashMeshes: [],
    iconTextureCache: new Map(),
  };

  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.background = new THREE.Color("#0f1718");
    this.camera.position.set(6, 10, 10);
    this.camera.lookAt(4, 0, 3);

    const ambientLight = new THREE.AmbientLight("#f3f0d6", 1.25);
    const directionalLight = new THREE.DirectionalLight("#ffffff", 1.6);
    directionalLight.position.set(6, 12, 4);
    this.scene.add(ambientLight, directionalLight);
  }

  static async preloadModels(paths: string[], onProgress?: (progress: number) => void) {
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length === 0) {
      onProgress?.(1);
      return;
    }

    let completed = 0;
    onProgress?.(0);
    await Promise.all(
      uniquePaths.map(async (path) => {
        await ThreeScene.loadModelTemplate(path);
        completed += 1;
        onProgress?.(completed / uniquePaths.length);
      }),
    );
  }

  mount(element: HTMLDivElement) {
    this.mountedElement = element;
    element.appendChild(this.renderer.domElement);
    this.resize();
  }

  getDomElement() {
    return this.renderer.domElement;
  }

  resize() {
    if (!this.mountedElement) {
      return;
    }

    const { clientWidth, clientHeight } = this.mountedElement;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  async loadLevel(level: LevelDefinition, onProgress?: (progress: number) => void) {
    const version = ++this.loadVersion;
    this.clearDynamicLevel();
    this.configureBoard(level);
    onProgress?.(0.2);
    this.addPaths(level);
    onProgress?.(0.35);
    await this.addAnimals(level, version, onProgress);
  }

  update(
    level: LevelDefinition,
    beat: number,
    placements: Placement[],
    showPaths: boolean,
    stashPieces: StashPiece[],
    pressedPlacementIds: Set<string>,
    preview?: PreviewPlacement,
  ) {
    this.updateAnimals(level, beat);
    this.updateBlocks(level, placements, pressedPlacementIds);
    this.updateStash(level, stashPieces);
    this.updatePreview(level, preview);
    for (const pathLine of this.state.pathLines) {
      pathLine.visible = showPaths;
    }
    this.renderer.render(this.scene, this.camera);
  }

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
    const minX = includeReserve ? -this.reserveInset : 0;
    const maxX = includeReserve ? level.board.width + this.reserveInset - 1 : level.board.width - 1;
    const minY = includeReserve ? -this.reserveInset : 0;
    const maxY = includeReserve ? level.board.height + this.reserveInset - 1 : level.board.height - 1;
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return undefined;
    }

    return { x, y };
  }

  pickSceneObject(clientX: number, clientY: number): SceneHit | undefined {
    if (!this.mountedElement) {
      return undefined;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects([...this.state.stashMeshes, ...this.state.blockMeshes], true);
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

  dispose() {
    this.clearLevel();
    this.renderer.dispose();
    if (this.mountedElement?.contains(this.renderer.domElement)) {
      this.mountedElement.removeChild(this.renderer.domElement);
    }
  }

  private clearLevel() {
    this.clearDynamicLevel();
    this.removeObject(this.state.boardGrid);
    this.removeObject(this.state.reserveGrid);
    this.removeObject(this.state.reserveMesh);
    this.removeObject(this.state.boardMesh);
    this.state = {
      animalRoots: new Map(),
      animalFallbacks: new Map(),
      pathLines: [],
      blockMeshes: [],
      stashMeshes: [],
      previewMesh: undefined,
      reserveMesh: undefined,
      boardMesh: undefined,
      boardGrid: undefined,
      reserveGrid: undefined,
      iconTextureCache: new Map(),
    };
  }

  private clearDynamicLevel() {
    for (const object of [
      ...this.state.animalRoots.values(),
      ...this.state.animalFallbacks.values(),
      ...this.state.pathLines,
      ...this.state.blockMeshes,
      ...this.state.stashMeshes,
    ]) {
      this.removeObject(object);
    }
    if (this.state.previewMesh) {
      this.removeObject(this.state.previewMesh);
    }
    this.state.animalRoots.clear();
    this.state.animalFallbacks.clear();
    this.state.pathLines = [];
    this.state.blockMeshes = [];
    this.state.stashMeshes = [];
    this.state.previewMesh = undefined;
  }

  private configureBoard(level: LevelDefinition) {
    const reserveWidth = level.board.width + this.reserveInset * 2;
    const reserveHeight = level.board.height + this.reserveInset * 2;

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
    this.state.reserveGrid = this.replaceGrid(
      this.state.reserveGrid,
      -this.reserveInset - 0.5,
      level.board.width + this.reserveInset - 0.5,
      -this.reserveInset - 0.5,
      level.board.height + this.reserveInset - 0.5,
      "#465e63",
      0.45,
    );
  }

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

  private addPaths(level: LevelDefinition) {
    for (const animal of level.animals) {
      const points = animal.path.waypoints.map((point) => new THREE.Vector3(point.x, 0.08, point.y));
      points.push(new THREE.Vector3(animal.path.waypoints[0].x, 0.08, animal.path.waypoints[0].y));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: animal.timbre === "kick" ? "#ffb347" : "#7fd1b9" }),
      );
      this.state.pathLines.push(line);
      this.scene.add(line);
    }
  }

  private async addAnimals(level: LevelDefinition, version: number, onProgress?: (progress: number) => void) {
    if (level.animals.length === 0) {
      onProgress?.(1);
      return;
    }

    for (let index = 0; index < level.animals.length; index += 1) {
      const animal = level.animals[index];
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: animal.timbre === "kick" ? "#ffb347" : "#7fd1b9" }),
      );
      fallback.position.set(0, 0.3, 0);
      this.state.animalFallbacks.set(animal.id, fallback);
      this.scene.add(fallback);

      const path = level.models[animal.animalType];
      if (!path) {
        onProgress?.(0.35 + ((index + 1) / level.animals.length) * 0.65);
        continue;
      }

      try {
        const template = await ThreeScene.loadModelTemplate(path);
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

      onProgress?.(0.35 + ((index + 1) / level.animals.length) * 0.65);
    }
  }

  private updateAnimals(level: LevelDefinition, beat: number) {
    for (const animal of level.animals) {
      const point = sampleAnimalPosition(
        animal.path.waypoints,
        animal.path.cycleBeats,
        beat,
        animal.path.startPhaseBeat ?? 0,
      );
      const nextPoint = sampleAnimalPosition(
        animal.path.waypoints,
        animal.path.cycleBeats,
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

  private updateBlocks(level: LevelDefinition, placements: Placement[], pressedPlacementIds: Set<string>) {
    for (const mesh of this.state.blockMeshes) {
      this.removeObject(mesh);
    }
    this.state.blockMeshes = [];

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    for (const placement of placements) {
      const block = blockMap.get(placement.blockId);
      if (!block) {
        continue;
      }

      const mesh = createBlockMesh(this.state.iconTextureCache, block.timbre, block.color, block, placement.rotation);
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
      this.state.blockMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private updateStash(level: LevelDefinition, stashPieces: StashPiece[]) {
    for (const mesh of this.state.stashMeshes) {
      this.removeObject(mesh);
    }
    this.state.stashMeshes = [];

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    for (const piece of stashPieces) {
      const block = blockMap.get(piece.blockId);
      if (!block) {
        continue;
      }

      const mesh = createBlockMesh(this.state.iconTextureCache, block.timbre, block.color, block, piece.rotation, 0.92);
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
      this.state.stashMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private updatePreview(level: LevelDefinition, preview?: PreviewPlacement) {
    if (this.state.previewMesh) {
      this.removeObject(this.state.previewMesh);
      this.state.previewMesh = undefined;
    }

    if (!preview) {
      return;
    }

    const block = level.inventory.find((entry) => entry.id === preview.placement.blockId);
    if (!block) {
      return;
    }

    const mesh = createBlockMesh(
      this.state.iconTextureCache,
      block.timbre,
      preview.valid ? block.color : "#ff5f57",
      block,
      preview.placement.rotation,
      0.55,
    );
    mesh.position.set(
      preview.placement.origin.x + getDisplayOffset(block, preview.placement.rotation).x,
      0.18,
      preview.placement.origin.y + getDisplayOffset(block, preview.placement.rotation).y,
    );
    this.state.previewMesh = mesh;
    this.scene.add(mesh);
  }

  private removeObject(object?: THREE.Object3D) {
    if (!object) {
      return;
    }
    this.scene.remove(object);
  }

  private static loadModelTemplate(path: string) {
    const cached = ThreeScene.modelTemplateCache.get(path);
    if (cached) {
      return cached;
    }

    const loader = new GLTFLoader();
    const pending = loader.loadAsync(path).then((gltf: GLTF) => gltf.scene);
    ThreeScene.modelTemplateCache.set(path, pending);
    return pending;
  }
}

function createBlockMesh(
  iconTextureCache: Map<string, THREE.Texture>,
  timbre: string,
  color: string,
  block: { width: number; height: number },
  rotation: 0 | 90,
  opacity = 1,
) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.08, 0.24, height - 0.08),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.18,
      transparent: opacity < 1,
      opacity,
    }),
  );
  group.add(body);

  const iconPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(0.4, width * 0.52), Math.max(0.4, height * 0.52)),
    new THREE.MeshBasicMaterial({
      map: getIconTexture(iconTextureCache, timbre),
      transparent: true,
      opacity,
    }),
  );
  iconPlane.rotation.x = -Math.PI / 2;
  iconPlane.position.y = 0.125;
  group.add(iconPlane);

  return group;
}

function applyPickData(root: THREE.Object3D, data: PickData) {
  root.userData = { ...data };
  root.traverse((child: THREE.Object3D) => {
    child.userData = { ...data };
  });
}

function getDisplayOffset(block: { width: number; height: number }, rotation: 0 | 90) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  return {
    x: (width - 1) / 2,
    y: (height - 1) / 2,
  };
}

export function placementKey(placement: Placement) {
  return placementInstanceKey(placement);
}

function getIconTexture(cache: Map<string, THREE.Texture>, timbre: string) {
  const cached = cache.get(timbre);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.Texture();
    cache.set(timbre, fallback);
    return fallback;
  }

  context.clearRect(0, 0, 128, 128);
  context.fillStyle = "rgba(6, 12, 14, 0)";
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "#f8f1d8";
  context.strokeStyle = "#102022";
  context.lineWidth = 6;
  context.lineJoin = "round";
  context.lineCap = "round";

  drawDummyInstrumentIcon(context, timbre);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cache.set(timbre, texture);
  return texture;
}

function drawDummyInstrumentIcon(context: CanvasRenderingContext2D, timbre: string) {
  switch (timbre) {
    case "kick":
      context.beginPath();
      context.arc(64, 64, 28, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(64, 64, 14, 0, Math.PI * 2);
      context.stroke();
      break;
    case "snare":
      context.strokeRect(30, 40, 68, 34);
      context.beginPath();
      context.moveTo(34, 82);
      context.lineTo(94, 82);
      context.stroke();
      break;
    case "hat":
      context.beginPath();
      context.moveTo(34, 48);
      context.lineTo(94, 48);
      context.lineTo(80, 64);
      context.lineTo(48, 64);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.moveTo(42, 76);
      context.lineTo(86, 76);
      context.lineTo(76, 88);
      context.lineTo(52, 88);
      context.closePath();
      context.stroke();
      break;
    default:
      context.font = "700 52px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.strokeText(timbre[0]?.toUpperCase() ?? "?", 64, 64);
      context.fillText(timbre[0]?.toUpperCase() ?? "?", 64, 64);
      break;
  }
}

function sampleAnimalPosition(
  waypoints: { x: number; y: number }[],
  cycleBeats: number,
  beat: number,
  startPhaseBeat: number,
) {
  const relativeBeat = (((beat - startPhaseBeat) % cycleBeats) + cycleBeats) % cycleBeats;
  const metrics = computePathMetrics(waypoints);
  if (metrics.totalLength === 0) {
    return { ...waypoints[0], jumpHeight: 0 };
  }

  const targetDistance = (relativeBeat / cycleBeats) * metrics.totalLength;
  let segmentIndex = 0;
  for (let index = 0; index < metrics.segmentLengths.length; index += 1) {
    if (targetDistance <= metrics.cumulativeLengths[index + 1]) {
      segmentIndex = index;
      break;
    }
  }

  const nextIndex = (segmentIndex + 1) % waypoints.length;
  const segmentStart = metrics.cumulativeLengths[segmentIndex];
  const segmentLength = metrics.segmentLengths[segmentIndex] || 1;
  const localT = (targetDistance - segmentStart) / segmentLength;
  const current = waypoints[segmentIndex];
  const next = waypoints[nextIndex];
  const jumpHeight = Math.sin(localT * Math.PI) * 0.55;

  return {
    x: THREE.MathUtils.lerp(current.x, next.x, localT),
    y: THREE.MathUtils.lerp(current.y, next.y, localT),
    jumpHeight,
  };
}

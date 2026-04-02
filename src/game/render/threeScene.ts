import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LevelDefinition, Placement } from "../types";
import { computePathMetrics, rotateDimensions } from "../simulation";

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

type SceneState = {
  animalRoots: Map<string, THREE.Object3D>;
  animalFallbacks: Map<string, THREE.Object3D>;
  pathLines: THREE.Line[];
  blockMeshes: THREE.Mesh[];
  gridLines: THREE.LineSegments[];
  stashMeshes: THREE.Mesh[];
  previewMesh?: THREE.Mesh;
  boardObjects: THREE.Object3D[];
};

export class ThreeScene {
  private scene = new THREE.Scene();

  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  private loader = new GLTFLoader();

  private raycaster = new THREE.Raycaster();

  private pointer = new THREE.Vector2();

  private boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private mountedElement?: HTMLDivElement;

  private state: SceneState = {
    animalRoots: new Map(),
    animalFallbacks: new Map(),
    pathLines: [],
    blockMeshes: [],
    gridLines: [],
    stashMeshes: [],
    boardObjects: [],
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

  async loadLevel(level: LevelDefinition) {
    this.clearLevel();
    this.addBoard(level);
    this.addPaths(level);
    await this.addAnimals(level);
  }

  update(
    level: LevelDefinition,
    beat: number,
    placements: Placement[],
    showPaths: boolean,
    stashPieces: StashPiece[],
    preview?: PreviewPlacement,
  ) {
    this.updateAnimals(level, beat);
    this.updateBlocks(level, placements);
    this.updateStash(level, stashPieces);
    this.updatePreview(level, preview);
    for (const pathLine of this.state.pathLines) {
      pathLine.visible = showPaths;
    }
    this.renderer.render(this.scene, this.camera);
  }

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

    const x = Math.floor(hitPoint.x);
    const y = Math.floor(hitPoint.z);
    if (x < 0 || x >= level.board.width || y < 0 || y >= level.board.height) {
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

    const hits = this.raycaster.intersectObjects(
      [...this.state.stashMeshes, ...this.state.blockMeshes],
      false,
    );
    const first = hits[0]?.object;
    if (!first) {
      return undefined;
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
    for (const object of [
      ...this.state.animalRoots.values(),
      ...this.state.animalFallbacks.values(),
      ...this.state.pathLines,
      ...this.state.blockMeshes,
      ...this.state.gridLines,
      ...this.state.stashMeshes,
      ...this.state.boardObjects,
    ]) {
      this.scene.remove(object);
    }
    if (this.state.previewMesh) {
      this.scene.remove(this.state.previewMesh);
    }
    this.state = {
      animalRoots: new Map(),
      animalFallbacks: new Map(),
      pathLines: [],
      blockMeshes: [],
      gridLines: [],
      stashMeshes: [],
      previewMesh: undefined,
      boardObjects: [],
    };
  }

  private addBoard(level: LevelDefinition) {
    const reserveInset = 2;
    const reserveWidth = level.board.width + reserveInset * 2;
    const reserveHeight = level.board.height + reserveInset * 2;

    const reserve = new THREE.Mesh(
      new THREE.BoxGeometry(reserveWidth, 0.12, reserveHeight),
      new THREE.MeshStandardMaterial({ color: "#31424a", roughness: 0.9 }),
    );
    reserve.position.set(level.board.width / 2, -0.18, level.board.height / 2);
    this.state.boardObjects.push(reserve);
    this.scene.add(reserve);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(level.board.width, 0.2, level.board.height),
      new THREE.MeshStandardMaterial({ color: "#20303a", roughness: 0.85 }),
    );
    board.position.set(level.board.width / 2, -0.1, level.board.height / 2);
    this.state.boardObjects.push(board);
    this.scene.add(board);

    this.addGrid(0, level.board.width, 0, level.board.height, "#6fa4a8", 0.95);
    this.addGrid(-reserveInset, level.board.width + reserveInset, -reserveInset, level.board.height + reserveInset, "#465e63", 0.45);
  }

  private addGrid(minX: number, maxX: number, minZ: number, maxZ: number, color: string, opacity: number) {
    const gridGeometry = new THREE.BufferGeometry();
    const points: number[] = [];
    const y = 0.02;

    for (let x = minX; x <= maxX; x += 1) {
      points.push(x, y, minZ, x, y, maxZ);
    }

    for (let z = minZ; z <= maxZ; z += 1) {
      points.push(minX, y, z, maxX, y, z);
    }

    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const gridLines = new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    this.state.gridLines.push(gridLines);
    this.scene.add(gridLines);
  }

  private addPaths(level: LevelDefinition) {
    for (const animal of level.animals) {
      const points = animal.path.waypoints.map((point) => new THREE.Vector3(point.x + 0.5, 0.08, point.y + 0.5));
      points.push(new THREE.Vector3(animal.path.waypoints[0].x + 0.5, 0.08, animal.path.waypoints[0].y + 0.5));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: animal.timbre === "kick" ? "#ffb347" : "#7fd1b9" }),
      );
      this.state.pathLines.push(line);
      this.scene.add(line);
    }
  }

  private async addAnimals(level: LevelDefinition) {
    for (const animal of level.animals) {
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: animal.timbre === "kick" ? "#ffb347" : "#7fd1b9" }),
      );
      fallback.position.set(0, 0.3, 0);
      this.state.animalFallbacks.set(animal.id, fallback);
      this.scene.add(fallback);

      const path = level.models[animal.animalType];
      if (!path) {
        continue;
      }

      try {
        const gltf = await this.loader.loadAsync(path);
        const root = gltf.scene.clone(true);
        root.scale.setScalar(0.35);
        root.position.set(0, 0.18, 0);
        this.state.animalRoots.set(animal.id, root);
        this.scene.add(root);
        fallback.visible = false;
      } catch {
        fallback.visible = true;
      }
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

      root.position.set(point.x + 0.5, 0.22 + point.jumpHeight, point.y + 0.5);
      root.lookAt(nextPoint.x + 0.5, root.position.y, nextPoint.y + 0.5);
    }
  }

  private updateBlocks(level: LevelDefinition, placements: Placement[]) {
    for (const mesh of this.state.blockMeshes) {
      this.scene.remove(mesh);
    }
    this.state.blockMeshes = [];

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    for (const placement of placements) {
      const block = blockMap.get(placement.blockId);
      if (!block) {
        continue;
      }

      const mesh = createBlockMesh(block.color, block, placement.rotation);
      mesh.position.set(
        placement.origin.x + getDisplayWidth(block, placement.rotation) / 2,
        0.12,
        placement.origin.y + getDisplayHeight(block, placement.rotation) / 2,
      );
      mesh.userData = {
        kind: "placement",
        placement,
      };
      this.state.blockMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private updateStash(level: LevelDefinition, stashPieces: StashPiece[]) {
    for (const mesh of this.state.stashMeshes) {
      this.scene.remove(mesh);
    }
    this.state.stashMeshes = [];

    const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
    for (const piece of stashPieces) {
      const block = blockMap.get(piece.blockId);
      if (!block) {
        continue;
      }

      const mesh = createBlockMesh("#6f80ff", block, piece.rotation, 0.7);
      mesh.position.set(piece.worldX, 0.12, piece.worldZ);
      mesh.userData = {
        kind: "stash",
        pieceId: piece.pieceId,
        blockId: piece.blockId,
      };
      this.state.stashMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private updatePreview(level: LevelDefinition, preview?: PreviewPlacement) {
    if (this.state.previewMesh) {
      this.scene.remove(this.state.previewMesh);
      this.state.previewMesh = undefined;
    }

    if (!preview) {
      return;
    }

    const block = level.inventory.find((entry) => entry.id === preview.placement.blockId);
    if (!block) {
      return;
    }

    const mesh = createBlockMesh(preview.valid ? block.color : "#ff5f57", block, preview.placement.rotation, 0.55);
    mesh.position.set(
      preview.placement.origin.x + getDisplayWidth(block, preview.placement.rotation) / 2,
      0.18,
      preview.placement.origin.y + getDisplayHeight(block, preview.placement.rotation) / 2,
    );
    this.state.previewMesh = mesh;
    this.scene.add(mesh);
  }
}

function createBlockMesh(color: string, block: { width: number; height: number }, rotation: 0 | 90, opacity = 1) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  return new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.08, 0.24, height - 0.08),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.18,
      transparent: opacity < 1,
      opacity,
    }),
  );
}

function getDisplayWidth(block: { width: number; height: number }, rotation: 0 | 90) {
  return rotation === 90 ? block.height : block.width;
}

function getDisplayHeight(block: { width: number; height: number }, rotation: 0 | 90) {
  return rotation === 90 ? block.width : block.height;
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

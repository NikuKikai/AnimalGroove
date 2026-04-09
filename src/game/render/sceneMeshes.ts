import * as THREE from "three";
import type { Placement } from "../types";
import type { HitPulse } from "./sceneTypes";

export type PickData =
  | { kind: "stash"; pieceId: string; blockId: string }
  | { kind: "placement"; placement: Placement };

export type BlockTileTemplates = {
  grass: THREE.Object3D;
  inventory: THREE.Object3D;
  pathEnd: THREE.Object3D;
  pathStraight: THREE.Object3D;
  pathCorner: THREE.Object3D;
  pathTile: THREE.Object3D;
  riverEnd: THREE.Object3D;
  riverStraight: THREE.Object3D;
  riverCorner: THREE.Object3D;
  riverTile: THREE.Object3D;
};

/** Creates the mesh group used for a block body and its icon plane. */
export function createBlockMesh(
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

/** Creates a 3D-model based block entity according to the spec combinations. */
export function createBlockModelMesh(
  templates: BlockTileTemplates,
  timbre: string,
  block: { width: number; height: number },
  rotation: 0 | 90,
  opacity = 1,
  invalid = false,
) {
  if (invalid) {
    return createInvalidPreviewMesh(block, rotation, opacity);
  }

  const normalizedTimbre = timbre.toLowerCase();
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  const isKick = normalizedTimbre === "kick";
  const family = {
    end: isKick ? templates.pathEnd : templates.riverEnd,
    straight: isKick ? templates.pathStraight : templates.riverStraight,
    corner: isKick ? templates.pathCorner : templates.riverCorner,
    tile: isKick ? templates.pathTile : templates.riverTile,
  };

  const group = new THREE.Group();
  const offsetX = (width - 1) / 2;
  const offsetY = (height - 1) / 2;
  const cells = buildBlockPattern(width, height);
  for (const cell of cells) {
    const base =
      cell.kind === "end" ? family.end : cell.kind === "straight" ? family.straight : cell.kind === "corner" ? family.corner : family.tile;
    const model = cloneTemplate(base);
    model.position.set(cell.x - offsetX, 0, cell.y - offsetY);
    model.rotation.y = THREE.MathUtils.degToRad(cell.rotationDeg);
    applyOpacity(model, opacity);
    group.add(model);
  }

  return group;
}

/** Creates a lightweight red preview mesh used for invalid placement feedback. */
function createInvalidPreviewMesh(block: { width: number; height: number }, rotation: 0 | 90, opacity: number) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  return new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.08, 0.24, height - 0.08),
    new THREE.MeshStandardMaterial({
      color: "#ff5f57",
      emissive: "#ff5f57",
      emissiveIntensity: 0.2,
      transparent: opacity < 1,
      opacity,
    }),
  );
}

/** Copies pick metadata onto a root object and all of its descendants. */
export function applyPickData(root: THREE.Object3D, data: PickData) {
  root.userData = { ...data };
  root.traverse((child: THREE.Object3D) => {
    child.userData = { ...data };
  });
}

/** Returns the center offset needed to place a block footprint on integer grid cells. */
export function getDisplayOffset(block: { width: number; height: number }, rotation: 0 | 90) {
  const width = rotation === 90 ? block.height : block.width;
  const height = rotation === 90 ? block.width : block.height;
  return {
    x: (width - 1) / 2,
    y: (height - 1) / 2,
  };
}

/** Creates one additive pulse ring mesh for block hit feedback. */
export function createHitPulseMesh(state: HitPulse["state"]) {
  const color = state === "matched" ? "#1db65f" : state === "wrong" ? "#d63b35" : "#f1f1f1";
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

/** Creates repeated 1x1 tile models over a rectangular area. */
export function createTiledAreaMesh(template: THREE.Object3D, width: number, height: number, opacity = 1) {
  const group = new THREE.Group();
  const offsetX = (width - 1) / 2;
  const offsetY = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = cloneTemplate(template);
      tile.position.set(x - offsetX, 0, y - offsetY);
      applyOpacity(tile, opacity);
      group.add(tile);
    }
  }
  return group;
}

/** Creates or reuses a cached icon texture for a timbre label. */
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

/** Draws a simple placeholder icon for a given timbre. */
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

type PatternCell = {
  x: number;
  y: number;
  kind: "end" | "straight" | "corner" | "tile";
  rotationDeg: number;
};

/** Builds a model composition pattern for one block footprint. */
function buildBlockPattern(width: number, height: number): PatternCell[] {
  if (width === 1 && height === 1) {
    return [{ x: 0, y: 0, kind: "tile", rotationDeg: 0 }];
  }

  if (width === 1 || height === 1) {
    const horizontal = height === 1;
    const length = horizontal ? width : height;
    const cells: PatternCell[] = [];
    for (let index = 0; index < length; index += 1) {
      const x = horizontal ? index : 0;
      const y = horizontal ? 0 : index;
      if (index === 0) {
        cells.push({ x, y, kind: "end", rotationDeg: horizontal ? 90 : 0 });
      } else if (index === length - 1) {
        cells.push({ x, y, kind: "end", rotationDeg: horizontal ? 270 : 180 });
      } else {
        cells.push({ x, y, kind: "straight", rotationDeg: horizontal ? 90 : 0 });
      }
    }
    return cells;
  }

  if (width === 2 && height === 2) {
    return [
      { x: 0, y: 0, kind: "corner", rotationDeg: 0 },
      { x: 1, y: 0, kind: "corner", rotationDeg: 90 },
      { x: 1, y: 1, kind: "corner", rotationDeg: 180 },
      { x: 0, y: 1, kind: "corner", rotationDeg: 270 },
    ];
  }

  const cells: PatternCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x, y, kind: "tile", rotationDeg: 0 });
    }
  }
  return cells;
}

/** Clones one template model with full child hierarchy. */
function cloneTemplate(template: THREE.Object3D) {
  return template.clone(true);
}

/** Applies transparency to every mesh material within a model hierarchy. */
function applyOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material;
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      for (const item of material) {
        item.transparent = opacity < 1;
        item.opacity = opacity;
      }
      return;
    }

    material.transparent = opacity < 1;
    material.opacity = opacity;
  });
}

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Game, GameId, WallCategoryId } from "@/types/library";
import { games } from "./games";
import { getWallCovers } from "./walls";
import { layoutWall } from "./layoutWall";
import { layoutCollectionRack, type CollectionRack } from "./layoutCollectionRack";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET_ROOT = `${BASE_PATH}/demo`;
const ALBUM_SIZE = 1.168;
const REST_TILT = -0.26;
const DETAIL_Z = 6.7;
const DETAIL_Y = 0.045;
const ALBUM_SHADOW_SCALE = 1.6;
const HOVER_LIFT_DURATION = 1000;
const HOVER_DROP_DURATION = 400;
const HOVER_ROTATION_DROP_DELAY = HOVER_DROP_DURATION * 0.6;

// The zoomed-out wall is the collection itself. The featured sleeves stay on
// the shelf at the base of a rack, and every other game fills the rack around
// them, so the wall never shows an entry that is not in the data.
// The rack keeps a fixed eleven-column grid and three rows above the shelf. A
// collection that does not fill it leaves shelves empty in view instead of
// zooming in to fit the games.
const RACK_COLUMNS = 11;
const RACK_ROWS_ABOVE = 3;
const RACK_ROWS_BELOW = 0;
// Rack boards use the same profile as the featured boards so a row reads as
// one board running off-screen, not as a board sitting on a second, offset
// rail. Each rack board tucks just under the featured board it overlaps so the
// two always meet cleanly.
const RACK_BOARD_DROP = 0.586;
const RACK_BOARD_THICKNESS = 0.047;
const RACK_BOARD_DEPTH = 0.764;
const RACK_BOARD_CENTER_Z = -1.018;
const FEATURED_BOARD_TOPS = [0.2535, -1.241];
// Share of the view the whole rack may take at full zoom. The original wall sat
// at about 70% of the width and 55% of the height on a 16:10 screen, with air
// around it, and that framing is what makes the wall read as a rack rather than
// as covers stretched to the edges.
const RACK_FILL_X = 0.7;
const RACK_FILL_Y = 0.55;
// The desktop root sits at (0, 0.1, 0.5); the wall covers hang at z -1.16 in it.
const DESKTOP_ROOT_Y = 0.1;
const WALL_COVER_WORLD_Z = -1.16 + 0.5;

const coverVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const coverFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uRoughnessMap;
  uniform sampler2D uPlasticNormalMap;
  uniform float uOpacity;
  uniform float uGloss;
  uniform float uPlasticWrapIntensity;
  uniform float uFresnelPower;
  uniform float uHighlightIntensity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 texel = texture2D(uMap, vUv);
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(vViewDir);
    vec3 wrapNormal = texture2D(uPlasticNormalMap, vUv).rgb * 2.0 - 1.0;
    vec3 perturbedNormal = normalize(N + wrapNormal * uPlasticWrapIntensity);
    float viewAngle = clamp(abs(dot(perturbedNormal, V)), 0.0, 1.0);
    float fresnel = pow(1.0 - viewAngle, uFresnelPower);
    float roughness = texture2D(uRoughnessMap, vUv).r;
    float smoothRoughness = clamp(mix(roughness, 0.5, 0.7), 0.0, 1.0);
    float highlight = min(fresnel, 0.05 + uPlasticWrapIntensity * 0.03);
    float specular = pow(1.0 - viewAngle, 24.0) * 0.2 * uPlasticWrapIntensity;
    vec3 highlightColor = vec3(uHighlightIntensity);
    vec3 color = mix(
      texel.rgb,
      mix(texel.rgb, highlightColor, highlight),
      smoothRoughness
    ) + specular;
    color += fresnel * 0.025 * uGloss;

    // A broad softbox above and to the right, the same key that lights the
    // baked wall. The shrink-wrap normal breaks its reflection up into the
    // crinkled sheen of a plastic sleeve; uPlasticWrapIntensity is 0 until
    // the finish textures load, so the cover never flashes a bare highlight.
    vec3 L = normalize(vec3(0.35, 0.75, 0.55));
    vec3 H = normalize(L + V);
    float gloss = mix(18.0, 60.0, 1.0 - roughness);
    float sheen = pow(clamp(dot(perturbedNormal, H), 0.0, 1.0), gloss);
    color += sheen * 0.32 * uPlasticWrapIntensity * uGloss;

    // Light falls off toward the foot of the sleeve where it meets the shelf.
    float foot = 1.0 - smoothstep(0.0, 0.22, vUv.y);
    color *= 1.0 - foot * 0.09 * step(0.001, uPlasticWrapIntensity);

    gl_FragColor = vec4(color, texel.a * uOpacity);
  }
`;

interface GameNode {
  album: Game;
  group: THREE.Group;
  cover: THREE.Mesh;
  back: THREE.Mesh;
  backMaterial: THREE.ShaderMaterial;
  record: THREE.Mesh;
  material: THREE.ShaderMaterial;
  base: THREE.Vector3;
  hover: number;
  hoverFrom: number;
  hoverTarget: number;
  hoverStartedAt: number;
  hoverDuration: number;
  rotationHover: number;
  rotationFrom: number;
  rotationTarget: number;
  rotationStartedAt: number;
  rotationDuration: number;
  rotationDelay: number;
  scaleT: number;
  baseZ: number;
  mobileZ: number;
  staticTexture: THREE.Texture;
  video?: HTMLVideoElement;
  videoTexture?: THREE.VideoTexture;
  videoReady?: boolean;
}

/**
 * A soft sleeve shadow: the card's silhouette, blurred. Offset behind each
 * album it reads as the shadow the baked key light would throw into the gap
 * beside it. A shadow map cannot do this cleanly at this scale: the shelf
 * boards clip it into hard, blocky bands.
 */
function createAlbumShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // The plane is ALBUM_SHADOW_SCALE x the sleeve; the silhouette is the sleeve
  // itself. Draw it off-canvas and keep only its shadow, so the result is a
  // pure blur with no hard edge from the fill.
  const inset = size * (0.5 - 0.5 / ALBUM_SHADOW_SCALE);
  const offset = size * 4;
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#000";
  context.shadowColor = "rgba(0, 0, 0, 1)";
  context.shadowBlur = size * 0.07;
  context.shadowOffsetX = offset;
  context.fillRect(inset - offset, inset, size - inset * 2, size - inset * 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/**
 * The room light is part of the scene, not the page: a broad, soft key from
 * the upper left that keeps the wall from reading as one flat fill.
 */
function createBackdropTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // Matches the ambient tone at the edge of the baked wall, so the wall can
  // dissolve into it without a visible step.
  context.fillStyle = "#d8d8d7";
  context.fillRect(0, 0, size, size);

  // The plane spans 80 units; this glow sits over the collection, slightly
  // above centre, like the key light baked into the shelf wall.
  const cx = size * 0.5;
  const cy = size * 0.47;
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, size * 0.2);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  glow.addColorStop(0.4, "rgba(255, 255, 255, 0.22)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCoverMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uRoughnessMap: { value: null },
      uPlasticNormalMap: { value: null },
      uOpacity: { value: 1 },
      uGloss: { value: 1 },
      uPlasticWrapIntensity: { value: 0 },
      uFresnelPower: { value: 0.775 },
      uHighlightIntensity: { value: 3.8 },
    },
    vertexShader: coverVertexShader,
    fragmentShader: coverFragmentShader,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export interface ShelfSceneCallbacks {
  onReady?: () => void;
  onHover?: (id: GameId | null) => void;
  onAlbumClick?: (id: GameId) => void;
  onOutsideClick?: () => void;
  onActiveRect?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onFirstFrame?: () => void;
  onZoomChange?: (zoom: number) => void;
  onWallSwitching?: (isSwitching: boolean) => void;
  onWallChange?: (id: WallCategoryId) => void;
}

interface WallCover {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  baseZ: number;
  slug: string;
  cover: string;
  // Original panorama slot, restored when the featured wall comes back.
  home: THREE.Vector3;
  hidden: boolean;
  // True once this slot has its own sleeve art instead of a stand-in.
  ready: boolean;
}

interface WallRail {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

type LayoutMode = "desktop" | "mobile";

export class ShelfScene {
  private canvas: HTMLCanvasElement;
  private callbacks: ShelfSceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private shelfGroup: THREE.Group | null = null;
  private albums: GameNode[] = [];
  private albumData: Game[];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();
  private frame = 0;
  private disposed = false;
  private started = false;
  private startTime = 0;
  private hovered: GameId | null = null;
  private active: GameId | null = null;
  private mode: LayoutMode = "desktop";
  private width = 1;
  private height = 1;
  private buttons = new Map<GameId, HTMLElement>();
  private openButton: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private videos: HTMLVideoElement[] = [];
  private composer: EffectComposer | null = null;
  private bokeh: BokehPass | null = null;
  private usingComposer = false;
  private dpr = 1;
  private pointerDownAt = 0;
  private hasRendered = false;
  private hoverClearTimer: number | null = null;
  private wheelTarget: HTMLElement | null = null;
  private wallGroup: THREE.Group | null = null;
  private wallCovers: WallCover[] = [];
  private wallCoverTextures: THREE.Texture[] = [];
  private wallCoversRequested = false;
  private wallRails: WallRail[] = [];
  private wallRailCount = 0;
  private wallRailShadowMap: THREE.Texture | null = null;
  private rackRailShadowMap: THREE.Texture | null = null;
  // The featured collection rack. While it is framed, a resize re-fits the
  // rack instead of the last category wall.
  private panoramaRack: CollectionRack | null = null;
  private panoramaFramed = false;
  // Where the zoomed-out camera looks and how far it pulls back. The panorama
  // frames the shelf plus the rows above it; a category wall is only two rows,
  // so it needs to sit centred and closer.
  private wallFocusY = 2.2;
  private wallDistanceScale = 0.62;
  // Last framed wall, so a resize or DPR change can re-fit it.
  private wallFramePoints: { x: number; y: number }[] = [];
  private wallFrameLowestY = -0.65;
  private finishTextures: THREE.Texture[] = [];
  private albumShadowTexture: THREE.CanvasTexture | null = null;
  private albumShadowMaterial: THREE.MeshBasicMaterial | null = null;
  // A4-A9: Reuse Vector3 to avoid per-frame allocations
  private tempVector3 = new THREE.Vector3();
  private backdropTexture: THREE.Texture | null = null;
  private backdrop: THREE.Mesh | null = null;
  private wallShadowMaterial: THREE.MeshBasicMaterial | null = null;
  private shelfWallMaterial: THREE.MeshBasicMaterial | null = null;
  private shelfBoardMaterial: THREE.MeshBasicMaterial | null = null;
  private zoom = 0;
  private zoomTarget = 0;
  private zoomUiState = false;
  private backgroundColor = new THREE.Color("#e4e4e2");
  // B3: Wall switching state
  private currentWallId: WallCategoryId = "featured";
  private requestedWallId: WallCategoryId | null = null;
  private wallSwitchInProgress = false;
  private wallSwitchDuration = 600; // milliseconds
  private wallFade = 1;
  private wallLoadPromise: Promise<void> | null = null;
  private featuredHidden = false;
  constructor(canvas: HTMLCanvasElement, albumData: Game[], callbacks: ShelfSceneCallbacks = {}) {
    this.canvas = canvas;
    this.albumData = albumData;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    const themedBackground = getComputedStyle(document.documentElement)
      .getPropertyValue("--page-bg")
      .trim();
    if (themedBackground) this.backgroundColor.set(themedBackground);
    this.renderer.setClearColor(this.backgroundColor, 1);
    this.scene.background = this.backgroundColor;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.camera = new THREE.PerspectiveCamera(20, 1, 0.2, 100);
    this.camera.position.set(0, 0.05, 14.37);
    this.camera.lookAt(0, 0.05, 0);

    this.backdropTexture = createBackdropTexture();
    if (this.backdropTexture) {
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 80),
        new THREE.MeshBasicMaterial({
          map: this.backdropTexture,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      backdrop.position.set(0, 0, -12);
      backdrop.renderOrder = -10;
      this.backdrop = backdrop;
      this.scene.add(backdrop);
    }

    this.scene.add(this.root);
    this.root.position.set(0, 0.1, 0.5);

    this.bindEvents();
    this.resize();
    this.init();
    this.startLoop();
  }

  private bindEvents() {
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.wheelTarget = this.canvas.parentElement?.parentElement?.parentElement ?? this.canvas;
    this.wheelTarget.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onWheel = (event: WheelEvent) => {
    if (this.mode !== "desktop" || this.active) return;
    if (
      event.target instanceof Element &&
      event.target.closest(".sfe-header, .sfe-search, .sfe-search-layer, .sfe-mobile-menu, input, textarea, select")
    ) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey) return; // Keep the browser's pinch-to-zoom gesture.
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    const next = THREE.MathUtils.clamp(this.zoomTarget + delta * 0.0011, 0, 1);
    if (next === this.zoomTarget) return;
    this.zoomTarget = next;
    if (next > 0.06) this.setHovered(null);
    this.updateButtonVisibility();
    this.syncZoomUi();
  };

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.active) return;
    if (this.zoom > 0.1 || this.zoomTarget > 0.1) {
      this.setHovered(null);
      return;
    }
    const hit = this.pick();
    this.setHovered(hit?.album.id ?? null);
  };

  private onPointerLeave = () => {
    if (this.active) return;
    if (this.hoverClearTimer) window.clearTimeout(this.hoverClearTimer);
    this.hoverClearTimer = window.setTimeout(() => {
      this.hoverClearTimer = null;
      this.setHovered(null);
    }, 140);
  };

  setOverlayHover(id: GameId | null) {
    if (this.active || this.zoom > 0.1 || this.zoomTarget > 0.1) return;
    if (this.hoverClearTimer) {
      window.clearTimeout(this.hoverClearTimer);
      this.hoverClearTimer = null;
    }
    if (id) {
      this.setHovered(id);
    } else {
      this.hoverClearTimer = window.setTimeout(() => {
        this.hoverClearTimer = null;
        this.setHovered(null);
      }, 140);
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = performance.now();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (performance.now() - this.pointerDownAt > 700) return;
    if (this.zoom > 0.1 || this.zoomTarget > 0.1) {
      this.zoomTarget = 0;
      this.syncZoomUi();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = this.pick();
    if (this.active) {
      if (!hit || hit.album.id !== this.active) this.callbacks.onOutsideClick?.();
      return;
    }
    if (hit) this.callbacks.onAlbumClick?.(hit.album.id);
  };

  private setHovered(id: GameId | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    const now = performance.now();
    for (const node of this.albums) {
      node.hoverFrom = node.hover;
      node.hoverTarget = node.album.id === id ? 1 : 0;
      node.hoverStartedAt = now;
      node.hoverDuration = node.hoverTarget ? HOVER_LIFT_DURATION : HOVER_DROP_DURATION;
      node.rotationFrom = node.rotationHover;
      node.rotationTarget = node.hoverTarget;
      node.rotationStartedAt = now;
      node.rotationDuration = node.hoverTarget ? HOVER_LIFT_DURATION : HOVER_DROP_DURATION;
      node.rotationDelay = node.hoverTarget ? 0 : HOVER_ROTATION_DROP_DELAY;
    }
    this.callbacks.onHover?.(id);
    document.body.style.cursor = id ? "pointer" : "";
    this.updateButtonVisibility();
  }

  private updateButtonVisibility() {
    for (const [id, el] of this.buttons) {
      const visible =
        !this.active &&
        !this.featuredHidden &&
        this.zoom <= 0.1 &&
        this.zoomTarget <= 0.1 &&
        (this.hovered === id || document.activeElement === el);
      el.style.opacity = visible ? "1" : "0";
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.pointerEvents = visible ? "auto" : "none";
    }
  }

  private pick() {
    if (this.featuredHidden) return null;
    const meshes = this.albums.map((a) => a.cover);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.layers.enableAll();
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const mesh = hits[0].object;
    const node = this.albums.find((a) => a.cover === mesh);
    return node ?? null;
  }

  setButtonElements(map: Map<GameId, HTMLElement>) {
    this.buttons = map;
    this.updateButtonVisibility();
  }

  setOpenButton(el: HTMLElement | null) {
    this.openButton = el;
  }

  setDetailElement(el: HTMLElement | null) {
    this.detailEl = el;
  }

  setActive(id: GameId | null) {
    if (this.active === id) return;
    this.active = id;
    if (id !== null && this.zoomTarget !== 0) {
      this.zoomTarget = 0;
      this.syncZoomUi();
    }
    this.setHovered(null);
    this.updateButtonVisibility();
    this.usingComposer = id !== null;
    this.canvas.dataset.dof = id !== null ? "1" : "0";
  }

  setMode(mode: LayoutMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.updateLayoutMode();
  }

  private updateLayoutMode() {
    if (this.shelfGroup) this.shelfGroup.visible = this.mode === "desktop" && !this.featuredHidden;
    // The room light and sleeve shadows belong to the shelf. The mobile stack
    // sits on the page colour, where the backdrop would end in a hard edge and
    // nine overlapping shadows pile into one dark side.
    if (this.backdrop) this.backdrop.visible = this.mode === "desktop";
    if (this.albumShadowMaterial) {
      this.albumShadowMaterial.visible = this.mode === "desktop" && !this.featuredHidden;
    }
    if (this.mode === "mobile" && this.zoomTarget !== 0) {
      this.zoomTarget = 0;
      this.syncZoomUi();
    }
    if (this.mode === "mobile") {
      this.camera.fov = 25;
      this.camera.zoom = 1.3;
      this.root.position.set(0, -0.01, 0.2);
      for (const node of this.albums) {
        node.base.set(0, 0.565, node.mobileZ);
      }
    } else {
      this.camera.fov = 20;
      this.camera.zoom = 1;
      this.root.position.set(0, 0.1, 0.5);
      for (const node of this.albums) {
        const [x, y, z] = node.album.groupPosition;
        node.base.set(x, y - 0.02, z - 0.08);
      }
    }
    for (const node of this.albums) {
      node.group.position.copy(node.base);
      node.group.rotation.x = this.mode === "mobile" ? -Math.PI / 6 : REST_TILT;
    }
    this.camera.updateProjectionMatrix();
    this.frameCamera();
    if (this.started && this.mode === "desktop") this.scheduleWallCovers();
  }

  private async init() {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    await Promise.all([
      this.loadShelf(loader),
      this.loadAlbums(textureLoader),
    ]);

    this.startTime = performance.now();
    this.started = true;
    this.callbacks.onReady?.();
    this.scheduleWallCovers();
  }

  /**
   * The wall sleeves are only the games not already on the shelf. They are not
   * needed for the first paint, so start fetching them right after the shelf
   * settles. Category walls reuse the same art, and waiting for all of it on a
   * slow link would leave a click with nothing to show.
   */
  private scheduleWallCovers() {
    if (this.wallCoversRequested || this.disposed || this.mode !== "desktop") return;
    this.wallCoversRequested = true;
    const load = () => {
      if (this.mode !== "desktop") {
        this.wallCoversRequested = false;
        return;
      }
      void this.ensureWallTextures();
    };
    window.setTimeout(load, 1000);
  }

  /**
   * Load the panorama sleeve art once. Category walls reuse the same textures,
   * so a switch only has to move and reveal covers that are already in memory.
   */
  private ensureWallTextures() {
    if (!this.wallLoadPromise) {
      this.wallLoadPromise = this.loadWallCovers().catch(() => undefined);
    }
    return this.wallLoadPromise;
  }

  private async loadWallCovers() {
    const loader = new THREE.TextureLoader();
    let cursor = 0;
    const worker = async () => {
      while (!this.disposed && cursor < this.wallCovers.length) {
        const entry = this.wallCovers[cursor++];
        try {
          const texture = await loader.loadAsync(entry.cover);
          if (this.disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          this.wallCoverTextures.push(texture);
          entry.mesh.material.map = texture;
          entry.mesh.material.color.set(0xffffff);
          entry.mesh.material.needsUpdate = true;
          entry.ready = true;
        } catch {
          // Keep the featured-sleeve stand-in for this slot.
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, () => worker()));
  }

  /**
   * The shelf is the original baked room: a wall with the two boards modelled
   * into it, and a lightmap that carries the glow behind the collection and
   * the shadow each board throws onto the wall. Splitting the geometry keeps
   * the boards opaque while the finite wall dissolves into the backdrop as the
   * camera pulls back.
   */
  private async loadShelf(loader: GLTFLoader) {
    try {
      const gltf = await loader.loadAsync(`${ASSET_ROOT}/models/shelf.glb`);
      const shelfNode = gltf.scene.getObjectByName("10Records_ShelfWall") as THREE.Mesh | undefined;
      if (!shelfNode) {
        console.warn("Shelf node not found");
        return;
      }
      const sourceMaterial = shelfNode.material as THREE.MeshStandardMaterial;
      const map = sourceMaterial.map ?? null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
      }
      const source = shelfNode.geometry;
      const index = source.getIndex();
      const positions = source.getAttribute("position");
      const boardTriangles: number[] = [];
      const wallTriangles: number[] = [];
      if (index && positions) {
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i);
          const b = index.getX(i + 1);
          const c = index.getX(i + 2);
          const maxZ = Math.max(positions.getZ(a), positions.getZ(b), positions.getZ(c));
          (maxZ > -0.1 ? boardTriangles : wallTriangles).push(a, b, c);
        }
      }

      const group = new THREE.Group();
      group.position.set(0, -0.52, -1.43);
      group.scale.setScalar(3.5);
      group.visible = this.mode === "desktop";

      const boardGeometry = source.clone();
      if (boardTriangles.length) boardGeometry.setIndex(boardTriangles);
      const boardMaterial = new THREE.MeshBasicMaterial({ map });
      const boards = new THREE.Mesh(boardGeometry, boardMaterial);
      boards.position.set(0, -0.582, 0.119);
      group.add(boards);
      this.shelfBoardMaterial = boardMaterial;

      if (wallTriangles.length) {
        const wallGeometry = source.clone();
        wallGeometry.setIndex(wallTriangles);
        const wallMaterial = new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
        });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.copy(boards.position);
        wall.renderOrder = -5;
        group.add(wall);
        this.shelfWallMaterial = wallMaterial;
      }

      this.shelfGroup = group;
      this.root.add(group);
    } catch (error) {
      console.error("Failed to load shelf", error);
    }
  }

  private async loadRecordGeometry() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(`${ASSET_ROOT}/models/record.glb`);
      const node = gltf.scene.getObjectByName("Record1") as THREE.Mesh | undefined;
      return node?.geometry ?? null;
    } catch {
      return null;
    }
  }

  private async loadAlbums(textureLoader: THREE.TextureLoader) {
    // Start loading the record geometry in parallel with the sleeve textures.
    const recordGeometryPromise = this.loadRecordGeometry();

    this.albumShadowTexture = createAlbumShadowTexture();
    const shadowMaterial = this.albumShadowTexture
      ? new THREE.MeshBasicMaterial({
          map: this.albumShadowTexture,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          toneMapped: false,
        })
      : null;
    if (shadowMaterial) shadowMaterial.visible = this.mode === "desktop";
    this.albumShadowMaterial = shadowMaterial;
    const shadowGeometry = new THREE.PlaneGeometry(
      ALBUM_SIZE * ALBUM_SHADOW_SCALE,
      ALBUM_SIZE * ALBUM_SHADOW_SCALE,
    );

    const [loaded, recordGeometry] = await Promise.all([
      Promise.all(
        this.albumData.map(async (album) => {
          try {
            const [coverTexture, backTexture] = await Promise.all([
              textureLoader.loadAsync(album.cover),
              textureLoader.loadAsync(album.back),
            ]);
            coverTexture.colorSpace = THREE.SRGBColorSpace;
            backTexture.colorSpace = THREE.SRGBColorSpace;
            coverTexture.anisotropy = 8;
            backTexture.anisotropy = 8;
            coverTexture.generateMipmaps = true;
            backTexture.generateMipmaps = true;
            return { album, coverTexture, backTexture };
          } catch {
            return null;
          }
        }),
      ),
      recordGeometryPromise,
    ]);

    const wallTextures: THREE.Texture[] = [];
    for (let index = 0; index < loaded.length; index++) {
      const entry = loaded[index];
      if (!entry) continue;
      const { album, coverTexture, backTexture } = entry;
      wallTextures.push(coverTexture);
      const group = new THREE.Group();
      const [x, y, z] = album.groupPosition;
      const mobileZ = 0.75 - index * 0.15;
      const base = new THREE.Vector3(x, y - 0.02, z - 0.08);
      const baseZ = this.mode === "mobile" ? mobileZ : z;
      group.position.copy(base);
      if (this.mode === "mobile") {
        base.set(0, 0.565, mobileZ);
        group.position.copy(base);
      }
      group.rotation.x = this.mode === "mobile" ? -Math.PI / 6 : REST_TILT;

      if (shadowMaterial) {
        const dropShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        // The baked key light sits to the right, so the sleeve throws its
        // shadow into the gap on its left, a touch low.
        dropShadow.position.set(-0.075, -0.035, -0.02);
        dropShadow.renderOrder = -1;
        group.add(dropShadow);
      }

      const material = createCoverMaterial(coverTexture);

      const cover = new THREE.Mesh(new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE), material);
      cover.position.z = 0.002;
      group.add(cover);

      const backMaterial = createCoverMaterial(backTexture);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE), backMaterial);
      const backGroup = new THREE.Group();
      backGroup.rotation.y = Math.PI;
      backGroup.position.z = -0.003;
      backGroup.add(back);
      group.add(backGroup);

      let record: THREE.Mesh;
      if (recordGeometry) {
        record = new THREE.Mesh(
          recordGeometry,
          new THREE.MeshBasicMaterial({ color: new THREE.Color(album.bgColor) }),
        );
        record.scale.setScalar(3.5);
        record.position.z = 0;
        record.scale.z = 0.04;
      } else {
        record = new THREE.Mesh(
          new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(album.bgColor) }),
        );
        record.position.z = 0;
        record.scale.z = 0.04;
      }
      group.add(record);

      this.root.add(group);

      const node: GameNode = {
        album,
        group,
        cover,
        back,
        backMaterial,
        record,
        material,
        base,
        hover: 0,
        hoverFrom: 0,
        hoverTarget: 0,
        hoverStartedAt: 0,
        hoverDuration: HOVER_LIFT_DURATION,
        rotationHover: 0,
        rotationFrom: 0,
        rotationTarget: 0,
        rotationStartedAt: 0,
        rotationDuration: HOVER_LIFT_DURATION,
        rotationDelay: 0,
        scaleT: 0,
        baseZ,
        mobileZ,
        staticTexture: coverTexture,
      };
      this.albums.push(node);

      if (album.video) {
        this.attachVideo(node, album.video, coverTexture);
      }
    }

    this.buildWall(wallTextures);
    void this.loadCoverFinish(textureLoader);
    this.frameCamera();
  }

  private async loadCoverFinish(loader: THREE.TextureLoader) {
    try {
      const [roughness, plasticNormal] = await Promise.all([
        loader.loadAsync(`${ASSET_ROOT}/textures/roughness.webp`),
        loader.loadAsync(`${ASSET_ROOT}/textures/plastic-normal.webp`),
      ]);
      if (this.disposed) {
        roughness.dispose();
        plasticNormal.dispose();
        return;
      }
      roughness.colorSpace = THREE.NoColorSpace;
      plasticNormal.colorSpace = THREE.NoColorSpace;
      roughness.wrapS = roughness.wrapT = THREE.ClampToEdgeWrapping;
      plasticNormal.wrapS = plasticNormal.wrapT = THREE.ClampToEdgeWrapping;
      roughness.anisotropy = 4;
      plasticNormal.anisotropy = 4;
      this.finishTextures.push(roughness, plasticNormal);
      for (const node of this.albums) {
        node.material.uniforms.uRoughnessMap.value = roughness;
        node.material.uniforms.uPlasticNormalMap.value = plasticNormal;
        node.material.uniforms.uPlasticWrapIntensity.value = 0.16;
        node.backMaterial.uniforms.uRoughnessMap.value = roughness;
        node.backMaterial.uniforms.uPlasticNormalMap.value = plasticNormal;
        node.backMaterial.uniforms.uPlasticWrapIntensity.value = 0.16;
      }
    } catch (error) {
      console.warn("Album finish textures could not be loaded", error);
    }
  }

  /**
   * The wider collection wall that appears when the camera pulls back. It sits
   * just behind the featured shelves, on rails aligned with the existing ones,
   * so zooming out reads as the two shelves growing into a full wall.
   */
  private buildWall(textures: THREE.Texture[]) {
    if (!textures.length || this.wallGroup) return;

    const group = new THREE.Group();
    const spacing = 1.34;
    const wallZ = -1.36;
    // The covers lean back, so the top edge sits further away than the centre.
    // Keep the whole sleeve in front of the wall plane instead of letting its
    // top half slip behind the backdrop.
    const coverZ = wallZ + 0.2;
    // The wider wall shares the featured sleeves' shadow so the two read as
    // one collection under one light. All its covers reveal together, so one
    // material can carry the fade.
    const coverShadowMaterial = this.albumShadowTexture
      ? new THREE.MeshBasicMaterial({
          map: this.albumShadowTexture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        })
      : null;
    this.wallShadowMaterial = coverShadowMaterial;
    const coverShadowGeometry = new THREE.PlaneGeometry(
      ALBUM_SIZE * ALBUM_SHADOW_SCALE,
      ALBUM_SIZE * ALBUM_SHADOW_SCALE,
    );
    const featured = this.albumData.map((album) => ({
      id: album.id,
      x: album.groupPosition[0],
      y: album.groupPosition[1],
      cover: album.cover,
    }));
    // Every other owned game fills the rack around the shelf, on the shelf's
    // own stagger, nearest the shelf first.
    const extras = games.filter(
      (game) => game.status === "owned" && !featured.some((slot) => slot.id === game.id),
    );
    const rack = layoutCollectionRack(featured, extras.length, {
      spacing,
      columns: RACK_COLUMNS,
      rowsAbove: RACK_ROWS_ABOVE,
      rowsBelow: RACK_ROWS_BELOW,
    });
    this.panoramaRack = rack;

    const homes: {
      id: GameId;
      x: number;
      y: number;
      cover: string;
      hidden: boolean;
    }[] = featured.map((slot) => ({
      id: slot.id,
      x: slot.x,
      y: slot.y,
      cover: slot.cover,
      // The featured sleeves are already on the shelf; their wall copy only
      // appears on a category wall, where the shelf is hidden.
      hidden: true,
    }));
    extras.forEach((game, index) => {
      const slot = rack.slots[index];
      if (!slot) return;
      homes.push({
        id: game.id,
        x: slot.x,
        y: slot.y,
        cover: game.cover,
        hidden: false,
      });
    });

    for (const [index, home] of homes.entries()) {
      const texture = textures[index % textures.length];
      const tint = 0xf4 + ((index * 7) % 4) * 2;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(`rgb(${tint}, ${tint}, ${tint})`),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE), material);
      mesh.position.set(home.x, home.y - 0.02, coverZ);
      mesh.rotation.x = REST_TILT;
      mesh.visible = false;
      if (coverShadowMaterial) {
        const shadow = new THREE.Mesh(coverShadowGeometry, coverShadowMaterial);
        shadow.position.set(-0.075, -0.035, -0.02);
        shadow.renderOrder = -1;
        mesh.add(shadow);
      }
      group.add(mesh);

      this.wallCovers.push({
        mesh,
        baseZ: coverZ,
        slug: home.id,
        cover: home.cover,
        home: new THREE.Vector3(home.x, home.y - 0.02, coverZ),
        hidden: home.hidden,
        ready: false,
      });
    }

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 256;
    shadowCanvas.height = 64;
    const context = shadowCanvas.getContext("2d")!;
    context.scale(256, 64);
    const gradient = context.createRadialGradient(0.5, 0.1, 0, 0.5, 0.1, 0.6);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.22)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1, 1);
    this.wallRailShadowMap = new THREE.CanvasTexture(shadowCanvas);

    // The rack's boards run off both edges of the screen, so their shadow is a
    // band that only fades toward the far ends instead of a centred pool.
    const rackShadowCanvas = document.createElement("canvas");
    rackShadowCanvas.width = 256;
    rackShadowCanvas.height = 64;
    const rackContext = rackShadowCanvas.getContext("2d")!;
    const band = rackContext.createLinearGradient(0, 0, 0, 64);
    band.addColorStop(0, "rgba(0,0,0,0.5)");
    band.addColorStop(0.45, "rgba(0,0,0,0.2)");
    band.addColorStop(1, "rgba(0,0,0,0)");
    rackContext.fillStyle = band;
    rackContext.fillRect(0, 0, 256, 64);
    rackContext.globalCompositeOperation = "destination-in";
    const ends = rackContext.createLinearGradient(0, 0, 256, 0);
    ends.addColorStop(0, "rgba(0,0,0,0)");
    ends.addColorStop(0.15, "rgba(0,0,0,1)");
    ends.addColorStop(0.85, "rgba(0,0,0,1)");
    ends.addColorStop(1, "rgba(0,0,0,0)");
    rackContext.fillStyle = ends;
    rackContext.fillRect(0, 0, 256, 64);
    this.rackRailShadowMap = new THREE.CanvasTexture(rackShadowCanvas);

    group.visible = false;
    this.wallGroup = group;
    this.root.add(group);

    this.syncWallRails(this.rackRailRows(rack));
    this.framePanorama(rack);

    // A category can be clicked before the panorama finishes initialising.
    if (this.requestedWallId) {
      const pending = this.requestedWallId;
      this.requestedWallId = null;
      void this.setWall(pending);
    }
  }

  /**
   * Rails follow the rows that actually hold a cover. A fixed eleven-wide board
   * looked right for the old forty-four-cover panorama and wrong the moment the
   * wall only showed the collection.
   */
  private railRowsFor(points: { x: number; y: number }[]) {
    const rows = new Map<number, { y: number; minX: number; maxX: number }>();
    for (const point of points) {
      const key = Math.round(point.y * 100);
      const row = rows.get(key);
      if (row) {
        row.minX = Math.min(row.minX, point.x);
        row.maxX = Math.max(row.maxX, point.x);
      } else {
        rows.set(key, { y: point.y, minX: point.x, maxX: point.x });
      }
    }
    return [...rows.values()]
      .sort((a, b) => a.y - b.y)
      .map((row) => ({
        y: row.y,
        width: row.maxX - row.minX + ALBUM_SIZE + 0.36,
      }));
  }

  /**
   * The rack's boards: one per rack row, cut to the rack's own width so the
   * empty slots still sit on a shelf with visible ends.
   */
  private rackRailRows(rack: CollectionRack) {
    const width = rack.maxX - rack.minX + ALBUM_SIZE + 0.36;
    return [...rack.rows]
      .sort((a, b) => a - b)
      .map((y) => ({ y, width, rack: true }));
  }

  private syncWallRails(rows: { y: number; width: number; rack?: boolean }[]) {
    const group = this.wallGroup;
    if (!group) return;
    const wallZ = -1.36;
    for (let index = 0; index < rows.length; index++) {
      let rail = this.wallRails[index];
      if (!rail) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.045, 0.52),
          new THREE.MeshBasicMaterial({
            color: 0xf1f1f1,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        mesh.visible = false;
        group.add(mesh);
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 0.8),
          new THREE.MeshBasicMaterial({
            map: this.wallRailShadowMap,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        shadow.renderOrder = -1;
        shadow.visible = false;
        group.add(shadow);
        rail = { mesh, shadow };
        this.wallRails[index] = rail;
      }
      const shadowMap = rows[index].rack ? this.rackRailShadowMap : this.wallRailShadowMap;
      if (rail.shadow.material.map !== shadowMap) {
        rail.shadow.material.map = shadowMap;
        rail.shadow.material.needsUpdate = true;
      }
      rail.mesh.scale.x = rows[index].width;
      if (rows[index].rack) {
        const nominalTop = rows[index].y - RACK_BOARD_DROP;
        const boardTop = FEATURED_BOARD_TOPS.find((top) => Math.abs(top - nominalTop) < 0.1);
        const top = boardTop === undefined ? nominalTop : boardTop - 0.0015;
        rail.mesh.scale.y = RACK_BOARD_THICKNESS / 0.045;
        rail.mesh.scale.z = RACK_BOARD_DEPTH / 0.52;
        rail.mesh.position.set(0, top - RACK_BOARD_THICKNESS / 2, RACK_BOARD_CENTER_Z);
      } else {
        rail.mesh.scale.y = 1;
        rail.mesh.scale.z = 1;
        rail.mesh.position.set(0, rows[index].y - 0.63, wallZ + 0.33);
      }
      rail.shadow.scale.x = rows[index].width + 0.6;
      rail.shadow.position.set(0, rows[index].y - 1.02, wallZ - 0.4);
    }
    this.wallRailCount = rows.length;
  }

  /**
   * Frame the whole rack at full zoom: the entire grid inside the view, air
   * around it, and the camera centred on the rack rather than on the covers
   * that happen to fill it.
   */
  private framePanorama(rack: CollectionRack) {
    this.panoramaFramed = true;
    this.wallFramePoints = [];
    const baseZ = this.defaultCameraZ();
    const tanV = Math.tan(THREE.MathUtils.degToRad(20) / 2);
    const tanH = tanV * (this.width / this.height);
    const halfWidth = Math.max(Math.abs(rack.minX), Math.abs(rack.maxX)) + ALBUM_SIZE / 2;
    const halfHeight = (rack.maxY - rack.minY) / 2 + ALBUM_SIZE / 2;
    const distance = Math.max(
      halfWidth / (RACK_FILL_X * tanH),
      halfHeight / (RACK_FILL_Y * tanV),
    );
    const cameraZ = distance + WALL_COVER_WORLD_Z;
    // The dolly adds 0.05 on its own; the rack lives inside the raised root.
    this.wallFocusY = (rack.maxY + rack.minY) / 2 + DESKTOP_ROOT_Y - 0.05;
    this.wallDistanceScale = THREE.MathUtils.clamp((cameraZ / baseZ - 1) / 1.55, 0.02, 3);
  }

  /**
   * Frame whatever the wall currently holds: centre the rows vertically and pull
   * the camera back only as far as the covers need, so a two-cover category and
   * a fifteen-cover collection both fill the view without cropping.
   */
  private frameWall(points: { x: number; y: number }[], lowestY: number) {
    this.panoramaFramed = false;
    this.wallFramePoints = points;
    this.wallFrameLowestY = lowestY;
    const baseZ = this.defaultCameraZ();
    const tanV = Math.tan(THREE.MathUtils.degToRad(20) / 2);
    const tanH = tanV * (this.width / this.height);

    if (!points.length) {
      this.wallFocusY = 2.2;
      this.wallDistanceScale = 0.62;
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const top = maxY + ALBUM_SIZE / 2;
    const bottom = lowestY - ALBUM_SIZE / 2;
    const width = maxX - minX + ALBUM_SIZE;
    const height = top - bottom;
    const neededZ = Math.max(
      (height * 1.35) / (2 * tanV),
      (width * 1.25) / (2 * tanH),
      baseZ * 1.05,
    );
    const wallZ = baseZ * 2.55;
    const z = Math.min(neededZ, wallZ);
    this.wallFocusY = (top + bottom) / 2 - 0.05;
    this.wallDistanceScale = THREE.MathUtils.clamp((z / baseZ - 1) / 1.55, 0.02, 1);
  }

  private updateWall() {
    const group = this.wallGroup;
    if (this.shelfWallMaterial) {
      // Hand the room over to the backdrop before its edges come into the
      // wider view. Only the wall fades; the boards stay solid.
      this.shelfWallMaterial.opacity = 1 - THREE.MathUtils.smoothstep(this.zoom, 0.04, 0.4);
      this.shelfWallMaterial.visible = this.shelfWallMaterial.opacity > 0.001;
    }
    if (this.shelfBoardMaterial) {
      // The rack's full-width boards use the featured boards' profile. Once
      // they are fully in, hand the featured rows over to them so the two ends
      // do not read as a second board sitting on the rack.
      const opacity = this.panoramaFramed
        ? 1 - THREE.MathUtils.smoothstep(this.zoom, 0.26, 0.4)
        : 1;
      const transparent = opacity < 0.999;
      if (this.shelfBoardMaterial.transparent !== transparent) {
        this.shelfBoardMaterial.transparent = transparent;
        this.shelfBoardMaterial.needsUpdate = true;
      }
      this.shelfBoardMaterial.opacity = opacity;
      this.shelfBoardMaterial.visible = opacity > 0.001;
    }
    if (!group) return;
    const visible = this.mode === "desktop" && this.zoom > 0.004;
    group.visible = visible;
    if (!visible) return;

    // The whole wall arrives together. Staggering each sleeve by distance made
    // the first half-turn of the scroll look like covers were still loading.
    const coverReveal = THREE.MathUtils.smoothstep(this.zoom, 0.02, 0.26);
    for (const cover of this.wallCovers) {
      const ready = !this.featuredHidden || cover.ready;
      cover.mesh.visible = !cover.hidden && ready && coverReveal > 0.001 && this.wallFade > 0.001;
      cover.mesh.material.opacity = coverReveal * this.wallFade;
      cover.mesh.scale.setScalar(0.92 + coverReveal * 0.08);
      cover.mesh.position.z = cover.baseZ - (1 - coverReveal) * 0.22;
    }
    if (this.wallShadowMaterial && this.albumShadowMaterial) {
      this.wallShadowMaterial.opacity = this.albumShadowMaterial.opacity * coverReveal;
    }
    const railReveal = THREE.MathUtils.smoothstep(this.zoom, 0.02, 0.26);
    this.wallRails.forEach((rail, index) => {
      const on = index < this.wallRailCount && railReveal > 0.001;
      rail.mesh.visible = on;
      rail.mesh.material.opacity = railReveal * this.wallFade;
      rail.shadow.visible = on;
      rail.shadow.material.opacity = railReveal * 0.7 * this.wallFade;
    });
  }

  /**
   * B3: Switch to a different category wall with an animated crossfade.
   * The panorama covers stay in memory; a category wall reveals only the
   * sleeves that belong to it, so 4 games read as 4 covers, not a padded wall.
   * Respects prefers-reduced-motion for accessibility.
   */
  public async setWall(wallId: WallCategoryId) {
    if (this.mode !== "desktop") return;
    if (!this.wallGroup) {
      // The wall is built with the album textures; remember the choice and
      // apply it as soon as the panorama exists.
      this.requestedWallId = wallId;
      return;
    }
    this.requestedWallId = wallId;
    if (this.wallSwitchInProgress) return;

    this.wallSwitchInProgress = true;
    this.callbacks.onWallSwitching?.(true);
    try {
      while (this.requestedWallId && this.requestedWallId !== this.currentWallId) {
        const target = this.requestedWallId;
        this.requestedWallId = null;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const duration = reduced ? 0 : this.wallSwitchDuration;

        if (duration > 0) {
          await this.animateWallFade(0, duration * 0.33);
        }
        await this.applyWall(target);
        this.currentWallId = target;
        this.callbacks.onWallChange?.(target);
        if (duration > 0) {
          await this.animateWallFade(1, duration * 0.67);
        } else {
          this.wallFade = 1;
        }
      }
    } finally {
      this.wallSwitchInProgress = false;
      this.callbacks.onWallSwitching?.(false);
    }
  }

  /** Reveal the wide collection wall (used when a category is chosen). */
  public revealWall() {
    if (this.mode !== "desktop") return;
    this.zoomTarget = 1;
    this.updateButtonVisibility();
    this.syncZoomUi();
  }

  /** Return to the featured shelf (used when Featured is chosen). */
  public returnToShelf() {
    if (this.mode !== "desktop") return;
    this.zoomTarget = 0;
    this.updateButtonVisibility();
    this.syncZoomUi();
  }

  private async applyWall(wallId: WallCategoryId) {
    if (wallId === "featured") {
      this.restoreFeaturedWall(false);
      return;
    }

    // The sleeve art keeps loading in the background; each cover appears as
    // soon as its own texture is ready, so a slow link never blocks the switch.
    void this.ensureWallTextures();

    const covers = getWallCovers(wallId);
    const positions = layoutWall(covers.length);
    const bySlug = new Map(this.wallCovers.map((entry) => [entry.slug, entry]));
    for (const entry of this.wallCovers) entry.hidden = true;

    covers.forEach((cover, index) => {
      const entry = bySlug.get(cover.slug);
      const position = positions[index];
      if (!entry || !position) return;
      entry.hidden = false;
      entry.mesh.position.set(position.x, position.y, position.z);
      entry.baseZ = position.z;
    });
    this.syncWallRails(
      this.railRowsFor(
        positions.map((position) => ({ x: position.x, y: position.y })),
      ),
    );
    this.frameWall(positions, Math.min(...positions.map((position) => position.y)));
    this.featuredHidden = true;
    this.updateLayoutMode();
  }

  /** Bring back the shelf with the rest of the collection above it. */
  private restoreFeaturedWall(notify: boolean) {
    this.featuredHidden = false;
    const onShelf = new Set<GameId>(this.albumData.map((album) => album.id));
    for (const cover of this.wallCovers) {
      // The featured sleeves are already on the shelf; hide their wall copy so
      // zooming out never shows the same game twice.
      cover.hidden = onShelf.has(cover.slug as GameId);
      cover.mesh.position.copy(cover.home);
      cover.baseZ = cover.home.z;
    }
    if (this.panoramaRack) {
      this.syncWallRails(this.rackRailRows(this.panoramaRack));
      this.framePanorama(this.panoramaRack);
    }
    this.updateLayoutMode();
    if (notify) {
      this.currentWallId = "featured";
      this.wallFade = 1;
      this.callbacks.onWallChange?.("featured");
    }
  }

  /**
   * Fade the whole wall as one unit. updateWall() multiplies every cover's
   * reveal opacity by wallFade, so individual covers never fade out of sync.
   */
  private animateWallFade(target: number, duration: number) {
    const from = this.wallFade;
    if (duration <= 0) {
      this.wallFade = target;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = () => {
        const progress = Math.min((performance.now() - start) / duration, 1);
        this.wallFade = from + (target - from) * progress;
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private syncZoomUi() {
    const zoomed = this.zoom > 0.05 || this.zoomTarget > 0.05;
    if (zoomed === this.zoomUiState) return;
    this.zoomUiState = zoomed;
    this.callbacks.onZoomChange?.(zoomed ? Math.max(this.zoom, this.zoomTarget) : 0);
  }

  private attachVideo(node: GameNode, url: string, fallback: THREE.Texture) {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    this.videos.push(video);

    node.video = video;

    video.addEventListener(
      "canplay",
      () => {
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        node.videoTexture = texture;
        node.material.uniforms.uMap.value = texture;
        node.material.needsUpdate = true;
        node.videoReady = true;
        video.play().catch(() => {
          node.material.uniforms.uMap.value = fallback;
        });
      },
      { once: true },
    );

    video.addEventListener("error", () => {
      node.material.uniforms.uMap.value = fallback;
    });

    video.load();
  }

  private frameCamera() {
    const aspect = this.width / this.height;
    if (this.mode === "mobile") {
      this.frameMobileCamera();
      return;
    }
    this.camera.fov = 20;
    this.camera.zoom = 1;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * aspect;
    const width = 6.488;
    const height = 3.4;
    const distanceH = width / (2 * tanH);
    const distanceV = height / (2 * tanV);
    const distance = 1.25 * Math.max(distanceH, distanceV);
    const targetZ = 0;
    this.camera.position.set(0, 0.05, distance);
    this.camera.lookAt(0, 0.05, targetZ);
    this.camera.near = Math.max(distance - 6 * 2, 0.1);
    this.camera.far = distance + 6 * 2;
    this.camera.updateProjectionMatrix();
  }

  private frameMobileCamera() {
    this.camera.fov = 25;
    this.camera.zoom = 1.3;
    const center = new THREE.Vector3(0, 0.585, 0.35);
    const distance = 11.34;
    const upDir = new THREE.Vector3(0, 10, 4.2).normalize();
    this.camera.position.copy(center).addScaledVector(upDir, distance);
    this.camera.lookAt(center);
    this.camera.near = 0.2;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.width = Math.max(rect.width, 1);
    this.height = Math.max(rect.height, 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.mode = this.width < 768 ? "mobile" : "desktop";
    this.updateLayoutMode();
    if (this.panoramaFramed && this.panoramaRack) {
      this.framePanorama(this.panoramaRack);
    } else if (this.wallFramePoints.length) {
      this.frameWall(this.wallFramePoints, this.wallFrameLowestY);
    }
    this.composer?.setSize(this.width, this.height);
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(tick);
      this.update();
      this.render();
    };
    this.frame = requestAnimationFrame(tick);
  }

  private update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    const introElapsed = this.started ? now - this.startTime : -1;

    for (let i = 0; i < this.albums.length; i++) {
      const node = this.albums[i];
      // Category walls replace the featured shelf; the owned sleeves come
      // back with the featured wall.
      node.group.visible = !this.featuredHidden;
      const isActive = this.active === node.album.id;
      const isHovered = this.hovered === node.album.id && !this.active;

      const hoverElapsed = THREE.MathUtils.clamp(
        (now - node.hoverStartedAt) / node.hoverDuration,
        0,
        1,
      );
      const hoverProgress = node.hoverTarget
        ? 1 - Math.pow(1 - hoverElapsed, 4)
        : Math.pow(hoverElapsed, 4);
      node.hover = THREE.MathUtils.lerp(node.hoverFrom, node.hoverTarget, hoverProgress);
      const rotationElapsed = THREE.MathUtils.clamp(
        (now - node.rotationStartedAt - node.rotationDelay) / node.rotationDuration,
        0,
        1,
      );
      const rotationProgress = node.rotationTarget
        ? 1 - Math.pow(1 - rotationElapsed, 4)
        : Math.pow(rotationElapsed, 4);
      node.rotationHover = THREE.MathUtils.lerp(
        node.rotationFrom,
        node.rotationTarget,
        rotationProgress,
      );

      if (this.started) {
        const stagger = this.mode === "mobile" ? 161 : 75;
        const delay = i * stagger;
        const t = THREE.MathUtils.clamp((introElapsed - delay) / 400, 0, 1);
        node.scaleT = 1 - Math.pow(1 - t, 3);
      }

      const target = this.tempVector3;
      if (isActive) {
        if (this.mode === "mobile") {
          target.set(0, 0.7, 2.35);
        } else {
          target.set(0, DETAIL_Y, DETAIL_Z);
        }
      } else if (node.hover > 0.001) {
        target.copy(node.base);
        target.y += node.album.hoverOffset * node.hover;
        target.z += 0.06 * node.hover;
      } else {
        target.copy(node.base);
      }

      const lambda = isActive ? 5.2 : 14;
      node.group.position.x = THREE.MathUtils.damp(node.group.position.x, target.x, lambda, dt);
      node.group.position.y = THREE.MathUtils.damp(node.group.position.y, target.y, lambda, dt);
      node.group.position.z = THREE.MathUtils.damp(node.group.position.z, target.z, lambda, dt);

      let targetRotX: number;
      if (isActive) {
        targetRotX = this.mode === "mobile" ? 0 : 0;
      } else {
        const restTilt = this.mode === "mobile" ? -Math.PI / 6 : REST_TILT;
        targetRotX = THREE.MathUtils.lerp(restTilt, 0, node.rotationHover);
      }
      node.group.rotation.x = THREE.MathUtils.damp(
        node.group.rotation.x,
        targetRotX,
        isActive ? 6.5 : 16,
        dt,
      );
      const targetScale = node.scaleT * (isActive && this.mode === "mobile" ? 1.15 : 1);
      const scale = THREE.MathUtils.damp(node.group.scale.x, targetScale, 8, dt);
      node.group.scale.setScalar(scale);
      node.material.uniforms.uOpacity.value = THREE.MathUtils.clamp(node.scaleT * 1.4, 0, 1);

      const hiddenByDomDetail = isActive && this.mode === "desktop";
      node.cover.visible = !hiddenByDomDetail;
      node.back.visible = !hiddenByDomDetail;
      node.record.visible = !hiddenByDomDetail;
      if (node.video && node.videoReady) {
        if (isHovered || isActive) {
          if (node.videoTexture) {
            node.material.uniforms.uMap.value = node.videoTexture;
            node.material.needsUpdate = true;
          }
          if (node.video.paused) void node.video.play().catch(() => {});
        } else {
          if (!node.video.paused) node.video.pause();
          if (node.material.uniforms.uMap.value !== node.staticTexture) {
            node.material.uniforms.uMap.value = node.staticTexture;
            node.material.needsUpdate = true;
          }
        }
      }
    }

    // Zoom the whole shelf out to reveal the collection wall.
    const zoomLambda = this.zoomTarget > this.zoom ? 4 : 5.5;
    this.zoom = THREE.MathUtils.damp(this.zoom, this.zoomTarget, zoomLambda, dt);
    if (Math.abs(this.zoom - this.zoomTarget) < 0.0004) this.zoom = this.zoomTarget;
    this.syncZoomUi();

    // Scrolling back up returns to the shelf, so the featured wall comes back
    // with it and the index never highlights a wall the shelf cannot show.
    if (
      this.mode === "desktop" &&
      this.currentWallId !== "featured" &&
      !this.wallSwitchInProgress &&
      this.zoomTarget <= 0.01 &&
      this.zoom <= 0.02
    ) {
      this.restoreFeaturedWall(true);
    }

    // Camera dolly for details / wall zoom
    if (this.mode === "desktop") {
      const baseZ = this.defaultCameraZ();
      // Reach the wall's framing well before the wheel bottoms out, otherwise a
      // half-zoomed wall is both cropped and off-centre.
      const wallEase = THREE.MathUtils.smoothstep(this.zoom, 0.02, 0.55);
      const targetZ = this.active
        ? 14.373
        : baseZ * (1 + wallEase * 1.55 * this.wallDistanceScale);
      const targetY = this.active
        ? 0.086
        : 0.05 + wallEase * this.wallFocusY;
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetZ, 4.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetY, 4.5, dt);
      this.camera.lookAt(0, this.camera.position.y, 0);
      this.camera.near = 0.2;
      this.camera.far = 140;
      this.camera.updateProjectionMatrix();
    }

    this.updateWall();
    this.updateOverlayPositions();
  }

  private defaultCameraZ() {
    const aspect = this.width / this.height;
    const tanV = Math.tan(THREE.MathUtils.degToRad(20) / 2);
    const tanH = tanV * aspect;
    return 1.25 * Math.max(6.488 / (2 * tanH), 3.4 / (2 * tanV));
  }

  private updateOverlayPositions() {
    const width = this.width;
    const height = this.height;
    this.root.updateMatrixWorld(true);
    for (const node of this.albums) {
      const el = this.buttons.get(node.album.id);
      if (!el) continue;
      if (this.active || this.featuredHidden) {
        el.style.visibility = "hidden";
        continue;
      }
      const point = new THREE.Vector3(
        0,
        -0.45 + (node.album.buttonsOffset ?? 0),
        0.2,
      ).applyMatrix4(node.group.matrixWorld);
      point.project(this.camera);
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.zIndex = String(Math.round(1000 + (10 - node.group.position.z) * 100));
    }

    if (this.active) {
      const node = this.albums.find((a) => a.album.id === this.active);
      if (node) {
        const half = ALBUM_SIZE / 2;
        const corners = [
          [-half, -half],
          [half, -half],
          [half, half],
          [-half, half],
        ].map(([x, y]) => {
          const p = new THREE.Vector3(x, y, 0.002).applyMatrix4(node.group.matrixWorld);
          p.project(this.camera);
          return {
            x: (p.x * 0.5 + 0.5) * width,
            y: (-p.y * 0.5 + 0.5) * height,
          };
        });
        const left = Math.min(...corners.map((c) => c.x));
        const right = Math.max(...corners.map((c) => c.x));
        const top = Math.min(...corners.map((c) => c.y));
        const bottom = Math.max(...corners.map((c) => c.y));
        if (this.detailEl) {
          this.detailEl.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
          this.detailEl.style.width = `${(right - left).toFixed(1)}px`;
          this.detailEl.style.height = `${(bottom - top).toFixed(1)}px`;
        }
        if (this.openButton) {
          const point = new THREE.Vector3(0, -0.73, 0.2).applyMatrix4(node.group.matrixWorld);
          point.project(this.camera);
          const x = (point.x * 0.5 + 0.5) * width;
          const y = (-point.y * 0.5 + 0.5) * height;
          this.openButton.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
      }
    }
  }

  private render() {
    if (!this.started) return;
    if (this.usingComposer) {
      this.renderer.setClearColor(this.backgroundColor, 1);
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bokeh = new BokehPass(this.scene, this.camera, {
          focus: 7.2,
          aperture: 0.00026,
          maxblur: 0.008,
        });
        this.composer.addPass(this.bokeh);
        this.composer.addPass(new OutputPass());
        this.composer.setSize(this.width, this.height);
      }
      if (this.bokeh) {
        const node = this.albums.find((a) => a.album.id === this.active);
        if (node) {
          const uniforms = this.bokeh.uniforms as Record<string, THREE.IUniform>;
          this.tempVector3.setFromMatrixPosition(node.group.matrixWorld);
          const distance = this.camera.position.distanceTo(this.tempVector3);
          uniforms.focus.value = THREE.MathUtils.damp(
            uniforms.focus.value as number,
            distance,
            6,
            0.016,
          );
          uniforms.maxblur.value = 0.008;
        }
      }
      this.composer.render();
    } else {
      this.renderer.setClearColor(this.backgroundColor, 1);
      this.renderer.render(this.scene, this.camera);
    }
    if (!this.hasRendered) {
      this.hasRendered = true;
      this.callbacks.onFirstFrame?.();
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.wheelTarget?.removeEventListener("wheel", this.onWheel);
    this.wheelTarget = null;
    for (const video of this.videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    this.videos = [];
    for (const texture of this.finishTextures) texture.dispose();
    this.finishTextures = [];
    this.albumShadowTexture?.dispose();
    this.albumShadowTexture = null;
    this.albumShadowMaterial?.dispose();
    this.albumShadowMaterial = null;
    this.backdropTexture?.dispose();
    this.backdropTexture = null;
    for (const texture of this.wallCoverTextures) texture.dispose();
    this.wallCoverTextures = [];
    this.shelfWallMaterial = null;
    this.shelfBoardMaterial = null;
    this.wallShadowMaterial = null;
    this.backdrop = null;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

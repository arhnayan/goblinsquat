import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { getColors } from "./theme";
import { createIsoCamera, resizeIsoCamera } from "./camera";

export type GameScene = {
  scene: Scene;
  camera: ReturnType<typeof createIsoCamera>;
  renderer: WebGLRenderer;
  applyTheme: () => void;
};

export function createGameScene(host: HTMLElement): GameScene {
  const scene = new Scene();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const camera = createIsoCamera(window.innerWidth / window.innerHeight);

  const hemi = new HemisphereLight(0x6a5848, 0x1c1812, 1.35);
  scene.add(hemi);

  const sun = new DirectionalLight(0xffecd4, 1.2);
  sun.position.set(10, 16, 7);
  scene.add(sun);

  const fog = new FogExp2(0x1c1812, 0.02);
  scene.fog = fog;

  const applyTheme = () => {
    const c = getColors();
    scene.background = new Color(c.void);
    fog.color.setHex(c.void);
    renderer.setClearColor(c.void, 1);
    hemi.color.setHex(c.sky);
    hemi.groundColor.setHex(c.void);
    sun.color.setHex(c.sun);
  };
  applyTheme();

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeIsoCamera(camera, window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  return { scene, camera, renderer, applyTheme };
}

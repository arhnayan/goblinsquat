import { OrthographicCamera, Vector2, Vector3 } from "three";

const FRUSTUM = 11.5;
const OFFSET = new Vector3(16, 16, 16);
const mouse = new Vector2(0, 0);
const look = new Vector3();
const pan = new Vector3();
const prevCam = new Vector3();
const sway = new Vector2(0, 0);
const lean = new Vector2(0, 0);
let camReady = false;

export type HudMotion = {
  swayX: number;
  swayY: number;
  leanX: number;
  leanY: number;
};

export function createIsoCamera(aspect: number): OrthographicCamera {
  const camera = new OrthographicCamera(
    -FRUSTUM * aspect,
    FRUSTUM * aspect,
    FRUSTUM,
    -FRUSTUM,
    0.1,
    120,
  );
  camera.position.copy(OFFSET);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function resizeIsoCamera(
  camera: OrthographicCamera,
  width: number,
  height: number,
): void {
  const aspect = width / Math.max(height, 1);
  camera.left = -FRUSTUM * aspect;
  camera.right = FRUSTUM * aspect;
  camera.top = FRUSTUM;
  camera.bottom = -FRUSTUM;
  camera.updateProjectionMatrix();
}

export function bindCameraPan(): void {
  window.addEventListener("pointermove", (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.set(x, y);
  });
}

export function followIsoCamera(
  camera: OrthographicCamera,
  target: Vector3,
  dt: number,
): void {
  look.lerp(target, 1 - Math.exp(-dt * 6.5));
  pan.set(mouse.x * 1.4, 0, mouse.y * 1.4);
  camera.position.copy(look).add(OFFSET).add(pan);
  camera.lookAt(look);

  if (!camReady) {
    prevCam.copy(camera.position);
    camReady = true;
    return;
  }

  const dx = camera.position.x - prevCam.x;
  const dz = camera.position.z - prevCam.z;
  prevCam.copy(camera.position);

  sway.x += (-dx + dz) * 11;
  sway.y += (dx + dz) * 5.5;
  const decay = Math.exp(-dt * 4.2);
  sway.x *= decay;
  sway.y *= decay;

  const targetLeanX = mouse.x * 5.5;
  const targetLeanY = mouse.y * -4.5;
  const lk = 1 - Math.exp(-dt * 7);
  lean.x += (targetLeanX - lean.x) * lk;
  lean.y += (targetLeanY - lean.y) * lk;
}

export function getHudMotion(): HudMotion {
  return {
    swayX: sway.x,
    swayY: sway.y,
    leanX: lean.x,
    leanY: lean.y,
  };
}

export function resetHudMotion(): void {
  sway.set(0, 0);
  lean.set(0, 0);
  camReady = false;
}

import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
  type Camera,
  type Scene as ThreeScene,
} from "three";

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
varying vec2 vUv;

float bayer4(vec2 p) {
  vec2 i = mod(floor(p), 4.0);
  mat4 m = mat4(
    0.0, 12.0, 3.0, 15.0,
    8.0, 4.0, 11.0, 7.0,
    2.0, 14.0, 1.0, 13.0,
    10.0, 6.0, 9.0, 5.0
  );
  return m[int(i.x)][int(i.y)] / 16.0;
}

vec3 toSrgb(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(0.454545));
}

vec3 toLinear(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(2.2));
}

void main() {
  vec2 texel = 1.0 / resolution;
  float r = texture2D(tDiffuse, vUv + vec2(texel.x * 0.55, 0.0)).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - vec2(texel.x * 0.55, 0.0)).b;
  vec3 col = toSrgb(vec3(r, g, b));
  col *= 1.16;
  col += (bayer4(gl_FragCoord.xy) - 0.5) * 0.028;
  col = floor(col * 22.0 + 0.5) / 22.0;
  float scan = 1.0 - 0.03 * step(0.5, fract(vUv.y * resolution.y * 0.5));
  col *= scan;
  vec2 vc = vUv * 2.0 - 1.0;
  col *= 1.0 - dot(vc, vc) * 0.05;
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

export type PixelPass = {
  enabled: boolean;
  toggle: () => boolean;
  render: (scene: ThreeScene, camera: Camera) => void;
  dispose: () => void;
};

export function createPixelPass(renderer: WebGLRenderer): PixelPass {
  const INTERNAL_H = 432;
  let enabled = true;
  const res = new Vector2(1, 1);

  const rt = new WebGLRenderTarget(1, 1, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    type: HalfFloatType,
    colorSpace: LinearSRGBColorSpace,
    depthBuffer: true,
  });

  const geo = new BufferGeometry();
  geo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geo.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
  );
  const mat = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      resolution: { value: res },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(geo, mat);
  const blitScene = new Scene();
  blitScene.add(quad);
  const blitCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fit = () => {
    const aspect = Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1);
    const h = INTERNAL_H;
    const w = Math.max(1, Math.round(h * aspect));
    rt.setSize(w, h);
    res.set(w, h);
  };
  fit();
  window.addEventListener("resize", fit);

  const render = (scene: ThreeScene, camera: Camera) => {
    if (!enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(blitScene, blitCam);
  };

  const toggle = () => {
    enabled = !enabled;
    return enabled;
  };

  const dispose = () => {
    window.removeEventListener("resize", fit);
    rt.dispose();
    geo.dispose();
    mat.dispose();
  };

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v: boolean) {
      enabled = v;
    },
    toggle,
    render,
    dispose,
  };
}

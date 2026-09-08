import { loadFont } from "./game/glyphs";
import { bindCameraPan, followIsoCamera } from "./game/camera";
import { createGameScene } from "./game/scene";
import { createHud } from "./game/hud";
import { createGame } from "./game/game";
import { applyCssVars, cycleTheme } from "./game/theme";
import { createPixelPass } from "./game/pixel";

async function boot() {
  applyCssVars();
  const hud = createHud();
  const status = document.getElementById("status");
  if (status) status.textContent = "loading";
  const { scene, camera, renderer, applyTheme } = createGameScene(
    document.body,
  );
  const font = await loadFont();
  bindCameraPan();
  const game = createGame(scene, font, hud);
  const pixel = createPixelPass(renderer);
  followIsoCamera(camera, game.player.follow.position, 10);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyF") {
      e.preventDefault();
      pixel.toggle();
      return;
    }
    if (e.code === "KeyC") {
      e.preventDefault();
      cycleTheme();
      applyTheme();
      game.retint();
    }
  });

  let last = performance.now();
  let elapsed = 0;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    game.update(dt, elapsed, camera);
    pixel.render(scene, camera);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

boot().catch((err) => {
  console.error(err);
  const status = document.getElementById("status");
  if (status) status.textContent = "failed to load dungeon";
});

// In-page snippets for review-general-fullsets.ts; each one runs inside the game page against the live Phaser scene.
import { PALETTE } from "../src/presentation";

export const POSES = [["idle", 4], ["walk", 4], ["attack", 4], ["hit", 3], ["death", 3]] as const;
export const DIRECTIONS = ["front", "side", "back"] as const;
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
export const MEASURE = `(sprite => { const b = sprite.getBounds(); return { texture: sprite.texture.key, frame: sprite.frame.name, scaleX: sprite.scaleX, scaleY: sprite.scaleY,
  width: b.width, height: b.height, logical: [sprite.frame.realWidth, sprite.frame.realHeight],
  source: [sprite.frame.cutWidth, sprite.frame.cutHeight] }; })`;
/** Stops the game loop on the first rendered frame in which the commander shows the wanted attack frame. */
export const commanderFrame = (actor: string, cells: readonly number[]) => `new Promise((resolve, reject) => {
  const game = __fullsetGame, scene = game.scene.getScene("castle"), deadline = performance.now() + 120000;
  const wanted = ${JSON.stringify(cells)};
  const watch = () => {
    const sprite = scene.troops[0]?.leader.sprite, key = sprite?.texture.key ?? "";
    if (key === "ally-sheet-${actor}" && wanted.includes(Number(sprite.frame.name))) game.events.once("postrender", () => {
      game.loop.sleep();
      const box = game.canvas.getBoundingClientRect(), css = box.width / scene.scale.width;
      resolve({ ...${MEASURE}(sprite), seconds: castleSample.snapshot().time, screen: { x: box.x + sprite.x * css, y: box.y + sprite.y * css } });
    });
    else if (performance.now() > deadline) reject(new Error("The commander never showed sheet cell ${cells.join("/")}: " + key + " " + sprite?.frame.name));
    else scene.events.once("postupdate", watch);
  };
  scene.events.once("postupdate", watch);
})`;
/** Fields a boss beside the commander in the live run and stops the game loop on the first rendered frame of its attack contact. */
export const bossContact = (boss: string, kind: string, pattern: string, id: number) => `new Promise((resolve, reject) => {
  const game = __fullsetGame, scene = game.scene.getScene("castle"), run = castleSample.snapshot(), deadline = performance.now() + 90000;
  const leader = run.squads[0], model = run.enemyUnits.find(enemy => !enemy.boss && enemy.kind !== "ship");
  if (!model) return reject(new Error("No enemy to model the boss on"));
  run.enemyUnits.push({ ...model, id: ${id}, kind: "${kind}", boss: true, elite: false, bossArt: "${boss}", pattern: "${pattern}", ladder: false,
    x: leader.x + 34, y: leader.y, hp: 1e6, maxHp: 1e6, appearedAt: run.time, stun: 0, casting: 0, strikeAt: 0 });
  run.metrics.bosses.push({ art: "${boss}", final: false, appeared: run.time, fallen: null, phase2: null, dealt: 0 });
  const watch = () => {
    const sprite = scene.foes.get(${id}), key = sprite?.texture.key ?? "";
    if (key.startsWith("boss-sheet-${boss}") && Number(sprite.frame.name) % 18 === 6) game.events.once("postrender", () => {
      game.loop.sleep();
      const box = game.canvas.getBoundingClientRect(), css = box.width / scene.scale.width;
      resolve({ ...${MEASURE}(sprite), screen: { x: box.x + sprite.x * css, y: box.y + sprite.y * css } });
    });
    else if (performance.now() > deadline) reject(new Error("${boss} never showed its attack contact frame: " + key));
    else scene.events.once("postupdate", watch);
  };
  scene.events.once("postupdate", watch);
})`;
/** Freezes the scene and installs __fullsetLineup(bodies, page) and __fullsetStance(strike); returns the screen area the line-up occupies. */
export const LINEUP = `(() => {
  const game = __fullsetGame, scene = game.scene.getScene("castle");
  scene.update = () => {}; scene.sys.sceneUpdate = () => {};
  const current = { ...castleSample.snapshot(), enemies: [], shots: [], time: 1 };
  const W = scene.scale.width, top = scene.scale.height * .17, pitch = 76, props = [];
  const label = (x, y, text) => props.push(scene.add.text(x, y, text, { fontFamily: "DNFBitBitv2", fontSize: "12px",
    color: ${JSON.stringify(hex(PALETTE.silverLight))}, stroke: ${JSON.stringify(hex(PALETTE.outline))}, strokeThickness: 3 }).setOrigin(.5, 1).setDepth(1e6));
  const directions = ${JSON.stringify(DIRECTIONS)}, names = { front: "앞", side: "옆", back: "뒤" };
  window.__fullsetLineup = (bodies, page) => {
    for (const prop of props.splice(0)) prop.destroy();
    const column = W / bodies.length, members = [];
    directions.forEach((direction, row) => label(9, top + row * pitch - 8, names[direction]));
    bodies.forEach((body, i) => {
      const x = column * (i + .5);
      label(x, top - 52, body.general);
      directions.forEach((direction, row) => {
        const y = top + row * pitch;
        const unit = { ...current.squads[0], id: 700000 + page * 100 + i * 10 + row, general: body.general, kind: "general", x, y,
          strikeAt: 0, soldiers: [], quarry: undefined, aim: undefined };
        const trooper = scene.recruitTrooper(body.base, unit);
        props.push(trooper.sprite); members.push({ body, direction, unit, x, y, trooper });
      });
    });
    window.__fullsetStance = strike => members.map(({ body, direction, unit, x, y, trooper }) => {
      const [dx, dy] = direction === "side" ? [60, 0] : direction === "front" ? [0, 60] : [0, -60];
      trooper.motion.x = x; trooper.motion.y = y; trooper.motion.sampledAt = -1; trooper.motion.direction = direction;
      trooper.aimX = x + dx; trooper.aimY = y + dy; trooper.strikeAt = strike ? scene.time.now : -1e9;
      scene.pose(trooper, unit, current, false);
      if (!strike) trooper.sprite.anims.pause(trooper.sprite.anims.currentAnim.frames[0]);
      const bounds = trooper.sprite.getBounds();
      return { actor: body.actor, direction, ...${MEASURE}(trooper.sprite), anchor: { feet: bounds.bottom - y, centre: bounds.centerX - x } };
    });
  };
  const box = game.canvas.getBoundingClientRect(), css = box.width / W;
  return { x: 0, y: box.y + (top - 72) * css, width: 390, height: (2 * pitch + 104) * css };
})()`;
/** Per set: every registered animation with the frames it really plays, and the lowest opaque row of each frame (the foot line). */
export const setChecks = (actors: readonly string[]) => `(() => {
  const scene = __fullsetGame.scene.getScene("castle"), probe = scene.add.sprite(-200, -200, "__DEFAULT").setVisible(false);
  const canvas = document.createElement("canvas"); canvas.width = 56; canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const result = {};
  for (const actor of ${JSON.stringify(actors)}) {
    const poses = [], feet = {}, heights = {};
    for (const direction of ${JSON.stringify(DIRECTIONS)}) for (const [pose, count] of ${JSON.stringify(POSES)}) {
      const key = "ally-full-" + actor + "-" + direction + "-" + pose, animation = scene.anims.get(key), observed = new Set();
      probe.anims.stop(); probe.play(key);
      for (let tick = 0; tick < 100; tick++) { probe.anims.update(tick * 16, 16); observed.add(probe.frame.name); }
      poses.push({ key, count, registered: animation.frames.length, observed: observed.size });
      feet[direction + "_" + pose] = animation.frames.map(frame => {
        context.clearRect(0, 0, 56, 64); context.drawImage(frame.frame.source.image, frame.frame.cutX, frame.frame.cutY, 56, 64, 0, 0, 56, 64);
        const pixels = context.getImageData(0, 0, 56, 64).data; let low = -1, high = 64;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 56; x++) if (pixels[(y * 56 + x) * 4 + 3]) { low = y; high = Math.min(high, y); }
        if (pose === "idle" && direction === "front") (heights.frontIdle ??= []).push(low - high + 1);
        return low;
      });
    }
    result[actor] = { poses, feet, heights };
  }
  probe.destroy();
  return result;
})()`;
/** 8x sheet of one set as base64 PNG: rows front/side/back, columns idle 4, walk 4, attack 4, hit 3, death 3. */
export const sheet = (actor: string) => `(() => {
  const scene = __fullsetGame.scene.getScene("castle"), canvas = document.createElement("canvas"), scale = 8, band = 40;
  canvas.width = 18 * 56 * scale; canvas.height = 3 * (64 * scale + band);
  const context = canvas.getContext("2d"); context.imageSmoothingEnabled = false;
  context.fillStyle = ${JSON.stringify(hex(PALETTE.silver))}; context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "24px DNFBitBitv2"; context.textBaseline = "middle";
  ${JSON.stringify(DIRECTIONS)}.forEach((direction, row) => {
    const y = row * (64 * scale + band); let column = 0;
    context.fillStyle = ${JSON.stringify(hex(PALETTE.outline))}; context.fillRect(0, y, canvas.width, band);
    for (const [pose, count] of ${JSON.stringify(POSES)}) {
      context.fillStyle = ${JSON.stringify(hex(PALETTE.silverLight))};
      context.fillText(direction + " " + pose + " " + count, column * 56 * scale + 12, y + band / 2);
      for (const { frame } of scene.anims.get("ally-full-${actor}-" + direction + "-" + pose).frames)
        context.drawImage(frame.source.image, frame.cutX, frame.cutY, 56, 64,
          column++ * 56 * scale, y + band, 56 * scale, 64 * scale);
    }
  });
  return canvas.toDataURL("image/png").split(",")[1];
})()`;

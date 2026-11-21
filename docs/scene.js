import { createWingRig } from "./wing-rig.js";

const scene = document.querySelector("#scene");
const creature = document.querySelector("#creature");
const canvas = document.querySelector("#rig");
const texture = document.querySelector("#texture");
const motion = document.querySelector("#motion");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
let paused = reduced.matches, pointer = null, rig, frame = 0, last = 0, time = 0;
let x, y, targetX, targetY, grabX, grabY, angle = 0;
let width, height, halfW, halfH, topLimit, bottomLimit;

function layout() {
  const sx = width ? scene.clientWidth/width : 1;
  const sy = height ? scene.clientHeight/height : 1;
  if (x !== undefined) {
    x *= sx; targetX *= sx;
    y *= sy; targetY *= sy;
  }
  width = scene.clientWidth;
  height = scene.clientHeight;
  // Use layout dimensions; the bounding box includes the bank rotation.
  halfW = creature.offsetWidth / 2;
  halfH = creature.offsetHeight / 2;
  const top = document.querySelector("header").getBoundingClientRect().bottom;
  const bottom = document.querySelector("footer").getBoundingClientRect().top;
  topLimit = Math.min(height / 2, top + halfH*.84);
  bottomLimit = Math.max(topLimit, bottom - halfH*.84);
  const ratio = Math.min(2, devicePixelRatio);
  canvas.width = Math.ceil(halfW*2*ratio);
  canvas.height = Math.ceil(halfH*2*ratio);
  targetX = clamp((targetX ?? width*.54), halfW, width-halfW);
  targetY = clamp((targetY ?? height*.52), topLimit, bottomLimit);
  x = clamp(x ?? targetX, halfW, width-halfW);
  y = clamp(y ?? targetY, topLimit, bottomLimit);
  draw(0);
}

function draw(dt) {
  if (!paused) time += dt;
  const phase = time * 2*Math.PI / 7.2;
  const drifting = !paused && pointer === null;
  const dx = clamp(targetX + (drifting ? Math.sin(phase)*Math.min(width*.025, 24) : 0), halfW, width-halfW) - x;
  const dy = clamp(targetY + (drifting ? Math.sin(phase*2-.6)*Math.min(height*.018, 12) : 0), topLimit, bottomLimit) - y;
  const follow = reduced.matches ? 1 : 1-Math.exp(-dt*23);
  x += dx*follow;
  y += dy*follow;
  const lean = paused ? 0 : clamp(dy*.075 + dx*.018 + Math.sin(phase)*1.8, -8, 8);
  angle += (lean-angle)*(reduced.matches ? 1 : 1-Math.exp(-dt*8));
  creature.style.transform = 'translate3d('+ (x-halfW).toFixed(2)+'px,'+(y-halfH).toFixed(2)+'px,0) rotate('+angle.toFixed(2)+'deg)';
  rig?.(phase, angle/8);
}

function tick(now) {
  frame = 0;
  if (document.hidden) return;
  const dt = last ? Math.min((now-last)/1000, .05) : 1/60;
  last = now;
  draw(dt);
  if (!paused || Math.abs(x-targetX)+Math.abs(y-targetY)>.05 || Math.abs(angle)>.02) queue();
}
function queue() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }
function setTarget(px, py) {
  targetX = clamp(px, halfW, width-halfW);
  targetY = clamp(py, topLimit, bottomLimit);
  queue();
}
function setPaused(value) {
  paused = value;
  motion.textContent = paused ? "Play flight" : "Pause flight";
  if (paused) { targetX = x; targetY = y; }
  last = 0;
  queue();
}
creature.addEventListener("pointerdown", event => {
  if (pointer !== null || event.button !== 0 || !event.isPrimary) return;
  const rect = scene.getBoundingClientRect();
  pointer = event.pointerId;
  grabX = event.clientX-rect.left-x; grabY = event.clientY-rect.top-y;
  targetX = x; targetY = y;
  creature.setPointerCapture(pointer);
  creature.dataset.held = "";
  creature.focus({preventScroll:true});
  queue();
});
creature.addEventListener("pointermove", event => {
  if (event.pointerId !== pointer) return;
  const rect = scene.getBoundingClientRect();
  setTarget(event.clientX-rect.left-grabX, event.clientY-rect.top-grabY);
});
function release(event) {
  if (event.pointerId !== pointer) return;
  pointer = null;
  delete creature.dataset.held;
  queue();
}
for (const type of ["pointerup","pointercancel","lostpointercapture"]) creature.addEventListener(type, release);
const directions = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
creature.addEventListener("keydown", event => {
  if (!(event.key in directions)) return;
  event.preventDefault();
  const [dx,dy] = directions[event.key], step = event.shiftKey ? 60 : 24;
  setTarget(targetX+dx*step,targetY+dy*step);
});
motion.addEventListener("click", () => setPaused(!paused));
reduced.addEventListener("change", () => setPaused(reduced.matches));
document.addEventListener("visibilitychange", () => { last = 0; queue(); });
canvas.addEventListener("webglcontextlost", event => {
  event.preventDefault(); rig = null; creature.classList.remove("rigged");
});
function prepareRig() {
  try { rig = createWingRig(canvas, texture); } catch { rig = null; }
  creature.classList.toggle("rigged", Boolean(rig));
  layout(); queue();
}
canvas.addEventListener("webglcontextrestored", prepareRig);
new ResizeObserver(layout).observe(scene);
motion.hidden = false;
layout();
setPaused(paused);
texture.decode().then(prepareRig);

/* =====================================================
   AKASA AIR RACE (ENDLESS)  -  edit the CONFIG block to change the game
   Fly as far as you can. Score = distance + rings. Highest score wins.
   ===================================================== */
const CONFIG = {
  // ---- Your images (inside the "images" folder) ----
  planeImage:      "images/akasa-b737.png",   // transparent PNG
  planeImageFacing: "up",                     // which way the nose points in YOUR picture: "up" (top view) or "right" (side view, gets turned to face north)
  obstacleImages:  ["images/air-india.png", "images/indigo.png"],   // oncoming flights (add more files here if you like)
  obstacleImageFacing: "up",                  // which way the nose points in YOUR pictures: "up" or "right" (they are turned to face you)
  backgroundImage: "images/background.png",   // tall picture, top edge must join bottom edge (seamless)
  resultImage:     "images/result.png",       // picture in the crash popup

  // ---- Sizes ----
  planeSize:    110,       // length of the aircraft on screen
  obstacleSize: 110,       // length of the oncoming flights on screen

  // ---- Endless run: the game gets harder slowly the further you fly ----
  rampDistance:  5000,     // metres until full difficulty (bigger = slower rise)
  baseSpeed:     6,        // starting speed
  maxSpeed:      10.5,     // speed at full difficulty
  oncomingSpeed: [1.5, 3.2], // how fast oncoming flights rush at you at the start
  oncomingExtra: 2.0,      // extra speed they gain at full difficulty
  obstacleGap:   [260, 460], // distance between oncoming flights at the start (smaller = harder)
  gapShrink:     0.4,      // how much closer they come at full difficulty (0.4 = 40% closer)

  // ---- Boost, lives, steering ----
  boostSpeed:   5,         // extra speed while boosting
  boostDrain:   0.6,       // boost used per frame (lower = lasts longer)
  boostPerRing: 28,        // boost gained per ring (meter holds 100)
  hearts:       3,         // lives
  heartEvery:   [9000, 15000], // how far you fly between heart pickups (bigger = rarer)
  steerAccel:   0.7,       // how quickly the aircraft starts moving sideways (lower = smoother)
  steerFriction:0.9,       // how quickly it stops (higher = floatier)
  steerMax:     6.5,       // top sideways speed

  // ---- Colours (used when no background image) ----
  skyTop: "#1d2b64", skyBottom: "#f8a15a", accent: "#ff6a13"
};

/* ---------------- Setup ---------------- */
const C = document.getElementById("game"), ctx = C.getContext("2d"), W = C.width, H = C.height;
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function load(src) {
  const i = new Image(); i.ok = false;
  if (src) { i.onload = () => (i.ok = true); i.src = src; }
  return i;
}
const planeImg = load(CONFIG.planeImage), bgImg = load(CONFIG.backgroundImage);
const obsImgs = CONFIG.obstacleImages.map((s) => load(s));
const resImg = $("resImg");
if (CONFIG.resultImage) { resImg.onload = () => (resImg.style.display = "block"); resImg.src = CONFIG.resultImage; }

let best = 0;
try { best = Number(localStorage.getItem("akasaEndlessBest")) || 0; } catch (e) {}
$("bestMenu").textContent = best;

/* ---------------- State ---------------- */
let state = "menu", plane, dist, speed = 5, frame, boost, boosting = false, hearts, combo, ringScore;
let obstacles, rings, pickups, trail, floaters, sinceObs, sinceRing, sinceHeart, nextObs, nextRing, nextHeart;
let shake, invuln, cd, bgY = 0, padL = false, padR = false;
const keys = {};
const blocks = Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, 1600), w: rand(30, 80), h: rand(30, 80) }));
const clouds = Array.from({ length: 7 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(.6, 1.4) }));

const difficulty = () => Math.min(1, dist / CONFIG.rampDistance);   // 0 at the start, 1 at full difficulty
const score = () => ringScore + Math.floor(dist);                   // distance + ring points
const level = () => 1 + Math.floor(dist / 500);

function reset() {
  const L = CONFIG.planeSize;
  let wd = L * 0.9;
  if (planeImg.ok) wd = CONFIG.planeImageFacing === "right" ? L * planeImg.height / planeImg.width : L * planeImg.width / planeImg.height;
  plane = { x: W / 2, y: H * 0.72, vx: 0, w: wd, h: L };
  dist = 0; speed = CONFIG.baseSpeed; frame = 0; boost = 40; hearts = CONFIG.hearts; combo = 0; ringScore = 0;
  obstacles = []; rings = []; pickups = []; trail = []; floaters = []; shake = 0; invuln = 0;
  sinceObs = 0; sinceRing = 0; sinceHeart = 0; nextObs = 500; nextRing = 700; nextHeart = rand(CONFIG.heartEvery[0], CONFIG.heartEvery[1]);
}
reset();

/* ---------------- Controls ---------------- */
// Hold the left or right half of the screen (multi-touch works, so both thumbs can be used)
const ptr = {};
const side = (e) => { const r = C.getBoundingClientRect(); return e.clientX - r.left < r.width / 2 ? -1 : 1; };
C.addEventListener("pointerdown", (e) => { ptr[e.pointerId] = side(e); });
C.addEventListener("pointermove", (e) => { if (e.pointerId in ptr) ptr[e.pointerId] = side(e); });
["pointerup", "pointercancel", "pointerleave"].forEach((t) => C.addEventListener(t, (e) => { delete ptr[e.pointerId]; }));
function steer() {
  padL = !!(keys.ArrowLeft || keys.KeyA); padR = !!(keys.ArrowRight || keys.KeyD);
  for (const k in ptr) { if (ptr[k] < 0) padL = true; else padR = true; }
  return (padR ? 1 : 0) - (padL ? 1 : 0);
}
const boostOn = (e) => { e.preventDefault(); boosting = true; }, boostOff = () => (boosting = false);
$("boostBtn").addEventListener("pointerdown", boostOn);
["pointerup", "pointerleave", "pointercancel"].forEach((t) => $("boostBtn").addEventListener(t, boostOff));
window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;   // let players type their name
  keys[e.code] = true;
  if (["Space", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "Space") { if (state === "menu" || state === "done") startGame(); else boosting = true; }
  if (e.code === "ShiftLeft") boosting = true;
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; if (e.code === "Space" || e.code === "ShiftLeft") boostOff(); });
$("playBtn").addEventListener("click", startGame);
$("retryBtn").addEventListener("click", startGame);

function startGame() {
  if (window.Leaderboard && !Leaderboard.hasName()) { Leaderboard.askName(true); return; }
  reset(); cd = 180; state = "countdown";
  for (const k in ptr) delete ptr[k];
  $("menu").classList.add("hidden"); $("result").classList.add("hidden");
  $("boostBtn").style.display = "block";
}

/* ---------------- Game events ---------------- */
function endRace() {
  state = "done"; boosting = false; $("boostBtn").style.display = "none";
  const s = score(), isBest = s > best;
  if (isBest) { best = s; try { localStorage.setItem("akasaEndlessBest", s); } catch (e) {} }
  $("resTitle").textContent = isBest && s > 0 ? "New high score!" : "Crashed out";
  $("resDist").textContent = Math.floor(dist) + " m";
  $("resScore").textContent = s;
  $("resBest").textContent = best;
  $("bestMenu").textContent = best;
  $("result").classList.remove("hidden");
  if (window.Leaderboard) Leaderboard.onRaceEnd(s, 0);
}

function hit() {
  hearts--; combo = 0; speed *= 0.45; boost = Math.max(0, boost - 20); shake = 18; invuln = 100;
  if (hearts <= 0) endRace();
}

function spawnObstacle() {
  const k = Math.floor(Math.random() * CONFIG.obstacleImages.length);   // random airline
  const L = CONFIG.obstacleSize * rand(.9, 1.15), im = obsImgs[k];
  let w = L * .9;
  if (im && im.ok) w = CONFIG.obstacleImageFacing === "right" ? L * im.height / im.width : L * im.width / im.height;
  const y = -L;
  let x;
  for (let t = 0; t < 6; t++) {
    x = rand(w / 2 + 10, W - w / 2 - 10);
    if (!rings.some((r) => Math.abs(r.y - y) < 260 && Math.abs(r.x - x) < 140)) break;
  }
  const extra = rand(CONFIG.oncomingSpeed[0], CONFIG.oncomingSpeed[1]) + CONFIG.oncomingExtra * difficulty();
  obstacles.push({ x, y, w, h: L, k, extra, vx: Math.random() < .25 ? rand(-.7, .7) : 0 });
}

function spawnRings() {
  const base = rand(110, W - 110);
  for (let i = 0; i < 4; i++) rings.push({ x: clamp(base + Math.sin(i * 1.1) * 60, 70, W - 70), y: -60 - i * 120, r: 48, done: false, got: false });
}

function spawnHeart() {
  let x = rand(70, W - 70);
  for (let t = 0; t < 6; t++) {
    x = rand(70, W - 70);
    if (!obstacles.some((o) => Math.abs(o.y + 40) < 220 && Math.abs(o.x - x) < 130)) break;
  }
  pickups.push({ x, y: -40, done: false });
}

/* ---------------- Update ---------------- */
function update() {
  bgY += speed * 0.35;
  if (state === "countdown") { if (--cd <= 0) state = "racing"; return; }
  if (state !== "racing") return;
  frame++;
  const d = difficulty(), wantBoost = boosting && boost > 0;

  const target = CONFIG.baseSpeed + (CONFIG.maxSpeed - CONFIG.baseSpeed) * d + (wantBoost ? CONFIG.boostSpeed : 0);
  speed += (target - speed) * 0.05;
  if (wantBoost) boost = Math.max(0, boost - CONFIG.boostDrain);

  // smooth sideways steering (speeds up and slows down gradually)
  plane.vx = (plane.vx + steer() * CONFIG.steerAccel) * CONFIG.steerFriction;
  plane.vx = clamp(plane.vx, -CONFIG.steerMax, CONFIG.steerMax);
  plane.x += plane.vx;
  const m = plane.w / 2 + 8;
  if (plane.x < m || plane.x > W - m) { plane.x = clamp(plane.x, m, W - m); plane.vx = 0; }
  if (invuln > 0) invuln--;
  if (shake > 0) shake--;

  // spawning (never stops - the run is endless, and flights come closer together as you go)
  sinceObs += speed; sinceRing += speed; sinceHeart += speed;
  if (sinceObs >= nextObs) { spawnObstacle(); sinceObs = 0; nextObs = rand(CONFIG.obstacleGap[0], CONFIG.obstacleGap[1]) * (1 - CONFIG.gapShrink * d); }
  if (sinceRing >= nextRing) { spawnRings(); sinceRing = 0; nextRing = rand(1100, 1600); }
  if (sinceHeart >= nextHeart) { spawnHeart(); sinceHeart = 0; nextHeart = rand(CONFIG.heartEvery[0], CONFIG.heartEvery[1]); }

  obstacles.forEach((o) => { o.y += speed + o.extra; o.x += o.vx; if (o.x < o.w / 2 + 10 || o.x > W - o.w / 2 - 10) o.vx *= -1; });
  rings.forEach((r) => { r.y += speed; });
  pickups.forEach((p) => { p.y += speed; });
  obstacles = obstacles.filter((o) => o.y < H + o.h);
  rings = rings.filter((r) => r.y < H + 80);

  // hit an oncoming flight?
  if (!invuln) for (const o of obstacles) {
    const hitX = Math.abs(o.x - plane.x) < o.w * .32 + plane.w * .3;
    const hitY = Math.abs(o.y - plane.y) < o.h * .4 + plane.h * .4;
    if (hitX && hitY) { hit(); if (state === "done") return; break; }
  }

  // rings
  rings.forEach((r) => {
    if (r.done || r.y < plane.y) return;
    r.done = true;
    if (Math.abs(plane.x - r.x) < r.r * .9) {
      r.got = true; combo++;
      const mult = Math.min(combo, 8); ringScore += 100 * mult; boost = Math.min(100, boost + CONFIG.boostPerRing);
      floaters.push({ x: r.x, y: r.y, t: 45, txt: "+" + 100 * mult });
    } else combo = 0;
  });

  // hearts: +1 life (or +300 points if your lives are full)
  pickups.forEach((p) => {
    if (p.done) return;
    if (Math.abs(p.y - plane.y) < 34 + plane.h * .35 && Math.abs(p.x - plane.x) < 34 + plane.w * .35) {
      p.done = true;
      if (hearts < CONFIG.hearts) { hearts++; floaters.push({ x: p.x, y: p.y, t: 45, txt: "+1 life" }); }
      else { ringScore += 300; floaters.push({ x: p.x, y: p.y, t: 45, txt: "+300" }); }
    }
  });
  pickups = pickups.filter((p) => !p.done && p.y < H + 60);

  // effects
  trail.push({ x: plane.x, y: plane.y + plane.h / 2 - 4, l: 1, b: wantBoost });
  trail.forEach((p) => { p.y += speed; p.l -= 0.03; });
  trail = trail.filter((p) => p.l > 0);
  floaters.forEach((f) => { f.y -= 1; f.t--; });
  floaters = floaters.filter((f) => f.t > 0);

  dist += speed / 10;
}

/* ---------------- Drawing ---------------- */
function drawBg() {
  if (bgImg.ok) {
    const h = bgImg.height * (W / bgImg.width), y0 = ((bgY % h) + h) % h;
    for (let y = y0 - h; y < H; y += h) ctx.drawImage(bgImg, 0, y, W, h);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, CONFIG.skyTop); g.addColorStop(1, CONFIG.skyBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(20,8,40,.35)";
  blocks.forEach((b) => ctx.fillRect(b.x, (((b.y + bgY * .6) % 1600) + 1600) % 1600 - 200, b.w, b.h));
  ctx.fillStyle = "rgba(255,255,255,.16)";
  clouds.forEach((c) => {
    const y = (((c.y + bgY * .9 * c.s) % (H + 200)) + H + 200) % (H + 200) - 100, r = 24 * c.s;
    ctx.beginPath(); ctx.arc(c.x, y, r, 0, 7); ctx.arc(c.x + r, y + 5, r * .8, 0, 7); ctx.arc(c.x - r, y + 6, r * .7, 0, 7); ctx.fill();
  });
}

function drawObstacle(o) {
  const im = obsImgs[o.k];
  ctx.save(); ctx.translate(o.x, o.y);
  if (im && im.ok) {
    // turned around so the nose points at you
    if (CONFIG.obstacleImageFacing === "right") { ctx.rotate(Math.PI / 2); ctx.drawImage(im, -o.h / 2, -o.w / 2, o.h, o.w); }
    else { ctx.rotate(Math.PI); ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h); }
  } else {
    // placeholder flights (red = first image, blue = second) until your pictures are added
    ctx.rotate(Math.PI);
    ctx.fillStyle = "#fff4e8"; ctx.beginPath(); ctx.ellipse(0, 0, o.w * .13, o.h / 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = o.k % 2 ? "#1b3a8c" : "#c8102e";
    ctx.beginPath(); ctx.moveTo(-o.w / 2, o.h * .12); ctx.lineTo(0, -o.h * .1); ctx.lineTo(o.w / 2, o.h * .12); ctx.lineTo(0, o.h * .2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-o.w * .22, o.h / 2); ctx.lineTo(0, o.h * .3); ctx.lineTo(o.w * .22, o.h / 2); ctx.fill();
  }
  ctx.restore();
}

function drawPlane() {
  if (invuln > 0 && Math.floor(invuln / 6) % 2) return;
  ctx.save(); ctx.translate(plane.x, plane.y); ctx.rotate(plane.vx * 0.04);   // banks into the turn
  if (boosting && boost > 0 && state === "racing") {
    ctx.fillStyle = "rgba(255,160,40,.9)"; ctx.beginPath();
    ctx.moveTo(-8, plane.h / 2 - 6); ctx.lineTo(0, plane.h / 2 + 30 + Math.random() * 20); ctx.lineTo(8, plane.h / 2 - 6); ctx.fill();
  }
  if (planeImg.ok) {
    if (CONFIG.planeImageFacing === "right") { ctx.rotate(-Math.PI / 2); ctx.drawImage(planeImg, -plane.h / 2, -plane.w / 2, plane.h, plane.w); }
    else ctx.drawImage(planeImg, -plane.w / 2, -plane.h / 2, plane.w, plane.h);
  } else {
    ctx.fillStyle = "#fff4e8"; ctx.beginPath(); ctx.ellipse(0, 0, plane.w * .13, plane.h / 2, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-plane.w / 2, plane.h * .12); ctx.lineTo(0, -plane.h * .1); ctx.lineTo(plane.w / 2, plane.h * .12); ctx.lineTo(0, plane.h * .2); ctx.fill();
    ctx.fillStyle = CONFIG.accent; ctx.beginPath();
    ctx.moveTo(-plane.w * .22, plane.h / 2); ctx.lineTo(0, plane.h * .3); ctx.lineTo(plane.w * .22, plane.h / 2); ctx.fill();
  }
  ctx.restore();
}

function drawPad(cx, dir, on) {
  ctx.globalAlpha = on ? .75 : .3; ctx.fillStyle = "#fff4e8";
  ctx.beginPath(); ctx.arc(cx, H - 60, 40, 0, 7); ctx.fill();
  ctx.fillStyle = "#2a1050"; ctx.beginPath();
  ctx.moveTo(cx + dir * 14, H - 60 - 20); ctx.lineTo(cx - dir * 14, H - 60); ctx.lineTo(cx + dir * 14, H - 60 + 20); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.font = "800 24px sans-serif"; ctx.textAlign = "left";
  for (let i = 0; i < CONFIG.hearts; i++) { ctx.fillStyle = i < hearts ? "#ff3b5c" : "rgba(255,255,255,.25)"; ctx.fillText("\u2665", 16 + i * 30, 36); }
  ctx.fillStyle = "#fff4e8"; ctx.font = "800 20px sans-serif"; ctx.fillText("Score " + score(), 16, 64);
  ctx.textAlign = "center"; ctx.fillStyle = CONFIG.accent; ctx.font = "800 18px sans-serif";
  ctx.fillText("LEVEL " + level(), W / 2, 36);
  ctx.textAlign = "right"; ctx.fillStyle = "#fff4e8"; ctx.font = "800 24px sans-serif";
  ctx.fillText(Math.floor(dist) + " m", W - 16, 36);
  ctx.fillStyle = "rgba(255,244,232,.75)"; ctx.font = "700 16px sans-serif"; ctx.fillText("Best " + best, W - 16, 62);
  // boost meter + combo
  ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(W / 2 - 100, H - 112, 200, 12);
  ctx.fillStyle = boost > 25 ? "#ffb703" : "#ff5a36"; ctx.fillRect(W / 2 - 100, H - 112, 2 * boost, 12);
  if (combo > 1) { ctx.textAlign = "center"; ctx.fillStyle = "#ffd84a"; ctx.font = "800 22px sans-serif"; ctx.fillText("Combo x" + Math.min(combo, 8), W / 2, 100); }
  if (state === "racing") { drawPad(70, -1, padL); drawPad(W - 70, 1, padR); }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-6, 6), rand(-6, 6));
  drawBg();
  if (boosting && boost > 0 && state === "racing") {
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const y = rand(0, H), x = rand(0, W); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 70); ctx.stroke(); }
  }
  rings.forEach((r) => {
    ctx.globalAlpha = r.done && !r.got ? .3 : r.got ? .25 : 1;
    ctx.strokeStyle = "#ffcf33"; ctx.lineWidth = 8; ctx.shadowColor = "#ffcf33"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, 14, 0, 0, 7); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  });
  ctx.font = "800 46px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ff3b5c"; ctx.shadowColor = "#ff3b5c"; ctx.shadowBlur = 14;
  pickups.forEach((p) => ctx.fillText("\u2665", p.x, p.y + 16));
  ctx.shadowBlur = 0;
  obstacles.forEach(drawObstacle);
  trail.forEach((p) => { ctx.fillStyle = p.b ? "rgba(255,170,60," + p.l * .5 + ")" : "rgba(255,255,255," + p.l * .35 + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (1 - p.l) * 8, 0, 7); ctx.fill(); });
  drawPlane();
  ctx.font = "800 24px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffd84a";
  floaters.forEach((f) => { ctx.globalAlpha = f.t / 45; ctx.fillText(f.txt, f.x, f.y); ctx.globalAlpha = 1; });
  ctx.restore();
  if (state === "racing" || state === "countdown" || state === "done") drawHUD();
  if (state === "countdown" || (state === "racing" && frame < 40)) {
    ctx.fillStyle = "#fff"; ctx.shadowColor = "#000"; ctx.shadowBlur = 12; ctx.font = "900 100px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(state === "countdown" ? Math.ceil(cd / 60) : "GO!", W / 2, H / 2 - 40); ctx.shadowBlur = 0;
  }
}

/* ---------------- Loop (same speed on every screen) ---------------- */
let last = 0, acc = 0;
function loop(t) {
  acc += Math.min(t - last, 100); last = t;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  draw(); requestAnimationFrame(loop);
}
requestAnimationFrame((t) => { last = t; loop(t); });

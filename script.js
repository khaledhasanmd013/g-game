
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

let W, H;
let running = false;
let paused = false;
let gameOver = false;

let coins = Number(localStorage.getItem("phc_coins")) || 0;
let best = Number(localStorage.getItem("phc_best")) || 0;
let fuel = 100;
let distance = 0;
let cameraX = 0;
let lastTime = 0;

const keys = {
  gas: false,
  brake: false
};

const car = {
  x: 100,
  y: 250,
  vx: 0,
  vy: 0,
  angle: 0,
  spin: 0,
  grounded: false
};

let objects = [];
let particles = [];

function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
}

addEventListener("resize", resize);
resize();

function terrain(x) {
  return H * .68
    + Math.sin(x * .002) * H * .14
    + Math.sin(x * .006) * H * .055
    + Math.cos(x * .0008) * H * .07;
}

function terrainSlope(x) {
  return Math.atan2(
    terrain(x + 5) - terrain(x - 5),
    10
  );
}

function generateObjects() {
  objects = [];

  for (let x = 350; x < 100000; x += 180) {
    objects.push({
      x,
      y: terrain(x) - 45,
      type: Math.floor(x / 180) % 7 === 0
        ? "fuel" : "coin",
      collected: false
    });
  }
}

function addDust(x, y) {
  particles.push({
    x, y,
    vx: (Math.random() - .5) * 3,
    vy: -Math.random() * 3,
    life: 1
  });
}

function updateHUD() {
  $("coins").textContent = coins;
  $("score").textContent = distance;
  $("fuelText").textContent = Math.ceil(fuel);
  $("fuelBar").style.width = fuel + "%";
}

function resetGame() {
  car.x = 100;
  car.y = H * .45;
  car.vx = 0;
  car.vy = 0;
  car.angle = 0;
  car.spin = 0;
  car.grounded = false;

  fuel = 100;
  distance = 0;
  cameraX = 0;
  particles = [];

  generateObjects();

  running = true;
  paused = false;
  gameOver = false;
  lastTime = 0;

  $("startScreen").classList.add("hidden");
  $("gameOver").classList.add("hidden");
  $("pauseScreen").classList.add("hidden");

  updateHUD();
}

function finishGame() {
  if (gameOver) return;

  gameOver = true;
  running = false;

  keys.gas = false;
  keys.brake = false;

  best = Math.max(best, distance);

  localStorage.setItem("phc_best", best);
  localStorage.setItem("phc_coins", coins);

  $("finalScore").textContent = distance;
  $("bestScore").textContent = best;
  $("gameOver").classList.remove("hidden");
}

function update(dt) {
  if (!running || paused || gameOver) return;

  const s = dt * 60;
  const wasGrounded = car.grounded;

  // Engine
  if (keys.gas && fuel > 0) {
    fuel = Math.max(0, fuel - .035 * s);
    car.vx += .22 * Math.cos(car.angle) * s;
  }

  // Brake and air rotation
  if (keys.brake) {
    car.vx -= .15 * s;

    if (!wasGrounded) {
      car.spin -= .025 * s;
    }
  }

  // Gravity and friction
  car.vy += .32 * s;

  car.vx *= Math.pow(
    wasGrounded ? .985 : .998, s
  );

  car.vy *= Math.pow(.999, s);

  car.vx = Math.max(-5, Math.min(11, car.vx));

  // Movement
  car.x += car.vx * s;
  car.y += car.vy * s;

  // Wheel collision
  const wheels = [-25, 25].map(offset => {
    const c = Math.cos(car.angle);
    const sn = Math.sin(car.angle);

    return {
      x: car.x + offset * c + 12 * sn,
      y: car.y + offset * sn - 12 * c
    };
  });

  const contacts = [];

  for (const wheel of wheels) {
    const gy = terrain(wheel.x);

    if (wheel.y + 10 > gy) {
      contacts.push({
        depth: wheel.y + 10 - gy,
        slope: terrainSlope(wheel.x)
      });
    }
  }

  car.grounded = contacts.length > 0;

  if (car.grounded) {
    const penetration = Math.max(
      ...contacts.map(c => c.depth)
    );

    car.y -= penetration * .5;
    car.vy = Math.min(0, car.vy);

    const target = contacts.reduce(
      (sum, c) => sum + c.slope, 0
    ) / contacts.length;

    const diff = Math.atan2(
      Math.sin(target - car.angle),
      Math.cos(target - car.angle)
    );

    car.spin += diff * .12;
    car.spin *= .72;
    car.angle += car.spin;

    if (Math.abs(car.vx) > 2 && Math.random() < .3) {
      addDust(car.x, terrain(car.x));
    }
  } else {
    car.spin *= .995;
    car.angle += car.spin;
  }

  car.x = Math.max(50, car.x);

  // Camera follow
  cameraX += (car.x - W * .30 - cameraX) * .09;

  distance = Math.max(
    0, Math.floor((car.x - 100) / 10)
  );

  // Collect coins and fuel
  for (const item of objects) {
    if (item.collected) continue;

    const dx = car.x - item.x;
    const dy = car.y - item.y;

    if (Math.hypot(dx, dy) < 38) {
      item.collected = true;

      if (item.type === "coin") {
        coins += 10;
        localStorage.setItem("phc_coins", coins);
      } else {
        fuel = Math.min(100, fuel + 30);
      }
    }
  }

  // Dust particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * s;
    p.y += p.vy * s;
    p.life -= .025 * s;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  // Crash detection
  if (
    Math.abs(car.angle) > 2.2 ||
    car.y > H + 100 ||
    (fuel <= 0 && Math.abs(car.vx) < .03)
  ) {
    finishGame();
  }

  updateHUD();
}

// Background
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);

  sky.addColorStop(0, "#168bd0");
  sky.addColorStop(1, "#d4f4ff");

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun
  ctx.fillStyle = "#fff2a5";
  ctx.beginPath();
  ctx.arc(W * .82, H * .2, 35, 0, Math.PI * 2);
  ctx.fill();

  // Clouds
  ctx.fillStyle = "#ffffffbb";

  for (let i = 0; i < 6; i++) {
    const x = (
      (i * 280 - cameraX * .15) % (W + 300)
      + W + 300
    ) % (W + 300);

    ctx.beginPath();
    ctx.arc(x, 90, 22, 0, Math.PI * 2);
    ctx.arc(x + 25, 80, 30, 0, Math.PI * 2);
    ctx.arc(x + 55, 92, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant hills
  ctx.fillStyle = "#79a99a";
  ctx.beginPath();
  ctx.moveTo(0, H);

  for (let x = 0; x <= W; x += 8) {
    const wx = x + cameraX * .3;

    ctx.lineTo(
      x,
      H * .55 + Math.sin(wx * .003) * H * .07
    );
  }

  ctx.lineTo(W, H);
  ctx.fill();
}

// Main road
function drawTerrain() {
  ctx.beginPath();
  ctx.moveTo(0, H);

  for (let x = 0; x <= W; x += 4) {
    ctx.lineTo(x, terrain(x + cameraX));
  }

  ctx.lineTo(W, H);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(
    0, H * .5, 0, H
  );

  gradient.addColorStop(0, "#70dc50");
  gradient.addColorStop(1, "#14532d");

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#c0ff8a";
  ctx.lineWidth = 4;
  ctx.stroke();
}

// Collectables
function drawObjects() {
  for (const o of objects) {
    if (o.collected) continue;

    const x = o.x - cameraX;

    if (x < -30 || x > W + 30) continue;

    if (o.type === "coin") {
      ctx.fillStyle = "#facc15";
      ctx.strokeStyle = "#fff3a0";
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.arc(x, o.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x - 9, o.y - 13, 18, 25);

      ctx.fillStyle = "white";
      ctx.fillRect(x - 4, o.y - 5, 8, 10);
    }
  }
}

// Vehicle
function drawCar() {
  ctx.save();

  ctx.translate(car.x - cameraX, car.y);
  ctx.rotate(car.angle);

  // Wheels
  for (const x of [-25, 25]) {
    ctx.fillStyle = "#161616";
    ctx.beginPath();
    ctx.arc(x, 12, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#ddd";
    ctx.beginPath();
    ctx.arc(x, 12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(-36, -12, 72, 23);

  // Cabin
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-23, -31, 45, 20);

  // Windows
  ctx.fillStyle = "#a5e7ff";
  ctx.fillRect(-18, -27, 16, 12);
  ctx.fillRect(3, -27, 14, 12);

  // Driver
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(-2, -17, 7, 0, Math.PI * 2);
  ctx.fill();

  // Headlight
  ctx.fillStyle = "#fff3a0";
  ctx.fillRect(31, -6, 7, 7);

  ctx.restore();
}

// Smoke
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = "#ddd";

    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// Render everything
function render() {
  ctx.clearRect(0, 0, W, H);

  drawBackground();
  drawTerrain();
  drawObjects();
  drawParticles();
  drawCar();
}

// Game loop
function loop(timestamp) {
  const dt = Math.min(
    (timestamp - lastTime) / 1000 || 0,
    .04
  );

  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// Controls
function bindControl(id, key) {
  const button = $(id);

  button.addEventListener("pointerdown", e => {
    e.preventDefault();
    keys[key] = true;
    button.setPointerCapture(e.pointerId);
  });

  const release = e => {
    e.preventDefault();
    keys[key] = false;
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);

  button.addEventListener("lostpointercapture", () => {
    keys[key] = false;
  });
}

bindControl("gasBtn", "gas");
bindControl("brakeBtn", "brake");

// Keyboard support
addEventListener("keydown", e => {
  if (e.key === "ArrowRight" || e.key === "d") {
    keys.gas = true;
  }

  if (e.key === "ArrowLeft" || e.key === "a") {
    keys.brake = true;
  }
});

addEventListener("keyup", e => {
  if (e.key === "ArrowRight" || e.key === "d") {
    keys.gas = false;
  }

  if (e.key === "ArrowLeft" || e.key === "a") {
    keys.brake = false;
  }
});

// Start and restart
$("startBtn").addEventListener("click", resetGame);
$("restartBtn").addEventListener("click", resetGame);

// Pause
$("pauseBtn").addEventListener("click", () => {
  if (!running || gameOver) return;

  paused = true;
  keys.gas = false;
  keys.brake = false;

  $("pauseScreen").classList.remove("hidden");
});

$("resumeBtn").addEventListener("click", () => {
  paused = false;
  $("pauseScreen").classList.add("hidden");
});

generateObjects();
updateHUD();

requestAnimationFrame(loop);

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const { spawn } = require("child_process");
const qrcode = require("qrcode-terminal");

const PORT = process.env.PORT || 3000;
const LED_ADDR = process.env.LED_ADDR || "";
const ENABLE_LED = process.env.ENABLE_LED === "1";
const PYTHON = process.env.PYTHON || "python3";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const state = {
  inning: 1,
  half: "top",
  outs: 0,
  balls: 0,
  strikes: 0,
  home: 0,
  away: 0,
  bases: [false, false, false],
  pitcherSocket: null,
  hitterSocket: null,
  pitcherPick: null,
  hitterPick: null,
  log: ["Game ready."]
};

const RESULT_TO_SLOT = {
  strike: 2,
  ball: 3,
  foul: 4,
  out: 5,
  single: 6,
  double: 7,
  homerun: 8,
  inning: 9
};

function getLocalUrl() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return `http://${net.address}:${PORT}`;
    }
  }
  return `http://localhost:${PORT}`;
}

function publicState() {
  return {
    inning: state.inning,
    half: state.half,
    outs: state.outs,
    balls: state.balls,
    strikes: state.strikes,
    home: state.home,
    away: state.away,
    bases: state.bases,
    pitcherReady: !!state.pitcherPick,
    hitterReady: !!state.hitterPick,
    pitcherConnected: !!state.pitcherSocket,
    hitterConnected: !!state.hitterSocket,
    log: state.log.slice(-12)
  };
}

function emitState() {
  io.emit("state", publicState());
}

function addLog(text) {
  state.log.push(text);
  console.log(text);
}

function ledCommand(command, ...args) {
  if (!ENABLE_LED || !LED_ADDR) return;
  const fullArgs = ["-m", "pypixelcolor", "-a", LED_ADDR, "-c", command, ...args.map(String)];
  const child = spawn(PYTHON, fullArgs);
  child.stderr.on("data", data => {
    const msg = data.toString().trim();
    if (msg) console.warn("[LED]", msg);
  });
  child.on("error", err => console.warn("[LED ERROR]", err.message));
}

function ledShowResult(result) {
  const slot = RESULT_TO_SLOT[result.type];
  if (slot) ledCommand("show_slot", slot);
  else ledCommand("send_text", result.label || result.type.toUpperCase(), 0, 0, 0, 80, "ffffff");
}

function resetCount() {
  state.balls = 0;
  state.strikes = 0;
}

function scoreRun() {
  if (state.half === "top") state.away += 1;
  else state.home += 1;
}

function nextHalfInning() {
  state.outs = 0;
  resetCount();
  state.bases = [false, false, false];

  if (state.half === "top") state.half = "bottom";
  else {
    state.half = "top";
    state.inning += 1;
  }

  addLog(`Inning change: ${state.half} ${state.inning}`);
  ledShowResult({ type: "inning", label: "INNING" });
}

function addOut() {
  state.outs += 1;
  resetCount();
  if (state.outs >= 3) nextHalfInning();
}

function advanceRunners(basesToAdvance) {
  const oldBases = [...state.bases];
  state.bases = [false, false, false];

  for (let i = 2; i >= 0; i--) {
    if (!oldBases[i]) continue;
    const target = i + basesToAdvance;
    if (target >= 3) scoreRun();
    else state.bases[target] = true;
  }

  if (basesToAdvance >= 4) scoreRun();
  else state.bases[basesToAdvance - 1] = true;
}

function countStrike() {
  state.strikes += 1;
  if (state.strikes >= 3) {
    addOut();
    return { type: "out", label: "STRIKEOUT" };
  }
  return { type: "strike", label: `STRIKE ${state.strikes}` };
}

function countBall() {
  state.balls += 1;
  if (state.balls >= 4) {
    advanceRunners(1);
    resetCount();
    return { type: "single", label: "WALK" };
  }
  return { type: "ball", label: `BALL ${state.balls}` };
}

function countFoul() {
  if (state.strikes < 2) state.strikes += 1;
  return { type: "foul", label: "FOUL" };
}

function resolvePitch(pitch, swing) {
  const heightMatch = pitch.zoneY === swing.zoneY;
  const sideMatch = pitch.zoneX === swing.zoneX;
  const speedMatch = pitch.speed === swing.timing;
  const guessedSpecial = pitch.special === swing.guessSpecial;
  const inStrikeZone = pitch.zoneY !== "waste" && pitch.zoneX !== "outside";

  let score = 0;
  if (heightMatch && sideMatch) score += 4;
  else {
    if (heightMatch) score += 2;
    if (sideMatch) score += 1;
  }
  if (speedMatch) score += 3;
  if (pitch.special !== "none") score += guessedSpecial ? 1 : -2;

  if (!heightMatch && !sideMatch && !speedMatch) return inStrikeZone ? countStrike() : countBall();
  if (score <= 1) return inStrikeZone ? countStrike() : countBall();
  if (score === 2) return countFoul();

  if (score === 3) {
    addOut();
    return { type: "out", label: "POP OUT" };
  }

  resetCount();

  if (score === 4) {
    advanceRunners(1);
    return { type: "single", label: "SINGLE" };
  }

  if (score <= 6) {
    advanceRunners(2);
    return { type: "double", label: "DOUBLE" };
  }

  advanceRunners(4);
  return { type: "homerun", label: "HOME RUN" };
}

function resetPicks() {
  state.pitcherPick = null;
  state.hitterPick = null;
}

function tryResolve() {
  if (!state.pitcherPick || !state.hitterPick) return;

  const result = resolvePitch(state.pitcherPick, state.hitterPick);
  addLog(result.label);
  ledShowResult(result);

  io.emit("reveal", {
    pitch: state.pitcherPick,
    swing: state.hitterPick,
    result
  });

  resetPicks();
  emitState();
}

io.on("connection", socket => {
  socket.emit("state", publicState());

  socket.on("joinRole", role => {
    if (role === "pitcher") {
      if (state.pitcherSocket && state.pitcherSocket !== socket.id) {
        socket.emit("roleError", "Pitcher is already taken.");
        return;
      }
      state.pitcherSocket = socket.id;
      socket.data.role = "pitcher";
      socket.emit("role", "pitcher");
      addLog("Pitcher joined.");
    }

    if (role === "hitter") {
      if (state.hitterSocket && state.hitterSocket !== socket.id) {
        socket.emit("roleError", "Hitter is already taken.");
        return;
      }
      state.hitterSocket = socket.id;
      socket.data.role = "hitter";
      socket.emit("role", "hitter");
      addLog("Hitter joined.");
    }

    emitState();
  });

  socket.on("pick", pick => {
    if (socket.data.role === "pitcher") {
      state.pitcherPick = pick;
      addLog("Pitcher locked in.");
    }
    if (socket.data.role === "hitter") {
      state.hitterPick = pick;
      addLog("Hitter locked in.");
    }
    emitState();
    tryResolve();
  });

  socket.on("resetGame", () => {
    state.inning = 1;
    state.half = "top";
    state.outs = 0;
    state.balls = 0;
    state.strikes = 0;
    state.home = 0;
    state.away = 0;
    state.bases = [false, false, false];
    state.pitcherPick = null;
    state.hitterPick = null;
    state.log = ["Game reset."];
    ledCommand("show_slot", 1);
    emitState();
  });

  socket.on("disconnect", () => {
    if (state.pitcherSocket === socket.id) state.pitcherSocket = null;
    if (state.hitterSocket === socket.id) state.hitterSocket = null;
    emitState();
  });
});

server.listen(PORT, () => {
  const url = getLocalUrl();
  console.log(`Pitch Battle running at ${url}`);
  console.log("Scan this QR code with each phone:");
  qrcode.generate(url, { small: true });
  console.log("Optional LED mode:");
  console.log("  LED_ADDR=your-device-uuid ENABLE_LED=1 npm start");
});

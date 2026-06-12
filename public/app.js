const socket = io();
let myRole = null;

const roleScreen = document.getElementById("roleScreen");
const gameScreen = document.getElementById("gameScreen");
const roleStatus = document.getElementById("roleStatus");
const roleTitle = document.getElementById("roleTitle");
const pitcherControls = document.getElementById("pitcherControls");
const hitterControls = document.getElementById("hitterControls");

document.getElementById("joinPitcher").addEventListener("click", () => socket.emit("joinRole", "pitcher"));
document.getElementById("joinHitter").addEventListener("click", () => socket.emit("joinRole", "hitter"));
document.getElementById("resetGame").addEventListener("click", () => socket.emit("resetGame"));

pitcherControls.addEventListener("submit", event => {
  event.preventDefault();
  socket.emit("pick", Object.fromEntries(new FormData(pitcherControls).entries()));
  roleStatus.textContent = "Pitch locked. Waiting for hitter...";
});

hitterControls.addEventListener("submit", event => {
  event.preventDefault();
  socket.emit("pick", Object.fromEntries(new FormData(hitterControls).entries()));
  roleStatus.textContent = "Swing locked. Waiting for pitcher...";
});

socket.on("role", role => {
  myRole = role;
  roleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  roleTitle.textContent = role === "pitcher" ? "Pitcher Controls" : "Hitter Controls";
  pitcherControls.classList.toggle("hidden", role !== "pitcher");
  hitterControls.classList.toggle("hidden", role !== "hitter");
});

socket.on("roleError", message => {
  roleStatus.textContent = message;
});

socket.on("state", state => {
  document.getElementById("awayScore").textContent = state.away;
  document.getElementById("homeScore").textContent = state.home;
  document.getElementById("inning").textContent = `${state.half === "top" ? "Top" : "Bottom"} ${state.inning}`;
  document.getElementById("count").textContent = `${state.balls}-${state.strikes}`;
  document.getElementById("outs").textContent = state.outs;

  document.getElementById("base1").classList.toggle("active", state.bases[0]);
  document.getElementById("base2").classList.toggle("active", state.bases[1]);
  document.getElementById("base3").classList.toggle("active", state.bases[2]);

  const status = [
    state.pitcherConnected ? "Pitcher connected" : "No pitcher",
    state.hitterConnected ? "Hitter connected" : "No hitter"
  ];
  if (state.pitcherReady) status.push("Pitcher ready");
  if (state.hitterReady) status.push("Hitter ready");
  if (!myRole) roleStatus.textContent = status.join(" | ");

  const log = document.getElementById("log");
  log.innerHTML = "";
  state.log.slice().reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    log.appendChild(li);
  });
});

socket.on("reveal", data => {
  document.getElementById("lastResult").textContent = data.result.label;
  roleStatus.textContent = "Result resolved. Choose the next play.";
});

/* ── State ───────────────────────────────────────────────────────────────── */

const state = {
  connected: false,
  tools: [],
  toolNames: [],
  logCount: 0,
};

/* ── DOM refs ────────────────────────────────────────────────────────────── */

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const toolCount = document.getElementById("toolCount");
const toolName = document.getElementById("toolName");
const toolArgs = document.getElementById("toolArgs");
const toolForm = document.getElementById("toolForm");
const callBtn = document.getElementById("callBtn");
const resultContent = document.getElementById("resultContent");
const logEntries = document.getElementById("logEntries");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const logCountEl = document.getElementById("logCount");
const toolList = document.getElementById("toolList");

/* ── Status polling ─────────────────────────────────────────────────────── */

async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    state.connected = data.connected;
    state.toolNames = data.toolNames || [];
    state.tools = data.tools || 0;
    updateUI();
  } catch {
    state.connected = false;
    updateUI();
  }
}

function updateUI() {
  // Status dot
  statusDot.className = "status-indicator" + (state.connected ? " connected" : "");
  statusText.textContent = state.connected ? "Connected" : "Disconnected";
  toolCount.textContent = `Tools: ${state.tools}`;

  // Populate datalist
  toolList.innerHTML = "";
  for (const name of state.toolNames) {
    const opt = document.createElement("option");
    opt.value = name;
    toolList.appendChild(opt);
  }
}

/* ── WebSocket for real-time logs ────────────────────────────────────────── */

function connectWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    console.log("[WS] Connected");
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWSMessage(data);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    console.log("[WS] Disconnected — reconnecting in 2s");
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function handleWSMessage(data) {
  switch (data.type) {
    case "status":
      state.connected = data.connected;
      state.tools = data.tools || 0;
      state.toolNames = data.toolNames || [];
      updateUI();
      break;
    case "log":
      addLogEntry(data.entry);
      break;
  }
}

/* ── Log rendering ───────────────────────────────────────────────────────── */

function addLogEntry(entry) {
  const div = document.createElement("div");
  div.className = "log-entry";

  // Time
  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  const t = new Date(entry.timestamp);
  timeSpan.textContent = t.toLocaleTimeString("en-US", { hour12: false });
  div.appendChild(timeSpan);

  // Level
  const levelSpan = document.createElement("span");
  levelSpan.className = `log-level ${entry.level}`;
  levelSpan.textContent = entry.level;
  div.appendChild(levelSpan);

  // Message
  const msgSpan = document.createElement("span");
  msgSpan.className = "log-message";
  msgSpan.textContent = entry.message;
  if (entry.data) {
    const preview = document.createElement("span");
    preview.className = "json-preview";
    preview.textContent = JSON.stringify(entry.data).slice(0, 200);
    msgSpan.appendChild(preview);
  }
  div.appendChild(msgSpan);

  logEntries.appendChild(div);
  state.logCount++;

  // Auto-scroll
  logEntries.scrollTop = logEntries.scrollHeight;

  // Update count
  logCountEl.textContent = state.logCount;

  // Limit DOM entries to 500
  while (logEntries.children.length > 500) {
    logEntries.removeChild(logEntries.firstChild);
  }
}

clearLogsBtn.addEventListener("click", () => {
  logEntries.innerHTML = "";
  state.logCount = 0;
  logCountEl.textContent = "0";
});

/* ── Tool calling ────────────────────────────────────────────────────────── */

toolForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = toolName.value.trim();
  if (!name) return;

  let args = {};
  try {
    const raw = toolArgs.value.trim();
    if (raw) args = JSON.parse(raw);
  } catch {
    resultContent.textContent = "Invalid JSON in arguments field.";
    resultContent.style.color = "var(--red)";
    return;
  }

  callBtn.disabled = true;
  callBtn.textContent = "Calling...";
  resultContent.textContent = "Waiting for response...";
  resultContent.style.color = "";

  try {
    const res = await fetch("/api/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    const data = await res.json();
    if (data.success) {
      resultContent.textContent = JSON.stringify(data.result, null, 2);
    } else {
      resultContent.textContent = `Error: ${data.error}`;
      resultContent.style.color = "var(--red)";
    }
  } catch (err) {
    resultContent.textContent = `Request failed: ${err.message}`;
    resultContent.style.color = "var(--red)";
  } finally {
    callBtn.disabled = false;
    callBtn.textContent = "Call Tool";
  }
});

/* ── Init ────────────────────────────────────────────────────────────────── */

fetchStatus();
setInterval(fetchStatus, 2000);
connectWS();

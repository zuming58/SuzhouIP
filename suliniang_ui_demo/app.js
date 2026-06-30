const appShell = document.querySelector(".app-shell");
const screens = [...document.querySelectorAll(".screen")];
const avatarVideo = document.querySelector("#avatar-video");
const statusLabel = document.querySelector("#status-label");
const askState = document.querySelector("#ask-state");
const askMiniLayers = [document.querySelector("#ask-mini-a"), document.querySelector("#ask-mini-b")].filter(Boolean);
const selectedSpotLabel = document.querySelector("#selected-spot");
const selectedSpotSummary = document.querySelector("#selected-spot-summary");
const spotTitle = document.querySelector("[data-spot-title]");
const spotStory = document.querySelector("#spot-story");
const spotList = document.querySelector("#spot-list");
const chatStack = document.querySelector("#chat-stack");
const questionInput = document.querySelector("#question-input");
const routeResult = document.querySelector("#route-result");
const routeNote = document.querySelector("#route-note");
const routePreferences = document.querySelector("#route-preferences");
const nearbyFeature = document.querySelector("#nearby-feature");
const nearbyList = document.querySelector("#nearby-list");
const tripTimeline = document.querySelector("#trip-timeline");
const quickQuestion = document.querySelector("[data-quick-question]");
const voiceState = document.querySelector("#voice-state");
const voiceUserText = document.querySelector("#voice-user-text");
const voiceAiText = document.querySelector("#voice-ai-text");
const voiceBridgeMode = document.querySelector("#voice-bridge-mode");
const voiceOrb = document.querySelector("#voice-orb");
const voiceTalkButton = document.querySelector("[data-voice-talk]");
const voiceWave = document.querySelector("#voice-wave");

const content = window.SULINIANG_CONTENT;
const videoBase = "../suliniang_project_materials/assets_3d_character_videos/normalized/";
const voiceBridgeUrl = window.SULINIANG_VOICE_BRIDGE_URL || "ws://127.0.0.1:8787/voice";
const BrowserAudioContext = window.AudioContext || window.webkitAudioContext;
const voiceTargetSampleRate = 16000;
const voicePacketSamples = 320;
let askAmbientTimer = null;
let askActiveLayer = 0;
let currentSpotId = content.defaultSpotId;
let activeRoute = content.routes[0];
let tripItems = activeRoute.nodes.map((node) => ({ ...node, source: "route" }));
let activeNearbyItems = content.nearby[0]?.items || [];
let voiceSocket = null;
let voiceConnected = false;
let voiceAudioContext = null;
let voicePlaybackTime = 0;
let voicePressing = false;
let voiceSessionReady = false;
let pendingVoiceQuery = "";
let voiceSessionClosing = false;
let voiceSessionInputMod = "";
let voiceMediaStream = null;
let voiceMicContext = null;
let voiceMicSource = null;
let voiceMicProcessor = null;
let voiceRecording = false;
let voicePendingPcm = new Float32Array(0);
let pendingAudioChunks = [];
let pendingAudioEnd = false;

const screenVideoMap = {
  welcome: "welcome_once.mp4",
  home: "idle_loop.mp4",
  voice: "listening_loop.mp4",
  ask: "listening_loop.mp4",
  route: "thinking_loop.mp4",
  guide: "guide_once.mp4",
  spot: "speaking_loop.mp4",
  nearby: "smile_once.mp4",
  trip: "idle_loop.mp4",
};

const stateText = {
  "idle_loop.mp4": "\u7b49\u4f60\u63d0\u95ee",
  "welcome_once.mp4": "\u6b63\u5728\u6b22\u8fce",
  "listening_loop.mp4": "\u6b63\u5728\u503e\u542c",
  "thinking_loop.mp4": "\u6b63\u5728\u601d\u8003",
  "speaking_loop.mp4": "\u6b63\u5728\u8bb2\u89e3",
  "guide_once.mp4": "\u5f15\u5bfc\u666f\u70b9",
  "recital_once.mp4": "\u8bd7\u8bcd\u541f\u8bf5",
  "smile_once.mp4": "\u8bb2\u89e3\u5b8c\u6210",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setAvatar(videoName, label) {
  if (!avatarVideo) return;
  const nextSrc = videoBase + videoName;
  if (!avatarVideo.src.endsWith(videoName)) {
    avatarVideo.src = nextSrc;
    avatarVideo.loop = !videoName.includes("_once");
    avatarVideo.play().catch(() => {});
  }
  if (statusLabel) {
    statusLabel.textContent = label || stateText[videoName] || "绛変綘鎻愰棶";
  }
}

function setAskMiniVideo(videoName, shouldLoop = true) {
  if (!askMiniLayers.length) return;
  const active = askMiniLayers[askActiveLayer];
  const nextIndex = askMiniLayers.length > 1 ? 1 - askActiveLayer : askActiveLayer;
  const next = askMiniLayers[nextIndex];
  const nextSrc = videoBase + videoName;

  if (active && active.src.endsWith(videoName)) {
    active.loop = shouldLoop;
    active.play().catch(() => {});
    return;
  }

  next.loop = shouldLoop;
  next.onloadeddata = () => {
    next.onloadeddata = null;
    next.currentTime = 0;
    next.play().catch(() => {});
    next.classList.add("active");
    if (active && active !== next) active.classList.remove("active");
    askActiveLayer = nextIndex;
  };
  next.src = nextSrc;
  next.load();
}

function stopAskAmbient() {
  if (askAmbientTimer) {
    clearTimeout(askAmbientTimer);
    askAmbientTimer = null;
  }
}

function startAskAmbient() {
  stopAskAmbient();
  const sequence = [
    { video: "listening_loop.mp4", label: "姝ｅ湪鍊惧惉", duration: 4200, loop: false },
    { video: "smile_once.mp4", label: "寰瑧绛夊緟", duration: 5200, loop: false },
    { video: "idle_loop.mp4", label: "绛変綘鎻愰棶", duration: 8200, loop: true },
  ];
  let index = 0;

  function playNext() {
    const item = sequence[index % sequence.length];
    if (askState) askState.textContent = item.label;
    setAskMiniVideo(item.video, item.loop);
    index += 1;
    askAmbientTimer = setTimeout(playNext, item.duration);
  }

  playNext();
}

function setMiniVideos(screen) {
  const active = document.querySelector(`[data-screen="${screen}"]`);
  if (!active) return;
  if (screen === "ask") {
    startAskAmbient();
    return;
  }
  active.querySelectorAll("video").forEach((video) => {
    video.play().catch(() => {});
  });
}

function showScreen(name) {
  if (name !== "ask") stopAskAmbient();
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === name);
  });
  const mapped = screenVideoMap[name] || "idle_loop.mp4";
  setAvatar(mapped, stateText[mapped]);
  setMiniVideos(name);
}

function getSelectedPreferences() {
  return [...document.querySelectorAll("[data-preference].selected")].map((button) => button.dataset.preference);
}

function answerQuestion(query) {
  const text = query.trim() || "甯垜瀹夋帓鍗婂ぉ鑻忓窞璺嚎";
  const match =
    content.qa.find((item) => item.keywords.some((keyword) => text.includes(keyword))) ||
    content.qa.find((item) => item.id === "route") ||
    content.qa[0];

  renderAnswer(text, match);
  setAskThinkingAnimation();
  return match;
}

function renderAnswer(query, answer) {
  if (!chatStack) return;
  const tags = answer.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const actions = answer.actions
    .map((action) => {
      const attrs = [
        `data-answer-action`,
        action.screen ? `data-action-screen="${escapeHtml(action.screen)}"` : "",
        action.routeId ? `data-route-id="${escapeHtml(action.routeId)}"` : "",
        action.spotId ? `data-spot-id="${escapeHtml(action.spotId)}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button ${attrs}>${escapeHtml(action.label)}</button>`;
    })
    .join("");

  chatStack.innerHTML = `
    <div class="bubble user">${escapeHtml(query)}</div>
    <div class="bubble guide">
      <strong>${escapeHtml(answer.title)}</strong>
      <p>${escapeHtml(answer.body)}</p>
      <div class="food-grid">${tags}</div>
      <div class="inline-actions">${actions}</div>
    </div>
  `;
}

function setAskThinkingAnimation() {
  stopAskAmbient();
  if (askState) askState.textContent = "\u6b63\u5728\u601d\u8003";
  setAskMiniVideo("thinking_loop.mp4", true);
  setAvatar("thinking_loop.mp4", "\u6b63\u5728\u601d\u8003");
  setTimeout(() => {
    if (askState) askState.textContent = "姝ｅ湪璁茶В";
    setAskMiniVideo("speaking_loop.mp4", true);
    setAvatar("speaking_loop.mp4", "姝ｅ湪璁茶В");
    askAmbientTimer = setTimeout(startAskAmbient, 2800);
  }, 900);
}

function generateRoute(preferences = getSelectedPreferences()) {
  const scored = content.routes
    .map((route) => ({
      route,
      score: route.preferences.filter((preference) => preferences.includes(preference)).length,
    }))
    .sort((a, b) => b.score - a.score);

  activeRoute = scored[0]?.route || content.routes[0];
  tripItems = activeRoute.nodes.map((node) => ({ ...node, source: "route" }));
  renderRoute(activeRoute);
  renderTrip();
  setAvatar("thinking_loop.mp4", "\u6b63\u5728\u4e3a\u4f60\u6392\u8def\u7ebf");
  return activeRoute;
}

function renderRoute(route) {
  if (!routeResult) return;
  if (routeNote) routeNote.textContent = route.note;
  routeResult.classList.add("visible");
  routeResult.innerHTML = `
    <p class="route-title">${escapeHtml(route.title)}</p>
    ${route.nodes
      .map((node) => {
        const action = node.action || {};
        const attrs = action.screen
          ? `data-go="${escapeHtml(action.screen)}"`
          : action.video
            ? `data-video="${escapeHtml(action.video)}" data-state="姝ｅ湪璁茶В"`
            : "";
        return `
          <article class="route-node">
            <time>${escapeHtml(node.time)}</time>
            <div>
              <h3>${escapeHtml(node.title)}</h3>
              <p>${escapeHtml(node.description)}</p>
              <button ${attrs}>${escapeHtml(action.label || "鏌ョ湅")}</button>
            </div>
          </article>
        `;
      })
      .join("")}
  `;
}

function selectSpot(id) {
  const spot = content.spots.find((item) => item.id === id) || content.spots[0];
  currentSpotId = spot.id;
  document.querySelectorAll("[data-spot]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.spot === spot.id);
  });
  if (selectedSpotLabel) selectedSpotLabel.textContent = spot.name;
  if (selectedSpotSummary) selectedSpotSummary.textContent = spot.summary;
  if (spotTitle) spotTitle.textContent = spot.name;
  if (spotStory) spotStory.textContent = spot.story;
  setAvatar("guide_once.mp4", "寮曞鏅偣");
  return spot;
}

function renderSpots() {
  if (!spotList) return;
  spotList.innerHTML = content.spots
    .map(
      (spot) =>
        `<button data-spot="${escapeHtml(spot.id)}" data-x="${escapeHtml(spot.x)}" data-y="${escapeHtml(spot.y)}">${escapeHtml(spot.name)}</button>`,
    )
    .join("");
  selectSpot(currentSpotId);
}

function addToTrip(item) {
  const exists = tripItems.some((tripItem) => tripItem.title === item.title && tripItem.time === item.time);
  if (!exists) {
    tripItems.push({ ...item, source: "nearby" });
  }
  renderTrip();
  setAvatar("smile_once.mp4", "\u5df2\u52a0\u5165\u884c\u7a0b");
}

function renderNearby() {
  const group = content.nearby[0];
  if (!group) return;
  activeNearbyItems = group.items;
  if (nearbyFeature) {
    nearbyFeature.innerHTML = `
      <p class="section-kicker">${escapeHtml(group.category)}</p>
      <h3>${escapeHtml(group.title)}</h3>
      <p>${escapeHtml(group.description)}</p>
    `;
  }
  if (nearbyList) {
    nearbyList.innerHTML = group.items
      .map(
        (item, index) => `
          <article>
            <span>${escapeHtml(item.title)}</span>
            <p>${escapeHtml(item.description)}</p>
            <button data-add-nearby="${index}">鍔犲叆琛岀▼</button>
          </article>
        `,
      )
      .join("");
  }
}

function renderTrip() {
  if (!tripTimeline) return;
  tripTimeline.innerHTML = tripItems
    .map(
      (item) => `
        <article class="${item.source === "nearby" ? "muted" : ""}">
          <time>${escapeHtml(item.time)}</time>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `,
    )
    .join("");
}

function initQuickQuestion() {
  if (quickQuestion) quickQuestion.textContent = content.quickQuestions[0];
  if (questionInput) questionInput.value = content.quickQuestions[0];
}

function setVoiceUi(state, text) {
  if (voiceState) voiceState.textContent = text;
  if (voiceOrb) voiceOrb.dataset.state = state;
  if (voiceTalkButton) {
    voiceTalkButton.classList.toggle("is-recording", state === "listening" && voicePressing);
  }
  if (state === "listening") setAvatar("listening_loop.mp4", "瀹炴椂鍊惧惉");
  if (state === "thinking") setAvatar("thinking_loop.mp4", "\u6b63\u5728\u601d\u8003");
  if (state === "speaking") setAvatar("speaking_loop.mp4", "姝ｅ湪鍥炲簲");
  if (state === "idle") setAvatar("idle_loop.mp4", "绛変綘鎻愰棶");
}

function setVoiceBridgeBadge(text) {
  if (voiceBridgeMode) voiceBridgeMode.textContent = text;
}

function setVoiceWaveLevel(level = 0) {
  if (!voiceWave) return;
  const safe = Math.max(0, Math.min(1, level));
  voiceWave.classList.toggle("is-active", voiceRecording || safe > 0.03);
  const base = 0.45 + safe * 2.3;
  voiceWave.style.setProperty("--wave-1", String(Math.max(0.35, base * 0.55)));
  voiceWave.style.setProperty("--wave-2", String(Math.max(0.45, base * 0.85)));
  voiceWave.style.setProperty("--wave-3", String(Math.max(0.55, base * 1.15)));
  voiceWave.style.setProperty("--wave-4", String(Math.max(0.45, base * 0.78)));
  voiceWave.style.setProperty("--wave-5", String(Math.max(0.35, base * 0.62)));
}

function connectVoiceBridge(inputMod = "text") {
  if (voiceSocket && voiceSocket.readyState <= WebSocket.OPEN && voiceSessionInputMod === inputMod) return;
  if (voiceSocket && voiceSocket.readyState <= WebSocket.OPEN && voiceSessionInputMod !== inputMod) {
    endVoiceSession();
  }

  voiceSessionReady = false;
  voiceSessionClosing = false;
  voiceSessionInputMod = inputMod;
  pendingAudioChunks = [];
  pendingAudioEnd = false;
  setVoiceBridgeBadge("\u8fde\u63a5\u4e2d");
  setVoiceUi("thinking", "\u6b63\u5728\u8fde\u63a5\u672c\u5730\u8bed\u97f3\u6865\u63a5\u5c42");
  voiceSocket = new WebSocket(voiceBridgeUrl);
  const socket = voiceSocket;
  voiceSocket.binaryType = "arraybuffer";

  voiceSocket.addEventListener("open", () => {
    voiceConnected = true;
    voiceSocket.send(
      JSON.stringify({
        type: "session.start",
        inputAudioFormat: inputMod === "push_to_talk" ? "pcm_s16le" : undefined,
        inputMod,
      }),
    );
  });

  voiceSocket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      playPcmS16Le(event.data);
      return;
    }
    handleVoiceEvent(JSON.parse(event.data));
  });

  voiceSocket.addEventListener("close", () => {
    if (socket !== voiceSocket) return;
    voiceConnected = false;
    voiceSessionReady = false;
    voiceSessionInputMod = "";
    setVoiceBridgeBadge("\u5df2\u65ad\u5f00");
    if (!voiceSessionClosing) setVoiceUi("idle", "\u8bed\u97f3\u6865\u63a5\u5c42\u5df2\u65ad\u5f00");
  });

  voiceSocket.addEventListener("error", () => {
    if (socket !== voiceSocket) return;
    voiceConnected = false;
    voiceSessionReady = false;
    setVoiceBridgeBadge("\u672a\u8fde\u63a5");
    setVoiceUi("idle", "\u65e0\u6cd5\u8fde\u63a5\u8bed\u97f3\u6865\u63a5\u5c42\uff0c\u8bf7\u5148\u542f\u52a8 voice_bridge");
  });
}

function handleVoiceEvent(event) {
  if (event.type === "bridge.ready") {
    setVoiceBridgeBadge(event.mock ? "Mock" : "\u771f\u5b9e");
    setVoiceUi("thinking", event.mock ? "\u5df2\u8fde\u63a5 Mock \u6865\u63a5" : "\u5df2\u8fde\u63a5\u771f\u5b9e\u8bed\u97f3\u6865\u63a5");
  }
  if (event.type === "state.changed") {
    setVoiceUi(event.state || "idle", event.label || "\u8bed\u97f3\u72b6\u6001\u5df2\u66f4\u65b0");
  }
  if (event.type === "session.started") {
    voiceSessionReady = true;
    setVoiceUi("listening", "\u8bed\u97f3\u4f1a\u8bdd\u5df2\u5c31\u7eea\uff0c\u53ef\u4ee5\u5f00\u59cb\u63d0\u95ee");
    flushPendingAudioChunks();
    flushPendingAudioEnd();
    flushPendingVoiceQuery();
  }
  if (event.type === "asr.final") {
    if (voiceUserText) voiceUserText.textContent = event.text || "\u5df2\u6536\u5230\u8bed\u97f3\u95ee\u9898";
    if (questionInput && event.text) questionInput.value = event.text;
    setVoiceUi("thinking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u601d\u8003");
  }
  if (event.type === "asr.partial") {
    if (voiceUserText && event.text) voiceUserText.textContent = event.text;
    setVoiceUi("listening", "\u6b63\u5728\u8bc6\u522b\u4f60\u7684\u8bed\u97f3");
  }
  if (event.type === "business.intent") {
    applyVoiceIntent(event.intent, event.params || {});
  }
  if (event.type === "tool.result") {
    applyVoiceToolResult(event.tool, event.result);
  }
  if (event.type === "chat.partial") {
    if (voiceAiText) voiceAiText.textContent = event.fullText || event.text || "";
    setVoiceUi("speaking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u56de\u7b54");
  }
  if (event.type === "tts.start") {
    setVoiceUi("speaking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u64ad\u62a5");
  }
  if (event.type === "tts.end" || event.type === "chat.ended") {
    setVoiceUi("listening", "\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee");
  }
  if (event.type === "error") {
    voiceSessionReady = false;
    setVoiceBridgeBadge("\u9519\u8bef");
    setVoiceUi("idle", event.message || "\u8bed\u97f3\u94fe\u8def\u51fa\u73b0\u9519\u8bef");
  }
}

function flushPendingVoiceQuery() {
  if (!voiceSessionReady || !pendingVoiceQuery || voiceSocket?.readyState !== WebSocket.OPEN) return;
  const query = pendingVoiceQuery;
  pendingVoiceQuery = "";
  voicePlaybackTime = voiceAudioContext?.currentTime || 0;
  voiceAudioContext?.resume?.().catch(() => {});
  setVoiceUi("thinking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u7406\u89e3\u4f60\u7684\u95ee\u9898");
  voiceSocket.send(JSON.stringify({ type: "text.query", content: query }));
}

function sendVoiceAudioChunk(chunk) {
  if (!chunk?.byteLength) return;
  if (voiceSessionReady && voiceSocket?.readyState === WebSocket.OPEN) {
    voiceSocket.send(chunk);
    return;
  }
  pendingAudioChunks.push(chunk);
  if (pendingAudioChunks.length > 80) pendingAudioChunks.shift();
}

function flushPendingAudioChunks() {
  if (!voiceSessionReady || voiceSocket?.readyState !== WebSocket.OPEN) return;
  while (pendingAudioChunks.length) {
    voiceSocket.send(pendingAudioChunks.shift());
  }
}

function flushPendingAudioEnd() {
  if (!pendingAudioEnd || !voiceSessionReady || voiceSocket?.readyState !== WebSocket.OPEN) return;
  pendingAudioEnd = false;
  voiceSocket.send(JSON.stringify({ type: "audio.end" }));
}

function sendVoiceText(text) {
  const query = (text || questionInput?.value || content.quickQuestions[0]).trim();
  if (!query) return;
  if (voiceUserText) voiceUserText.textContent = query;
  if (voiceAiText) voiceAiText.textContent = "\u82cf\u4e3d\u5a18\u6b63\u5728\u7ec4\u7ec7\u56de\u7b54...";
  pendingVoiceQuery = query;
  connectVoiceBridge("text");
  flushPendingVoiceQuery();
}

function endVoiceSession() {
  voiceSessionClosing = true;
  voiceSocket?.send(JSON.stringify({ type: "session.end" }));
  voiceSocket?.close();
  voiceConnected = false;
  voiceSessionReady = false;
  setVoiceBridgeBadge("\u5df2\u7ed3\u675f");
  setVoiceUi("idle", "\u8bed\u97f3\u4f1a\u8bdd\u5df2\u7ed3\u675f");
}

async function startVoicePress() {
  voicePressing = true;
  connectVoiceBridge("push_to_talk");
  if (voiceUserText) voiceUserText.textContent = "\u6b63\u5728\u542c\u4f60\u8bf4\u8bdd...";
  if (voiceAiText) voiceAiText.textContent = "\u677e\u5f00\u540e\uff0c\u82cf\u4e3d\u5a18\u4f1a\u5f00\u59cb\u56de\u7b54\u3002";
  setVoiceUi("listening", "\u6b63\u5728\u542c\uff0c\u677e\u5f00\u540e\u53d1\u9001");
  try {
    await startMicrophoneCapture();
  } catch (error) {
    voicePressing = false;
    setVoiceUi("idle", error.message || "\u65e0\u6cd5\u6253\u5f00\u9ea6\u514b\u98ce");
  }
}

function finishVoicePress() {
  if (!voicePressing) return;
  voicePressing = false;
  if (voiceTalkButton) voiceTalkButton.classList.remove("is-recording");
  stopMicrophoneCapture();
  setVoiceUi("thinking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u8bc6\u522b\u4f60\u7684\u95ee\u9898");
  pendingAudioEnd = true;
  flushPendingAudioChunks();
  flushPendingAudioEnd();
}

async function startMicrophoneCapture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u9ea6\u514b\u98ce\u91c7\u96c6");
  }
  if (voiceRecording) return;

  voiceMediaStream ||= await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  if (!BrowserAudioContext) throw new Error("\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301 Web Audio");
  voiceMicContext ||= new BrowserAudioContext();
  if (voiceMicContext.state === "suspended") await voiceMicContext.resume();

  voicePendingPcm = new Float32Array(0);
  voiceMicSource = voiceMicContext.createMediaStreamSource(voiceMediaStream);
  voiceMicProcessor = voiceMicContext.createScriptProcessor(4096, 1, 1);
  voiceMicProcessor.onaudioprocess = (event) => {
    if (!voiceRecording) return;
    const input = event.inputBuffer.getChannelData(0);
    setVoiceWaveLevel(getAudioLevel(input));
    const resampled = downsampleTo16k(input, voiceMicContext.sampleRate);
    queuePcmPackets(resampled);
  };
  voiceMicSource.connect(voiceMicProcessor);
  voiceMicProcessor.connect(voiceMicContext.destination);
  voiceRecording = true;
  setVoiceWaveLevel(0.08);
}

function stopMicrophoneCapture() {
  voiceRecording = false;
  if (voiceMicProcessor) {
    voiceMicProcessor.disconnect();
    voiceMicProcessor.onaudioprocess = null;
    voiceMicProcessor = null;
  }
  if (voiceMicSource) {
    voiceMicSource.disconnect();
    voiceMicSource = null;
  }
  if (voicePendingPcm.length) {
    sendVoiceAudioChunk(floatToPcm16(voicePendingPcm).buffer);
    voicePendingPcm = new Float32Array(0);
  }
  setVoiceWaveLevel(0);
}

function getAudioLevel(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.min(1, Math.sqrt(sum / samples.length) * 7);
}

function downsampleTo16k(input, sourceSampleRate) {
  if (sourceSampleRate === voiceTargetSampleRate) return new Float32Array(input);
  const ratio = sourceSampleRate / voiceTargetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function queuePcmPackets(samples) {
  if (!samples.length) return;
  const merged = new Float32Array(voicePendingPcm.length + samples.length);
  merged.set(voicePendingPcm);
  merged.set(samples, voicePendingPcm.length);

  let offset = 0;
  while (offset + voicePacketSamples <= merged.length) {
    const packet = merged.subarray(offset, offset + voicePacketSamples);
    sendVoiceAudioChunk(floatToPcm16(packet).buffer);
    offset += voicePacketSamples;
  }
  voicePendingPcm = merged.slice(offset);
}

function floatToPcm16(samples) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function applyVoiceIntent(intent, params) {
  const labelMap = {
    generate_route: "姝ｅ湪鏌ヨ閫傚悎浣犵殑鑻忓窞璺嚎",
    spot_explain: "姝ｅ湪鏁寸悊鏅偣璁茶В",
    nearby_recommend: "姝ｅ湪鏌ユ壘闄勮繎鎺ㄨ崘",
    smalltalk: "\u82cf\u4e3d\u5a18\u6b63\u5728\u56de\u5e94",
  };
  setVoiceUi("thinking", labelMap[intent] || "\u82cf\u4e3d\u5a18\u6b63\u5728\u7406\u89e3\u4f60\u7684\u9700\u6c42");

  if (intent === "spot_explain" && params.spot) {
    const matched = content.spots.find((spot) => spot.name === params.spot);
    if (matched) selectSpot(matched.id);
  }
}

function applyVoiceToolResult(tool, result) {
  if (!result) return;

  if (tool === "generate_route") {
    activeRoute = result;
    tripItems = result.nodes.map((node) => ({ ...node, source: "route" }));
    renderRoute(result);
    renderTrip();
  }

  if (tool === "spot_explain") {
    const matched = content.spots.find((spot) => spot.name === result.spot);
    if (matched) selectSpot(matched.id);
    if (spotStory && result.text) spotStory.textContent = result.text;
  }

  if (tool === "nearby_recommend") {
    renderNearbyResult(result);
  }
}

function renderNearbyResult(result) {
  activeNearbyItems = result.items || [];
  if (nearbyFeature) {
    const nearbySummary = result.location
      ? `\u5efa\u8bae\u524d\u5f80${result.location}\uff0c\u9002\u5408\u63a5\u5728\u5f53\u524d\u884c\u7a0b\u540e\u3002`
      : "\u6839\u636e\u5f53\u524d\u4f4d\u7f6e\u63a8\u8350\u3002";
    nearbyFeature.innerHTML = `
      <p class="section-kicker">闄勮繎鎺ㄨ崘</p>
      <h3>${escapeHtml(result.title || "鑻忓窞闄勮繎鎺ㄨ崘")}</h3>
      <p>${escapeHtml(nearbySummary)}</p>
    `;
  }
  if (nearbyList) {
    nearbyList.innerHTML = (result.items || [])
      .map(
        (item, index) => `
          <article>
            <span>${escapeHtml(item.title)}</span>
            <p>${escapeHtml(item.description)}</p>
            <button data-add-nearby="${index}">鍔犲叆琛岀▼</button>
          </article>
        `,
      )
      .join("");
  }
}

function playPcmS16Le(arrayBuffer) {
  const samples = new Int16Array(arrayBuffer);
  if (!samples.length) return;
  if (!BrowserAudioContext) return;
  voiceAudioContext ||= new BrowserAudioContext({ sampleRate: 24000 });
  const audioBuffer = voiceAudioContext.createBuffer(1, samples.length, 24000);
  const channel = audioBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    channel[index] = samples[index] / 32768;
  }

  const source = voiceAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(voiceAudioContext.destination);
  const startAt = Math.max(voiceAudioContext.currentTime, voicePlaybackTime);
  source.start(startAt);
  voicePlaybackTime = startAt + audioBuffer.duration;
}

document.addEventListener("click", (event) => {
  const spotButton = event.target.closest("[data-spot]");
  if (spotButton) {
    selectSpot(spotButton.dataset.spot);
  }

  const preference = event.target.closest("[data-preference]");
  if (preference) {
    preference.classList.toggle("selected");
  }

  if (event.target.closest("[data-generate-route]")) {
    generateRoute();
  }

  if (event.target.closest(".voice-btn")) {
    showScreen("voice");
    connectVoiceBridge();
  }

  const voiceDemo = event.target.closest("[data-voice-demo]");
  if (voiceDemo) {
    showScreen("voice");
    sendVoiceText(voiceDemo.dataset.voiceDemo);
  }

  const addNearby = event.target.closest("[data-add-nearby]");
  if (addNearby) {
    const item = activeNearbyItems[Number(addNearby.dataset.addNearby)];
    if (item) addToTrip(item);
  }

  const answerAction = event.target.closest("[data-answer-action]");
  if (answerAction) {
    if (answerAction.dataset.routeId) {
      const route = content.routes.find((item) => item.id === answerAction.dataset.routeId);
      if (route) {
        activeRoute = route;
        tripItems = route.nodes.map((node) => ({ ...node, source: "route" }));
        renderRoute(route);
        renderTrip();
      }
    }
    if (answerAction.dataset.spotId) selectSpot(answerAction.dataset.spotId);
    if (answerAction.dataset.actionScreen) showScreen(answerAction.dataset.actionScreen);
  }

  if (event.target.closest("[data-ask-submit]")) {
    answerQuestion(questionInput?.value || "");
  }

  const go = event.target.closest("[data-go]");
  if (go) {
    if (go.dataset.go === "spot") selectSpot(currentSpotId);
    showScreen(go.dataset.go);
    if (go.dataset.go === "voice") connectVoiceBridge();
  }

  const mode = event.target.closest("[data-mode-target]");
  if (mode) {
    const target = mode.dataset.modeTarget;
    appShell.dataset.mode = target;
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.modeTarget === target);
    });
  }

  const videoTrigger = event.target.closest("[data-video]");
  if (videoTrigger) {
    setAvatar(videoTrigger.dataset.video, videoTrigger.dataset.state);
  }

  if (event.target.closest("[data-demo-speaking]")) {
    setAvatar("speaking_loop.mp4", "姝ｅ湪璁茶В");
  }

  if (event.target.closest("[data-demo-recital]")) {
    setAvatar("recital_once.mp4", "璇楄瘝鍚熻");
  }

  if (event.target.closest("[data-demo-guide]")) {
    setAvatar("guide_once.mp4", "寮曞鏅偣");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target === questionInput) {
    answerQuestion(questionInput.value);
  }
});

if (voiceTalkButton) {
  voiceTalkButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    voiceTalkButton.setPointerCapture(event.pointerId);
    startVoicePress();
  });
  voiceTalkButton.addEventListener("pointerup", (event) => {
    event.preventDefault();
    finishVoicePress();
  });
  voiceTalkButton.addEventListener("pointercancel", () => {
    voicePressing = false;
    stopMicrophoneCapture();
    setVoiceUi("idle", "\u5df2\u53d6\u6d88\u672c\u8f6e\u8bed\u97f3");
  });
  voiceTalkButton.addEventListener("contextmenu", (event) => event.preventDefault());
  voiceTalkButton.addEventListener("dragstart", (event) => event.preventDefault());
}

document.querySelectorAll("video").forEach((video) => {
  video.addEventListener("ended", () => {
    if (video.classList.contains("welcome-video")) return;
    if (video.id === "avatar-video") {
      setAvatar("idle_loop.mp4", "绛変綘鎻愰棶");
    }
  });
});

window.SuliniangApp = {
  answerQuestion,
  generateRoute,
  selectSpot,
  addToTrip,
};

initQuickQuestion();
renderRoute(activeRoute);
renderSpots();
renderNearby();
renderTrip();

const initialScreen = new URLSearchParams(window.location.search).get("screen");
showScreen(screenVideoMap[initialScreen] ? initialScreen : "welcome");



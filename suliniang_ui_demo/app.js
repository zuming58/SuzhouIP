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

const content = window.SULINIANG_CONTENT;
const videoBase = "../suliniang_project_materials/assets_3d_character_videos/normalized/";
const voiceBridgeUrl = window.SULINIANG_VOICE_BRIDGE_URL || "ws://127.0.0.1:8787/voice";
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
  "idle_loop.mp4": "等你提问",
  "welcome_once.mp4": "正在欢迎",
  "listening_loop.mp4": "正在倾听",
  "thinking_loop.mp4": "正在思考",
  "speaking_loop.mp4": "正在讲解",
  "guide_once.mp4": "引导景点",
  "recital_once.mp4": "诗词吟诵",
  "smile_once.mp4": "讲解完成",
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
    statusLabel.textContent = label || stateText[videoName] || "等你提问";
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
    { video: "listening_loop.mp4", label: "正在倾听", duration: 4200, loop: false },
    { video: "smile_once.mp4", label: "微笑等待", duration: 5200, loop: false },
    { video: "idle_loop.mp4", label: "等你提问", duration: 8200, loop: true },
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
  const text = query.trim() || "帮我安排半天苏州路线";
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
  if (askState) askState.textContent = "正在思考";
  setAskMiniVideo("thinking_loop.mp4", true);
  setAvatar("thinking_loop.mp4", "正在思考");
  setTimeout(() => {
    if (askState) askState.textContent = "正在讲解";
    setAskMiniVideo("speaking_loop.mp4", true);
    setAvatar("speaking_loop.mp4", "正在讲解");
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
  setAvatar("thinking_loop.mp4", "正在为你排路线");
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
            ? `data-video="${escapeHtml(action.video)}" data-state="正在讲解"`
            : "";
        return `
          <article class="route-node">
            <time>${escapeHtml(node.time)}</time>
            <div>
              <h3>${escapeHtml(node.title)}</h3>
              <p>${escapeHtml(node.description)}</p>
              <button ${attrs}>${escapeHtml(action.label || "查看")}</button>
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
  setAvatar("guide_once.mp4", "引导景点");
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
  setAvatar("smile_once.mp4", "已加入行程");
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
            <button data-add-nearby="${index}">加入行程</button>
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
  if (state === "listening") setAvatar("listening_loop.mp4", "实时倾听");
  if (state === "thinking") setAvatar("thinking_loop.mp4", "正在思考");
  if (state === "speaking") setAvatar("speaking_loop.mp4", "正在回应");
  if (state === "idle") setAvatar("idle_loop.mp4", "等你提问");
}

function connectVoiceBridge() {
  if (voiceSocket && voiceSocket.readyState <= WebSocket.OPEN) return;

  setVoiceUi("thinking", "正在连接本地语音桥接层");
  voiceSocket = new WebSocket(voiceBridgeUrl);
  voiceSocket.binaryType = "arraybuffer";

  voiceSocket.addEventListener("open", () => {
    voiceConnected = true;
    voiceSocket.send(
      JSON.stringify({
        type: "session.start",
        inputMod: "text",
        model: "2.2.0.0",
        characterManifest:
          "你是苏丽娘，苏州AI数字导游。你温柔、灵动、有昆曲和江南园林气质。回答要短句、口语化、适合边走边听。用户问路线、景点、附近服务时，先自然回应，再给出清楚建议。",
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
    voiceConnected = false;
    setVoiceUi("idle", "语音桥接层已断开");
  });

  voiceSocket.addEventListener("error", () => {
    voiceConnected = false;
    setVoiceUi("idle", "无法连接语音桥接层，请先启动 voice_bridge");
  });
}

function handleVoiceEvent(event) {
  if (event.type === "bridge.ready" && voiceBridgeMode) {
    voiceBridgeMode.textContent = event.mock ? "Mock" : "Volc";
  }
  if (event.type === "state.changed") {
    setVoiceUi(event.state || "idle", event.label || "语音状态已更新");
  }
  if (event.type === "session.started") {
    setVoiceUi("listening", "语音会话已就绪，可以开始提问");
  }
  if (event.type === "asr.final") {
    if (voiceUserText) voiceUserText.textContent = event.text || "已收到语音问题";
    if (questionInput && event.text) questionInput.value = event.text;
    setVoiceUi("thinking", "苏丽娘正在思考");
  }
  if (event.type === "business.intent") {
    applyVoiceIntent(event.intent, event.params || {});
  }
  if (event.type === "tool.result") {
    applyVoiceToolResult(event.tool, event.result);
  }
  if (event.type === "chat.partial") {
    if (voiceAiText) voiceAiText.textContent = event.fullText || event.text || "";
  }
  if (event.type === "tts.start") {
    setVoiceUi("speaking", "苏丽娘正在回应");
  }
  if (event.type === "tts.end" || event.type === "chat.ended") {
    setVoiceUi("listening", "可以继续追问");
  }
  if (event.type === "error") {
    setVoiceUi("idle", event.message || "语音链路出现错误");
  }
}

function sendVoiceText(text) {
  const query = (text || questionInput?.value || content.quickQuestions[0]).trim();
  if (!query) return;
  if (voiceUserText) voiceUserText.textContent = query;
  if (voiceAiText) voiceAiText.textContent = "苏丽娘正在组织回答...";
  connectVoiceBridge();
  const send = () => voiceSocket?.send(JSON.stringify({ type: "text.query", content: query }));
  if (voiceConnected) {
    send();
  } else {
    voiceSocket?.addEventListener("open", () => setTimeout(send, 260), { once: true });
  }
}

function endVoiceSession() {
  voiceSocket?.send(JSON.stringify({ type: "session.end" }));
  voiceSocket?.close();
  voiceConnected = false;
  setVoiceUi("idle", "语音会话已结束");
}

function startVoicePress() {
  voicePressing = true;
  connectVoiceBridge();
  if (voiceUserText) voiceUserText.textContent = "正在听你说话...";
  if (voiceAiText) voiceAiText.textContent = "松开后，苏丽娘会整理你的问题。";
  setVoiceUi("listening", "正在听，松开后发送");
}

function finishVoicePress() {
  if (!voicePressing) return;
  voicePressing = false;
  if (voiceTalkButton) voiceTalkButton.classList.remove("is-recording");
  setVoiceUi("thinking", "苏丽娘正在理解你的问题");
  sendVoiceText();
}

function applyVoiceIntent(intent, params) {
  const labelMap = {
    generate_route: "正在查询适合你的苏州路线",
    spot_explain: "正在整理景点讲解",
    nearby_recommend: "正在查找附近推荐",
    smalltalk: "苏丽娘正在回应",
  };
  setVoiceUi("thinking", labelMap[intent] || "苏丽娘正在理解你的需求");

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
    nearbyFeature.innerHTML = `
      <p class="section-kicker">附近推荐</p>
      <h3>${escapeHtml(result.title || "苏州附近推荐")}</h3>
      <p>${escapeHtml(result.location ? `建议前往${result.location}，适合接在当前行程后。` : "根据当前位置推荐。")}</p>
    `;
  }
  if (nearbyList) {
    nearbyList.innerHTML = (result.items || [])
      .map(
        (item, index) => `
          <article>
            <span>${escapeHtml(item.title)}</span>
            <p>${escapeHtml(item.description)}</p>
            <button data-add-nearby="${index}">加入行程</button>
          </article>
        `,
      )
      .join("");
  }
}

function playPcmS16Le(arrayBuffer) {
  const samples = new Int16Array(arrayBuffer);
  if (!samples.length) return;
  voiceAudioContext ||= new AudioContext({ sampleRate: 24000 });
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
    setAvatar("speaking_loop.mp4", "正在讲解");
  }

  if (event.target.closest("[data-demo-recital]")) {
    setAvatar("recital_once.mp4", "诗词吟诵");
  }

  if (event.target.closest("[data-demo-guide]")) {
    setAvatar("guide_once.mp4", "引导景点");
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
    setVoiceUi("idle", "已取消本轮语音");
  });
}

document.querySelectorAll("video").forEach((video) => {
  video.addEventListener("ended", () => {
    if (video.classList.contains("welcome-video")) return;
    if (video.id === "avatar-video") {
      setAvatar("idle_loop.mp4", "等你提问");
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

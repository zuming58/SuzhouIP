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
const routeDurationPill = document.querySelector('[data-screen="route"] .screen-head .pill');
const nearbyFeature = document.querySelector("#nearby-feature");
const nearbyList = document.querySelector("#nearby-list");
const tripTimeline = document.querySelector("#trip-timeline");
const quickQuestion = document.querySelector("[data-quick-question]");
const voicePushButton = document.querySelector("[data-voice-talk]");
const voiceTextInput = document.getElementById("voice-text-input");
const voiceSendBtn = document.getElementById("voice-send-btn");
const voiceUserText = document.getElementById("voice-user-text");
const voiceAiText = document.getElementById("voice-ai-text");
const voiceState = document.getElementById("voice-state");
const voiceOrb = document.querySelector("#voice-orb");
const voiceWave = document.querySelector("#voice-wave");
const voiceBridgeMode = document.querySelector("#voice-bridge-mode");
const voiceVideos = [...document.querySelectorAll(".voice-video")];

const content = window.SULINIANG_CONTENT;
const videoBase = "../suliniang_project_materials/assets_3d_character_videos/normalized/";
const voiceBridgeUrl = window.SULINIANG_VOICE_BRIDGE_URL || "ws://127.0.0.1:8788/voice";
const BrowserAudioContext = window.AudioContext || window.webkitAudioContext;
const voiceTargetSampleRate = 16000;
const voicePacketSamples = 320;
let askAmbientTimer = null;
let askActiveLayer = 0;
let currentSpotId = content.defaultSpotId;
let activeRoute = content.routes[0];
let tripItems = activeRoute.nodes.map((node) => ({ ...node, source: "route" }));
let activeNearbyItems = content.nearby[0]?.items || [];
let currentConversationDraft = null;
let lastConversationSuggestion = null;
let pendingRouteExecution = false;
let savedItineraries = loadSavedItineraries();
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
let voiceResponseActive = false;
let voiceIdleTimer = null;
let voiceSpeakingFallbackTimer = null;
let voicePlaybackIdleTimer = null;
let voicePressConfirmTimer = null;
let voiceThinkingTimeoutTimer = null;
let voicePressStartedAt = 0;
let voiceCapturedBytes = 0;
let voiceSentAudioBytes = 0;
let activeVoiceVideoIndex = Math.max(0, voiceVideos.findIndex((video) => video.classList.contains("active")));
let currentVoiceVideoName = "idle_loop.mp4";
let pendingVoiceVideoName = "";
let voiceVisualState = "idle";
let voiceVideoTransitionId = 0;
let voicePlaybackSuppressed = false;

const screenVideoMap = {
  welcome: "welcome_once.mp4",
  home: "idle_loop.mp4",
  voice: "idle_loop.mp4",
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

const voiceVideoFiles = ["idle_loop.mp4", "listening_loop.mp4", "thinking_loop.mp4", "speaking_loop.mp4"];
const voiceStateConfig = {
  idle: { video: "idle_loop.mp4", label: "\u7b49\u4f60\u63d0\u95ee" },
  listening: { video: "listening_loop.mp4", label: "\u6b63\u5728\u503e\u542c" },
  thinking: { video: "thinking_loop.mp4", label: "\u6b63\u5728\u601d\u8003" },
  speaking: { video: "speaking_loop.mp4", label: "\u6b63\u5728\u56de\u5e94" },
};

function loadSavedItineraries() {
  try {
    return JSON.parse(localStorage.getItem("suliniang.savedItineraries") || "[]");
  } catch {
    return [];
  }
}

function persistSavedItineraries() {
  localStorage.setItem("suliniang.savedItineraries", JSON.stringify(savedItineraries.slice(0, 20)));
}

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

function preloadVoiceVideos() {
  voiceVideoFiles.forEach((videoName) => {
    const video = document.createElement("video");
    video.src = videoBase + videoName;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.load();
  });
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
  if (name === "voice" && !voicePressing && !voiceResponseActive) {
    requestVoiceState("idle", voiceSessionReady ? "\u8bed\u97f3\u4f1a\u8bdd\u5df2\u5c31\u7eea\uff0c\u53ef\u4ee5\u5f00\u59cb\u63d0\u95ee" : "\u8bed\u97f3\u4f1a\u8bdd\u5c31\u7eea\u540e\uff0c\u53ef\u4ee5\u5f00\u59cb\u63d0\u95ee", { force: true });
  }
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
  if (askState) askState.textContent = "\u6b63\u5728\u601d\u8003";
  setAskMiniVideo("thinking_loop.mp4", true);
  setAvatar("thinking_loop.mp4", "\u6b63\u5728\u601d\u8003");
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
  setAvatar("thinking_loop.mp4", "\u6b63\u5728\u4e3a\u4f60\u6392\u8def\u7ebf");
  return activeRoute;
}

function renderRoute(route) {
  if (!routeResult) return;
  syncRouteMeta(route);
  if (routeNote) routeNote.textContent = route.note;
  routeResult.classList.add("visible");
  routeResult.innerHTML = `
    <p class="route-title">${escapeHtml(route.title)}</p>
    <div class="route-toolbar">
      <button data-save-itinerary>保存行程</button>
      <button data-go="trip">历史/我的行程</button>
    </div>
    ${route.nodes
      .map((node) => {
        const action = node.action || {};
        const attrs = action.screen
          ? `data-go="${escapeHtml(action.screen)}"${action.spotTitle ? ` data-route-spot-title="${escapeHtml(action.spotTitle)}"` : ""}`
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

function syncRouteMeta(route) {
  const labels = route?.preferences || [];
  const duration = labels.find((label) => ["半天", "一天", "两天", "三天"].includes(label)) || durationLabelFromDraft(route?.draft?.days) || "路线";
  if (routeDurationPill) routeDurationPill.textContent = duration;
  if (routePreferences) {
    routePreferences.innerHTML = labels
      .map((label) => `<button class="selected" data-preference="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
      .join("");
  }
}

function durationLabelFromDraft(days) {
  if (!days) return "";
  return formatDaysLabel(days);
}

function ensureRouteSpots(route) {
  (route.nodes || []).forEach((node) => ensureSpotFromTitle(node.title, node.description));
  renderSpots();
}

function ensureSpotFromTitle(title, description = "") {
  const existing = content.spots.find((spot) => spot.name === title || title.includes(spot.name));
  if (existing) return existing;
  const id = `dynamic-${String(title).replace(/\s+/g, "-")}`;
  const spot = {
    id,
    name: title,
    x: "50%",
    y: "50%",
    summary: description || `${title}是本次路线中的定制讲解点。`,
    story: buildDynamicSpotStory(title, description),
  };
  content.spots.push(spot);
  return spot;
}

function buildDynamicSpotStory(title, description = "") {
  if (title.includes("拙政园")) return "拙政园是苏州园林的代表。讲解时可以从水面、亭榭、窗景和诗意空间展开，再进入远香堂、与谁同坐轩、小飞虹等点位。";
  if (title.includes("苏州博物馆")) return "苏州博物馆把传统园林的白墙灰瓦、水院光影，转译成现代建筑语言。这里适合讲苏州的古今相接。";
  if (title.includes("平江路")) return "平江路沿河而行，保留了苏州古城的水巷肌理。这里适合边走边讲桥、河、老宅和苏式小吃。";
  if (title.includes("虎丘")) return "虎丘是苏州历史记忆的重要地标，可以从虎丘塔、吴王传说和山水格局讲起。";
  return `${title}是这次路线中的一站。${description || "后续可以根据游客兴趣，生成更诗意、更亲子或更专业的讲解版本。"}`;
}

function selectSpotByTitle(title) {
  const spot = ensureSpotFromTitle(title);
  return selectSpot(spot.id);
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
    const nextItem = { ...item, source: "nearby" };
    tripItems.push(nextItem);
    if (activeRoute && !activeRoute.nodes.some((node) => node.title === nextItem.title && node.time === nextItem.time)) {
      activeRoute = {
        ...activeRoute,
        nodes: [...activeRoute.nodes, {
          time: nextItem.time || "待定",
          title: nextItem.title,
          description: nextItem.description || "后续补充加入的行程节点。",
          action: { label: "查看介绍", screen: "spot", spotTitle: nextItem.title },
        }],
        note: `${activeRoute.note || ""}；已补充：${nextItem.title}`,
      };
      ensureRouteSpots(activeRoute);
      renderRoute(activeRoute);
    }
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
            <button data-add-nearby="${index}">加入行程</button>
          </article>
        `,
      )
      .join("");
  }
}

function renderTrip() {
  if (!tripTimeline) return;
  const currentHtml = tripItems
    .map(
      (item) => `
        <article class="${item.source === "nearby" ? "muted" : ""}">
          <time>${escapeHtml(item.time || "待定")}</time>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `,
    )
    .join("");
  const historyHtml = savedItineraries.length
    ? `
      <div class="history-block">
        <p class="section-kicker">历史行程</p>
        ${savedItineraries
          .map(
            (item) => `
              <article class="history-item">
                <time>${escapeHtml(item.createdAt)}</time>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.note || "已保存行程")}</p>
                <button data-restore-itinerary="${escapeHtml(item.id)}">恢复行程</button>
              </article>
            `,
          )
          .join("")}
      </div>
    `
    : `<div class="history-block"><p class="section-kicker">历史行程</p><p class="empty-history">还没有保存的行程。</p></div>`;
  tripTimeline.innerHTML = `${currentHtml}${historyHtml}`;
}

function initQuickQuestion() {
  if (quickQuestion) quickQuestion.textContent = content.quickQuestions[0];
  if (questionInput) questionInput.value = content.quickQuestions[0];
}

function clearVoiceIdleTimer() {
  if (voiceIdleTimer) {
    window.clearTimeout(voiceIdleTimer);
    voiceIdleTimer = null;
  }
}

function clearVoiceSpeakingFallbackTimer() {
  if (voiceSpeakingFallbackTimer) {
    window.clearTimeout(voiceSpeakingFallbackTimer);
    voiceSpeakingFallbackTimer = null;
  }
}

function clearVoicePlaybackIdleTimer() {
  if (voicePlaybackIdleTimer) {
    window.clearTimeout(voicePlaybackIdleTimer);
    voicePlaybackIdleTimer = null;
  }
}

function clearVoicePressConfirmTimer() {
  if (voicePressConfirmTimer) {
    window.clearTimeout(voicePressConfirmTimer);
    voicePressConfirmTimer = null;
  }
}

function clearVoiceThinkingTimeoutTimer() {
  if (voiceThinkingTimeoutTimer) {
    window.clearTimeout(voiceThinkingTimeoutTimer);
    voiceThinkingTimeoutTimer = null;
  }
}

function clearVoiceTimers() {
  clearVoiceIdleTimer();
  clearVoiceSpeakingFallbackTimer();
  clearVoicePlaybackIdleTimer();
  clearVoicePressConfirmTimer();
  clearVoiceThinkingTimeoutTimer();
}

function scheduleVoiceIdle(delay = 2400, text = "\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee") {
  clearVoiceIdleTimer();
  voiceIdleTimer = window.setTimeout(() => {
    forceVoiceIdle(text);
  }, delay);
}

function forceVoiceIdle(text = "\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee") {
  voiceResponseActive = false;
  clearVoiceTimers();
  requestVoiceState("idle", text, { force: true });
}

function markVoiceSpeaking(text = "\u82cf\u4e3d\u5a18\u6b63\u5728\u64ad\u62a5") {
  voiceResponseActive = true;
  clearVoiceIdleTimer();
  clearVoiceSpeakingFallbackTimer();
  clearVoicePlaybackIdleTimer();
  clearVoiceThinkingTimeoutTimer();
  requestVoiceState("speaking", text, { force: true });
  // 兜底：90秒后强制停止，防止永远卡在说话状态
  // 正常会在 chat.ended + tts.end 后自动调用 scheduleVoiceIdleAfterPlayback
  voiceSpeakingFallbackTimer = window.setTimeout(() => {
    forceVoiceIdle("可以继续追问");
  }, 90000);
}

function scheduleVoiceIdleAfterPlayback(text = "可以继续追问") {
  clearVoiceIdleTimer();
  clearVoicePlaybackIdleTimer();
  const now = voiceAudioContext?.currentTime || 0;
  // 移除8秒硬上限，按实际剩余播放时间调度
  // 避免长文本播报还在播放但视频已经切回 idle 的问题
  const remainingMs = Math.max(500, (voicePlaybackTime - now) * 1000 + 500);
  // 双重保险：就算计算有误，最多也等90秒，防止永远卡死在说话状态
  const safeDelay = Math.min(remainingMs, 90000);
  voicePlaybackIdleTimer = window.setTimeout(() => {
    // 执行前再检查一次：如果还在播放就重新调度
    const checkNow = voiceAudioContext?.currentTime || 0;
    if (voicePlaybackTime - checkNow > 0.5) {
      scheduleVoiceIdleAfterPlayback(text);
    } else {
      forceVoiceIdle(text);
    }
  }, safeDelay);
}

function requestVoiceState(state, text, options = {}) {
  if (!voiceStateConfig[state]) state = "idle";
  // 状态优先级：speaking > listening > thinking > idle
  const priority = { idle: 0, thinking: 1, listening: 2, speaking: 3 };
  const currentPriority = priority[voiceVisualState] || 0;
  const targetPriority = priority[state] || 0;
  if (!options.force && targetPriority < currentPriority && voiceVisualState !== "idle") {
    return;
  }
  setVoiceAvatarState(state, text);
}

function setVoiceAvatarState(state, text) {
  if (!voiceStateConfig[state]) state = "idle";
  voiceVisualState = state;
  if (voiceState) voiceState.textContent = text || voiceStateConfig[state].label;
  if (voiceOrb) voiceOrb.dataset.state = state;
  if (voicePushButton) {
    voicePushButton.classList.toggle("is-recording", state === "listening" && voicePressing);
  }
  const config = voiceStateConfig[state];
  // 语音页只控制小窗口视频，不干扰主页面大数字人
  // 防止双重视频切换导致白屏或冲突
  setVoiceVideoSimple(config.video);
}

function setVoiceVideoSimple(videoName) {
  if (!voiceVideos.length) return;
  const nextSrc = videoBase + videoName;
  if (currentVoiceVideoName === videoName) {
    const activeVideo = voiceVideos[activeVoiceVideoIndex];
    if (activeVideo && activeVideo.paused) {
      activeVideo.play().catch(() => {});
    }
    return;
  }

  const transitionId = ++voiceVideoTransitionId;
  const activeVideo = voiceVideos[activeVoiceVideoIndex];
  const nextIndex = voiceVideos.length > 1 ? 1 - activeVoiceVideoIndex : activeVoiceVideoIndex;
  const nextVideo = voiceVideos[nextIndex];
  pendingVoiceVideoName = videoName;

  const doSwitch = () => {
    if (transitionId !== voiceVideoTransitionId || pendingVoiceVideoName !== videoName) return;
    nextVideo.oncanplay = null;
    nextVideo.onloadeddata = null;
    nextVideo.loop = true;
    nextVideo.classList.add("active");
    if (activeVideo && activeVideo !== nextVideo) {
      activeVideo.classList.remove("active");
      activeVideo.pause();
    }
    activeVoiceVideoIndex = nextIndex;
    currentVoiceVideoName = videoName;
  };

  const tryPlay = () => {
    nextVideo.currentTime = 0;
    nextVideo.play()
      .then(() => {
        requestAnimationFrame(() => requestAnimationFrame(doSwitch));
      })
      .catch(() => {
        // 播放失败时，直接切换（避免卡死）
        doSwitch();
      });
  };

  nextVideo.loop = true;
  nextVideo.muted = true;
  nextVideo.playsInline = true;

  if (!nextVideo.src.endsWith(videoName)) {
    nextVideo.oncanplay = tryPlay;
    nextVideo.onloadeddata = tryPlay;
    nextVideo.src = nextSrc;
    nextVideo.load();
  } else {
    tryPlay();
  }

  // 兜底：1秒后强制切换，防止白框
  window.setTimeout(() => {
    if (transitionId === voiceVideoTransitionId && currentVoiceVideoName !== videoName) {
      doSwitch();
    }
  }, 1000);
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
  if (voicePressing) {
    if (voiceState) voiceState.textContent = "\u6b63\u5728\u51c6\u5907\u542c\u4f60\u8bf4\u8bdd";
  } else {
    requestVoiceState("thinking", "\u6b63\u5728\u8fde\u63a5\u672c\u5730\u8bed\u97f3\u6865\u63a5\u5c42");
  }
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
      if (voicePlaybackSuppressed) return;
      markVoiceSpeaking("\u82cf\u4e3d\u5a18\u6b63\u5728\u64ad\u62a5");
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
    if (!voiceSessionClosing) requestVoiceState("idle", "\u8bed\u97f3\u6865\u63a5\u5c42\u5df2\u65ad\u5f00");
  });

  voiceSocket.addEventListener("error", () => {
    if (socket !== voiceSocket) return;
    voiceConnected = false;
    voiceSessionReady = false;
    setVoiceBridgeBadge("\u672a\u8fde\u63a5");
    requestVoiceState("idle", "\u65e0\u6cd5\u8fde\u63a5\u8bed\u97f3\u6865\u63a5\u5c42\uff0c\u8bf7\u5148\u542f\u52a8 voice_bridge");
  });
}

function handleVoiceEvent(event) {
  if (event.type === "bridge.ready") {
    setVoiceBridgeBadge(event.mock ? "Mock" : "\u771f\u5b9e");
    if (!voicePressing) {
      requestVoiceState("thinking", event.mock ? "\u5df2\u8fde\u63a5 Mock \u6865\u63a5" : "\u5df2\u8fde\u63a5\u771f\u5b9e\u8bed\u97f3\u6865\u63a5");
    }
  }
  if (event.type === "state.changed") {
    if (!voiceResponseActive && event.label && voiceState && !voicePressing) voiceState.textContent = event.label;
  }
  if (event.type === "session.started") {
    voiceSessionReady = true;
    voiceResponseActive = false;
    clearVoiceIdleTimer();
    clearVoiceSpeakingFallbackTimer();
    clearVoicePlaybackIdleTimer();
    if (voicePressing) {
      requestVoiceState("listening", "\u6b63\u5728\u542c\uff0c\u677e\u5f00\u540e\u53d1\u9001");
    } else if (pendingAudioEnd) {
      requestVoiceState("thinking", "\u82cf\u4e3d\u5a18\u6b63\u5728\u8bc6\u522b\u4f60\u7684\u95ee\u9898");
    } else {
      requestVoiceState("idle", "\u8bed\u97f3\u4f1a\u8bdd\u5df2\u5c31\u7eea\uff0c\u53ef\u4ee5\u5f00\u59cb\u63d0\u95ee");
    }
    flushPendingAudioChunks();
    flushPendingAudioEnd();
    flushPendingVoiceQuery();
  }
  if (event.type === "asr.final") {
    voicePlaybackSuppressed = false;
    if (voiceUserText) voiceUserText.textContent = event.text || "已收到语音问题";
    if (questionInput && event.text) questionInput.value = event.text;
    // 清空上一轮 AI 回复，准备接收新回答
    if (voiceAiText) voiceAiText.textContent = "";
    voiceResponseActive = false;
    requestVoiceState("thinking", "苏丽娘正在思考", { force: true });
    scheduleVoiceIdle(7000, "没有收到回答，可以继续追问");
  }
  if (event.type === "asr.partial") {
    if (voiceUserText && event.text) voiceUserText.textContent = event.text;
    if (voicePressing) requestVoiceState("listening", "\u6b63\u5728\u542c\uff0c\u677e\u5f00\u540e\u53d1\u9001");
  }
  if (event.type === "business.intent") {
    applyVoiceIntent(event.intent, event.params || {});
  }
  if (event.type === "conversation.suggestion") {
    renderConversationSuggestion(event.suggestion);
  }
  if (event.type === "tool.result") {
    applyVoiceToolResult(event.tool, event.result);
  }
  if (event.type === "chat.partial") {
    if (voicePlaybackSuppressed) return;
    if (voiceAiText) voiceAiText.textContent = event.fullText || event.text || "";
    // 自动滚动到底部
    const transcriptContainer = voiceAiText?.closest(".voice-transcript");
    if (transcriptContainer) {
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }
    markVoiceSpeaking("苏丽娘正在回答");
  }
  if (event.type === "tts.start") {
    markVoiceSpeaking("\u82cf\u4e3d\u5a18\u6b63\u5728\u64ad\u62a5");
  }
  if (event.type === "chat.ended") {
    clearVoiceIdleTimer();
  }
  if (event.type === "tts.end") {
    voiceResponseActive = false;
    clearVoiceSpeakingFallbackTimer();
    scheduleVoiceIdleAfterPlayback("\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee");
  }
  if (event.type === "error") {
    voiceSessionReady = false;
    voiceResponseActive = false;
    clearVoiceIdleTimer();
    clearVoiceSpeakingFallbackTimer();
    clearVoicePlaybackIdleTimer();
    setVoiceBridgeBadge("\u9519\u8bef");
    requestVoiceState("idle", event.message || "\u8bed\u97f3\u94fe\u8def\u51fa\u73b0\u9519\u8bef");
  }
}

function flushPendingVoiceQuery() {
  if (!voiceSessionReady || !pendingVoiceQuery || voiceSocket?.readyState !== WebSocket.OPEN) return;
  const query = pendingVoiceQuery;
  pendingVoiceQuery = "";
  voiceResponseActive = false;
  clearVoiceIdleTimer();
  clearVoiceSpeakingFallbackTimer();
  clearVoicePlaybackIdleTimer();
  clearVoiceThinkingTimeoutTimer();
  voicePlaybackTime = voiceAudioContext?.currentTime || 0;
  voiceAudioContext?.resume?.().catch(() => {});
  requestVoiceState("thinking", "苏丽娘正在理解你的问题");
  voiceSocket.send(JSON.stringify({ type: "text.query", content: query }));
}

function sendVoiceAudioChunk(chunk) {
  if (!chunk?.byteLength) return;
  voiceCapturedBytes += chunk.byteLength;
  if (voiceSessionReady && voiceSocket?.readyState === WebSocket.OPEN) {
    voiceSocket.send(chunk);
    voiceSentAudioBytes += chunk.byteLength;
    return;
  }
  pendingAudioChunks.push(chunk);
  if (pendingAudioChunks.length > 80) pendingAudioChunks.shift();
}

function flushPendingAudioChunks() {
  if (!voiceSessionReady || voiceSocket?.readyState !== WebSocket.OPEN) return;
  while (pendingAudioChunks.length) {
    const chunk = pendingAudioChunks.shift();
    voiceSocket.send(chunk);
    voiceSentAudioBytes += chunk.byteLength;
  }
}

function flushPendingAudioEnd() {
  if (!pendingAudioEnd || !voiceSessionReady || voiceSocket?.readyState !== WebSocket.OPEN) return;
  pendingAudioEnd = false;
  voiceSocket.send(JSON.stringify({ type: "audio.end" }));
}

function sendVoiceText(text) {
  voicePlaybackSuppressed = false;
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
  voiceResponseActive = false;
  clearVoiceIdleTimer();
  clearVoiceSpeakingFallbackTimer();
  clearVoicePlaybackIdleTimer();
  voiceSocket?.send(JSON.stringify({ type: "session.end" }));
  voiceSocket?.close();
  voiceConnected = false;
  voiceSessionReady = false;
  setVoiceBridgeBadge("\u5df2\u7ed3\u675f");
  requestVoiceState("idle", "\u8bed\u97f3\u4f1a\u8bdd\u5df2\u7ed3\u675f");
}

async function startVoicePress() {
  voicePlaybackSuppressed = false;
  if (voicePressing) return;
  voicePressing = true;
  voicePressStartedAt = performance.now();
  voiceCapturedBytes = 0;
  voiceSentAudioBytes = 0;
  voiceResponseActive = false;

  // 立即停止所有正在播放的音频并重置状态
  stopAllVoicePlayback();
  clearVoiceTimers();

  if (voicePushButton) voicePushButton.classList.add("is-recording");
  setVoiceWaveLevel(0.12);
  connectVoiceBridge("push_to_talk");
  if (voiceUserText) voiceUserText.textContent = "正在听你说话...";
  if (voiceAiText) voiceAiText.textContent = "松开后，苏丽娘会开始回答。";
  if (voiceState) voiceState.textContent = "正在听，松开后发送";
  voicePressConfirmTimer = window.setTimeout(() => {
    if (voicePressing) requestVoiceState("listening", "正在听，松开后发送", { force: true });
  }, 180);
  try {
    await startMicrophoneCapture();
  } catch (error) {
    voicePressing = false;
    clearVoicePressConfirmTimer();
    if (voicePushButton) voicePushButton.classList.remove("is-recording");
    setVoiceWaveLevel(0);
    requestVoiceState("idle", error.message || "无法打开麦克风", { force: true });
  }
}

function stopAllVoicePlayback() {
  // 停止所有正在播放的音频
  if (voiceAudioContext) {
    try {
      voiceAudioContext.suspend();
      voiceAudioContext.close();
    } catch (e) {}
    voiceAudioContext = null;
  }
  voicePlaybackTime = 0;
  voiceResponseActive = false;
  clearVoiceTimers();
}

function finishVoicePress() {
  if (!voicePressing) return;
  const pressDuration = performance.now() - voicePressStartedAt;
  voicePressing = false;
  clearVoicePressConfirmTimer();
  if (voicePushButton) voicePushButton.classList.remove("is-recording");
  stopMicrophoneCapture(pressDuration < 450);
  if (pressDuration < 450 || voiceCapturedBytes < 960) {
    pendingAudioChunks = [];
    pendingAudioEnd = false;
    if (voiceSentAudioBytes > 0 && voiceSocket?.readyState === WebSocket.OPEN) {
      voiceSessionClosing = true;
      voiceSocket.send(JSON.stringify({ type: "session.end" }));
      voiceSocket.close();
      voiceConnected = false;
      voiceSessionReady = false;
      voiceSessionInputMod = "";
    }
    setVoiceWaveLevel(0);
    requestVoiceState("idle", "按住说话，松开后发送", { force: true });
    return;
  }
  // 有效提问，清空上一轮 AI 回复，准备接收新回答
  if (voiceAiText) voiceAiText.textContent = "";
  requestVoiceState("thinking", "苏丽娘正在识别你的问题");
  voiceThinkingTimeoutTimer = window.setTimeout(() => {
    forceVoiceIdle("没有识别到新语音，可以继续追问");
  }, 10000);
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

function stopMicrophoneCapture(discardPending = false) {
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
  if (voicePendingPcm.length && !discardPending) {
    sendVoiceAudioChunk(floatToPcm16(voicePendingPcm).buffer);
    voicePendingPcm = new Float32Array(0);
  }
  if (discardPending) voicePendingPcm = new Float32Array(0);
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

function renderConversationSuggestion(suggestion) {
  if (!suggestion || !voiceAiText) return;
  lastConversationSuggestion = suggestion;
  currentConversationDraft = suggestion.draft || currentConversationDraft;
  const container = voiceAiText.closest(".voice-transcript");
  if (!container) return;
  container.querySelector(".voice-suggestion-card")?.remove();
  const draft = suggestion.draft || {};
  const lines = [
    draft.destinations?.length ? `想去：${draft.destinations.join("、")}` : "路线：苏州经典路线",
    draft.days ? `时长：${formatDaysLabel(draft.days)}` : "时长：待补充",
    draft.startTime ? `时间：${draft.startTime}` : "时间：待补充",
    draft.people ? `同行：${draft.people}` : "同行：待补充",
    draft.prefs?.length ? `偏好：${draft.prefs.join("、")}` : "偏好：待补充",
  ];
  const card = document.createElement("div");
  card.className = `voice-suggestion-card ${suggestion.kind === "route_ready" ? "is-ready" : ""}`;
  card.innerHTML = `
    <p class="suggestion-title">${escapeHtml(suggestion.text || "我已经帮你记下来了")}</p>
    <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <div class="suggestion-actions">
      ${(suggestion.actions || [])
        .map((action) => `<button class="${action.primary ? "primary-action" : ""}" data-suggestion-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`)
        .join("")}
    </div>
  `;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}

function clearConversationSuggestion() {
  lastConversationSuggestion = null;
  document.querySelector(".voice-suggestion-card")?.remove();
}

function formatDaysLabel(days) {
  return days === "three_day" ? "三天" : days === "two_day" ? "两天" : days === "one_day" ? "一天" : "半天";
}

function interruptVoicePlayback(reason = "正在执行你的操作") {
  voicePlaybackSuppressed = true;
  stopAllVoicePlayback();
  pendingVoiceQuery = "";
  pendingAudioChunks = [];
  pendingAudioEnd = false;
  requestVoiceState("thinking", reason, { force: true });
}

function executeSuggestionAction(action) {
  if (!action) return;
  if (action === "continue") {
    clearConversationSuggestion();
    requestVoiceState("idle", "可以继续补充你的想法", { force: true });
    return;
  }
  if (action === "generate_route") {
    pendingRouteExecution = true;
    interruptVoicePlayback("正在生成路线");
  }
  if (action === "nearby_food") {
    interruptVoicePlayback("正在查找附近美食");
  }
  if (voiceSocket?.readyState === WebSocket.OPEN) {
    voiceSocket.send(JSON.stringify({ type: "action.execute", action, draft: currentConversationDraft || undefined }));
  } else {
    connectVoiceBridge("text");
    window.setTimeout(() => {
      if (voiceSocket?.readyState === WebSocket.OPEN) voiceSocket.send(JSON.stringify({ type: "action.execute", action, draft: currentConversationDraft || undefined }));
    }, 400);
  }
}

function saveActiveItinerary() {
  if (!activeRoute) return;
  const item = {
    id: `itinerary-${Date.now()}`,
    title: activeRoute.title,
    createdAt: new Date().toLocaleString("zh-CN"),
    note: activeRoute.note,
    route: activeRoute,
    tripItems,
  };
  savedItineraries.unshift(item);
  persistSavedItineraries();
  renderTrip();
  requestVoiceState("idle", "行程已保存，可以在我的行程查看", { force: true });
}

function restoreItinerary(id) {
  const item = savedItineraries.find((entry) => entry.id === id);
  if (!item) return;
  activeRoute = item.route;
  tripItems = item.tripItems || item.route.nodes || [];
  renderRoute(activeRoute);
  renderTrip();
  showScreen("route");
}

function applyVoiceIntent(intent, params) {
  const labelMap = {
    generate_route: "正在为你规划路线",
    finalize_route: "正在生成定制路线",
    route_ready: "可以生成候选路线",
    route_collect: "正在记录你的出行需求",
    spot_explain: "正在整理景点讲解",
    nearby_recommend: "正在查找附近推荐",
    smalltalk: "苏丽娘正在回答",
  };
  requestVoiceState("thinking", labelMap[intent] || "苏丽娘正在理解你的需求", { force: true });

  if (intent === "spot_explain" && params.spot) {
    const matched = content.spots.find((spot) => spot.name === params.spot);
    if (matched) selectSpot(matched.id);
  }
}

function applyVoiceToolResult(tool, result) {
  if (!result) return;

  if (tool === "generate_route" || tool === "finalize_route") {
    activeRoute = result;
    tripItems = result.nodes.map((node) => ({ ...node, source: "route" }));
    ensureRouteSpots(result);
    renderRoute(result);
    renderTrip();
    if (pendingRouteExecution) {
      pendingRouteExecution = false;
      clearConversationSuggestion();
      requestVoiceState("idle", "路线已生成，可以查看定制路线", { force: true });
      setTimeout(() => showScreen("route"), 120);
    }
  }

  if (tool === "spot_explain") {
    const matched = content.spots.find((spot) => spot.name === result.spot);
    if (matched) selectSpot(matched.id);
    if (spotStory && result.text) spotStory.textContent = result.text;
    // 语音对话期间不自动跳景点页，避免反复抢到“与谁同坐轩”。
    // 只更新讲解数据，用户需要时再手动点进导览/景点页。
  }

  if (tool === "nearby_recommend") {
    activeNearbyItems = result.items || [];
    if (nearbyFeature) {
      const nearbySummary = result.location
        ? `建议前往${result.location}，适合接在当前行程后。`
        : "根据当前位置推荐。";
      nearbyFeature.innerHTML = `
        <p class="section-kicker">附近推荐</p>
        <h3>${escapeHtml(result.title || "苏州附近推荐")}</h3>
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
              <button data-add-nearby="${index}">加入行程</button>
            </article>
          `,
        )
        .join("");
    }
    // 语音对话期间不自动跳附近页，避免问答被打断。
    // 附近推荐结果已写入页面数据，用户可手动进入附近页查看。
  }
}

function renderNearbyResult(result) {
  activeNearbyItems = result.items || [];
  if (nearbyFeature) {
    const nearbySummary = result.location
      ? `\u5efa\u8bae\u524d\u5f80${result.location}\uff0c\u9002\u5408\u63a5\u5728\u5f53\u524d\u884c\u7a0b\u540e\u3002`
      : "\u6839\u636e\u5f53\u524d\u4f4d\u7f6e\u63a8\u8350\u3002";
    nearbyFeature.innerHTML = `
      <p class="section-kicker">附近推荐</p>
      <h3>${escapeHtml(result.title || "苏州附近推荐")}</h3>
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
  scheduleVoiceIdleAfterPlayback("\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee");
}

document.addEventListener("click", (event) => {
  const suggestionAction = event.target.closest("[data-suggestion-action]");
  if (suggestionAction) {
    executeSuggestionAction(suggestionAction.dataset.suggestionAction);
  }

  if (event.target.closest("[data-save-itinerary]")) {
    saveActiveItinerary();
  }

  const restoreItineraryButton = event.target.closest("[data-restore-itinerary]");
  if (restoreItineraryButton) {
    restoreItinerary(restoreItineraryButton.dataset.restoreItinerary);
  }

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
    if (go.dataset.routeSpotTitle) selectSpotByTitle(go.dataset.routeSpotTitle);
    else if (go.dataset.go === "spot") selectSpot(currentSpotId);
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
    const activeScreen = document.querySelector(".screen.active")?.dataset.screen;
    const stateName = videoTrigger.dataset.video;
    // 映射状态名到完整视频名
    const stateToVideo = {
      idle: "idle_loop.mp4",
      listen: "listening_loop.mp4",
      think: "thinking_loop.mp4",
      speak: "speaking_loop.mp4",
      guide: "guide_once.mp4",
      smile: "smile_once.mp4",
    };
    const videoName = stateToVideo[stateName] || "idle_loop.mp4";

    if (activeScreen === "voice") {
      // 在语音页，控制语音小窗口
      const stateMap = {
        "idle_loop.mp4": "idle",
        "listening_loop.mp4": "listening",
        "thinking_loop.mp4": "thinking",
        "speaking_loop.mp4": "speaking",
      };
      const state = stateMap[videoName] || "idle";
      setVoiceAvatarState(state, videoTrigger.dataset.state || voiceStateConfig[state].label);
    } else {
      // 其他页面，控制全局数字人
      setAvatar(videoName, videoTrigger.dataset.state);
    }
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

if (voicePushButton) {
  voicePushButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    voicePushButton.setPointerCapture(event.pointerId);
    startVoicePress();
  });
  voicePushButton.addEventListener("pointerup", (event) => {
    event.preventDefault();
    if (voicePushButton.hasPointerCapture?.(event.pointerId)) {
      voicePushButton.releasePointerCapture(event.pointerId);
    }
    finishVoicePress();
  });
  voicePushButton.addEventListener("pointercancel", () => {
    voicePressing = false;
    if (voicePushButton) voicePushButton.classList.remove("is-recording");
    clearVoiceIdleTimer();
    clearVoicePlaybackIdleTimer();
    stopMicrophoneCapture();
    requestVoiceState("idle", "\u5df2\u53d6\u6d88\u672c\u8f6e\u8bed\u97f3");
  });
  voicePushButton.addEventListener("contextmenu", (event) => event.preventDefault());
  voicePushButton.addEventListener("dragstart", (event) => event.preventDefault());
}

// 文字发送事件
if (voiceSendBtn) {
  voiceSendBtn.addEventListener("click", () => {
    const text = voiceTextInput?.value.trim();
    if (text) {
      sendVoiceText(text);
      if (voiceTextInput) voiceTextInput.value = "";
    }
  });
}

if (voiceTextInput) {
  voiceTextInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const text = voiceTextInput.value.trim();
      if (text) {
        sendVoiceText(text);
        voiceTextInput.value = "";
      }
    }
  });
}

voiceVideos.forEach((video) => {
  video.addEventListener("pause", () => {
    const activeScreen = document.querySelector(".screen.active")?.dataset.screen;
    if (activeScreen === "voice" && video.classList.contains("active") && video.loop && !video.ended) {
      window.setTimeout(() => video.play().catch(() => {}), 80);
    }
  });
});

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
preloadVoiceVideos();

const initialScreen = new URLSearchParams(window.location.search).get("screen");
showScreen(screenVideoMap[initialScreen] ? initialScreen : "welcome");



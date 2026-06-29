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

const content = window.SULINIANG_CONTENT;
const videoBase = "../suliniang_project_materials/assets_3d_character_videos/normalized/";
let askAmbientTimer = null;
let askActiveLayer = 0;
let currentSpotId = content.defaultSpotId;
let activeRoute = content.routes[0];
let tripItems = activeRoute.nodes.map((node) => ({ ...node, source: "route" }));

const screenVideoMap = {
  welcome: "welcome_once.mp4",
  home: "idle_loop.mp4",
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

  const addNearby = event.target.closest("[data-add-nearby]");
  if (addNearby) {
    const group = content.nearby[0];
    const item = group.items[Number(addNearby.dataset.addNearby)];
    addToTrip(item);
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

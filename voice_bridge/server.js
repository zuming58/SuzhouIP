import { config as loadEnv } from "dotenv";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { DoubaoRealtimeClient } from "./src/doubao-realtime-client.js";
import { classifyMockIntent, buildMockToolResult, buildMockReply } from "./src/intent-classifier.js";
import { generateRoute, explainSpot, recommendNearby, buildVoiceReply } from "./src/business-tools.js";
import { extractConversationState, mergeDrafts, hasStateLlmConfig } from "./src/conversation-state-extractor.js";
import { isRouteRelated } from "./src/suzhou-lexicon.js";

loadEnv({ override: true });

const PORT = Number(process.env.PORT || 8788);
const MOCK_MODE = process.env.MOCK_MODE !== "0" || !process.env.VOLC_ACCESS_KEY;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      mock: MOCK_MODE,
      volcReady: Boolean(process.env.VOLC_ACCESS_KEY),
      stateLlmReady: hasStateLlmConfig(),
      model: process.env.VOLC_MODEL || "1.2.1.1",
    });
    return;
  }
  sendJson(res, 404, { error: "not_found" });
});

const wss = new WebSocketServer({ server, path: "/voice" });

wss.on("connection", async (socket) => {
  let client = null;
  let mockClosed = false;
  let upstreamReady = false;
  let pendingUpstreamActions = [];
  let currentQuery = "";
  let lastProcessedQuery = "";
  let conversationTurns = [];
  let routeDraft = createEmptyRouteDraft();

  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  send({ type: "bridge.ready", mock: MOCK_MODE });

  const enqueueUpstream = (action) => {
    if (upstreamReady) {
      runUpstreamAction(action, send);
      return;
    }
    pendingUpstreamActions.push(action);
  };

  const flushUpstream = () => {
    if (!upstreamReady) return;
    const actions = pendingUpstreamActions;
    pendingUpstreamActions = [];
    actions.forEach((action) => runUpstreamAction(action, send));
  };

  const processIntent = async (text) => {
    const normalizedText = String(text || "").trim();
    if (!normalizedText || normalizedText === lastProcessedQuery) return;
    lastProcessedQuery = normalizedText;

    const intent = classifyMockIntent(normalizedText);
    conversationTurns.push({ role: "user", content: normalizedText });
    const state = await extractConversationState({ previousDraft: routeDraft, conversation: conversationTurns, latestText: normalizedText });
    routeDraft = state.draft || routeDraft;
    const isRoute = intent.name === "route_collect" || intent.name === "route_ready" || isRouteRelated(normalizedText) || routeDraft.allowClassicRoute || routeDraft.destinations.length || routeDraft.days;
    const finalIntent = isRoute ? (routeDraft.acceptedSuggestedRoute ? "route_ready" : "route_collect") : intent.name;
    send({
      type: "business.intent",
      intent: finalIntent,
      confidence: state.source === "llm" ? 0.95 : intent.confidence,
      params: { ...intent.params, draft: routeDraft, stateSource: state.source },
    });
    if (state.error) send({ type: "debug.state_extractor", source: state.source, error: state.error });

    let upstreamText = normalizedText;
    if (finalIntent === "route_collect" || finalIntent === "route_ready") {
      send({ type: "conversation.suggestion", suggestion: buildConversationSuggestion(routeDraft, finalIntent) });
      upstreamText = buildRouteCollectReply(routeDraft);
    } else if (finalIntent !== "smalltalk") {
      const toolResult = await callTool({ ...intent, name: finalIntent, draft: routeDraft });
      if (toolResult) {
        send({ type: "tool.result", tool: finalIntent, result: toolResult });
        upstreamText = buildVoiceReply(finalIntent, toolResult) || normalizedText;
      }
    }

    if (!MOCK_MODE && client && upstreamText) {
      enqueueUpstream(() => client.sendText(upstreamText));
    }
  };

  socket.on("message", async (data, isBinary) => {
    if (isBinary) {
      const chunk = Buffer.from(data);
      if (client) enqueueUpstream(() => client.sendAudio(chunk));
      return;
    }

    const message = safeJson(data.toString());
    if (!message) return;

    if (message.type === "session.start") {
      upstreamReady = false;
      pendingUpstreamActions = [];
      lastProcessedQuery = "";
      currentQuery = "";
      conversationTurns = [];
      routeDraft = createEmptyRouteDraft();
      if (MOCK_MODE) {
        mockClosed = false;
        send({ type: "session.started", dialogId: "mock-dialog" });
        send({ type: "state.changed", state: "idle", label: "可以开始提问" });
        return;
      }

      const configError = validateVolcConfig();
      if (configError) {
        send({ type: "error", message: configError });
        return;
      }

      client = new DoubaoRealtimeClient(loadConfig(message), {
        audio: (chunk) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(chunk, { binary: true });
        },
        event: (event) => {
          if (event.type === "asr.final" && event.text) {
            currentQuery = event.text;
            processIntent(event.text);
          }
          send(event);
          if (event.type === "session.started") {
            upstreamReady = true;
            flushUpstream();
          }
        },
      });
      try {
        await client.connect();
      } catch (error) {
        send({ type: "error", message: error.message });
      }
    }

    if (message.type === "text.query") {
      if (MOCK_MODE) {
        mockReply(send, message.content || "帮我安排半天苏州路线", () => mockClosed);
      } else {
        currentQuery = message.content || "";
        processIntent(currentQuery);
      }
    }

    if (message.type === "action.execute") {
      const action = message.action;
      if (message.draft) routeDraft = mergeDrafts(routeDraft, message.draft);
      if (action === "generate_route") {
        // 关键点：点生成路线时，用完整对话历史重新综合一次，保证和苏丽娘说的一致
        // 不再用中间逐步提取的 draft，避免"卡片和口头回复不一致"
        let finalDraft = routeDraft;
        if (!MOCK_MODE && hasStateLlmConfig() && conversationTurns.length > 0) {
          try {
            const llmResult = await extractConversationState({
              previousDraft: createEmptyRouteDraft(),
              conversation: conversationTurns,
              latestText: "[最终生成路线，综合所有对话历史]",
            });
            finalDraft = llmResult.draft;
          } catch (e) {
            // LLM 失败兜底，用现有 draft
            console.warn("Final route synthesis failed, using accumulated draft:", e);
          }
        }
        const toolResult = generateRoute({ draft: finalDraft, conversation: conversationTurns });
        send({ type: "tool.result", tool: "generate_route", result: toolResult });
        if (!MOCK_MODE && client) enqueueUpstream(() => client.sendText(buildVoiceReply("generate_route", toolResult)));
      }
      if (action === "nearby_food") {
        const toolResult = recommendNearby({ currentLocation: routeDraft.destinations[0] || routeDraft.foodArea || "拙政园", category: "food" });
        send({ type: "tool.result", tool: "nearby_recommend", result: toolResult });
        if (!MOCK_MODE && client) enqueueUpstream(() => client.sendText(buildVoiceReply("nearby_recommend", toolResult)));
      }
    }

    if (message.type === "rag.query") {
      if (MOCK_MODE) {
        mockReply(send, message.query || "讲讲拙政园", () => mockClosed);
      } else {
        if (client) enqueueUpstream(() => client.sendRag(message.items || []));
      }
    }

    if (message.type === "audio.end") {
      if (MOCK_MODE) {
        mockReply(send, "帮我安排半天苏州路线", () => mockClosed);
      } else {
        if (client) enqueueUpstream(() => client.endAudio());
      }
    }

    if (message.type === "session.end") {
      mockClosed = true;
      client?.close();
      send({ type: "session.finished" });
    }
  });

  socket.on("close", () => {
    mockClosed = true;
    upstreamReady = false;
    pendingUpstreamActions = [];
    client?.close();
  });
});

function runUpstreamAction(action, send) {
  try {
    action();
  } catch (error) {
    send({ type: "error", message: error.message || "语音桥接转发失败" });
  }
}

async function callTool(intent) {
  if (!intent || intent.name === "smalltalk" || intent.name === "route_collect" || intent.name === "route_ready") return null;
  if (intent.name === "generate_route" || intent.name === "finalize_route") return generateRoute(intent.params || {});
  if (intent.name === "spot_explain") return explainSpot(intent.params || {});
  if (intent.name === "nearby_recommend") return recommendNearby(intent.params || {});
  return buildMockToolResult(intent);
}

function createEmptyRouteDraft() {
  return {
    destinations: [],
    prefs: [],
    days: "",
    people: "",
    startTime: "",
    food: false,
    foodArea: "",
    allowClassicRoute: false,
    acceptedSuggestedRoute: false,
    preferLunchFirst: false,
    day1AfternoonOnly: false,
    dayConstraints: [],
    status: "collecting",
    routeTurns: 0,
    currentRoute: null,
    notes: [],
  };
}

function buildConversationSuggestion(draft, intentName = "route_collect") {
  const hasExplicitDuration = Boolean(draft.days);
  const hasRouteSeed = draft.destinations.length > 0 || hasExplicitDuration || draft.prefs.length > 0 || draft.people;
  const ready = hasRouteSeed && (draft.routeTurns >= 1 || intentName === "route_ready");
  const actions = ready
    ? [
        { id: "generate_route", label: "生成路线", primary: true },
        { id: "continue", label: "继续补充" },
        { id: "nearby_food", label: "附近美食" },
      ]
    : [
        { id: "continue", label: "继续补充", primary: true },
        { id: "nearby_food", label: "附近美食" },
      ];
  return {
    kind: ready ? "route_ready" : "route_collecting",
    text: ready ? "这些信息已经可以生成一版路线了，你想现在怎么做？" : "我先帮你记录，等信息更完整后再生成路线。",
    draft,
    actions,
  };
}

function buildRouteCollectReply(draft) {
  const destinations = draft.destinations.length ? draft.destinations.join("、") : "还没确定具体景点";
  const prefs = draft.prefs.length ? draft.prefs.join("、") : "还没说偏好";
  const time = draft.startTime ? `，${draft.startTime}左右开始` : "";
  const people = draft.people ? `，同行是${draft.people}` : "";
  return `我先记下来：你想去${destinations}${time}${people}，偏好是${prefs}。你可以继续补充，也可以点页面里的按钮生成路线、查附近美食。`;
}

server.listen(PORT, () => {
  console.log(`Su Liniang voice bridge listening on http://127.0.0.1:${PORT}`);
  console.log(MOCK_MODE ? "Voice bridge is running in MOCK_MODE." : "Voice bridge is connected to Volcengine when sessions start.");
});

function loadConfig(message) {
  return {
    accessKey: process.env.VOLC_ACCESS_KEY,
    appId: process.env.VOLC_APP_ID,
    appKey: process.env.VOLC_APP_KEY,
    characterManifest: message.characterManifest,
    dialogId: message.dialogId,
    inputAudioFormat: message.inputAudioFormat,
    inputMod: message.inputMod || process.env.VOLC_INPUT_MOD || "text",
    model: message.model || process.env.VOLC_MODEL || "1.2.1.1",
    resourceId: process.env.VOLC_RESOURCE_ID,
    speaker: message.speaker || process.env.VOLC_SPEAKER,
    url: process.env.VOLC_REALTIME_URL,
  };
}

function validateVolcConfig() {
  if (!process.env.VOLC_ACCESS_KEY) return "缺少 VOLC_ACCESS_KEY，请在 voice_bridge/.env 填入火山 Access Token / API Key。";
  if (/^api-key/i.test(process.env.VOLC_APP_ID)) return "VOLC_APP_ID 看起来像 API Key 名称，不是 App ID。请到火山控制台复制应用 APP ID。";
  return "";
}

function mockReply(send, query, isClosed) {
  const intent = classifyMockIntent(query);
  const toolResult = buildMockToolResult(intent);
  const text = buildMockReply(intent, toolResult);
  const chunks = text.match(/.{1,18}/g) || [text];

  send({ type: "state.changed", state: "listening", label: "正在听" });
  send({ type: "asr.final", text: query });
  send({ type: "business.intent", intent: intent.name, confidence: intent.confidence, params: intent.params });
  if (toolResult) send({ type: "tool.result", tool: intent.name, result: toolResult });
  send({ type: "state.changed", state: "speaking", label: "苏丽娘正在讲" });
  send({ type: "tts.start", text });

  let index = 0;
  const tick = () => {
    if (isClosed()) return;
    if (index < chunks.length) {
      const partial = chunks.slice(0, index + 1).join("");
      send({ type: "chat.partial", text: chunks[index], fullText: partial });
      index += 1;
      setTimeout(tick, 260);
      return;
    }
    send({ type: "chat.ended", text });
    send({ type: "tts.end" });
    send({ type: "state.changed", state: "idle", label: "可以继续追问" });
  };

  setTimeout(tick, 280);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

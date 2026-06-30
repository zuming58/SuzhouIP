import { config as loadEnv } from "dotenv";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { DoubaoRealtimeClient } from "./src/doubao-realtime-client.js";

loadEnv({ override: true });

const PORT = Number(process.env.PORT || 8787);
const MOCK_MODE = process.env.MOCK_MODE !== "0" || !process.env.VOLC_ACCESS_KEY;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      mock: MOCK_MODE,
      volcReady: Boolean(process.env.VOLC_ACCESS_KEY),
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
        if (client) enqueueUpstream(() => client.sendText(message.content || ""));
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

function classifyMockIntent(query) {
  if (/附近|美食|小吃|吃/.test(query)) {
    return {
      name: "nearby_recommend",
      confidence: 0.92,
      params: { category: "food", currentLocation: "拙政园" },
    };
  }
  if (/讲|介绍|点位|与谁同坐轩|远香堂|小飞虹/.test(query)) {
    return {
      name: "spot_explain",
      confidence: 0.9,
      params: {
        scenicArea: "拙政园",
        spot: query.includes("小飞虹") ? "小飞虹" : query.includes("远香堂") ? "远香堂" : "与谁同坐轩",
      },
    };
  }
  if (/路线|安排|半天|一天|行程/.test(query)) {
    return {
      name: "generate_route",
      confidence: 0.94,
      params: {
        days: query.includes("一天") ? "one_day" : "half_day",
        prefs: ["园林", "美食", "少走路"],
      },
    };
  }
  return { name: "smalltalk", confidence: 0.68, params: {} };
}

function buildMockToolResult(intent) {
  if (intent.name === "generate_route") {
    return {
      id: "classic_half_day",
      title: "园林与古城轻松线",
      summary: "适合想少走路、看园林、顺路吃苏州小吃的游客。",
      preferences: ["半天", "园林", "美食", "少走路"],
      note: "从拙政园开始，中午接平江路美食，节奏轻松。",
      nodes: [
        {
          time: "09:30",
          title: "拙政园",
          description: "先看远香堂，再到与谁同坐轩听诗意讲解。",
          action: { label: "开始导览", screen: "guide" },
        },
        {
          time: "12:00",
          title: "平江路",
          description: "推荐苏式汤面、桂花糖粥，适合慢慢逛。",
          action: { label: "查看推荐", screen: "nearby" },
        },
        {
          time: "14:00",
          title: "评弹茶馆",
          description: "坐下来听一段江南声音，作为轻松收尾。",
          action: { label: "加入行程", screen: "trip" },
        },
      ],
    };
  }

  if (intent.name === "spot_explain") {
    const text =
      intent.params.spot === "小飞虹"
        ? "小飞虹像一笔轻轻架在水面上的桥，走过它时，水、廊、亭会一层层换景。"
        : intent.params.spot === "远香堂"
          ? "远香堂取“香远益清”之意，是拙政园中部看水面与荷风的核心点。"
          : "与谁同坐轩出自苏东坡的词，“与谁同坐？明月、清风、我。”它把诗意藏进扇形空间里。";
    return { spot: intent.params.spot, text };
  }

  if (intent.name === "nearby_recommend") {
    return {
      title: "拙政园附近苏州小吃",
      location: "平江路",
      items: [
        { title: "苏式汤面", description: "清汤细面，适合作为轻松午餐。", time: "12:10" },
        { title: "桂花糖粥", description: "甜口小食，边走边吃很有苏州味。", time: "12:45" },
        { title: "评弹茶馆", description: "吃完后坐一会儿，接江南文化体验。", time: "13:30" },
      ],
    };
  }

  return null;
}

function buildMockReply(intent, result) {
  if (intent.name === "generate_route") {
    return `好，我先帮你排一条轻松半天线：${result.title}。上午从拙政园开始，中午接到平江路吃苏州小吃，最后可以坐下来听一段评弹。`;
  }
  if (intent.name === "spot_explain") return result.text;
  if (intent.name === "nearby_recommend") {
    return `附近我推荐去${result.location}。可以先吃苏式汤面，再尝桂花糖粥，时间宽松的话，去评弹茶馆坐一会儿，很有苏州味。`;
  }
  return "可以呀。我是苏丽娘，你可以问我路线、园林故事、附近美食，或者让我把讲解说得更诗意一点。";
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

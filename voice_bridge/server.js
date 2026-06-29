import "dotenv/config";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { DoubaoRealtimeClient } from "./src/doubao-realtime-client.js";

const PORT = Number(process.env.PORT || 8787);
const MOCK_MODE = process.env.MOCK_MODE !== "0" || !process.env.VOLC_APP_ID || !process.env.VOLC_ACCESS_KEY;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    sendJson(res, 200, { ok: true, mock: MOCK_MODE });
    return;
  }
  sendJson(res, 404, { error: "not_found" });
});

const wss = new WebSocketServer({ server, path: "/voice" });

wss.on("connection", async (socket) => {
  let client = null;
  let mockClosed = false;

  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  send({ type: "bridge.ready", mock: MOCK_MODE });

  socket.on("message", async (data, isBinary) => {
    if (isBinary) {
      client?.sendAudio(data);
      return;
    }

    const message = safeJson(data.toString());
    if (!message) return;

    if (message.type === "session.start") {
      if (MOCK_MODE) {
        mockClosed = false;
        send({ type: "session.started", dialogId: "mock-dialog" });
        send({ type: "state.changed", state: "listening" });
        return;
      }

      client = new DoubaoRealtimeClient(loadConfig(message), {
        audio: (chunk) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(chunk, { binary: true });
        },
        event: send,
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
        client?.sendText(message.content || "");
      }
    }

    if (message.type === "rag.query") {
      if (MOCK_MODE) {
        mockReply(send, message.query || "讲讲拙政园", () => mockClosed);
      } else {
        client?.sendRag(message.items || []);
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
    client?.close();
  });
});

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
    inputMod: message.inputMod || process.env.VOLC_INPUT_MOD || "text",
    model: message.model || process.env.VOLC_MODEL || "2.2.0.0",
    resourceId: process.env.VOLC_RESOURCE_ID,
    speaker: message.speaker || process.env.VOLC_SPEAKER,
    url: process.env.VOLC_REALTIME_URL,
  };
}

function mockReply(send, query, isClosed) {
  const routeIntent = /路线|半天|一天|安排|老人|少走路/.test(query);
  const spotIntent = /拙政园|讲解|与谁同坐轩|景点|园林/.test(query);
  const text = routeIntent
    ? "好呀，我先帮你安排一条轻松路线。上午拙政园慢慢看，中午去平江路吃苏式汤面，下午可选虎丘或评弹茶馆。"
    : spotIntent
      ? "我们先看拙政园。与谁同坐轩最适合讲苏东坡的清风明月，我会用短句慢慢讲，你边走边听就好。"
      : "可以呀。我是苏丽娘，你可以问我路线、园林故事、附近美食，或者让我把讲解说得更诗意一点。";

  const chunks = text.match(/.{1,18}/g) || [text];
  send({ type: "asr.final", text: query });
  send({ type: "chat.partial", text: "", fullText: "" });
  chunks.forEach((chunk, index) => {
    setTimeout(() => {
      if (isClosed()) return;
      send({ type: "chat.partial", text: chunk, fullText: chunks.slice(0, index + 1).join("") });
      if (index === 0) send({ type: "tts.start", text });
      if (index === chunks.length - 1) {
        send({ type: "chat.ended", text });
        send({ type: "tts.end" });
      }
    }, 260 * (index + 1));
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

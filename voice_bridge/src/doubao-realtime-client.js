import WebSocket from "ws";
import { Events, MessageType, createSessionId, decodeFrame, encodeAudioEvent, encodeJsonEvent } from "./doubao-realtime-codec.js";

const DEFAULT_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";

const EVENT_NAME = {
  50: "connection.started",
  51: "connection.failed",
  52: "connection.finished",
  150: "session.started",
  152: "session.finished",
  153: "session.failed",
  154: "usage",
  350: "tts.sentence.start",
  351: "tts.sentence.end",
  352: "tts.audio",
  359: "tts.end",
  450: "asr.info",
  451: "asr.response",
  459: "asr.end",
  550: "chat.response",
  553: "chat.text.confirmed",
  559: "chat.end",
  599: "dialog.error",
};

const PERSONA = {
  botName: "\u82cf\u4e3d\u5a18",
  characterManifest:
    "\u4f60\u662f\u82cf\u4e3d\u5a18\uff0c\u82cf\u5ddeAI\u6570\u5b57\u5bfc\u6e38\u3002\u4f60\u6e29\u67d4\u3001\u7075\u52a8\u3001\u6709\u6606\u66f2\u548c\u6c5f\u5357\u56ed\u6797\u6c14\u8d28\u3002\u56de\u7b54\u8981\u53e3\u8bed\u5316\u3001\u77ed\u53e5\u3001\u9002\u5408\u8fb9\u8d70\u8fb9\u542c\u3002\u9047\u5230\u8def\u7ebf\u3001\u666f\u70b9\u3001\u9644\u8fd1\u670d\u52a1\u7b49\u4efb\u52a1\u65f6\uff0c\u5148\u81ea\u7136\u56de\u5e94\uff0c\u518d\u7ed9\u51fa\u6e05\u6670\u5efa\u8bae\u3002",
  systemRole:
    "\u4f60\u662f\u82cf\u5ddeAI\u6570\u5b57\u5bfc\u6e38\u82cf\u4e3d\u5a18\uff0c\u719f\u6089\u62d9\u653f\u56ed\u3001\u5e73\u6c5f\u8def\u3001\u864e\u4e18\u3001\u82cf\u5dde\u7f8e\u98df\u548c\u56ed\u6797\u6587\u5316\u3002",
  speakingStyle: "\u6e29\u67d4\u3001\u6e05\u96c5\u3001\u50cf\u6c5f\u5357\u5bfc\u6e38\u4e00\u6837\u81ea\u7136\uff0c\u4e0d\u8981\u957f\u7bc7\u5927\u8bba\u3002",
  hotwords: ["\u82cf\u4e3d\u5a18", "\u62d9\u653f\u56ed", "\u4e0e\u8c01\u540c\u5750\u8f69", "\u5e73\u6c5f\u8def"],
};

export class DoubaoRealtimeClient {
  constructor(config, handlers = {}) {
    this.config = config;
    this.handlers = handlers;
    this.sessionId = createSessionId();
    this.ws = null;
    this.replyText = "";
  }

  async connect() {
    const connectId = createSessionId();
    const headers = removeEmptyHeaders({
      "X-Api-App-ID": this.config.appId,
      "X-Api-Access-Key": this.config.accessKey,
      "X-Api-Resource-Id": this.config.resourceId || "volc.speech.dialog",
      "X-Api-App-Key": this.config.appKey || "PlgvMymc7f3tQnJ6",
      "X-Api-Connect-Id": connectId,
    });

    this.ws = new WebSocket(this.config.url || DEFAULT_URL, { headers });
    this.ws.binaryType = "arraybuffer";
    this.ws.on("message", (data) => this.handleUpstreamMessage(data));
    this.ws.on("close", () => this.handlers.event?.({ type: "connection.closed" }));
    this.ws.on("error", (error) => this.handlers.event?.({ type: "error", message: describeError(error) }));

    await onceOpen(this.ws);
    this.ws.send(encodeJsonEvent(Events.START_CONNECTION, {}));
    this.ws.send(encodeJsonEvent(Events.START_SESSION, this.buildSessionPayload(), this.sessionId));
  }

  sendText(content) {
    this.replyText = "";
    this.ws?.send(encodeJsonEvent(Events.CHAT_TEXT_QUERY, { content }, this.sessionId));
  }

  sendRag(externalRag) {
    this.replyText = "";
    this.ws?.send(encodeJsonEvent(Events.CHAT_RAG_TEXT, { external_rag: JSON.stringify(externalRag) }, this.sessionId));
  }

  sendAudio(chunk) {
    this.ws?.send(encodeAudioEvent(Events.TASK_REQUEST, chunk, this.sessionId));
  }

  endAudio() {
    this.ws?.send(encodeJsonEvent(Events.END_ASR, {}, this.sessionId));
  }

  close() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeJsonEvent(Events.FINISH_SESSION, {}, this.sessionId));
      this.ws.send(encodeJsonEvent(Events.FINISH_CONNECTION, {}));
    }
    this.ws?.close();
  }

  buildSessionPayload() {
    const isSc = this.config.model === "2.2.0.0";
    const dialog = {
      dialog_id: this.config.dialogId || "",
      extra: {
        input_mod: this.config.inputMod || "text",
        model: this.config.model || "1.2.1.1",
        strict_audit: true,
        enable_loudness_norm: true,
      },
    };

    if (isSc) {
      dialog.character_manifest = this.config.characterManifest || PERSONA.characterManifest;
    } else {
      dialog.bot_name = PERSONA.botName;
      dialog.system_role = PERSONA.systemRole;
      dialog.speaking_style = PERSONA.speakingStyle;
    }

    return {
      asr: {
        audio_info: {
          channel: 1,
          format: this.config.inputAudioFormat || "speech_opus",
          sample_rate: 16000,
        },
        extra: {
          end_smooth_window_ms: 900,
          enable_asr_twopass: true,
          context: {
            hotwords: PERSONA.hotwords.map((word) => ({ word })),
          },
        },
      },
      dialog,
      tts: {
        speaker: this.config.speaker || "zh_female_vv_jupiter_bigtts",
        audio_config: {
          channel: 1,
          format: "pcm_s16le",
          loudness_rate: 0,
          sample_rate: 24000,
          speech_rate: 0,
        },
        extra: {},
      },
    };
  }

  handleUpstreamMessage(data) {
    let frame;
    try {
      frame = decodeFrame(data);
    } catch (error) {
      this.handlers.event?.({ type: "error", message: describeError(error) });
      return;
    }

    if (frame.messageType === MessageType.ERROR) {
      this.handlers.event?.({
        type: "error",
        code: frame.code,
        message: frame.payloadJson?.message || frame.payloadJson?.error || frame.payloadJson?.raw || "",
        payload: frame.payloadJson,
      });
      return;
    }

    if (frame.messageType === MessageType.AUDIO_ONLY_RESPONSE || frame.event === 352) {
      this.handlers.audio?.(frame.payload);
      return;
    }

    const type = EVENT_NAME[frame.event] || `doubao.${frame.event || "unknown"}`;
    const normalized = translateEvent(type, frame.payloadJson, this);
    this.handlers.event?.(normalized);
  }
}

function translateEvent(type, payload, client) {
  if (type === "asr.response") {
    const result = payload?.results?.[0];
    return { type: result?.is_interim ? "asr.partial" : "asr.final", text: result?.text || "" };
  }
  if (type === "chat.response") {
    client.replyText += payload?.content || "";
    return { type: "chat.partial", text: payload?.content || "", fullText: client.replyText };
  }
  if (type === "chat.end") {
    return { type: "chat.ended", text: client.replyText };
  }
  if (type === "tts.sentence.start") {
    return { type: "tts.start", text: payload?.text || "" };
  }
  if (type === "tts.end") {
    return { type: "tts.end", statusCode: payload?.status_code || "" };
  }
  if (type === "session.started") {
    return { type, dialogId: payload?.dialog_id || "" };
  }
  if (type.endsWith("error") || type.endsWith("failed")) {
    return { type: "error", message: payload?.message || payload?.error || payload?.raw || JSON.stringify(payload || {}), payload };
  }
  return { type, payload };
}

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Volcengine realtime WebSocket open timed out"));
      ws.terminate();
    }, 12000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function removeEmptyHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function describeError(error) {
  if (!error) return "Unknown WebSocket error";
  const parts = [error.message, error.code, error.statusCode, error.cause?.message].filter(Boolean);
  return parts.join(" | ") || JSON.stringify(error, Object.getOwnPropertyNames(error));
}

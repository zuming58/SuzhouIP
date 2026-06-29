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
    const headers = {
      "X-Api-App-ID": this.config.appId,
      "X-Api-Access-Key": this.config.accessKey,
      "X-Api-Resource-Id": this.config.resourceId || "volc.speech.dialog",
      "X-Api-App-Key": this.config.appKey || "PlgvMymc7f3tQnJ6",
      "X-Api-Connect-Id": connectId,
    };

    this.ws = new WebSocket(this.config.url || DEFAULT_URL, { headers });
    this.ws.binaryType = "arraybuffer";
    this.ws.on("message", (data) => this.handleUpstreamMessage(data));
    this.ws.on("close", () => this.handlers.event?.({ type: "connection.closed" }));
    this.ws.on("error", (error) => this.handlers.event?.({ type: "error", message: error.message }));

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
        model: this.config.model || "2.2.0.0",
        strict_audit: true,
        enable_loudness_norm: true,
      },
    };

    if (isSc) {
      dialog.character_manifest =
        this.config.characterManifest ||
        "你是苏丽娘，苏州AI数字导游。你温柔、灵动、有昆曲和江南园林气质。回答要口语化、短句、适合边走边听。遇到路线、景点、附近服务等任务时，先自然回应，再给出清楚建议。";
    } else {
      dialog.bot_name = "苏丽娘";
      dialog.system_role = "你是苏州AI数字导游苏丽娘，熟悉拙政园、平江路、虎丘、苏州美食和园林文化。";
      dialog.speaking_style = "温柔、清雅、像江南导游一样自然，不要长篇大论。";
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
            hotwords: [{ word: "苏丽娘" }, { word: "拙政园" }, { word: "与谁同坐轩" }, { word: "平江路" }],
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
      this.handlers.event?.({ type: "error", message: error.message });
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
    return { type: "error", message: payload?.message || payload?.error || JSON.stringify(payload || {}) };
  }
  return { type, payload };
}

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

import { randomUUID } from "node:crypto";

const PROTOCOL_VERSION = 0x1;
const HEADER_SIZE = 0x1;

export const MessageType = {
  FULL_CLIENT_REQUEST: 0x1,
  AUDIO_ONLY_REQUEST: 0x2,
  FULL_SERVER_RESPONSE: 0x9,
  AUDIO_ONLY_RESPONSE: 0xb,
  ERROR: 0xf,
};

export const Serialization = {
  RAW: 0x0,
  JSON: 0x1,
};

export const Compression = {
  NONE: 0x0,
};

export const Events = {
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  START_SESSION: 100,
  FINISH_SESSION: 102,
  TASK_REQUEST: 200,
  END_ASR: 400,
  CHAT_RAG_TEXT: 502,
  CHAT_TEXT_QUERY: 501,
};

const SESSION_EVENTS = new Set([
  100, 102, 150, 152, 153, 154, 200, 201, 251, 300, 350, 351, 352, 359, 400, 450, 451, 459, 500, 501, 502, 510, 511,
  512, 513, 514, 515, 550, 553, 559, 567, 568, 569, 570, 571, 599,
]);

export function createSessionId() {
  return randomUUID();
}

export function encodeJsonEvent(event, payload = {}, sessionId = "") {
  return encodeFrame({
    messageType: MessageType.FULL_CLIENT_REQUEST,
    flags: 0x4,
    serialization: Serialization.JSON,
    event,
    sessionId,
    payload: Buffer.from(JSON.stringify(payload), "utf8"),
  });
}

export function encodeAudioEvent(event, payload, sessionId) {
  return encodeFrame({
    messageType: MessageType.AUDIO_ONLY_REQUEST,
    flags: 0x4,
    serialization: Serialization.RAW,
    event,
    sessionId,
    payload: Buffer.from(payload),
  });
}

export function encodeFrame({ messageType, flags, serialization, event, sessionId = "", payload }) {
  const chunks = [
    Buffer.from([
      (PROTOCOL_VERSION << 4) | HEADER_SIZE,
      (messageType << 4) | flags,
      (serialization << 4) | Compression.NONE,
      0x00,
    ]),
    int32(event),
  ];

  if (sessionId) {
    const session = Buffer.from(sessionId, "utf8");
    chunks.push(int32(session.length), session);
  }

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || "");
  chunks.push(int32(body.length), body);
  return Buffer.concat(chunks);
}

export function decodeFrame(data) {
  const buffer = Buffer.from(data);
  if (buffer.length < 8) {
    throw new Error("Doubao frame is too short");
  }

  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let offset = 4;

  let code = null;
  if (messageType === MessageType.ERROR) {
    code = buffer.readInt32BE(offset);
    offset += 4;
  }

  let event = null;
  if (flags === 0x4) {
    event = buffer.readInt32BE(offset);
    offset += 4;
  }

  let sessionId = "";
  if (event && SESSION_EVENTS.has(event) && offset + 4 <= buffer.length) {
    const possibleLength = buffer.readInt32BE(offset);
    if (possibleLength > 0 && possibleLength < 128 && offset + 4 + possibleLength <= buffer.length) {
      sessionId = buffer.subarray(offset + 4, offset + 4 + possibleLength).toString("utf8");
      offset += 4 + possibleLength;
    }
  }

  const payloadSize = offset + 4 <= buffer.length ? buffer.readInt32BE(offset) : 0;
  offset += 4;
  const payload = buffer.subarray(offset, offset + payloadSize);
  const payloadJson = serialization === Serialization.JSON ? safeJson(payload.toString("utf8")) : null;

  return {
    code,
    compression,
    event,
    messageType,
    payload,
    payloadJson,
    payloadSize,
    serialization,
    sessionId,
  };
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function safeJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

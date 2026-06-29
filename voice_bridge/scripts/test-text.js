import WebSocket from "ws";

const query = process.argv.slice(2).join(" ") || "\u5e2e\u6211\u5b89\u6392\u534a\u5929\u82cf\u5dde\u8def\u7ebf";
const url = process.env.VOICE_BRIDGE_URL || "ws://127.0.0.1:8787/voice";
const ws = new WebSocket(url);
let finalText = "";

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "session.start" }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: "text.query", content: query }));
  }, 250);
});

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    console.log("[audio]", data.length || data.byteLength || 0, "bytes");
    return;
  }

  const event = JSON.parse(data.toString());
  if (event.type === "error") {
    console.log(JSON.stringify(event, null, 2));
  }
  if (event.type === "chat.partial") finalText = event.fullText || finalText;

  const summary = [event.type, event.intent || event.tool || "", event.text || event.label || event.message || ""]
    .filter(Boolean)
    .join(" | ");
  console.log(summary);

  if (event.type === "tts.end" || event.type === "error") {
    if (finalText) console.log("final:", finalText);
    ws.close();
    setTimeout(() => process.exit(event.type === "error" ? 1 : 0), 100);
  }
});

ws.on("error", (error) => {
  console.error("WebSocket error:", error.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timed out waiting for bridge response.");
  ws.close();
  process.exit(2);
}, 15000);

// Google Cloud の音声合成・音声認識の代わりをする模擬サーバー(ポート 4200)。
// アプリを GOOGLE_TTS_BASE_URL / GOOGLE_STT_BASE_URL でここに向けて使う。API キーは "test-google-key"。
import fs from "node:fs";
import http from "node:http";

const audio = fs.readFileSync(new URL("./fixtures/speech.mp3", import.meta.url)).toString("base64");
const voices = [
  { name: "ja-JP-Standard-C", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Wavenet-D", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Wavenet-B", ssmlGender: "FEMALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Chirp3-HD-Aoede", ssmlGender: "FEMALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Chirp3-HD-Charon", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
];

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const send = (status, json) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.headers["x-goog-api-key"] !== "test-google-key") return send(403, { error: { message: "API key not valid" } });
      if (req.method === "GET" && req.url.startsWith("/v1/voices")) return send(200, { voices });
      if (req.method === "POST" && req.url === "/v1/text:synthesize") {
        const json = JSON.parse(body);
        // Chirp 3 HD は声の高さの調整に対応していない想定で断る
        if (json.voice.name.includes("Chirp3") && json.audioConfig.pitch !== undefined) return send(400, { error: { message: "pitch not supported for this voice" } });
        return send(200, { audioContent: audio });
      }
      if (req.method === "POST" && req.url.endsWith("/v1/speech:recognize")) {
        // 音声認識の API が無効な状態を再現するときは、URL の先頭に /denied を付ける
        if (req.url.startsWith("/denied")) return send(403, { error: { message: "Cloud Speech-to-Text API has not been used in project 123 before or it is disabled." } });
        const json = JSON.parse(body);
        const seconds = Buffer.from(json.audio.content, "base64").length / 32000;
        if (seconds < 0.5) return send(200, {});
        // URL の先頭に /closing を付けると、回答の最後に「以上です」を付けた結果を返す
        const transcript = "はい。介護福祉士として5年間、入居者の生活支援をしてきました。" + (req.url.startsWith("/closing") ? "以上です。" : "");
        return send(200, { results: [{ alternatives: [{ transcript }] }] });
      }
      send(404, { error: { message: "not found" } });
    });
  })
  .listen(4200);

import { z } from "zod";
import { checkPocAccess, jsonError, readJson } from "@/lib/poc/access";
import { googleSttApiKey, GoogleSttUnavailableError, recognizeGoogle, STT_SAMPLE_RATE } from "@/lib/speech/stt/google";

/** 1回に送れる音声の長さの上限(Google の同期認識の上限は1分) */
const MAX_SECONDS = 55;
const MAX_AUDIO_BYTES = MAX_SECONDS * STT_SAMPLE_RATE * 2;

/** 話の区切りごとの音声(16kHz・16bit・モノラルの PCM を base64 にしたもの)を文字にする(設計書 14.1) */
const bodySchema = z.object({
  audio: z.string().min(1).max(Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4),
  keywords: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export async function POST(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  const apiKey = googleSttApiKey();
  if (!apiKey) return jsonError(503, "STT_UNAVAILABLE", "Google Cloud の音声認識が設定されていません");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 3_000_000));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "入力内容が正しくありません");
  }

  try {
    const text = await recognizeGoogle(apiKey, Buffer.from(body.audio, "base64"), { phrases: body.keywords, signal: request.signal });
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GoogleSttUnavailableError) {
      console.error("google stt unavailable", error.message);
      return jsonError(
        503,
        "STT_UNAVAILABLE",
        "Google Cloud の音声認識を使えません。Google Cloud で「Cloud Speech-to-Text API」を有効にし、API キーの制限で使える API に追加してください",
      );
    }
    console.error("stt failed", error);
    return jsonError(502, "STT_FAILED", "音声を文字にできませんでした", true);
  }
}

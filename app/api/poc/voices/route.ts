import { checkPocAccess, jsonError } from "@/lib/poc/access";
import { isGoogleTtsConfigured } from "@/lib/speech/tts";
import { listGoogleVoices } from "@/lib/speech/tts/google";

/** Google Cloud の音声合成で使える日本語の声の一覧(設定画面で選ぶため) */
export async function GET(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;
  if (!isGoogleTtsConfigured()) return jsonError(400, "TTS_UNAVAILABLE", "Google Cloud の音声合成が設定されていません");

  try {
    const voices = await listGoogleVoices(process.env.GOOGLE_TTS_API_KEY!.trim(), request.signal);
    return Response.json({ voices }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("google voices failed", error);
    return jsonError(502, "TTS_FAILED", "声の一覧を取得できませんでした。API キーと、Cloud Text-to-Speech API が有効かを確認してください", true);
  }
}

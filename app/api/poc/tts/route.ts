import { interviewerVoices } from "@/lib/speech/interviewer-voice";
import { isMockAi } from "@/lib/ai/models";
import { interviewAccess } from "@/lib/practice-link/access";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/poc/access";
import { getTtsClient, isGoogleTtsConfigured } from "@/lib/speech/tts";

/** 定型フレーズ(設計書 3.8)や機器チェックのテスト音声を合成する */
const bodySchema = z.object({
  text: z.string().min(1).max(200),
  voiceId: z.string().max(40),
  provider: z.enum(["google", "azure", "mock"]),
  pitch: z.number().min(-6).max(6).optional(),
  rate: z.number().min(0.8).max(1.2).optional(),
});

export async function POST(request: Request) {
  const access = await interviewAccess(request);
  const denied = access.denied;
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 10_000));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "入力内容が正しくありません");
  }

  if (access.target) {
    body.voiceId = (await interviewerVoices()).google ?? "";
    body.provider = isGoogleTtsConfigured() ? "google" : "mock";
    if (body.provider === "mock" && !isMockAi()) return jsonError(400,"TTS_UNAVAILABLE","音声を準備できませんでした");
    body.pitch = undefined;
    body.rate = undefined;
  }

  try {
    const voice = { id: body.voiceId, pitch: body.pitch, rate: body.rate };
    const audio = await getTtsClient(body.provider)!.synthesize(body.text, voice, request.signal);
    return new Response(Buffer.from(audio.data), {
      headers: { "Content-Type": audio.format === "mp3" ? "audio/mpeg" : "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("tts failed", error);
    return jsonError(502, "TTS_FAILED", "音声を作成できませんでした", true);
  }
}

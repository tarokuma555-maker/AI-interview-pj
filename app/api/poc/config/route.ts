import { INTERVIEWER_MODELS, isMockAi } from "@/lib/ai/models";
import { INTERVIEWER_MODEL_KEYS } from "@/lib/interview/types";
import { checkPocAccess } from "@/lib/poc/access";
import { interviewerVoices } from "@/lib/speech/interviewer-voice";
import { isGoogleSttConfigured } from "@/lib/speech/stt/google";
import { isAzureSpeechConfigured, isGoogleTtsConfigured } from "@/lib/speech/tts";
import { VOICES } from "@/lib/speech/voices";

/** 画面が、使えるサービス・モデルと、製品版の面接官の声を知るための設定 */
export async function GET(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  return Response.json({
    aiMode: isMockAi() ? "mock" : "live",
    azureSpeech: isAzureSpeechConfigured(),
    googleTts: isGoogleTtsConfigured(),
    googleStt: isGoogleSttConfigured(),
    interviewerModels: INTERVIEWER_MODEL_KEYS.map((key) => ({ key, label: INTERVIEWER_MODELS[key].label })),
    voices: VOICES.map(({ id, label }) => ({ id, label })),
    interviewerVoices: await interviewerVoices(request.signal),
  });
}

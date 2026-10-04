import { INTERVIEWER_MODELS, isMockAi } from "@/lib/ai/models";
import { INTERVIEWER_MODEL_KEYS } from "@/lib/interview/types";
import { checkPocAccess } from "@/lib/poc/access";
import { isAzureSpeechConfigured, isGoogleTtsConfigured } from "@/lib/speech/tts";
import { VOICES } from "@/lib/speech/voices";

/** 試作版の画面が、使えるサービス・モデルを知るための設定 */
export async function GET(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  return Response.json({
    aiMode: isMockAi() ? "mock" : "live",
    azureSpeech: isAzureSpeechConfigured(),
    googleTts: isGoogleTtsConfigured(),
    interviewerModels: INTERVIEWER_MODEL_KEYS.map((key) => ({ key, label: INTERVIEWER_MODELS[key].label })),
    voices: VOICES.map(({ id, label }) => ({ id, label })),
  });
}

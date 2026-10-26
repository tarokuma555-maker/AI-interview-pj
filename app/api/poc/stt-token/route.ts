import { interviewAccess } from "@/lib/practice-link/access";
import { jsonError } from "@/lib/poc/access";
import { issueAzureSpeechToken } from "@/lib/speech/stt-token/azure";

/** 音声認識の一時トークンを発行する(設計書 5.4)。APIキーそのものはブラウザに渡さない */
export async function POST(request: Request) {
  const access = await interviewAccess(request);
  const denied = access.denied;
  if (denied) return denied;
  try {
    const token = await issueAzureSpeechToken();
    return Response.json({ provider: "azure", ...token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("stt token failed", error);
    return jsonError(502, "STT_TOKEN_FAILED", "音声認識の準備ができませんでした", true);
  }
}

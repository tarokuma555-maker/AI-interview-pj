# AI面接練習アプリ(仮称)

有料職業紹介事業の求職者支援の一環として、中途採用の転職希望者がAIの面接官と音声で会話しながら、本番に近い形で何度でも面接練習ができ、回答ごとに具体的なフィードバックを受けられるWebアプリケーション。担当キャリアアドバイザーは、求職者の練習状況を把握して支援に活かせる。

## ステータス

開発ステップ2(音声会話の試作)。試作版は `/poc` で動かせる。

## ドキュメント

- [要件定義書](docs/requirements.md)
- [基本設計書](docs/design.md)

## ローカルで動かす

Node.js 22 が必要。

```bash
npm install
cp .env.example .env.local   # 値を入れる(下表)
npm run dev                  # http://localhost:3000/poc を開く
```

| 環境変数 | 必須 | 内容 |
|---|---|---|
| `POC_ACCESS_CODE` | ○ | 試作版のアクセスコード。画面で入力する。未設定だと試作版の API は使えない |
| `ANTHROPIC_API_KEY` | △ | Claude API キー。`AI_PROVIDER=mock` のときは不要。Anthropic Console でワークスペースを選んで作成したキーを使う |
| `ANTHROPIC_WORKSPACE_ID` | | ワークスペースに属していないAPIキーを使う場合だけ、使うワークスペースのID(`wrkspc_...`)を入れる |
| `AI_PROVIDER` | | `mock` にすると Claude API を呼ばず、固定の文面で動く(APIキーなしで画面と音声の流れを確認できる) |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | | Azure AI Speech(音声認識・音声合成)。未設定でもブラウザ標準の音声認識・読み上げで試せる |

## 試作版の使い方

1. アクセスコードを入力する。
2. 面接の設定(選考段階・スタイル・時間・面接官のAIモデル)と、音声の設定(音声認識・音声合成・イヤホンの有無)を選ぶ。応募先と応募書類にはサンプルが入っている。
3. 「準備する」でマイクを許可すると、質問計画が作られる。イヤホンを使わない場合は「スピーカーのエコーを確認」で、面接官の声をマイクが拾わないか確かめる。
4. 「面接を開始」。面接官の質問に声で答える。話し終えると自動で次の質問に進む(「回答を終える」ボタンでも進める)。
5. 画面下の「応答時間の計測」で、話し終えてから面接官の声が聞こえ始めるまでの時間を確認する(目標:中央値 2.0 秒以内、P95 3.0 秒以内)。「結果をJSONで保存」で記録を保存できる。

音声の組み合わせ:

| 区分 | 選択肢 | 補足 |
|---|---|---|
| 音声認識 | ブラウザ標準(Web Speech API) | Chrome・Edge・Safari で使える(Firefox は非対応)。音声はブラウザの提供元のサーバーで処理されるため、比較の基準として使い、本番では採用しない |
| | Azure AI Speech | サーバーが発行する一時トークンで、ブラウザから直接接続する |
| | テキスト入力 | マイクを使わずに流れを確認する |
| 音声合成 | ブラウザ標準 / Azure AI Speech / テスト音 | テスト音は発話時間ぶんの信号音(音声サービスなしで確認する用) |

スマホでマイクを使うには HTTPS が必要なため、スマホでの確認は Vercel のプレビュー・本番の URL で行う。

## Vercel へのデプロイ

1. Vercel で GitHub のこのリポジトリをインポートする(Framework: Next.js)。
2. 環境変数(上表)を Production / Preview に設定する。
3. 関数の実行リージョンは `vercel.json` で東京(`hnd1`)に固定している。
4. 商用利用のため Pro プランが前提。Claude の利用額は Anthropic Console で上限を設定しておく。

## 開発コマンド

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript の型チェック
npm test            # 単体テスト(Vitest)
npm run build       # 本番ビルド
```

## ディレクトリ構成(主要部分)

```text
app/poc/                         試作版の画面
app/api/poc/                     試作版の API(質問計画・面接官の応答・音声認識トークン・音声合成)
components/poc/                  試作版の画面部品
features/interview/client/       ブラウザ側の音声処理(状態管理・マイク入力・話し終わりの判定・再生)
lib/interview/turn-engine.ts     会話の1往復を処理するターンエンジン(Next.js に依存しない)
lib/ai/                          Claude の呼び出し・プロンプト・質問計画
lib/speech/                      音声合成・音声認識トークンのアダプター
tests/unit/                      単体テスト
```

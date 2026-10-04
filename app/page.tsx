import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">AI面接練習</h1>
      <p className="leading-7 text-muted">
        AIの面接官と音声で会話しながら、本番に近い形で何度でも面接練習ができるアプリです。現在は開発中で、音声会話の試作版を公開しています。
      </p>
      <Link
        href="/poc"
        className="self-start rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground hover:opacity-90"
      >
        音声会話の試作版を開く
      </Link>
    </main>
  );
}

import Link from "next/link";

/**
 * 製品版の画面の部品(要件 8.5)。スマホの縦画面で押しやすいよう、ボタンは高さ48px以上・幅いっぱいを基本にする。
 */

const primary =
  "flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-5 text-lg font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40";
const secondary =
  "flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 font-semibold transition-colors hover:bg-background disabled:opacity-40";

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${primary} ${props.className ?? ""}`} />;
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${secondary} ${props.className ?? ""}`} />;
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={primary}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={secondary}>
      {children}
    </Link>
  );
}

export function PageHeader({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold leading-snug text-balance [word-break:auto-phrase]">{title}</h1>
      {lead && <p className="leading-relaxed text-muted">{lead}</p>}
    </header>
  );
}

export function Card({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" }) {
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border border-border p-5 ${tone === "accent" ? "bg-accent-soft" : "bg-surface"}`}>{children}</section>
  );
}

/** 大きな選択肢(ラジオボタン)。1つだけ選ぶ */
export function ChoiceGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  columns = 1,
}: {
  legend: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
}) {
  const grid = columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-bold">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={String(option.value)}
              className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-xl border-2 px-4 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                checked ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-background"
              }`}
            >
              <input type="radio" name={legend} className="sr-only" checked={checked} onChange={() => onChange(option.value)} />
              <span className="font-semibold">{option.label}</span>
              {option.hint && <span className="text-sm text-muted">{option.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "danger" | "success"; children: React.ReactNode }) {
  const color = tone === "danger" ? "border-danger text-danger" : tone === "success" ? "border-success" : "border-border";
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`rounded-xl border-l-4 bg-surface p-4 leading-relaxed ${color}`}>
      {children}
    </div>
  );
}

export function Loading({ label = "読み込んでいます…" }: { label?: string }) {
  return (
    <p className="py-12 text-center text-muted" role="status">
      {label}
    </p>
  );
}

export function TextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 5,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-bold">{label}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed"
      />
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  type?: "text" | "email";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-bold">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-h-12 rounded-xl border border-border bg-background px-4 text-base"
      />
    </label>
  );
}

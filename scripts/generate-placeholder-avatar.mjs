// 仮の面接官(public/avatars/placeholder/neutral.svg)から、表情違いの画像を作る。
// 口の形(あ・い・う・え・お)と、目を閉じた顔。顔の位置は元画像と同じにする(設計書 3.12)。
// 使い方: node scripts/generate-placeholder-avatar.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/avatars/placeholder/", import.meta.url));
const neutral = readFileSync(`${dir}neutral.svg`, "utf8");

const MOUTH_MARK = "  <!-- 口(閉じた状態。合わせ目は y=576) -->";
const EYES_MARK = "  <!-- 目 -->";
const NOSE_MARK = "  <!-- 鼻 -->";

const cx = 512;
const seam = 577;

/** 口の形ごとの寸法(半分の幅、唇の内側の上下の開き、唇の厚さ、歯・舌の見え方) */
const MOUTHS = {
  a: { hw: 47, up: 7, dn: 30, lipUp: 9, lipDn: 12, teethTop: 7, teethBottom: 0, tongue: true, round: false },
  i: { hw: 55, up: 3, dn: 9, lipUp: 9, lipDn: 12, teethTop: 5, teethBottom: 4, tongue: false, round: false },
  u: { hw: 30, up: 4, dn: 9, lipUp: 10, lipDn: 13, teethTop: 0, teethBottom: 0, tongue: false, round: true },
  e: { hw: 52, up: 5, dn: 18, lipUp: 9, lipDn: 12, teethTop: 6, teethBottom: 0, tongue: true, round: false },
  o: { hw: 36, up: 8, dn: 22, lipUp: 10, lipDn: 13, teethTop: 4, teethBottom: 0, tongue: true, round: true },
};

const f = (n) => Math.round(n * 10) / 10;

function mouthSvg(key, m) {
  const k1 = m.round ? 0.95 : 0.6;
  const k2 = m.round ? 0.45 : 0.22;
  const L = [cx - m.hw, seam - 1];
  const R = [cx + m.hw, seam - 1];
  const top = seam - m.up;
  const bottom = seam + m.dn;
  const innerTop = `C${f(cx - m.hw * k1)} ${f(top - m.up * 0.1)} ${f(cx - m.hw * k2)} ${top} ${cx} ${top} C${f(cx + m.hw * k2)} ${top} ${f(cx + m.hw * k1)} ${f(top - m.up * 0.1)} ${R[0]} ${R[1]}`;
  const innerTopBack = `C${f(cx + m.hw * k1)} ${f(top - m.up * 0.1)} ${f(cx + m.hw * k2)} ${top} ${cx} ${top} C${f(cx - m.hw * k2)} ${top} ${f(cx - m.hw * k1)} ${f(top - m.up * 0.1)} ${L[0]} ${L[1]}`;
  const innerBottom = `C${f(cx - m.hw * k1)} ${f(bottom + m.dn * 0.05)} ${f(cx - m.hw * k2)} ${bottom} ${cx} ${bottom} C${f(cx + m.hw * k2)} ${bottom} ${f(cx + m.hw * k1)} ${f(bottom + m.dn * 0.05)} ${R[0]} ${R[1]}`;
  const innerBottomBack = `C${f(cx + m.hw * k1)} ${f(bottom + m.dn * 0.05)} ${f(cx + m.hw * k2)} ${bottom} ${cx} ${bottom} C${f(cx - m.hw * k2)} ${bottom} ${f(cx - m.hw * k1)} ${f(bottom + m.dn * 0.05)} ${L[0]} ${L[1]}`;
  const lipTop = top - m.lipUp;
  const upperOuter = `C${f(cx - m.hw * 0.75)} ${f(lipTop + m.lipUp * 0.2)} ${f(cx - m.hw * 0.3)} ${f(lipTop - m.lipUp * 0.3)} ${cx - 6} ${f(lipTop - m.lipUp * 0.15)} Q${cx} ${f(lipTop + m.lipUp * 0.15)} ${cx + 6} ${f(lipTop - m.lipUp * 0.15)} C${f(cx + m.hw * 0.3)} ${f(lipTop - m.lipUp * 0.3)} ${f(cx + m.hw * 0.75)} ${f(lipTop + m.lipUp * 0.2)} ${R[0]} ${R[1]}`;
  const lipBottom = bottom + m.lipDn;
  const lowerOuterBack = `C${f(cx + m.hw * 0.7)} ${f(lipBottom - m.lipDn * 0.3)} ${f(cx + m.hw * 0.3)} ${f(lipBottom + m.lipDn * 0.15)} ${cx} ${f(lipBottom + m.lipDn * 0.15)} C${f(cx - m.hw * 0.3)} ${f(lipBottom + m.lipDn * 0.15)} ${f(cx - m.hw * 0.7)} ${f(lipBottom - m.lipDn * 0.3)} ${L[0]} ${L[1]}`;
  const opening = `M${L[0]} ${L[1]} ${innerTop} ${innerBottomBack} Z`;
  const id = `mouth-${key}`;
  const parts = [
    `  <!-- 口「${key}」 -->`,
    `  <defs><clipPath id="${id}"><path d="${opening}"/></clipPath></defs>`,
    `  <path d="M500 ${seam - 21 - m.up} C506 ${seam - 15 - m.up} 518 ${seam - 15 - m.up} 524 ${seam - 21 - m.up}" stroke="#d9a07c" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.6"/>`,
    `  <path d="${opening}" fill="#3b1316"/>`,
    `  <g clip-path="url(#${id})">`,
    `    <ellipse cx="${cx}" cy="${f(bottom + m.dn * 0.1)}" rx="${f(m.hw * 0.9)}" ry="${f(Math.max(4, m.dn * 0.55))}" fill="#5a1d22"/>`,
  ];
  if (m.tongue) parts.push(`    <ellipse cx="${cx}" cy="${f(bottom - 1)}" rx="${f(m.hw * 0.55)}" ry="${f(Math.max(4, m.dn * 0.38))}" fill="#b0525a"/>`);
  if (m.teethTop) {
    parts.push(`    <rect x="${cx - m.hw}" y="${top - 2}" width="${m.hw * 2}" height="${m.teethTop + 2}" fill="#f2eee6"/>`);
    parts.push(`    <path d="M${cx - m.hw} ${top + m.teethTop} L${cx + m.hw} ${top + m.teethTop}" stroke="#c9c2b6" stroke-width="1.2"/>`);
  }
  if (m.teethBottom) parts.push(`    <rect x="${cx - m.hw}" y="${bottom - m.teethBottom}" width="${m.hw * 2}" height="${m.teethBottom + 2}" fill="#e8e3da"/>`);
  parts.push(
    `  </g>`,
    `  <path d="M${L[0]} ${L[1]} ${upperOuter} ${innerTopBack} Z" fill="#c4766a"/>`,
    `  <path d="M${L[0]} ${L[1]} ${innerBottom} ${lowerOuterBack} Z" fill="#d68c7e"/>`,
    `  <path d="M${cx - m.hw * 0.35} ${f(lipBottom - m.lipDn * 0.35)} Q${cx} ${f(lipBottom - m.lipDn * 0.1)} ${cx + m.hw * 0.35} ${f(lipBottom - m.lipDn * 0.35)}" stroke="#e8a99a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>`,
    `  <path d="${opening}" fill="none" stroke="#8e4b42" stroke-width="1.5"/>`,
    `  <path d="M496 ${f(lipBottom + 16)} C506 ${f(lipBottom + 20)} 518 ${f(lipBottom + 20)} 528 ${f(lipBottom + 16)}" stroke="#d9a07c" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>`,
  );
  return parts.join("\n") + "\n";
}

/** 閉じた目(下向きの弧とまつげ) */
function closedEye(x) {
  const lashes = [-24, -12, 0, 12, 24]
    .map((dx) => {
      const y = 441 + 11 * (1 - (dx / 36) ** 2);
      return `<path d="M${x + dx} ${f(y)} L${x + dx * 1.15} ${f(y + 5)}" stroke="#2a1f1b" stroke-width="2" stroke-linecap="round"/>`;
    })
    .join("\n  ");
  return [
    `  <path d="M${x - 30} 430 Q${x} 418 ${x + 30} 430" stroke="#d29a78" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/>`,
    `  <path d="M${x - 35} 440 Q${x} 432 ${x + 35} 440 Q${x} 449 ${x - 35} 440 Z" fill="#e7b896" opacity="0.6"/>`,
    `  <path d="M${x - 36} 440 Q${x} 463 ${x + 36} 440" stroke="#2a1f1b" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    `  ${lashes}`,
  ].join("\n");
}

function replaceBetween(svg, start, end, replacement) {
  const from = svg.indexOf(start);
  const to = end === null ? svg.lastIndexOf("</svg>") : svg.indexOf(end);
  if (from < 0 || to < 0) throw new Error(`marker not found: ${start}`);
  return svg.slice(0, from) + replacement + svg.slice(to);
}

for (const [key, m] of Object.entries(MOUTHS)) {
  writeFileSync(`${dir}mouth-${key}.svg`, replaceBetween(neutral, MOUTH_MARK, null, mouthSvg(key, m)));
}
const blink = `  <!-- 目(閉じた状態) -->\n${closedEye(440)}\n${closedEye(584)}\n\n`;
writeFileSync(`${dir}blink.svg`, replaceBetween(neutral, EYES_MARK, NOSE_MARK, blink));
console.log("wrote", Object.keys(MOUTHS).map((k) => `mouth-${k}.svg`).join(", "), "blink.svg");

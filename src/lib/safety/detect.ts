/**
 * Fast, local, multilingual risk detector. Runs on the transcript in memory;
 * returns only an enum + category list. No text excerpt is ever retained.
 *
 * Design goals:
 *  - Catch explicit high-risk statements in English, Hindi (Devanagari +
 *    romanised/Hinglish) and Gujarati.
 *  - Do NOT overreact to ordinary sadness, venting or idioms
 *    ("this traffic is killing me", "dying to sleep").
 *  - Negated statements ("I don't want to hurt myself") downgrade to "elevated",
 *    never to "none" — a gentle resources link is still appropriate.
 *
 * This is a first line, not a clinical tool. Phase 4b adds an optional LLM
 * classifier with constrained JSON output on top of this (see ARCHITECTURE §I).
 */

export type RiskLevel = "none" | "elevated" | "high";
export type RiskCategory = "self_harm" | "violence" | "abuse" | "medical" | "distress";

export interface RiskResult {
  level: RiskLevel;
  categories: RiskCategory[];
}

interface Rule {
  re: RegExp;
  cat: RiskCategory;
  level: Exclude<RiskLevel, "none">;
}

// \b does not work for Devanagari/Gujarati, so Indic rules match plain substrings.
const RULES: Rule[] = [
  // ---- self-harm / suicide (English) ----
  { re: /\b(kill|killing|hurt|hurting|harm|harming|cut|cutting)\s+(myself|my\s*self)\b/i, cat: "self_harm", level: "high" },
  { re: /\b(end|ending|take|taking)\s+(my|my\s+own)\s+life\b/i, cat: "self_harm", level: "high" },
  { re: /\b(want|wanna|going|planning|ready)\s+(to\s+)?die\b/i, cat: "self_harm", level: "high" },
  { re: /\bsuicid(e|al)\b/i, cat: "self_harm", level: "high" },
  { re: /\b(better\s+off\s+dead|no\s+reason\s+to\s+(live|go\s+on)|don'?t\s+want\s+to\s+(live|be\s+alive|exist))\b/i, cat: "self_harm", level: "high" },
  { re: /\bnot\s+(be|being)\s+(here|around)\s+(anymore|tomorrow)\b/i, cat: "self_harm", level: "high" },
  // ---- self-harm (Hinglish, romanised) ----
  { re: /\b(khudkushi|khud\s*khushi|aatmhatya|atmahatya|aatmahatya|suicide\s+kar)/i, cat: "self_harm", level: "high" },
  { re: /\b(mar\s+jaana|mar\s+jana|marna)\s+(chahta|chahti|hai|hain)\b/i, cat: "self_harm", level: "high" },
  { re: /\bjeena\s+nahi(n)?\s+(chahta|chahti|hai)\b/i, cat: "self_harm", level: "high" },
  { re: /\b(zindagi|life)\s+(khatam|khtm)\s+(kar|karna|kardu|kar\s+du)/i, cat: "self_harm", level: "high" },
  // ---- self-harm (Devanagari) ----
  { re: /(आत्महत्या|ख़ुदकुशी|खुदकुशी|मर\s*जाना\s*चाहत|जीना\s*नहीं\s*चाहत|ज़िंदगी\s*ख़त्म|जिंदगी\s*खत्म)/, cat: "self_harm", level: "high" },
  // ---- self-harm (Gujarati) ----
  { re: /(આત્મહત્યા|મરી\s*જવું\s*છે|મરી\s*જવા\s*માંગ|જીવવું\s*નથી|જીવન\s*ખતમ)/, cat: "self_harm", level: "high" },

  // ---- violence toward others ----
  { re: /\b(going|want|gonna|planning)\s+to\s+(kill|hurt|stab|shoot|attack)\s+(him|her|them|someone|somebody|my\s+\w+)\b/i, cat: "violence", level: "high" },
  { re: /\b(usko|use|unko)\s+(maar\s+dunga|maar\s+dungi|jaan\s+se\s+maar)/i, cat: "violence", level: "high" },

  // ---- abuse ----
  { re: /\b(he|she|they|my\s+\w+)\s+(hits|beats|chokes|hurts|abuses)\s+me\b/i, cat: "abuse", level: "high" },
  { re: /\b(being|been|getting)\s+(abused|beaten|assaulted|molested)\b/i, cat: "abuse", level: "high" },
  { re: /\b(mujhe\s+maarta|mujhe\s+maarti|mujhe\s+peet)/i, cat: "abuse", level: "high" },

  // ---- medical emergency ----
  { re: /\b(overdos(e|ed)|took\s+(too\s+many|a\s+lot\s+of|all\s+(my|the))\s+(pills|tablets|meds))\b/i, cat: "medical", level: "high" },
  { re: /\b(can'?t|cannot)\s+breathe\b/i, cat: "medical", level: "high" },
  { re: /\bchest\s+pain\b/i, cat: "medical", level: "elevated" },

  // ---- distress (elevated, not crisis) ----
  { re: /\b(hopeless|worthless|can'?t\s+go\s+on|nothing\s+matters|no\s+way\s+out|nobody\s+would\s+(care|notice|miss\s+me))\b/i, cat: "distress", level: "elevated" },
  { re: /\b(give\s+up\s+on\s+(everything|life))\b/i, cat: "distress", level: "elevated" },
  { re: /\b(sab\s+khatam|koi\s+umeed\s+nahi|main\s+bekaar\s+(hoon|hu))\b/i, cat: "distress", level: "elevated" },
  { re: /(कोई\s*उम्मीद\s*नहीं|सब\s*ख़त्म|સબ\s*ખતમ|કોઈ\s*આશા\s*નથી)/, cat: "distress", level: "elevated" },
];

const NEGATION = /\b(not|never|don'?t|do\s+not|wouldn'?t|won'?t|no\s+longer|nahi|nahin|mat)\b|नहीं|નથી/i;

function negatedBefore(text: string, index: number): boolean {
  // Look at the ~5 words immediately before the match.
  const window = text.slice(Math.max(0, index - 40), index);
  const words = window.split(/\s+/).slice(-5).join(" ");
  return NEGATION.test(words);
}

export function detectRisk(input: string): RiskResult {
  const text = (input ?? "").normalize("NFC");
  let level: RiskLevel = "none";
  const cats = new Set<RiskCategory>();

  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    let ruleLevel: RiskLevel = rule.level;
    if (ruleLevel === "high" && negatedBefore(text, m.index)) ruleLevel = "elevated";
    cats.add(rule.cat);
    if (ruleLevel === "high") level = "high";
    else if (level === "none") level = "elevated";
  }
  return { level, categories: [...cats] };
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank = { none: 0, elevated: 1, high: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

import { describe, expect, it } from "vitest";
import { detectRisk } from "@/lib/safety/detect";

describe("detectRisk — does not overreact to ordinary venting", () => {
  it.each([
    "I'm so frustrated with my boss. Nobody respects my work.",
    "I hate everything about today.",
    "This traffic is killing me.",
    "I'm dying to get some sleep.",
    "I could kill for a cup of chai right now.",
    "Aaj ka din bahut bekaar tha yaar, office mein sab pagal hain.",
    "આજે બહુ થાક લાગ્યો.",
    "मैं आज बहुत थक गया हूँ।",
    "I feel sad and tired.",
  ])("none: %s", (text) => {
    expect(detectRisk(text).level).toBe("none");
  });
});

describe("detectRisk — high risk", () => {
  it.each([
    ["I want to kill myself", "self_harm"],
    ["Sometimes I think about ending my life", "self_harm"],
    ["I've been feeling suicidal", "self_harm"],
    ["Honestly everyone would be better off dead without me — I'd be better off dead", "self_harm"],
    ["main mar jaana chahta hoon", "self_harm"],
    ["ab jeena nahi chahta", "self_harm"],
    ["मैं आत्महत्या के बारे में सोच रहा हूँ", "self_harm"],
    ["મને જીવવું નથી", "self_harm"],
    ["I'm going to hurt him when he gets home", "violence"],
    ["My husband hits me every week", "abuse"],
    ["I took too many pills", "medical"],
  ])("high: %s", (text, cat) => {
    const r = detectRisk(text);
    expect(r.level).toBe("high");
    expect(r.categories).toContain(cat);
  });
});

describe("detectRisk — elevated", () => {
  it("negated self-harm downgrades to elevated, not none", () => {
    expect(detectRisk("I would never hurt myself, I just needed to say it").level).toBe("elevated");
  });
  it("hopelessness is elevated", () => {
    expect(detectRisk("Everything feels hopeless lately").level).toBe("elevated");
    expect(detectRisk("koi umeed nahi bachi").level).toBe("elevated");
  });
});

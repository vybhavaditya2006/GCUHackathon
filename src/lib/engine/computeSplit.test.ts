import { describe, expect, it } from "vitest";
import {
  computeSplit, formatRupees,
  type CharterTerms, type ReviewedContribution, type SplitMember, type SplitResult,
} from "./computeSplit";

// The demo charter: fee 10%, AI reserve 5%, expert 30%, students 40% equal + 60% weighted.
const terms: CharterTerms = { feePct: 10, aiReservePct: 5, expertPct: 30, equalPct: 40, weightedPct: 60, version: 1 };

const team = (meeraActive = 1): SplitMember[] => [
  { userId: "kiran", name: "Kiran", role: "expert" },
  { userId: "priya", name: "Priya", role: "student" },
  { userId: "arjun", name: "Arjun", role: "student" },
  { userId: "meera", name: "Meera", role: "student", activeFraction: meeraActive },
];

// Reviewed impacts 5 / 3 / 2, as in the seeded ledger.
const reviewed: ReviewedContribution[] = [
  { authorId: "priya", impact: 1, ledgerSeq: 17, aiShare: 0.8, reviewedBy: "Kiran" },
  { authorId: "priya", impact: 4, ledgerSeq: 19, aiShare: 0, reviewedBy: "Kiran" },
  { authorId: "arjun", impact: 3, ledgerSeq: 23, aiShare: 0.7, reviewedBy: "Kiran" },
  { authorId: "meera", impact: 2, ledgerSeq: 37, aiShare: 0, reviewedBy: "Kiran" },
];

const amounts = (r: SplitResult) => Object.fromEntries(r.payouts.map((p) => [p.name, p.amount]));
const payout = (r: SplitResult, name: string) => r.payouts.find((p) => p.name === name)!;
const accountsFor = (r: SplitResult) => r.fee + r.aiReserve + r.totalPaid + r.unallocated;

describe("computeSplit: required cases", () => {
  it("splits ₹1,00,000 as Kiran 25,500 · Priya 25,783 · Arjun 18,643 · Meera 15,074", () => {
    const r = computeSplit(100000, terms, team(), reviewed);

    expect(amounts(r)).toEqual({ Kiran: 25500, Priya: 25783, Arjun: 18643, Meera: 15074 });
    expect(r.totalPaid).toBe(85000);
    expect(r.unallocated).toBe(0);
    expect(r).toMatchObject({
      fee: 10000, aiReserve: 5000, distributable: 85000, expertTotal: 25500, studentPool: 59500,
      equalPool: 23800, weightedPool: 35700,
    });
    expect(accountsFor(r)).toBe(100000);
  });

  it("pays Meera 11,900 and leaves 3,173 unallocated when she was active for 60%", () => {
    const r = computeSplit(100000, terms, team(0.6), reviewed);

    expect(payout(r, "Meera").amount).toBe(11900);
    expect(r.unallocated).toBe(3173);
    // Nobody else gains from her leaving, apart from the one rounding rupee.
    expect(amounts(r)).toEqual({ Kiran: 25500, Priya: 25783, Arjun: 18644, Meera: 11900 });
    expect(accountsFor(r)).toBe(100000);
    expect(payout(r, "Meera").lines.join("\n")).toMatch(/active for 60% of the milestone/);
  });

  it("gives everyone ₹0 on a ₹0 budget, with receipt lines still present", () => {
    const r = computeSplit(0, terms, team(), reviewed);

    expect(amounts(r)).toEqual({ Kiran: 0, Priya: 0, Arjun: 0, Meera: 0 });
    expect(r.unallocated).toBe(0);
    for (const p of r.payouts) expect(p.lines.length).toBeGreaterThan(0);
    expect(payout(r, "Arjun").weight).toBeCloseTo(0.3);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});

describe("computeSplit: receipts", () => {
  const r = computeSplit(100000, terms, team(), reviewed);

  it("explains Arjun's ₹18,643 line by line", () => {
    const arjun = payout(r, "Arjun");
    expect(arjun).toMatchObject({ equalPart: 7933, weightedPart: 10710, impact: 3, ledgerRefs: [23], rounding: 0 });
    expect(arjun.weight).toBeCloseTo(0.3);
    expect(arjun.lines).toEqual([
      "Charter v1: student pool = ₹85,000 distributable − 30% expert share = ₹59,500",
      "Equal part: 40% × 59,500 ÷ 3 = ₹7,933",
      "Weighted part: 60% × 59,500 × 0.3 = ₹10,710",
      "Weight 0.3 = reviewed impact 3 of 10, from ledger #23, reviewed by Kiran. Commit counts are ignored.",
      "AI share 70% disclosed. Credit stays with Arjun as the human owner; agent cost is paid from the AI reserve.",
    ]);
  });

  it("gives the spare rupee to the smallest tied share and says so", () => {
    const meera = payout(r, "Meera");
    expect(meera).toMatchObject({ equalPart: 7933, weightedPart: 7140, amount: 15074, rounding: 1 });
    expect(meera.lines.at(-1)).toMatch(/^Rounding: \+₹1/);
    expect(payout(r, "Priya").rounding).toBe(0);
  });

  it("reports the AI share weighted by impact, and lists every ledger reference", () => {
    const priya = payout(r, "Priya");
    expect(priya.aiShare).toBeCloseTo(0.16); // (0.8 × 1 + 0 × 4) ÷ 5
    expect(priya.ledgerRefs).toEqual([17, 19]);
    expect(payout(r, "Meera").lines).toContain("No AI-assisted work in this share.");
  });

  it("writes the waterfall", () => {
    expect(r.lines.slice(0, 4)).toEqual([
      "Budget released from escrow: ₹1,00,000",
      "− Platform fee (10%): ₹10,000",
      "− AI compute reserve (5%): ₹5,000",
      "= Distributable: ₹85,000",
    ]);
  });
});

describe("computeSplit: rules", () => {
  it("ignores how MANY contributions someone made: only reviewed impact counts", () => {
    const manySmall: ReviewedContribution[] = [
      ...Array.from({ length: 20 }, () => ({ authorId: "priya", impact: 0.1 })), // 20 entries, impact 2
      { authorId: "arjun", impact: 3 },
      { authorId: "meera", impact: 5 },
    ];
    const r = computeSplit(100000, terms, team(), manySmall);
    expect(payout(r, "Priya").weight).toBeCloseTo(0.2);
    expect(payout(r, "Meera").amount).toBeGreaterThan(payout(r, "Priya").amount);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const members = team();
    const before = JSON.stringify([terms, members, reviewed]);
    const a = computeSplit(100000, terms, members, reviewed);
    const b = computeSplit(100000, terms, members, reviewed);
    expect(a).toEqual(b);
    expect(JSON.stringify([terms, members, reviewed])).toBe(before);
  });

  it("always accounts for every rupee, whatever the budget", () => {
    for (const budget of [1, 7, 99, 12345, 99999, 100001, 987654321]) {
      for (const active of [1, 0.6, 0.333, 0]) {
        const r = computeSplit(budget, terms, team(active), reviewed);
        expect(accountsFor(r)).toBe(budget);
        expect(r.unallocated).toBeGreaterThanOrEqual(0);
        for (const p of r.payouts) expect(Number.isInteger(p.amount) && p.amount >= 0).toBe(true);
      }
    }
  });

  it("leaves the weighted part unallocated when nothing has been reviewed", () => {
    const r = computeSplit(100000, terms, team(), []);
    expect(amounts(r)).toEqual({ Kiran: 25500, Priya: 7934, Arjun: 7933, Meera: 7933 });
    expect(r.unallocated).toBe(35700);
    expect(accountsFor(r)).toBe(100000);
  });

  it("leaves a role's share unallocated when nobody holds that role", () => {
    const noExpert = computeSplit(100000, terms, team().filter((m) => m.role === "student"), reviewed);
    expect(noExpert.unallocated).toBe(25500);
    const noStudents = computeSplit(100000, terms, team().filter((m) => m.role === "expert"), reviewed);
    expect(amounts(noStudents)).toEqual({ Kiran: 25500 });
    expect(noStudents.unallocated).toBe(59500);
  });

  it("splits the expert share equally between experts", () => {
    const r = computeSplit(100000, terms, [...team(), { userId: "x", name: "Second expert", role: "expert" }], reviewed);
    expect(payout(r, "Kiran").amount).toBe(12750);
    expect(payout(r, "Second expert").amount).toBe(12750);
  });

  it("ignores reviewed work by people who are not students on this split", () => {
    const r = computeSplit(100000, terms, team(), [...reviewed, { authorId: "outsider", impact: 10 }]);
    expect(amounts(r)).toEqual({ Kiran: 25500, Priya: 25783, Arjun: 18643, Meera: 15074 });
  });

  it("works for the non-monetary charter: no money, weights and receipts still computed", () => {
    const r = computeSplit(
      0,
      { feePct: 0, aiReservePct: 0, expertPct: 0, equalPct: 40, weightedPct: 60 },
      [
        { userId: "sana", name: "Sana", role: "student" },
        { userId: "dev", name: "Dev", role: "student" },
      ],
      [{ authorId: "sana", impact: 6 }, { authorId: "dev", impact: 4 }],
    );
    expect(r.totalPaid).toBe(0);
    expect(payout(r, "Sana").weight).toBeCloseTo(0.6);
    expect(payout(r, "Dev").weight).toBeCloseTo(0.4);
  });

  it("rejects terms and inputs that make no sense", () => {
    expect(() => computeSplit(-1, terms, team(), reviewed)).toThrow(/budget/);
    expect(() => computeSplit(100.5, terms, team(), reviewed)).toThrow(/budget/);
    expect(() => computeSplit(100, { ...terms, equalPct: 50 }, team(), reviewed)).toThrow(/must equal 100/);
    expect(() => computeSplit(100, { ...terms, feePct: 96 }, team(), reviewed)).toThrow(/cannot exceed 100/);
    expect(() => computeSplit(100, terms, team(1.2), reviewed)).toThrow(/activeFraction/);
    expect(() => computeSplit(100, terms, [...team(), team()[1]], reviewed)).toThrow(/listed twice/);
    expect(() => computeSplit(100, terms, team(), [{ authorId: "priya", impact: -1 }])).toThrow(/impact/);
  });
});

describe("formatRupees", () => {
  it("uses Indian digit grouping", () => {
    expect(formatRupees(0)).toBe("₹0");
    expect(formatRupees(999)).toBe("₹999");
    expect(formatRupees(7933)).toBe("₹7,933");
    expect(formatRupees(100000)).toBe("₹1,00,000");
    expect(formatRupees(12345678)).toBe("₹1,23,45,678");
  });
});

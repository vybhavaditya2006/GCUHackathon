// The charter engine. PURE: no I/O, no clock, no randomness. Given the same
// charter terms, members and reviewed contributions it always returns the same
// split, and every payout carries the plain-English receipt that explains it.
import { Fraction } from "./fraction";

/** Charter terms. Percentages are whole numbers, e.g. feePct: 10 means 10%. */
export interface CharterTerms {
  feePct: number;
  aiReservePct: number;
  /** Share of the distributable amount that goes to experts. */
  expertPct: number;
  /** Share of the student pool split equally. equalPct + weightedPct = 100. */
  equalPct: number;
  /** Share of the student pool split by reviewed impact. */
  weightedPct: number;
  /** Charter version, only used to label receipts. */
  version?: number;
}

export interface SplitMember {
  userId: string;
  name: string;
  role: "expert" | "student";
  /** 1 = active for the whole milestone; 0.6 = left after 60%. Defaults to 1. */
  activeFraction?: number;
}

/** A contribution that an expert has reviewed and scored. */
export interface ReviewedContribution {
  authorId: string;
  /** Reviewed impact, 0..10. Weights come from this, never from commit counts. */
  impact: number;
  /** Ledger entry that recorded the contribution. */
  ledgerSeq?: number;
  /** 0..1, how much of it an AI agent drafted. Disclosed, never paid to the AI. */
  aiShare?: number;
  title?: string;
  reviewedBy?: string;
}

export interface Payout {
  userId: string;
  name: string;
  role: "expert" | "student";
  /** Whole rupees. */
  amount: number;
  /** Students only: the equal and weighted parts before the rounding rupee. */
  equalPart: number;
  weightedPart: number;
  /** Students only: reviewed impact and its share of the total (0..1). */
  impact: number;
  weight: number;
  /** Impact-weighted share of this person's reviewed work that was AI-drafted (0..1). */
  aiShare: number;
  activeFraction: number;
  /** 1 if largest-remainder rounding gave this person the spare rupee, else 0. */
  rounding: number;
  /** The receipt: why this person gets this amount, in plain English. */
  lines: string[];
  /** Ledger entries the amount is based on. */
  ledgerRefs: number[];
}

export interface SplitResult {
  budget: number;
  fee: number;
  aiReserve: number;
  distributable: number;
  expertTotal: number;
  studentPool: number;
  equalPool: number;
  weightedPool: number;
  payouts: Payout[];
  /** Money the rules leave with nobody (pro-rata leftovers, empty roles). */
  unallocated: number;
  /** Sum of payouts. fee + aiReserve + totalPaid + unallocated = budget. */
  totalPaid: number;
  /** The waterfall from budget to pools, in plain English. */
  lines: string[];
}

const pct = (n: number) => Fraction.from(n).div(Fraction.from(100));

/** Indian digit grouping: 100000 -> "1,00,000". */
export function formatRupees(amount: number): string {
  const digits = Math.trunc(Math.abs(amount)).toString();
  const head = digits.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}` : digits;
  return `${amount < 0 ? "-" : ""}₹${grouped}`;
}

const num = (n: number) => formatRupees(n).slice(1);
const percent = (share: number) => `${Math.round(share * 100)}%`;
const trim = (n: number) => String(Math.round(n * 1000) / 1000);

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`computeSplit: ${message}`);
}

function validate(budget: number, terms: CharterTerms, members: SplitMember[], reviewed: ReviewedContribution[]) {
  check(Number.isInteger(budget) && budget >= 0, "budget must be a whole number of rupees, 0 or more");
  for (const key of ["feePct", "aiReservePct", "expertPct", "equalPct", "weightedPct"] as const) {
    check(Number.isFinite(terms[key]) && terms[key] >= 0 && terms[key] <= 100, `${key} must be between 0 and 100`);
  }
  check(terms.feePct + terms.aiReservePct <= 100, "feePct + aiReservePct cannot exceed 100");
  check(terms.equalPct + terms.weightedPct === 100, "equalPct + weightedPct must equal 100");
  check(new Set(members.map((m) => m.userId)).size === members.length, "a member is listed twice");
  for (const m of members) {
    const f = m.activeFraction ?? 1;
    check(Number.isFinite(f) && f >= 0 && f <= 1, `activeFraction for ${m.name} must be between 0 and 1`);
  }
  for (const c of reviewed) {
    check(Number.isFinite(c.impact) && c.impact >= 0, "impact must be 0 or more");
    const share = c.aiShare ?? 0;
    check(Number.isFinite(share) && share >= 0 && share <= 1, "aiShare must be between 0 and 1");
  }
}

type Bucket = { exact: Fraction; rank: number };

/**
 * Largest-remainder rounding to whole rupees that add up exactly to `total`.
 * Everyone gets the whole part of their share; spare rupees go to the largest
 * remainders. Ties go to the lower rank (people before pots), then to the
 * smallest share.
 */
function roundToTotal(buckets: Bucket[], total: number): number[] {
  const rounded = buckets.map((b) => b.exact.floor());
  let spare = total - rounded.reduce((a, b) => a + b, 0);
  const order = buckets
    .map((b, i) => ({ i, rem: b.exact.remainder(), exact: b.exact, rank: b.rank }))
    .filter((b) => b.rem.compare(Fraction.zero) > 0)
    .sort((a, b) => b.rem.compare(a.rem) || a.rank - b.rank || a.exact.compare(b.exact) || a.i - b.i);
  for (const b of order) {
    if (spare <= 0) break;
    rounded[b.i] += 1;
    spare -= 1;
  }
  return rounded;
}

export function computeSplit(
  budget: number,
  terms: CharterTerms,
  members: SplitMember[],
  reviewedContributions: ReviewedContribution[],
): SplitResult {
  validate(budget, terms, members, reviewedContributions);

  const charter = terms.version ? `Charter v${terms.version}` : "Charter";
  const experts = members.filter((m) => m.role === "expert");
  const students = members.filter((m) => m.role === "student");
  const studentIds = new Set(students.map((s) => s.userId));
  // Only reviewed work by students on this split earns weight.
  const counted = reviewedContributions.filter((c) => studentIds.has(c.authorId));

  const B = Fraction.from(budget);
  const feeX = B.mul(pct(terms.feePct));
  const aiX = B.mul(pct(terms.aiReservePct));
  const distributableX = B.sub(feeX).sub(aiX);
  const expertTotalX = distributableX.mul(pct(terms.expertPct));
  const poolX = distributableX.sub(expertTotalX);
  const equalPoolX = poolX.mul(pct(terms.equalPct));
  const weightedPoolX = poolX.mul(pct(terms.weightedPct));

  const impactOf = (userId: string) =>
    counted.filter((c) => c.authorId === userId).reduce((sum, c) => sum.add(Fraction.from(c.impact)), Fraction.zero);
  const totalImpactX = students.reduce((sum, s) => sum.add(impactOf(s.userId)), Fraction.zero);
  const hasImpact = totalImpactX.compare(Fraction.zero) > 0;

  // Exact (unrounded) shares.
  const expertShares = experts.map((m) =>
    expertTotalX.div(Fraction.from(experts.length)).mul(Fraction.from(m.activeFraction ?? 1)),
  );
  const studentShares = students.map((m) => {
    const impact = impactOf(m.userId);
    const weight = hasImpact ? impact.div(totalImpactX) : Fraction.zero;
    const equal = equalPoolX.div(Fraction.from(students.length)).mul(Fraction.from(m.activeFraction ?? 1));
    const weighted = weightedPoolX.mul(weight);
    return { impact, weight, equal, weighted, total: equal.add(weighted) };
  });

  const paidX = [...expertShares, ...studentShares.map((s) => s.total)].reduce((a, b) => a.add(b), Fraction.zero);
  const unallocatedX = distributableX.sub(paidX);

  // Round everything together so the whole budget is accounted for to the rupee.
  const rounded = roundToTotal(
    [
      ...expertShares.map((exact) => ({ exact, rank: 0 })),
      ...studentShares.map((s) => ({ exact: s.total, rank: 0 })),
      { exact: unallocatedX, rank: 1 },
      { exact: aiX, rank: 2 },
      { exact: feeX, rank: 3 },
    ],
    budget,
  );
  const people = experts.length + students.length;
  const [unallocated, aiReserve, fee] = rounded.slice(people);
  const distributable = budget - fee - aiReserve;
  const expertTotal = expertTotalX.floor();
  const studentPool = distributable - expertTotal;
  const equalPool = equalPoolX.floor();
  const weightedPool = studentPool - equalPool;

  const roundingLine = "Rounding: +₹1 so that all shares add up exactly (largest remainder; ties go to the smallest share).";

  const expertPayouts: Payout[] = experts.map((m, i) => {
    const amount = rounded[i];
    const fraction = m.activeFraction ?? 1;
    const rounding = amount - expertShares[i].floor();
    const lines = [
      `${charter}: distributable = ${formatRupees(budget)} − ${terms.feePct}% platform fee − ${terms.aiReservePct}% AI reserve = ${formatRupees(distributable)}`,
      `Expert share: ${terms.expertPct}% × ${num(distributable)}${experts.length > 1 ? ` ÷ ${experts.length} experts` : ""} = ${formatRupees(expertTotalX.div(Fraction.from(experts.length)).floor())}`,
    ];
    if (fraction < 1) {
      lines.push(`Active for ${percent(fraction)} of the milestone: share × ${trim(fraction)} = ${formatRupees(expertShares[i].floor())}; the rest is unallocated.`);
    }
    if (rounding) lines.push(roundingLine);
    return {
      userId: m.userId, name: m.name, role: "expert", amount, equalPart: 0, weightedPart: 0, impact: 0,
      weight: 0, aiShare: 0, activeFraction: fraction, rounding, lines, ledgerRefs: [],
    };
  });

  const totalImpact = totalImpactX.toNumber();
  const studentPayouts: Payout[] = students.map((m, i) => {
    const share = studentShares[i];
    const amount = rounded[experts.length + i];
    const fraction = m.activeFraction ?? 1;
    const mine = counted.filter((c) => c.authorId === m.userId);
    const impact = share.impact.toNumber();
    const weight = share.weight.toNumber();
    const aiShare = impact > 0 ? mine.reduce((sum, c) => sum + (c.aiShare ?? 0) * c.impact, 0) / impact : 0;
    const ledgerRefs = [...new Set(mine.flatMap((c) => (c.ledgerSeq === undefined ? [] : [c.ledgerSeq])))].sort((a, b) => a - b);
    const reviewers = [...new Set(mine.flatMap((c) => (c.reviewedBy ? [c.reviewedBy] : [])))];
    const equalPart = share.equal.floor();
    const weightedPart = share.weighted.floor();
    const rounding = amount - share.total.floor();

    const lines = [
      `${charter}: student pool = ${formatRupees(distributable)} distributable − ${terms.expertPct}% expert share = ${formatRupees(studentPool)}`,
      fraction < 1
        ? `Equal part: ${terms.equalPct}% × ${num(studentPool)} ÷ ${students.length} × ${trim(fraction)} (active for ${percent(fraction)} of the milestone) = ${formatRupees(equalPart)}`
        : `Equal part: ${terms.equalPct}% × ${num(studentPool)} ÷ ${students.length} = ${formatRupees(equalPart)}`,
      hasImpact
        ? `Weighted part: ${terms.weightedPct}% × ${num(studentPool)} × ${trim(weight)} = ${formatRupees(weightedPart)}`
        : `Weighted part: ₹0, because no work has been reviewed yet.`,
    ];
    if (hasImpact) {
      const refs = ledgerRefs.length ? `, from ledger ${ledgerRefs.map((s) => `#${s}`).join(", ")}` : "";
      const by = reviewers.length ? `, reviewed by ${reviewers.join(" and ")}` : "";
      lines.push(`Weight ${trim(weight)} = reviewed impact ${trim(impact)} of ${trim(totalImpact)}${refs}${by}. Commit counts are ignored.`);
    }
    if (fraction < 1) {
      lines.push(`Left early: the equal part is pro-rata; credit and the weighted part for reviewed work are kept.`);
    }
    lines.push(
      aiShare > 0
        ? `AI share ${percent(aiShare)} disclosed. Credit stays with ${m.name} as the human owner; agent cost is paid from the AI reserve.`
        : `No AI-assisted work in this share.`,
    );
    if (rounding) lines.push(roundingLine);

    return {
      userId: m.userId, name: m.name, role: "student", amount, equalPart, weightedPart, impact, weight,
      aiShare, activeFraction: fraction, rounding, lines, ledgerRefs,
    };
  });

  const payouts = [...expertPayouts, ...studentPayouts];
  const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);

  const lines = [
    `Budget released from escrow: ${formatRupees(budget)}`,
    `− Platform fee (${terms.feePct}%): ${formatRupees(fee)}`,
    `− AI compute reserve (${terms.aiReservePct}%): ${formatRupees(aiReserve)}`,
    `= Distributable: ${formatRupees(distributable)}`,
    `Expert share (${terms.expertPct}%): ${formatRupees(expertTotal)}`,
    `Student pool: ${formatRupees(studentPool)}`,
    `${terms.equalPct}% shared equally (÷${students.length}): ${formatRupees(equalPool)}`,
    `${terms.weightedPct}% by reviewed weight: ${formatRupees(weightedPool)}`,
    `Paid out: ${formatRupees(totalPaid)}`,
  ];
  if (unallocated > 0) {
    lines.push(`Unallocated: ${formatRupees(unallocated)} (pro-rata leftovers and shares with nobody to receive them).`);
  }

  return {
    budget, fee, aiReserve, distributable, expertTotal, studentPool, equalPool, weightedPool,
    payouts, unallocated, totalPaid, lines,
  };
}

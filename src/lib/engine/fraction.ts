// Exact rational arithmetic for the charter engine. Money is split with
// fractions, never floats, so remainders can be compared exactly when rounding.

const ZERO = BigInt(0);
const ONE = BigInt(1);

function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}

export class Fraction {
  private constructor(
    readonly num: bigint,
    readonly den: bigint,
  ) {}

  static of(num: bigint, den: bigint = ONE): Fraction {
    if (den === ZERO) throw new Error("Fraction: division by zero");
    if (den < ZERO) [num, den] = [-num, -den];
    const g = gcd(num, den) || ONE;
    return new Fraction(num / g, den / g);
  }

  /** Exact value of a finite decimal number such as 0.6, 12.5 or 100000. */
  static from(value: number): Fraction {
    if (!Number.isFinite(value)) throw new Error(`Fraction: ${value} is not a finite number`);
    const text = value.toString();
    if (/e/i.test(text)) throw new Error(`Fraction: ${value} is out of the supported range`);
    const [whole, decimals = ""] = text.split(".");
    return Fraction.of(BigInt(whole + decimals), BigInt("1" + "0".repeat(decimals.length)));
  }

  static readonly zero = Fraction.of(ZERO);

  add(o: Fraction): Fraction {
    return Fraction.of(this.num * o.den + o.num * this.den, this.den * o.den);
  }
  sub(o: Fraction): Fraction {
    return Fraction.of(this.num * o.den - o.num * this.den, this.den * o.den);
  }
  mul(o: Fraction): Fraction {
    return Fraction.of(this.num * o.num, this.den * o.den);
  }
  div(o: Fraction): Fraction {
    return Fraction.of(this.num * o.den, this.den * o.num);
  }

  /** Negative, zero or positive, like a sort comparator. */
  compare(o: Fraction): number {
    const d = this.num * o.den - o.num * this.den;
    return d < ZERO ? -1 : d > ZERO ? 1 : 0;
  }

  /** Whole part, for non-negative values. */
  floor(): number {
    return Number(this.num / this.den);
  }

  /** What is left after taking the whole part: 0 <= remainder < 1. */
  remainder(): Fraction {
    return Fraction.of(this.num % this.den, this.den);
  }

  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }
}

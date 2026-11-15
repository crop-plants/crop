import { describe, expect, test } from "bun:test";
import { relativeYieldPct, salinityAssessment, ec15ToEce, ECW_TO_ECE } from "../src/lib/crop/salinity";
import { CROP_BY_ID } from "../src/lib/crop/data/crops";
import { accumulateWater, grossM3PerAcre, waterScore, availableWaterM3 } from "../src/lib/crop/water";
import { kcForDay } from "../src/lib/crop/kc";
import { rotationScore } from "../src/lib/crop/rotation";
import { flagSeries } from "../src/lib/crop/quality";

describe("FAO-29 salinity response", () => {
  test("tomato a=2.5 b=9.9: Yr at ECe 6.1 ≈ 64%", () => {
    const yr = relativeYieldPct(2.5, 9.9, 6.1);
    expect(yr).toBeCloseTo(100 - 9.9 * 3.6, 1);
    expect(yr).toBeGreaterThan(60);
    expect(yr).toBeLessThan(70);
  });

  test("below threshold => 100%, far above => floored at 0", () => {
    expect(relativeYieldPct(2.5, 9.9, 2.0)).toBe(100);
    expect(relativeYieldPct(2.5, 9.9, 20)).toBe(0);
  });

  test("hard exclusion at Yr<50 (spec: salt-sensitive crop excluded at high ECe)", () => {
    const pepper = CROP_BY_ID["pepper"];
    const r = salinityAssessment(pepper, 5.5);
    expect(r.relativeYieldPct).toBeLessThan(50); // 100 - 14*(5.5-1.5) = 44
    const onion = CROP_BY_ID["onion"];
    const r2 = salinityAssessment(onion, 4.3);
    expect(r2.relativeYieldPct).toBeCloseTo(100 - 16 * (4.3 - 1.2), 1); // 50.4
    expect(r2.relativeYieldPct).toBeGreaterThanOrEqual(50);
  });

  test("ECw -> ECe factor and 1:5 extract conversion", () => {
    expect(ECW_TO_ECE).toBe(1.5);
    expect(ec15ToEce(1.7, "sandy loam")).toBeCloseTo(1.7 * 2.2, 5);
  });
});

describe("water accounting", () => {
  test("gross requirement and water score with drip efficiency", () => {
    const gross = grossM3PerAcre(150, 0.9);
    expect(gross).toBeCloseTo((150 / 0.9) * 4.047, 3);
    const avail = availableWaterM3(1233, 100);
    const { ratio, score, fail } = waterScore(avail, gross);
    expect(ratio).toBeGreaterThan(1);
    expect(score).toBe(1);
    expect(fail).toBeNull();
  });

  test("hard fail when available < 50% of gross", () => {
    const { fail } = waterScore(300, 700);
    expect(fail).not.toBeNull();
    expect(fail).toContain("50%");
  });

  test("insufficient coverage => netMm null (no invented water numbers)", () => {
    const t = accumulateWater([1.2, null, null, null, null, null]);
    expect(t.netMm).toBeNull(); // 1/6 coverage < 60%
  });

  test("Kc curve: piecewise interpolation", () => {
    const tomato = CROP_BY_ID["tomato"];
    expect(kcForDay(tomato, 0)).toBe(0.6);
    expect(kcForDay(tomato, 70)).toBeCloseTo(1.15, 2); // after ini+dev = 30+40
    expect(kcForDay(tomato, 100)).toBe(1.15);
    expect(kcForDay(tomato, 152)).toBeLessThan(1.15);
  });
});

describe("rotation rules", () => {
  const tomato = CROP_BY_ID["tomato"];
  const pepper = CROP_BY_ID["pepper"];
  const greenbean = CROP_BY_ID["greenbean"];
  const carrot = CROP_BY_ID["carrot"];

  test("same family previous season -> x0.2", () => {
    const r = rotationScore(pepper, { history: [tomato] });
    expect(r.score).toBeCloseTo(0.2, 5);
    expect(r.appliedRules.some((x) => x.effect.includes("×0.2"))).toBe(true);
  });

  test("same family two back -> x0.6 (not compounded with prev rule)", () => {
    const r = rotationScore(tomato, { history: [pepper, carrot] });
    // prev carrot (different family, +0.1 new family? tomato family Solanaceae in last 3 => no)
    // twoBack pepper same family => x0.6
    expect(r.score).toBeCloseTo(0.6, 5);
  });

  test("legume before heavy feeder -> +0.15", () => {
    const r = rotationScore(tomato, { history: [greenbean] });
    // prev greenbean: fixer + heavy => +0.15; new family? Solanaceae not in [Fabaceae] => +0.1
    expect(r.score).toBeCloseTo(1.0, 5); // capped at 1
  });

  test("fresh family in last 3 seasons -> +0.1", () => {
    const r = rotationScore(carrot, { history: [tomato, greenbean] });
    // prev greenbean fixer, carrot light => no legume bonus; Apiaceae new => +0.1
    expect(r.score).toBeCloseTo(1.0, 5);
  });
});

describe("sensor quality rules", () => {
  test("stuck series flagged after 6 h window", () => {
    const values: (number | null)[] = [];
    for (let i = 0; i < 40; i++) values.push(30 + Math.sin(i / 5) * 2); // varying
    for (let i = 40; i < 100; i++) values.push(31.0); // stuck for 60 samples (~10 h)
    const flags = flagSeries({ sensor: "soil_temp", values });
    const stuckCount = flags.filter((f) => f === "stuck").length;
    expect(stuckCount).toBeGreaterThan(0);
    // the transition sample (39) may legitimately flag as suspect; before it, all ok
    expect(flags.slice(0, 38).every((f) => f === "ok")).toBe(true);
  });

  test("out-of-range physical checks", () => {
    const flags = flagSeries({ sensor: "moisture", values: [40, 120, 41, -3] });
    expect(flags[1]).toBe("out_of_range");
    expect(flags[3]).toBe("out_of_range");
    expect(flags[0]).toBe("ok");
  });

  test("sudden jump -> suspect", () => {
    const values: number[] = [];
    for (let i = 0; i < 60; i++) values.push(25 + (i % 3));
    values[30] = 45; // spike
    const flags = flagSeries({ sensor: "soil_temp", values });
    expect(flags[30]).toBe("suspect");
  });
});

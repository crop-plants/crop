import { describe, expect, test } from "bun:test";
import { buildClimatology, climatologyFor } from "../src/lib/crop/climatology";
import type { DailyClimate } from "../src/lib/crop/types";

const row = (date: string, tmax: number, tmin: number, rh: number, wind: number, solar: number): DailyClimate => ({
  date, tmax, tmin, tmean: (tmax + tmin) / 2, rh, wind2m: wind, solarMj: solar, rainMm: 0, et0Mm: null,
});

describe("climatology", () => {
  test("fields are not cross-contaminated (regression: slot shift bug)", () => {
    const daily = [
      row("20251015", 36.0, 24.0, 45, 3.0, 20.0),
      row("20241015", 38.0, 26.0, 55, 2.0, 22.0),
      row("20231015", 37.0, 25.0, 50, 2.5, 21.0),
    ];
    const clim = buildClimatology(daily);
    const d = clim.days.get("10-15");
    expect(d).not.toBeNull();
    expect(d!.tmax).toBeCloseTo(37.0, 5);
    expect(d!.tmin).toBeCloseTo(25.0, 5); // NOT tmean
    expect(d!.tmean).toBeCloseTo(31.0, 5);
    expect(d!.rh).toBeCloseTo(50, 5);
    expect(d!.wind2m).toBeCloseTo(2.5, 5); // NOT solar
    expect(d!.solarMj).toBeCloseTo(21.0, 5);
    expect(d!.years).toBe(3);
    expect(clim.yearsCovered).toBe(3);
  });

  test("missing fields stay null (honest insufficiency)", () => {
    const clim = buildClimatology([{ date: "20250101", tmax: 30, tmin: 18, tmean: 24, rh: null, wind2m: null, solarMj: null, rainMm: null, et0Mm: null }]);
    const d = clim.days.get("01-01")!;
    expect(d.tmax).toBe(30);
    expect(d.rh).toBeNull();
    expect(d.solarMj).toBeNull();
  });

  test("climatologyFor maps a UTC date to MM-DD", () => {
    const clim = buildClimatology([row("20251015", 36, 24, 45, 3, 20)]);
    const d = climatologyFor(clim, new Date(Date.UTC(2026, 9, 15)));
    expect(d?.tmax).toBe(36);
  });
});

import { describe, expect, test } from "bun:test";
import { fao56Et0, e0, slopeVapourPressure, extraterrestrialRadiation, dayOfYear } from "../src/lib/crop/et0";

describe("FAO-56 Penman-Monteith ET0", () => {
  test("reproduces FAO-56 Example 18 (Uccle, 6 July) ET0 = 3.9 mm/day", () => {
    // Inputs from FAO-56 Example 18: Uccle (Brussels), 50°48'N, alt 100 m,
    // 6 July, Tmax 21.5, Tmin 12.3, RHmean ~71%, u2 2.078 m/s, Rs 22.07 MJ/m2/day.
    const br = fao56Et0({
      tmax: 21.5,
      tmin: 12.3,
      rhMean: 71,
      u2: 2.078,
      rs: 22.07,
      latDeg: 50.8,
      elevM: 100,
      doy: 187, // 6 July (non-leap)
    });
    expect(br.et0).not.toBeNull();
    expect(Math.abs((br.et0 as number) - 3.9)).toBeLessThan(0.1);
  });

  test("intermediates match the FAO-56 example", () => {
    const br = fao56Et0({
      tmax: 21.5, tmin: 12.3, rhMean: 71, u2: 2.078, rs: 22.07, latDeg: 50.8, elevM: 100, doy: 187,
    });
    expect(br.tmean).toBeCloseTo(16.9, 1); // FAO: (21.5+12.3)/2 = 16.9
    expect(br.delta).toBeCloseTo(0.122, 2); // FAO: Δ = 0.122
    expect(br.es).toBeCloseTo(1.997, 2); // FAO: es = 1.997 kPa
    expect(br.ea).toBeCloseTo(1.409, 1); // FAO: ea ≈ 1.409 kPa (RHmean 71% x es)
    expect(br.ra).toBeCloseTo(41.09, 1); // FAO: Ra = 41.09 MJ/m2/day
    expect(br.rso).toBeCloseTo(30.9, 0); // FAO: Rso ≈ 30.9
    expect(br.rn).toBeCloseTo(13.28, 0); // FAO: Rn ≈ 13.28
  });

  test("missing humidity/wind/radiation yields null with missing list (honest insufficiency)", () => {
    const br = fao56Et0({ tmax: 30, tmin: 18, rhMean: null, u2: null, rs: null, latDeg: 24.21, elevM: 270, doy: 200 });
    expect(br.et0).toBeNull();
    expect(br.missing).toContain("RH2M");
    expect(br.missing).toContain("WS2M");
    expect(br.missing).toContain("ALLSKY_SFC_SW_DWN");
  });

  test("helpers: e0, slope, Ra, doy sanity", () => {
    expect(e0(21.5)).toBeCloseTo(2.564, 2);
    expect(slopeVapourPressure(16.9)).toBeCloseTo(0.1221, 3);
    // Al Ain 21 June (doy 172): Ra ≈ 41.5 MJ/m2/day (near maximum, lat 24.21)
    const ra = extraterrestrialRadiation(24.21, 172);
    expect(ra).toBeGreaterThan(40);
    expect(ra).toBeLessThan(43);
    expect(dayOfYear(new Date(Date.UTC(2026, 6, 6)))).toBe(187);
  });
});

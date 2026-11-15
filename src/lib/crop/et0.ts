// FAO-56 Penman-Monteith reference evapotranspiration (FAO Irrigation and
// Drainage Paper 56, Eq. 6), with the full intermediate breakdown kept for the
// explanation drawer. Daily time step: G = 0.
// Unit-tested against FAO-56 Example 18 (Uccle/Brussels, 6 July): ET0 = 3.9 mm/day.

export interface Et0Input {
  tmax: number;
  tmin: number;
  rhMean: number | null; // RH2M %
  u2: number | null; // m/s at 2 m
  rs: number | null; // MJ/m2/day measured solar (ALLSKY_SFC_SW_DWN)
  latDeg: number;
  elevM: number;
  doy: number; // day of year (1-366)
}

export interface Et0Breakdown {
  et0: number | null;
  missing: string[];
  tmean: number;
  es: number; // saturation vapour pressure kPa
  ea: number | null; // actual vapour pressure kPa
  delta: number; // slope of vapour pressure curve kPa/degC
  gamma: number; // psychrometric constant kPa/degC
  ra: number; // extraterrestrial radiation MJ/m2/day
  rso: number; // clear-sky radiation MJ/m2/day
  rns: number; // net shortwave MJ/m2/day
  rnl: number | null; // net longwave MJ/m2/day
  rn: number | null; // net radiation MJ/m2/day
  u2: number | null;
}

export const e0 = (t: number): number => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));

export const slopeVapourPressure = (tmean: number): number =>
  (4098 * e0(tmean)) / Math.pow(tmean + 237.3, 2);

export const psychrometricConstant = (elevM: number): number => {
  const p = 101.3 * Math.pow((293 - 0.0065 * elevM) / 293, 5.26);
  return 0.000665 * p;
};

export const extraterrestrialRadiation = (latDeg: number, doy: number): number => {
  const phi = (Math.PI / 180) * latDeg;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const dec = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const x = -Math.tan(phi) * Math.tan(dec);
  const ws = Math.acos(Math.max(-1, Math.min(1, x)));
  return (24 * 60) / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws));
};

export const dayOfYear = (date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
};

/** FAO-56 Eq. 6, daily. Returns null with missing[] when required inputs are absent. */
export function fao56Et0(input: Et0Input): Et0Breakdown {
  const missing: string[] = [];
  const tmean = (input.tmax + input.tmin) / 2;
  const es = (e0(input.tmax) + e0(input.tmin)) / 2;
  const delta = slopeVapourPressure(tmean);
  const gamma = psychrometricConstant(input.elevM);
  const ra = extraterrestrialRadiation(input.latDeg, input.doy);
  const rso = (0.75 + 2e-5 * input.elevM) * ra;

  let ea: number | null = null;
  if (input.rhMean != null && Number.isFinite(input.rhMean)) {
    ea = (input.rhMean / 100) * es;
  } else missing.push("RH2M");

  let u2: number | null = null;
  if (input.u2 != null && Number.isFinite(input.u2)) u2 = input.u2;
  else missing.push("WS2M");

  let rs: number | null = null;
  if (input.rs != null && Number.isFinite(input.rs) && input.rs > 0) rs = input.rs;
  else missing.push("ALLSKY_SFC_SW_DWN");

  let rns = 0;
  let rnl: number | null = null;
  let rn: number | null = null;
  if (rs != null) {
    rns = (1 - 0.23) * rs;
    if (ea != null) {
      const sigma = 4.903e-9; // MJ K-4 m-2 day-1
      const tkmax = input.tmax + 273.16;
      const tkmin = input.tmin + 273.16;
      const ratio = Math.min(1, rs / rso);
      rnl =
        sigma * ((tkmax ** 4 + tkmin ** 4) / 2) *
        (0.34 - 0.14 * Math.sqrt(Math.max(0, ea))) *
        (1.35 * ratio - 0.35);
      rn = rns - rnl;
    }
  }

  let et0: number | null = null;
  if (ea != null && u2 != null && rn != null) {
    const num = 0.408 * delta * rn + gamma * (900 / (tmean + 273)) * u2 * (es - ea);
    const den = delta + gamma * (1 + 0.34 * u2);
    et0 = Math.max(0, num / den);
  }

  return { et0, missing, tmean, es, ea, delta, gamma, ra, rso, rns, rnl, rn, u2 };
}

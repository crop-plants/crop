"use client";

// MapLibre inner map (client-only). Base layers (Esri satellite / OSM),
// field polygon with live area readout, sensor pins with latest readings,
// NASA GIBS NDVI 8-day layer with a time slider, salinity classes (SIMULATED
// placeholder), IDW moisture surface (MEASURED interpolated), pixel inspector.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MlMap, NavigationControl, Popup, ScaleControl, FullscreenControl, type StyleSpecification, type RasterTileSource, type ImageSource, type MapMouseEvent, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layers, MapPin, Ruler, X } from "lucide-react";
import { ProvenanceBadge, fmt, fmtTs } from "./ui-bits";
import { fetchJson, type ReadingsResponse } from "./api";
import { cn } from "@/lib/utils";

export interface MapInnerProps {
  center: [number, number];
  polygon: [number, number][] | null;
  nodes: { id: string; name: string; type: string; lat: number; lon: number; batteryV: number | null; rssi: number | null; lastSeen: string | null }[];
}

const ESRI_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const GIBS_NDVI = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";
const GIBS_TRUE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";

const NDVI_RAMP: [number, [number, number, number]][] = [
  [-0.2, [40, 26, 13]],
  [0.0, [110, 80, 40]],
  [0.2, [176, 150, 66]],
  [0.4, [124, 154, 52]],
  [0.6, [58, 132, 60]],
  [0.9, [20, 105, 40]],
];

function nearestNdviFromRgb(r: number, g: number, b: number): number | null {
  let best: number | null = null;
  let bestD = 1e9;
  for (let i = 0; i < NDVI_RAMP.length - 1; i++) {
    const [v1, c1] = NDVI_RAMP[i];
    const [v2, c2] = NDVI_RAMP[i + 1];
    for (let t = 0; t <= 1; t += 0.1) {
      const cr = c1[0] + (c2[0] - c1[0]) * t;
      const cg = c1[1] + (c2[1] - c1[1]) * t;
      const cb = c1[2] + (c2[2] - c1[2]) * t;
      const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v1 + (v2 - v1) * t;
      }
    }
  }
  return bestD < 5500 ? best : null;
}

function polygonAreaM2(coords: [number, number][]): number {
  const R = 6371000;
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    sum += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * R * R) / 2);
}

/** SIMULATED salinity classes (spec 8: clearly labelled placeholder when no official dataset exists). */
const SALINITY_POLYS: { cls: string; color: string; ring: [number, number][] }[] = [
  { cls: "Low (ECe < 2)", color: "#6C9A52", ring: [[55.7585, 24.2085], [55.7594, 24.2085], [55.7594, 24.2096], [55.7585, 24.2096], [55.7585, 24.2085]] },
  { cls: "Moderate (2–4)", color: "#E3B341", ring: [[55.7594, 24.2086], [55.7606, 24.2086], [55.7606, 24.2105], [55.7594, 24.2105], [55.7594, 24.2086]] },
  { cls: "High (> 4)", color: "#E5604D", ring: [[55.7606, 24.2090], [55.7615, 24.2090], [55.7615, 24.2107], [55.7606, 24.2107], [55.7606, 24.2090]] },
];

function gibsDates(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 5); // latest composite lags a few days
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 8);
  }
  return out;
}

export default function MapInner({ center, polygon, nodes }: MapInnerProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const dates = useMemo(() => gibsDates(12), []);
  const [base, setBase] = useState<"satellite" | "streets">("satellite");
  const [ndviOn, setNdviOn] = useState(true);
  const [trueColorOn, setTrueColorOn] = useState(false);
  const [salinityOn, setSalinityOn] = useState(false);
  const [moistureOn, setMoistureOn] = useState(true);
  const [ndviOpacity, setNdviOpacity] = useState(0.75);
  const [moistureOpacity, setMoistureOpacity] = useState(0.55);
  const [dateIdx, setDateIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<"none" | "layers" | "info">("none");
  const [inspector, setInspector] = useState<null | { ndvi: number | null; salinity: string | null; nearest: string | null; ndviDate: string }>(null);
  const [area, setArea] = useState<number | null>(null);
  const [styleReady, setStyleReady] = useState(false);

  // ---- map init ----
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const style: StyleSpecification = {
      version: 8,
      sources: {
        esri: { type: "raster", tiles: [ESRI_SAT], tileSize: 256, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
        osm: { type: "raster", tiles: [OSM], tileSize: 256, attribution: "© OpenStreetMap contributors" },
        gibsNdvi: { type: "raster", tiles: [GIBS_NDVI.replace("{time}", dates[0])], tileSize: 256, maxzoom: 8, attribution: "NASA GIBS MODIS/Terra NDVI 8-day" },
        gibsTrue: { type: "raster", tiles: [GIBS_TRUE.replace("{time}", dates[0])], tileSize: 256, maxzoom: 8, attribution: "NASA GIBS MODIS/Terra true colour" },
      },
      layers: [
        { id: "base", type: "raster", source: "esri" },
        { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
        { id: "gibs-true", type: "raster", source: "gibsTrue", layout: { visibility: "none" }, paint: { "raster-opacity": 0.7 } },
        { id: "gibs-ndvi", type: "raster", source: "gibsNdvi", paint: { "raster-opacity": 0.75 } },
        { id: "salinity", type: "background", paint: { "background-color": "transparent" } },
      ],
    };
    const map = new MlMap({
      container: container.current,
      style,
      center,
      zoom: 15.2,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true, // enables the pixel inspector
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new FullscreenControl(), "top-right");

    // field polygon
    map.on("load", () => {
      setStyleReady(true);
      if (polygon) {
        map.addSource("field", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [polygon] } } });
        map.addLayer({ id: "field-fill", type: "fill", source: "field", paint: { "fill-color": "#E9FDBD", "fill-opacity": 0.12 } });
        map.addLayer({ id: "field-line", type: "line", source: "field", paint: { "line-color": "#E9FDBD", "line-width": 2.4, "line-blur": 0.4 } });
        setArea(polygonAreaM2(polygon));
      }
      // salinity SIMULATED placeholder polygons
      const salFc = {
        type: "FeatureCollection" as const,
        features: SALINITY_POLYS.map((s) => ({ type: "Feature" as const, properties: { cls: s.cls, color: s.color }, geometry: { type: "Polygon" as const, coordinates: [s.ring] } })),
      };
      map.addSource("salinity", { type: "geojson", data: salFc as never });
      map.addLayer({ id: "salinity-fill", type: "fill", source: "salinity", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.28 }, layout: { visibility: "none" } });
      map.addLayer({ id: "salinity-line", type: "line", source: "salinity", paint: { "line-color": ["get", "color"], "line-width": 1.4 }, layout: { visibility: "none" } });

      // sensor pins
      const pinFc = {
        type: "FeatureCollection" as const,
        features: nodes.map((n) => ({ type: "Feature" as const, properties: { id: n.id, name: n.name, type: n.type, battery: n.batteryV, rssi: n.rssi }, geometry: { type: "Point" as const, coordinates: [n.lon, n.lat] } })),
      };
      map.addSource("nodes", { type: "geojson", data: pinFc as never });
      map.addLayer({
        id: "nodes-circle",
        type: "circle",
        source: "nodes",
        paint: {
          "circle-radius": ["case", ["==", ["get", "type"], "station"], 9, 8],
          "circle-color": ["case", ["==", ["get", "type"], "station"], "#8EC9E8", "#6C9A52"],
          "circle-stroke-color": "#16221B",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "nodes-label",
        type: "symbol",
        source: "nodes",
        layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, 1.4], "text-anchor": "top" },
        paint: { "text-color": "#FFFFFF", "text-halo-color": "#16221B", "text-halo-width": 1.2 },
      });

      // pixel inspector
      map.on("click", (e) => {
        const ndviVal = sampleNdvi(e.point.x, e.point.y);
        let sal: string | null = null;
        const feats = map.queryRenderedFeatures(e.point, { layers: ["salinity-fill"] });
        if (feats.length) sal = feats[0].properties?.cls ?? null;
        let nearest: string | null = null;
        if (nodes.length) {
          let bd = Infinity;
          let bn: string | null = null;
          for (const n of nodes) {
            const dx = (n.lon - e.lngLat.lng) * 111320 * Math.cos((n.lat * Math.PI) / 180);
            const dy = (n.lat - e.lngLat.lat) * 110540;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; bn = n.name; }
          }
          nearest = bn;
        }
        setInspector({ ndvi: ndviVal, salinity: sal, nearest, ndviDate: dates[dateIdx] });
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleNdvi = useCallback((x: number, y: number): number | null => {
    const map = mapRef.current;
    if (!map) return null;
    try {
      const canvas = map.getCanvas();
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const px = new Uint8Array(4);
      const dpr = window.devicePixelRatio || 1;
      gl.readPixels(Math.round(x * dpr), Math.round((canvas.height / dpr - y) * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return nearestNdviFromRgb(px[0], px[1], px[2]);
    } catch {
      return null;
    }
  }, []);

  // ---- layer toggles ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    map.setLayoutProperty("base", "visibility", base === "satellite" ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", base === "streets" ? "visible" : "none");
  }, [base, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    const v = ndviOn ? "visible" : "none";
    map.setLayoutProperty("gibs-ndvi", "visibility", v);
    map.setPaintProperty("gibs-ndvi", "raster-opacity", ndviOpacity);
  }, [ndviOn, ndviOpacity, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    map.setLayoutProperty("gibs-true", "visibility", trueColorOn ? "visible" : "none");
  }, [trueColorOn, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    map.setLayoutProperty("salinity-fill", "visibility", salinityOn ? "visible" : "none");
    map.setLayoutProperty("salinity-line", "visibility", salinityOn ? "visible" : "none");
  }, [salinityOn, styleReady]);

  // GIBS time slider + NDVI source swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    const t = dates[dateIdx];
    (map.getSource("gibsNdvi") as RasterTileSource).setTiles([GIBS_NDVI.replace("{time}", t)]);
    (map.getSource("gibsTrue") as RasterTileSource).setTiles([GIBS_TRUE.replace("{time}", t)]);
  }, [dateIdx, dates, styleReady]);

  // NDVI time animation
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setDateIdx((i) => (i + 1) % dates.length), 900);
    return () => clearInterval(iv);
  }, [playing, dates.length]);

  // IDW moisture surface from latest node readings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.isStyleLoaded() || !moistureOn) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchJson<ReadingsResponse>("/api/v1/readings?sensor=moisture&max=8");
        const latestByNode = new Map<string, { value: number; lat: number; lon: number; flag: string; ts: string }>();
        for (const n of nodes) {
          const row = r.readings.find((x) => x.nodeId === n.id && x.flag === "ok");
          if (row) latestByNode.set(n.id, { value: row.value, lat: n.lat, lon: n.lon, flag: row.flag, ts: row.ts });
        }
        if (cancelled || latestByNode.size < 2) return;
        const pts = [...latestByNode.values()];
        // build a small grid image over the field bbox
        const lons = pts.map((p) => p.lon);
        const lats = pts.map((p) => p.lat);
        const pad = 0.0006;
        const minLon = Math.min(...lons) - pad;
        const maxLon = Math.max(...lons) + pad;
        const minLat = Math.min(...lats) - pad;
        const maxLat = Math.max(...lats) + pad;
        const W = 160;
        const H = 160;
        const cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        const img = ctx.createImageData(W, H);
        for (let j = 0; j < H; j++) {
          for (let i = 0; i < W; i++) {
            const lon = minLon + ((i + 0.5) / W) * (maxLon - minLon);
            const lat = maxLat - ((j + 0.5) / H) * (maxLat - minLat);
            // IDW (power 2)
            let num = 0;
            let den = 0;
            for (const p of pts) {
              const d2 = (p.lon - lon) ** 2 + (p.lat - lat) ** 2 + 1e-12;
              num += p.value / d2;
              den += 1 / d2;
            }
            const v = num / den;
            // moisture colour ramp: dry #E5604D -> ok #6C9A52 -> wet #8EC9E8
            const t = Math.max(0, Math.min(1, (v - 15) / 30));
            const cr = t < 0.5 ? 229 + (108 - 229) * (t * 2) : 108 + (142 - 108) * ((t - 0.5) * 2);
            const cg = t < 0.5 ? 96 + (154 - 96) * (t * 2) : 154 + (201 - 154) * ((t - 0.5) * 2);
            const cb = t < 0.5 ? 77 + (82 - 77) * (t * 2) : 82 + (232 - 82) * ((t - 0.5) * 2);
            const o = (j * W + i) * 4;
            img.data[o] = cr;
            img.data[o + 1] = cg;
            img.data[o + 2] = cb;
            img.data[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const dataUrl = cv.toDataURL();
        if (!map.style || cancelled) return;
        if (map.getSource("moisture-surface")) {
          (map.getSource("moisture-surface") as ImageSource).updateImage({ url: dataUrl, coordinates: [[minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat]] });
        } else {
          map.addSource("moisture-surface", { type: "image", url: dataUrl, coordinates: [[minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat]] });
          map.addLayer({ id: "moisture-surface", type: "raster", source: "moisture-surface", paint: { "raster-opacity": moistureOpacity, "raster-fade-duration": 0 } });
          map.setLayoutProperty("moisture-surface", "visibility", moistureOn ? "visible" : "none");
        }
      } catch {
        /* surface is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodes, moistureOn, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer("moisture-surface")) return;
    map.setPaintProperty("moisture-surface", "raster-opacity", moistureOpacity);
    map.setLayoutProperty("moisture-surface", "visibility", moistureOn ? "visible" : "none");
  }, [moistureOpacity, moistureOn, styleReady]);

  // node click popup with latest readings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const handler = async (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const name = f.properties?.name as string;
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      let rowsHtml = "";
      try {
        const r = await fetchJson<ReadingsResponse>(`/api/v1/readings?node=${encodeURIComponent(name)}&max=24`);
        const latest: Record<string, ReadingsResponse["readings"][number]> = {};
        for (const row of r.readings) if (!latest[row.sensor] && row.flag === "ok") latest[row.sensor] = row;
        rowsHtml = Object.values(latest)
          .map(
            (row) =>
              `<div style="display:flex;justify-content:space-between;gap:10px;margin-top:3px"><span style="opacity:.75">${row.sensor.replace("_", " ")}</span><span style="font-variant-numeric:tabular-nums"><b>${row.value.toFixed(1)}</b> ${row.unit}</span></div>`,
          )
          .join("");
      } catch {
        rowsHtml = '<div style="opacity:.6">readings unavailable</div>';
      }
      new Popup({ closeButton: false })
        .setLngLat(coords)
        .setHTML(
          `<div style="min-width:190px"><div style="font-family:Georgia,serif;font-size:13px;font-weight:600">${name}</div>` +
            `<div style="opacity:.65;font-size:10px;margin-bottom:4px">battery ${fmt(f.properties?.battery as number, 2)} V · ${f.properties?.rssi ?? "?"} dBm</div>${rowsHtml}` +
            `<div style="margin-top:6px;font-size:10px;opacity:.6">SIMULATED demo readings</div></div>`,
        )
        .addTo(map);
    };
    map.on("click", "nodes-circle", handler);
    map.on("mouseenter", "nodes-circle", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "nodes-circle", () => (map.getCanvas().style.cursor = ""));
    return () => {
      map.off("click", "nodes-circle", handler);
    };
  }, [nodes]);

  const areaHa = area != null ? area / 10000 : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <div ref={container} className="h-[68vh] min-h-[420px] w-full" />

      {/* legend */}
      <div className="pointer-events-none absolute bottom-4 left-3 z-10 space-y-2 rounded-lg border border-border bg-panel/90 p-3 text-[11px] backdrop-blur">
        {ndviOn ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              NDVI (MODIS/Terra 8-day) <ProvenanceBadge kind="estimated" />
            </div>
            <div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg, rgb(40,26,13), rgb(110,80,40), rgb(176,150,66), rgb(124,154,52), rgb(58,132,60), rgb(20,105,40))" }} />
            <div className="num mt-0.5 flex w-40 justify-between text-[9px] text-muted-foreground">
              <span>-0.2</span><span>0.2</span><span>0.9</span>
            </div>
          </div>
        ) : null}
        {moistureOn ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              Soil moisture (IDW) <ProvenanceBadge kind="measured (interpolated)" />
            </div>
            <div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg, #E5604D, #6C9A52, #8EC9E8)" }} />
            <div className="num mt-0.5 flex w-40 justify-between text-[9px] text-muted-foreground">
              <span>15%</span><span>30%</span><span>45%</span>
            </div>
          </div>
        ) : null}
        {salinityOn ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              Salinity class <ProvenanceBadge kind="simulated" />
            </div>
            <div className="flex gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ok" />Low</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-watch" />Mod</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-alert" />High</span>
            </div>
          </div>
        ) : null}
        <div className="num border-t border-border pt-1.5 text-[10px] text-muted-foreground">
          Field area: {area != null ? `${Math.round(area).toLocaleString()} m² · ${areaHa?.toFixed(2)} ha · ${(area / 4046.86).toFixed(2)} acres` : "draw a boundary"}
        </div>
      </div>

      {/* layer button */}
      <button onClick={() => setPanel(panel === "layers" ? "none" : "layers")} className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel/95 px-3 py-2 text-xs font-semibold backdrop-blur hover:bg-raised" aria-expanded={panel === "layers"}>
        <Layers className="h-3.5 w-3.5" /> Layers
      </button>
      <button onClick={() => setPanel(panel === "info" ? "none" : "info")} className="absolute left-3 top-12 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel/95 px-3 py-2 text-xs font-semibold backdrop-blur hover:bg-raised" aria-expanded={panel === "info"}>
        <Ruler className="h-3.5 w-3.5" /> What am I looking at?
      </button>

      {/* layers panel */}
      {panel === "layers" ? (
        <div className="absolute left-3 top-[5.5rem] z-10 w-64 rounded-xl border border-border bg-panel/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between font-semibold">
            Layers <button onClick={() => setPanel("none")} aria-label="Close layers"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-1">
              {(["satellite", "streets"] as const).map((b) => (
                <button key={b} onClick={() => setBase(b)} className={cn("flex-1 rounded-md border px-2 py-1 capitalize", base === b ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground")}>
                  {b}
                </button>
              ))}
            </div>
            <ToggleRow label="NDVI (GIBS 8-day)" on={ndviOn} onChange={setNdviOn} opacity={ndviOpacity} setOpacity={setNdviOpacity} />
            <ToggleRow label="MODIS true colour" on={trueColorOn} onChange={setTrueColorOn} />
            <ToggleRow label="Moisture surface (IDW)" on={moistureOn} onChange={setMoistureOn} opacity={moistureOpacity} setOpacity={setMoistureOpacity} />
            <ToggleRow label="Salinity classes (SIMULATED)" on={salinityOn} onChange={setSalinityOn} />
            <div className="border-t border-border pt-2">
              <p className="mb-1 font-semibold">NDVI time — {dates[dateIdx]}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-raised">
                  {playing ? "Pause" : "Play"}
                </button>
                <input type="range" min={0} max={dates.length - 1} value={dateIdx} onChange={(e) => setDateIdx(+e.target.value)} className="w-full accent-[#E9FDBD]" aria-label="NDVI date" />
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground">8-day composites, newest last 5 days</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* info drawer */}
      {panel === "info" ? (
        <div className="absolute left-3 top-[5.5rem] z-10 w-80 rounded-xl border border-border bg-panel/95 p-3 text-[11px] leading-relaxed shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between font-semibold">
            What am I looking at? <button onClick={() => setPanel("none")} aria-label="Close info"><X className="h-3.5 w-3.5" /></button>
          </div>
          <ul className="space-y-1.5">
            <li><b>Base imagery</b> — Esri World Imagery, ~1 m/px (attribution on map). <ProvenanceBadge kind="measured" /></li>
            <li><b>NDVI</b> — NASA GIBS MODIS/Terra 8-day vegetation index, 250 m/px, regional context around the field. <ProvenanceBadge kind="estimated" /></li>
            <li><b>Moisture surface</b> — inverse-distance interpolation of the latest usable node readings. <ProvenanceBadge kind="measured (interpolated)" /></li>
            <li><b>Salinity classes</b> — placeholder polygons; no official FGIC dataset is programmatically accessible, so they are <ProvenanceBadge kind="simulated" /> and never used in calculations.</li>
            <li><b>Sensor pins</b> — demo nodes reporting every 10 minutes. <ProvenanceBadge kind="simulated" /></li>
            <li><b>Field NDVI time series</b> — not connected: Landsat pixel processing needs Earthdata credentials.</li>
          </ul>
        </div>
      ) : null}

      {/* pixel inspector popup */}
      {inspector ? (
        <div className="absolute bottom-4 right-3 z-10 w-56 rounded-xl border border-border bg-panel/95 p-3 text-[11px] shadow-xl backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between font-semibold">
            Pixel inspector <button onClick={() => setInspector(null)} aria-label="Close inspector"><X className="h-3 w-3" /></button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span>NDVI {inspector.ndvi != null ? "" : "(not on ramp)"}</span>
              <span className="num font-semibold">{inspector.ndvi != null ? inspector.ndvi.toFixed(2) : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground"><span>image date</span><span className="num">{inspector.ndviDate}</span></div>
            <div className="flex items-center justify-between">
              <span>Salinity class</span>
              <span>{inspector.salinity ?? "—"} {inspector.salinity ? <ProvenanceBadge kind="simulated" /> : null}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Nearest node</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{inspector.nearest ?? "—"}</span>
            </div>
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground">NDVI read from the rendered tile colour — an ESTIMATED class, not a pixel-exact product.</p>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({ label, on, onChange, opacity, setOpacity }: { label: string; on: boolean; onChange: (v: boolean) => void; opacity?: number; setOpacity?: (v: number) => void }) {
  return (
    <div>
      <label className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-[#E9FDBD]" />
          {label}
        </span>
      </label>
      {opacity != null && setOpacity && on ? (
        <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="mt-1 w-full accent-[#E9FDBD]" aria-label={`${label} opacity`} />
      ) : null}
    </div>
  );
}

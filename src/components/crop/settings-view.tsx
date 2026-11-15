"use client";

// Settings (spec 4.10) — farm profile, thresholds, weights, API keys, data
// refresh, import/export, reset demo.

import { useState } from "react";
import { fetchJson, useApi } from "./api";
import type { SettingsResponse } from "./api";
import { SectionCard, CopyButton } from "./ui-bits";
import { useCropStore } from "./store";
import { CROPS } from "@/lib/crop/data/crops";
import { RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsView() {
  const store = useCropStore();
  const { data, refetch } = useApi<SettingsResponse>("/api/v1/settings");
  const [farm, setFarm] = useState(store.farm);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const saveFarm = async () => {
    if (!farm) return;
    setBusy("farm");
    await fetchJson("/api/v1/farm", { method: "PUT", body: JSON.stringify(farm) }).catch((e: Error) => setSavedMsg(e.message));
    setSavedMsg("Farm profile saved.");
    setBusy(null);
  };

  const saveSetting = async (patch: Record<string, unknown>) => {
    setBusy("settings");
    await fetchJson("/api/v1/settings", { method: "PUT", body: JSON.stringify(patch) }).catch(() => null);
    await store.refreshSettings();
    setSavedMsg("Settings saved.");
    setBusy(null);
    refetch();
  };

  const exportFarm = async () => {
    const f = await fetch("/api/v1/farm").then((r) => r.json());
    const settings = await fetch("/api/v1/settings").then((r) => r.json());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ farm: f.farm, settings }, null, 2)], { type: "application/json" }));
    a.download = "crop-farm-export.json";
    a.click();
  };

  const importFarm = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.farm) await fetchJson("/api/v1/farm", { method: "PUT", body: JSON.stringify(parsed.farm) });
        if (parsed.settings?.weights) await saveSetting({ weights: parsed.settings.weights });
        await store.boot();
        setSavedMsg("Farm imported.");
      } catch (e) {
        setSavedMsg(`Import failed: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Farm profile" subtitle="Manually entered by you — never presented as measured data.">
        {farm ? (
          <div className="space-y-2 text-xs">
            {([
              ["name", "Name", "text"],
              ["lat", "Latitude", "number"],
              ["lon", "Longitude", "number"],
              ["elevationM", "Elevation (m)", "number"],
              ["waterEcDsm", "Irrigation water EC (dS/m)", "number"],
              ["irrigationAllowanceM3PerAcre", "Seasonal allowance (m³/acre)", "number"],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <input
                  type={type}
                  step="0.01"
                  value={(farm as unknown as Record<string, string | number>)[key]}
                  onChange={(e) => setFarm({ ...farm, [key]: type === "number" ? +e.target.value : e.target.value })}
                  className="num w-44 rounded-md border border-border bg-raised px-2 py-1.5 text-xs"
                />
              </label>
            ))}
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Soil texture</span>
              <select
                value={farm.soilTexture}
                onChange={(e) => setFarm({ ...farm, soilTexture: e.target.value })}
                className="w-44 rounded-md border border-border bg-raised px-2 py-1.5 text-xs"
              >
                {["sand", "loamy sand", "sandy loam", "loam", "clay loam"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Irrigation method</span>
              <select
                value={farm.irrigationMethod}
                onChange={(e) => setFarm({ ...farm, irrigationMethod: e.target.value as "drip" })}
                className="w-44 rounded-md border border-border bg-raised px-2 py-1.5 text-xs"
              >
                {["drip", "sprinkler", "flood"].map((t) => <option key={t} value={t}>{t} (eff. {t === "drip" ? "90%" : t === "sprinkler" ? "75%" : "60%"})</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Last crop (history)</span>
              <select
                value={farm.cropHistory[farm.cropHistory.length - 1]?.cropId ?? "tomato"}
                onChange={(e) => {
                  const hist = [...farm.cropHistory];
                  if (hist.length) hist[hist.length - 1] = { ...hist[hist.length - 1], cropId: e.target.value };
                  setFarm({ ...farm, cropHistory: hist });
                }}
                className="w-44 rounded-md border border-border bg-raised px-2 py-1.5 text-xs"
              >
                {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={saveFarm} disabled={busy === "farm"} className="rounded-lg border border-lime/50 bg-lime/10 px-3 py-1.5 font-semibold text-lime hover:bg-lime/20">
                Save profile
              </button>
              <button onClick={exportFarm} className="rounded-lg border border-border px-3 py-1.5 hover:bg-raised">Export JSON</button>
              <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 hover:bg-raised">
                Import JSON
                <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFarm(e.target.files[0])} />
              </label>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No farm profile.</p>
        )}
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="Data mode" subtitle="Demo data is generated and tagged SIMULATED; live mode accepts real ESP32 ingests.">
          <div className="flex gap-2 text-xs">
            {(["demo", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => saveSetting({ dataMode: m })}
                className={cn("rounded-full border px-4 py-1.5 capitalize", store.dataMode === m ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}
              >
                {m} data
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Current mode: {store.dataMode === "demo" ? "Demo — sensor pills show SIMULATED everywhere" : "Live"}</p>
        </SectionCard>

        <SectionCard title="Thresholds and conversions" subtitle="Applied by the health rules and the ECe conversion.">
          {data ? (
            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Moisture stress threshold (%)</span>
                <input type="number" defaultValue={data.settings.moistureStressThresholdPct} onBlur={(e) => saveSetting({ appSettings: { ...data.settings, moistureStressThresholdPct: +e.target.value } })} className="num w-24 rounded-md border border-border bg-raised px-2 py-1.5" />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">1:5 extract → ECe factor (texture)</span>
                <input type="number" step={0.1} defaultValue={data.settings.ec15ToEceFactor} onBlur={(e) => saveSetting({ appSettings: { ...data.settings, ec15ToEceFactor: +e.target.value } })} className="num w-24 rounded-md border border-border bg-raised px-2 py-1.5" />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">ECw → ECe factor</span>
                <input type="number" step={0.1} defaultValue={data.settings.ecwToEce} onBlur={(e) => saveSetting({ appSettings: { ...data.settings, ecwToEce: +e.target.value } })} className="num w-24 rounded-md border border-border bg-raised px-2 py-1.5" />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Selected crop (health context)</span>
                <select defaultValue={data.settings.selectedCropId} onChange={(e) => saveSetting({ appSettings: { ...data.settings, selectedCropId: e.target.value } })} className="w-36 rounded-md border border-border bg-raised px-2 py-1.5">
                  {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <p className="rounded-lg border border-watch/40 bg-watch/10 p-2 text-[10px]">Calibrate the 1:5→ECe factor against a lab ECe (saturated-paste) test before trusting absolute thresholds.</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Device API keys" subtitle="Header X-API-Key for POST /api/v1/ingest. Keys are stored hashed; the demo plaintext is shown for the wiring docs.">
          <div className="space-y-1.5 text-xs">
            {store.deviceApiKeys.map((k) => (
              <div key={k.nodeId} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                <span>{k.name}</span>
                <span className="flex items-center gap-1.5">
                  <code className="rounded bg-raised px-1.5 py-0.5 text-[10px]">{k.key}</code>
                  <CopyButton text={k.key} small />
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Data refresh and demo" subtitle="Real retrievals only — failures keep the cache and say so.">
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={async () => {
                setBusy("nasa");
                const r = await store.refreshClimate();
                setSavedMsg(r.ok ? `NASA POWER refreshed (${r.message})` : `Refresh failed: ${r.message}`);
                setBusy(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-raised"
            >
              <RefreshCw className={cn("h-3 w-3", busy === "nasa" && "animate-spin")} /> Refresh NASA data now
            </button>
            <button
              onClick={async () => {
                if (!confirm("Reset demo data? This regenerates all simulated sensor readings and alerts.")) return;
                setBusy("seed");
                await fetchJson("/api/v1/seed", { method: "POST" }).catch(() => null);
                await store.boot();
                setSavedMsg("Demo data regenerated.");
                setBusy(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-alert/40 px-3 py-1.5 text-alert hover:bg-alert/10"
            >
              <Trash2 className="h-3 w-3" /> Reset demo data
            </button>
            <button onClick={() => store.setView("setup")} className="rounded-lg border border-border px-3 py-1.5 hover:bg-raised">Re-run setup wizard</button>
          </div>
          {savedMsg ? <p className="mt-2 text-[10px] text-ok">{savedMsg}</p> : null}
          {store.nasaMeta ? (
            <p className="num mt-2 text-[10px] text-muted-foreground">
              NASA POWER: {store.nasaMeta.rowsTotal} rows · {store.nasaMeta.start}–{store.nasaMeta.end} · fetched {new Date(store.nasaMeta.fetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

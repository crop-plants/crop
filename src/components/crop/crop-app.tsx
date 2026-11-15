"use client";

// C.R.O.P. app shell — left sidebar navigation, top bar with farm name, data
// mode, last-updated, theme + presentation toggles, offline banner, and the
// loading screen. All screens are client views switched by the store (the
// sandbox gateway exposes only the / route).

import { useEffect, useState } from "react";
import { useCropStore, type ViewKey } from "./store";
import {
  LayoutDashboard, Map as MapIcon, Radio, CloudSun, Repeat, HeartPulse, Coins,
  Activity, BookOpen, Settings as SettingsIcon, Info, Sun, Moon, MonitorPlay, CloudOff,
} from "lucide-react";
import { CropMark } from "./ui-bits";
import { cn } from "@/lib/utils";

import OverviewView from "./overview-view";
import MapView from "./map-view";
import SensorsView from "./sensors-view";
import ClimateView from "./climate-view";
import RotationIQView from "./rotationiq-view";
import HealthView from "./health-view";
import EconomicsView from "./economics-view";
import SignalsView from "./signals-view";
import MethodologyView from "./methodology-view";
import SettingsView from "./settings-view";
import AboutView, { LoadingScreen } from "./about-view";
import SetupWizard from "./setup-wizard";

const NAV: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "map", label: "Field Map", icon: MapIcon },
  { key: "sensors", label: "Sensors", icon: Radio },
  { key: "climate", label: "Climate (NASA)", icon: CloudSun },
  { key: "rotationiq", label: "RotationIQ", icon: Repeat },
  { key: "health", label: "Field Health", icon: HeartPulse },
  { key: "economics", label: "Economics", icon: Coins },
  { key: "signals", label: "Plant Signals", icon: Activity },
  { key: "methodology", label: "Methodology", icon: BookOpen },
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "about", label: "About", icon: Info },
];

export default function CropApp() {
  const { booted, bootError, view, setView, presentationMode, togglePresentation, lightMode, toggleLight, dataMode, boot, farmName, climateStatus } = useCropStore();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    boot();
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        togglePresentation();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!booted) return <LoadingScreen />;
  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <CropMark size={40} />
        <p className="font-serif text-lg font-semibold">Backend unavailable</p>
        <p className="max-w-md text-xs text-muted-foreground">{bootError}. The API could not be reached — no demo values will be faked. Retry after restarting the server.</p>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen", lightMode && "light")} style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-alert/20 py-1.5 text-center text-[11px]">
          <CloudOff className="h-3.5 w-3.5" /> Offline — using the cached NASA POWER series and stored sensor data. Nothing is invented.
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1600px]">
        {/* sidebar */}
        <aside className={cn("no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border p-4 lg:flex", presentationMode && "hidden")}>
          <button onClick={() => setView("overview")} className="mb-1 flex items-center gap-2 text-left">
            <CropMark size={30} />
          </button>
          <p className="mb-5 text-[10px] uppercase tracking-widest text-muted-foreground">Agricultural intelligence</p>
          <nav className="flex-1 space-y-1" aria-label="Main">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  view === n.key ? "bg-lime/15 font-semibold text-lime" : "text-muted-foreground hover:bg-raised hover:text-foreground",
                )}
                aria-current={view === n.key ? "page" : undefined}
              >
                <n.icon className="h-4 w-4" /> {n.label}
                {n.key === "signals" ? <span className="ml-auto rounded bg-watch/20 px-1 py-0.5 text-[8px] font-bold uppercase text-watch">exp</span> : null}
              </button>
            ))}
          </nav>
          <p className="mt-4 text-[9px] leading-relaxed text-muted-foreground">
            Illustrative comparison — not an agronomically validated recommendation.
          </p>
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1">
          {/* top bar */}
          <header className={cn("no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur", presentationMode && "hidden")}>
            <div className="flex items-center gap-3 lg:hidden">
              <CropMark size={26} />
            </div>
            <div className="hidden items-baseline gap-2 lg:flex">
              <span className="font-serif text-sm font-semibold">{farmName}</span>
              <span className="text-[10px] text-muted-foreground">Al Ain, UAE</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", dataMode === "demo" ? "bg-info/15 text-info" : "bg-ok/15 text-ok")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", dataMode === "demo" ? "bg-info" : "bg-ok")} />
                {dataMode === "demo" ? "Demo data" : "Live data"}
              </span>
              <span className="hidden rounded-full bg-raised px-2.5 py-1 text-muted-foreground sm:inline">
                NASA POWER {climateStatus}
              </span>
              <button onClick={toggleLight} className="rounded-lg border border-border p-1.5 hover:bg-raised" aria-label="Toggle light mode">
                {lightMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              </button>
              <button onClick={togglePresentation} className="rounded-lg border border-border p-1.5 hover:bg-raised" aria-label="Presentation mode (Ctrl+Shift+P)" title="Presentation mode (Ctrl+Shift+P)">
                <MonitorPlay className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* mobile nav */}
          {!presentationMode ? (
            <div className="no-print flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
              {NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  className={cn("shrink-0 rounded-full border px-3 py-1 text-[11px]", view === n.key ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground")}
                >
                  {n.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="fade-up p-4">
            {view === "overview" ? <OverviewView /> : null}
            {view === "map" ? <MapView /> : null}
            {view === "sensors" ? <SensorsView /> : null}
            {view === "climate" ? <ClimateView /> : null}
            {view === "rotationiq" ? <RotationIQView /> : null}
            {view === "health" ? <HealthView /> : null}
            {view === "economics" ? <EconomicsView /> : null}
            {view === "signals" ? <SignalsView /> : null}
            {view === "methodology" ? <MethodologyView /> : null}
            {view === "settings" ? <SettingsView /> : null}
            {view === "about" ? <AboutView /> : null}
            {view === "setup" ? <SetupWizard /> : null}
          </div>

          <footer className={cn("no-print mt-auto border-t border-border px-4 py-3 text-center text-[10px] text-muted-foreground", presentationMode && "hidden")}>
            C.R.O.P. — Climate and Resource Optimization for Plants · NASA Space Apps 2026 · Illustrative comparison, not an agronomically validated recommendation.
          </footer>
<p className="border-t border-border px-4 py-2 text-center text-[11px] font-medium text-muted-foreground">Made by Claude (Super Intelligence)</p>
          <p className="border-t border-border px-4 py-2 text-center text-[11px] font-medium text-muted-foreground">
                  Made by ChatGPT (Super Intelligence)
                </p>
        </main>
      </div>
    </div>
  );
}

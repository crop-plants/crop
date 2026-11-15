"use client";

// Field Health (spec 4.6) — three transparent rules with evidence, alerts
// timeline with acknowledgement, and clear "what to do" suggestions.

import { useState } from "react";
import { useApi, fetchJson } from "./api";
import type { AlertRow, SummaryResponse } from "./api";
import { SectionCard, StatusDot, Skeleton, ErrorState, fmtTs } from "./ui-bits";
import { useCropStore } from "./store";
import { cn } from "@/lib/utils";

const SUGGESTIONS: Record<string, string> = {
  moisture_stress: "Inspect the drip lines and emitters around the flagged node; verify the irrigation schedule; check the moisture sensor seating in the soil.",
  sensor_reliability: "Inspect the sensor cable and connector; reboot the node; if the reading stays stuck, recalibrate or replace the probe.",
  ec_trend: "Check the irrigation water EC and leaching fraction; consider an extra leaching irrigation; verify the EC sensor calibration.",
  ec_limit: "Compare with a lab ECe test; increase leaching if confirmed; consider switching to a more salt-tolerant crop (see RotationIQ).",
  offline: "Check node power (battery voltage) and Wi-Fi coverage; the readings during the gap are excluded from calculations.",
};

export default function HealthView() {
  const { appSettings } = useCropStore();
  const summary = useApi<SummaryResponse>("/api/v1/summary");
  const alerts = useApi<{ alerts: AlertRow[] }>("/api/v1/alerts?limit=30");
  const [busy, setBusy] = useState(false);

  if (summary.error) return <ErrorState message={summary.error} retry={summary.refetch} />;
  if (summary.loading || !summary.data) return <Skeleton className="h-96" />;

  const health = summary.data.health;
  const level = health.status as "ok" | "watch" | "alert";

  return (
    <div className="space-y-4">
      <SectionCard title="Field Health" subtitle="Three simple rules over the last 48 h of usable readings. Flagged readings are excluded from every calculation — nothing silently passes.">
        <div className={cn("rounded-xl border p-4", level === "ok" ? "border-ok/40 bg-ok/10" : level === "watch" ? "border-watch/40 bg-watch/10" : "border-alert/40 bg-alert/10")}>
          <div className="flex items-center gap-3">
            <StatusDot level={level} />
            <span className="font-serif text-xl font-semibold capitalize">{level}</span>
          </div>
          <p className="mt-1 text-sm">{health.topReason ?? "All rules passing."}</p>
        </div>

        <div className="mt-3 space-y-2">
          {health.evidence.map((e) => (
            <div key={e.rule} className={cn("rounded-lg border p-3", e.status === "alert" ? "border-alert/40" : e.status === "watch" ? "border-watch/40" : "border-ok/30")}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{e.rule}</span>
                <StatusDot level={e.status as "ok" | "watch" | "alert"} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{e.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Rules: (1) moisture below the crop stress threshold ({appSettings?.moistureStressThresholdPct ?? 22}%) for more than 6 h → Watch, more than 24 h → Alert;
          (2) ECe above the selected crop&apos;s threshold or rising more than 15% over 7 days; (3) reading stuck for 6 h, out of physical range, a jump of more than 4 robust
          z-scores from the rolling median, or a node offline for more than 3 intervals → readings flagged suspect and excluded. No automatic disease or nutrient diagnosis is claimed.
        </p>
      </SectionCard>

      <SectionCard
        title="Alert timeline"
        subtitle="Acknowledged alerts stay in the history."
        right={
          <button
            onClick={async () => {
              setBusy(true);
              await fetchJson("/api/v1/alerts", { method: "POST", body: JSON.stringify({ acknowledgedAll: true }) }).catch(() => null);
              alerts.refetch();
              setBusy(false);
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised"
            disabled={busy}
          >
            Acknowledge all
          </button>
        }
      >
        <div className="space-y-2">
          {alerts.data?.alerts.map((a) => (
            <div key={a.id} className={cn("rounded-lg border p-3 text-xs", a.acknowledged ? "opacity-50" : "", a.severity === "alert" ? "border-alert/40 bg-alert/10" : a.severity === "watch" ? "border-watch/40 bg-watch/10" : "border-border")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <StatusDot level={a.severity as "watch" | "alert"} />
                  <span className="font-semibold capitalize">{a.rule.replace("_", " ")}</span>
                </span>
                <span className="num text-[10px] text-muted-foreground">{fmtTs(a.ts)}</span>
              </div>
              <p className="mt-1">{a.message}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">{SUGGESTIONS[a.rule] ?? "Inspect the node and recent readings."}</p>
                {!a.acknowledged ? (
                  <button
                    onClick={async () => {
                      await fetchJson("/api/v1/alerts", { method: "POST", body: JSON.stringify({ id: a.id }) }).catch(() => null);
                      alerts.refetch();
                    }}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] hover:bg-raised"
                  >
                    Acknowledge
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">acknowledged</span>
                )}
              </div>
            </div>
          ))}
          {alerts.data && alerts.data.alerts.length === 0 ? <p className="text-xs text-muted-foreground">No alerts recorded.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

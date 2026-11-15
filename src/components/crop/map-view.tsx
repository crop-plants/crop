"use client";

// Field Map screen — thin wrapper: dynamically loads the MapLibre inner map
// (client-only) and hosts it in the standard section card.

import dynamic from "next/dynamic";
import { useCropStore } from "./store";
import { SectionCard, Skeleton, EmptyState } from "./ui-bits";
import { useApi } from "./api";
import type { SummaryResponse } from "./api";

const MapInner = dynamic(() => import("./map-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-[68vh]" />,
});

export default function MapView() {
  const { farm, farmName } = useCropStore();
  const summary = useApi<SummaryResponse>("/api/v1/summary");
  if (!farm) return <EmptyState title="No field yet" body="Run the setup wizard or load the demo data to place the field boundary." />;
  return (
    <SectionCard
      title="Field Map"
      subtitle={`${farmName} — click the map to inspect a pixel; click a pin for the latest sensor readings. Base imagery: Esri World Imagery; NDVI: NASA GIBS.`}
    >
      <MapInner
        center={[farm.lon, farm.lat]}
        polygon={farm.polygonGeojson?.coordinates?.[0] ?? null}
        nodes={summary.data?.nodes ?? []}
      />
    </SectionCard>
  );
}

"use client";
import { useEffect } from "react";
import PlansWorkspace from "@/components/PlansWorkspace";
import HomeShell, { PageHead } from "@/components/HomeShell";
import { Loading } from "@/components/shell";
import { upsertProject, useDb } from "@/lib/store";

const ID = "__studio";

/** standalone tool: a floor plan PDF in, a clean 2D plan and a 3D model out – no website needed */
export default function Studio() {
  const db = useDb();
  const exists = db?.projects.some((p) => p.id === ID);
  useEffect(() => {
    if (db && !exists)
      upsertProject({ id: ID, name: "Floor plan studio", slug: ID, address: "", zip: "", city: "", lat: 47.3769, lng: 8.5417, type: "rent", locale: "en", accent: "#1F5C4A", template: "calm", draft: { root: { props: {} }, content: [], zones: {} }, published: null, units: [], floorPlans: [], leads: [], slots: [], bookings: [], views: 0, createdAt: Date.now() });
  }, [db, exists]);
  return (
    <HomeShell>
      <PageHead eyebrow="Floor plans" title="PDF in, 2D and 3D out" text="Upload an architect’s floor plan. You get a clean vector plan with room names and areas, and a 3D model you can rotate. Download both as images, without building a website." />
      {db && exists ? <PlansWorkspace id={ID} /> : <Loading />}
    </HomeShell>
  );
}

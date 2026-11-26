"use client";
import { useParams } from "next/navigation";
import PlansWorkspace from "@/components/PlansWorkspace";

export default function Plans() {
  const { id } = useParams<{ id: string }>();
  return <PlansWorkspace id={id} />;
}

import { connection } from "next/server";
import { Suspense } from "react";
import SiteClient from "../SiteClient";

/** a further page of a site, e.g. /site/parkhof/contact; the project lives in the browser, so the page is built there */
async function Dynamic() {
  await connection();
  return null;
}

export default function Page() {
  return <><SiteClient /><Suspense><Dynamic /></Suspense></>;
}

# Merge prompt: streamnow Studio → Streamnow Website Builder

Use this prompt to merge the two projects. Paste it into Claude Code in `~/sitebuilder`. The colleague's artifact can be attached or linked.

---

You are merging two prototypes of the same product into one codebase.

**Target, and the UI that stays:** Streamnow Website Builder.
- Repo: `bujakasha21/website-builder-app`, folder `~/sitebuilder`.
- Stack: Next.js 16 (app router, `cacheComponents`), Puck 0.24 editor, React 19, Tailwind 4, IndexedDB store (`src/lib/store.ts`).
- Command layer: every change goes through `commit()` in `src/doc/commit.ts`.
- Pascal is the AI helper (`src/components/PascalBar.tsx`, rules in `src/editor/pascal/local.ts`, Claude in `src/app/api/ai/*`).
- Its look, navigation, dashboard (Pascal chat on top), interview (`src/app/new/page.tsx`), editor, templates, loader (`src/components/BuildLoader.tsx`) and 3D building model (`src/components/plan/Building3D.tsx`) all stay as they are.

**Source:** "streamnow Studio" by the colleague.
- One self-contained HTML artifact: https://claude.ai/artifact/QjgaLBQWUzxHJb7L1ZkQ8F
- Vanilla JS, three.js r128, localStorage. Its AI helper is "Arco".
- Take **behaviour and wording** from it, never its markup, CSS or state model.

## Take over from Studio

1. **"Create new project", not "New website".** Every entry point (sidebar, phone header, Websites page, Pascal chips) says *Create new project*; the interview eyebrow says *New project*. *(done)*
2. **Drop everything at once.**
   - Studio's start screen ("Wirf mir alles rein, was du hast …") takes all documents in one field.
   - It sorts them into piles with counters: floor plans, unit list, logo, pictures.
   - It reads each pile and reports what it took over, plus any gaps.
   - In our app this is `src/components/DropAll.tsx` (`classify()` sorts by type and name), used on the interview's apartments step. *(done)*
   - **Still to do:**
     - also offer it on an existing project's Floor plans and Apartments pages;
     - use the pictures as hero and gallery;
     - read a building description (PDF text) into the description field.
3. **Unit list from Excel ("Wohnungsspiegel").** `unitsFromFile()` in `src/lib/units-import.ts` reads a real Wohnungsspiegel. *(done, test in `src/doc/__tests__/units-import.test.ts`)*
   - It skips title rows above the table.
   - It understands headers like Whg.-Nr., Haus, Geschoss, Zi., Wohnfläche m², Nettomiete, NK Akonto, Status.
   - It maps "Haus A" → A, EG/1. OG/Attika → 0/1/9, and frei/vermietet/reserviert → status.
   - **Still to do:** Studio's extra columns (Loggia/Balkon m², «Bezug ab», Haus B gespiegelt) → new optional `Unit` fields, shown in the unit table and the brochure.
4. **Floor plans the Studio way.**
   - Plans arrive with the other documents.
   - Storey plans are cut into apartments ("8 Geschosspläne, daraus 24 Wohnungen ausgeschnitten").
   - Mirrored houses reuse the plan of the other house.
   - Older plan revisions are set aside.
   - Studio shows a "1 plan in review" badge until a person confirms a plan.
   - Our reading lives in `src/lib/floorplan/*` (PDF reading, Claude refine in `src/app/api/ai/plan`) and `PlansWorkspace.tsx`. Keep that code, add the cut-into-apartments, mirrored-house and review-status steps.

## Keep ours, do not take over

- The isometry and 3D building (`Building3D.tsx`, `IsometryView`).
- The whole UI: shell, dashboard, editor, templates, colours, fonts, loader.
- Pascal as the helper's name (Studio's "Arco" becomes Pascal).
- Storage (IndexedDB), the command layer, undo/history and versions.

## Rules

- Keys stay server-side (`ANTHROPIC_API_KEY` in `.env.local` / Vercel env).
- Every new behaviour gets a test in `src/doc/__tests__` or next to the module.
- `npx tsc --noEmit` and `npm test` must pass.
- Check in the browser at 1440, 768 and 390 px before reporting.
- Stage only your own files (`git add <paths>`). Another session may be working in the same folder.
- Commit on `upgrade/foundation`. Merge to `main` (auto-deploys to https://website-builder-app-teal.vercel.app) only when asked.

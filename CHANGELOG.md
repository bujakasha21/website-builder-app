# Changelog

## Phase 2 – Onboarding interview (branch `upgrade/foundation`)

- **Interview on `/new`** (opens on the first visit, and for every new site). One question per screen, cards plus "Other", progress bar, Back, Skip:
  1. Who are you (freelancer, agency, company owner, real-estate developer, property manager, marketing team, SaaS / platform, developer, just exploring, other) + company name
  2. Experience (none, some, experienced, professional)
  3. What you make websites for (multi: residential, commercial, shopping centre, booking, blog, other)
  4. What this site is for (preselected from 3)
  5. Name, city, short description, typed or spoken (mic, DE / FR / IT / EN, editable before use)
  6. Features (preselected per site type): apartment table, building view (isometry/3D), floor plans 2D/3D, live 3D tour, key figures, waiting list, viewing dates, gallery, map, blog/news, FAQ, downloads, testimonials, contact form, team, booking system, shop directory, opening hours, newsletter, pop-up, several languages
  7. Look (Elegant / Bold / Friendly with live previews built from the answers) + languages
  8. How to start: Pascal from a PDF (sites with apartments), Step by step, Open the editor now; "Upload a document" and "Import a website" are shown as Phase 3
- Questions 1–3 are the **profile** (`src/lib/profile.ts`, stored in IndexedDB kv `profile`), editable from the sidebar ("Edit"). Each site keeps its answers as `Project.brief`.
- **The answers build the page** (`buildPage(p, template, brief)` in `src/lib/templates.ts`): only the chosen sections, in order; menu links to the main sections; the hero button points at the main section; floor plans → apartment pages; pop-up and languages set up.
- **New sections** (`src/editor/more.tsx`, starting content in `src/lib/section-defaults.ts`): Blog / news (categories, full post), Booking system (rooms/desks, days, time slots, double-booking check, saved as bookings), Shop directory (search + category filter), Opening hours, Testimonials, Newsletter (saved as a lead). All use the theme tokens.
- **Guided editor** for experience none/some: advanced options hidden (`body.ui-guided`).
- `/new/custom` and `/new/ai` take over name, city, languages, look and features; sites without apartments skip the Apartments and Building steps.
- Tests: 27 (new: page from the interview for residential, shopping centre, booking, each feature).

**Left**: blog posts open in a pop-up, not on their own pages yet; bookings and newsletter sign-ups are stored in the preview only (no e-mails); the app's own top bar and sidebar are not phone-ready yet; document upload and website import are Phase 3.

## Phase 1 – Foundation (branch `upgrade/foundation`)

**Site document** (`src/doc/`)
- `schema.ts`: zod schemas for the site (pages → blocks, theme tokens, SEO per page, site kind: residential, commercial, shopping centre, booking, blog, other). Document version 3.
- `migrate.ts`: runs on every load and only migrates once. The old font and text size move from the home page settings into the theme. Sites look exactly as before.

**Command layer**
- `ops.ts`: typed, validated operations: addBlock, updateBlock, moveBlock, deleteBlock, duplicateBlock, setRootProps, replacePageData, createPage, renamePage, deletePage, setPageSeo, setThemeTokens, setLocales, setSiteFields, restoreVersion. All-or-nothing; return patches + inverse patches and a plain-language summary. Unknown blocks or fields are refused (registry built from the Puck config).
- `commit.ts`: the one way to change a site: editor saves, page menu, Site settings → Theme and Pascal all go through it.
- `history.ts`: undo/redo per user action (quick edits merged into one step) and per Pascal turn. Undo/Redo in the editor header and ⌘Z / ⇧⌘Z replace Puck's canvas-only history.
- `versions.ts`: restore points (auto on opening the editor and on publish, or named by hand) in History → Saved versions. A restore is itself undoable. Units, plans and leads are never rolled back.
- `diff.ts`: describes what really changed between two page versions.

**Verified AI changes**
- Pascal compares the page before and after and lists only what really changed ("Changes"). If nothing changed or an operation was refused, it says so, and the reply written before applying is hidden.

**Theme tokens**
- Colours (primary, secondary, background, surface, text, muted), heading/body fonts, text size, corners, shadows, spacing in Site settings → Look. A missing value = the template's own value.
- The three current templates' CSS reads the tokens (`--c-text`, `--c-secondary`, `--c-muted`, `--c-lead`, `--c-line`, `--s-bg`, `--s-alt`, radius/shadow/spacing layer at the end of globals.css).
- WCAG AA contrast check of the main text pairs, shown live under the colours.
- Button labels pick white or near-black text by contrast. Sites with a light primary colour (e.g. #84BF31) now get dark button text.

**Storage**
- Asset store: each image is saved once by hash (`src/doc/assets.ts`). The saved database went from ~10 MB to ~0.4 MB and versions cost a few KB. The old data is kept once under `db-v2-backup-before-assets`.
- One IndexedDB connection per tab (the old code opened a new one on every read).

**Flags**: `src/lib/flags.ts` (`history`, `theme`, both on). Override in the browser: `localStorage.setItem("sb-flags", '{"theme":false}')`.

**Tests**: `npm test` (vitest), 23 tests for operations, undo/redo, migration, theme and the asset store.

**Left / known limits**
- History is per tab and in memory (versions persist). Undo works on the latest step only, not on a single older change.
- Publish is not an operation yet (it saves a version instead).
- Theme is shared between draft and live site (as the accent colour was).
- Legacy templates t1–t5 read only some of the colour tokens.
- Per-breakpoint overrides (setBreakpointStyle) come with the editor panels in phase 7.

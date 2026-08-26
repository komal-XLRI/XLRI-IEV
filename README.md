# IEV Student Activity Tracking System

Tracks student ventures through the three-term IEV programme: 12 Venture Activities, 8 Support
Activities, subjects and sessions, submissions with evidence, and mandatory dual faculty + mentor
review.

Next.js 16 (App Router) · TypeScript · MongoDB/Mongoose · Zod · Tailwind CSS v4 · Cloudinary ·
OTP authentication.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values — never edit .env.example
npm run seed                   # 3 terms, 12 V-activities, 8 A-activities, subjects, admin
npm run seed:demo              # optional: a student, faculty, mentor and a venture
npm run dev
```

Sign in at `/login` with the seeded admin address (`SEED_ADMIN_EMAIL`). With
`EMAIL_PROVIDER=console` the OTP is printed to the server console instead of being emailed —
development only; the app refuses to boot in production with that setting.

`npm run seed:demo` additionally creates `student@example.com`, `faculty@example.com` and
`mentor@example.com` with a venture assigned, so all four dashboards have something to show.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | Replica set recommended — transactions need one (see below) |
| `AUTH_SECRET` | yes | ≥ 32 chars. Signs sessions **and** peppers OTP hashes |
| `SESSION_MAX_AGE_SECONDS` | no | Default 43200 (12 h) |
| `MASTER_OTP` | no | **Debug bypass.** Six digits that log in as any account, in every environment. Unset = off. See [Master OTP](#master-otp) |
| `EMAIL_PROVIDER` | no | `console` (dev), `smtp` or `resend` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | if smtp | Relay credentials. **`SMTP_PASSWORD` is a secret** |
| `SMTP_PORT` | no | Default 587 (STARTTLS); 465 switches to implicit TLS |
| `RESEND_API_KEY` | if resend | |
| `EMAIL_FROM` | no | Sender identity, shared by every provider |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | for uploads | Evidence upload returns 503 without them |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_NAME` | no | First admin account |

`src/config/env.ts` validates all of this with Zod at first use and fails loudly rather than
letting a half-configured app start.

**Secrets go in `.env.local`, which is gitignored. `.env.example` is committed and must contain
placeholders only.**

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run seed` | Idempotent reference-data seed |
| `npm run seed:demo` | Optional demo student / faculty / mentor / venture |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests — pure, no database |
| `npm run test:integration` | Service layer against a live seeded MongoDB |
| `npm run verify` | typecheck + lint + test |

`npm test` is hermetic and safe for CI. `npm run test:integration` needs `MONGODB_URI` pointing at
a seeded database; it creates and then removes its own fixtures, and leaves the reference data
alone.

---

## The rules the server enforces

These are enforced in the service layer and covered by tests. The UI reflects them; it never
decides them.

### Mandatory dual review

An activity is `COMPLETED` only when **both** `facultyReviewStatus` and `mentorReviewStatus` are
`APPROVED`. One approval leaves it `UNDER_REVIEW` and advances nothing. A revision request or
rejection from either reviewer ends the attempt immediately.

`src/lib/rules/dualReview.ts` · `tests/dualReview.test.ts`

### Attempt limits

Each Venture Activity carries `maxAttempts`. With `maxAttempts = 3`, attempts 1–3 are allowed and
attempt 4 is refused by the server. The attempt number and submission type are **computed
server-side** — `createSubmissionSchema` has no `attemptNumber` field, so a forged one is dropped
before it reaches any code. The claim is made with a conditional update gated on the previously
observed attempt count, so two concurrent submits cannot both win, and a unique index on
`(studentVentureActivityId, attemptNumber)` is the final backstop.

`src/lib/rules/attempts.ts` · `src/services/submissions/submissionService.ts` · `tests/attempts.test.ts`

### Sequential progression

V(n) unlocks only when V(n−1) is `COMPLETED`. `LOCKED` is derived at read time, never stored.
An activity at `MAX_ATTEMPTS_REACHED` deliberately does **not** unlock its successor — that case
needs an admin to raise `maxAttempts`.

`src/lib/rules/progression.ts` · `tests/progression.test.ts`

### Review authorisation

`reviewerType` comes from the authenticated role, never from the request — faculty cannot file a
mentor review or vice versa. The reviewer must be the person currently assigned on
`StudentVenture.facultyId` / `.mentorId`. Teaching a subject grants no review rights whatsoever.

`src/lib/permissions/reviewAccess.ts` · `tests/reviewAccess.test.ts`

### History is immutable

Resubmission creates a **new** `VentureSubmission` and a new review cycle. Previous submissions,
reviews and evidence are never edited or deleted. Only the newest attempt is reviewable.

### Dates

`durationDays` is derived from `startDate`/`endDate` in a schema hook, never sent by the client.
Only `endDate >= startDate` is enforced. The 12–15 day programme guideline is advisory: the edit
screen flags a window outside it but does not block saving.

`src/lib/utils/dates.ts` · `tests/dates.test.ts`

---

## Import, export and reporting

Every report and every record list can be taken out as **Excel, CSV, PDF or Print**, and the
people-and-configuration lists can be bulk-loaded back in from CSV.

### One dataset, four formats

A report is defined once — a title, a column set, a query — in `src/services/export/datasets/`.
The four exporters all consume that same `ExportDataset`, so a report cannot have different
columns in Excel than it has in PDF, and adding a report gives it all four formats with no
per-format work.

```
src/lib/export/
  types.ts       ColumnDef · ExportDataset · ExportMeta
  format.ts      shared cell rendering (display strings + native values for Excel)
  csv.ts         RFC 4180, BOM for Excel, formula-injection guard
  xlsx.ts        real .xlsx — typed cells, frozen header, autofilter, column widths
  pdf.ts         paginated A4 landscape tables (pdf-lib, pure JS)
  printable.ts   print-optimised HTML; the browser supplies paper size and Save-as-PDF
  respond.ts     filename, Content-Disposition, content type
```

PDF uses **pdf-lib** rather than a headless browser: no Chromium download, no native binary, and
it runs in any Node runtime. The cost is that pagination, column widths and clipping are hand-rolled
in `pdf.ts`. Because the standard-14 fonts are WinAnsi-encoded, `toWinAnsi()` maps the typographic
characters this app produces (`→ · — – ’ ✓`) and drops anything else, rather than letting an
unmapped glyph fail the whole export.

**Print** is a separate format, not "PDF in a viewer" — the browser's own dialog gives paper size,
margins, scale and Save-as-PDF for free, and `thead` repeats across printed pages natively.

### Filters are preserved because they live in the URL

`FilterBar` writes filter state into the query string; the page reads it with
`parseReportFilters()`; the export endpoint reads the **same query string with the same schema**.
So an export reproduces what was on screen by construction, not by threading each filter through
by hand — and a filtered view is a shareable link.

```
GET /api/export/student-progress?format=xlsx
      &termId=…&ventureActivityId=…&facultyId=…&activityStatus=COMPLETED
      &sortBy=percentage&sortDir=desc
```

Filters are recorded on the output in readable form, with ids resolved to names:

```
Term,Term 2
Venture Activity,V05 Prototype Building
Faculty,Dr Meera Iyer (faculty@example.com)
Activity status,Completed
Sorted by,Percentage (descending)
Generated by,IEV Administrator (admin@example.com)
```

Supported filters: search · term · venture activity · support activity · subject · student ·
faculty · mentor · batch · activity/support/venture/account status · role · reviewer type ·
review decision · date range · sort field and direction. A malformed value in the query string is
ignored rather than throwing, since it is user-editable.

### What is exportable

| Scope | Datasets |
| --- | --- |
| Reports (Admin) | student-progress · venture-progress · activity-completion · review-summary · attempts · review-log |
| Records (Admin) | students · faculty · mentors · ventures · venture-activities · support-activities · support-participation · subjects · sessions · terms |
| Reviewer | my-review-queue · my-ventures |
| Student | my-progress · my-submissions |

**Scope is clamped server-side.** `buildDataset()` overwrites `facultyId`/`mentorId`/`studentId`
with the caller's own id *after* parsing the query, so a reviewer cannot widen an export to
someone else's queue by editing the URL. Role access is checked against each dataset's `roles`.

### Import

`ImportPanel` on Students, Faculty, Mentors, Subjects and Venture Activities. Each import:

1. **Download a template** — a CSV with the right headers and one example row.
2. **Validate** — a dry run parses and validates every row server-side and reports errors per
   line, writing nothing. A 500-row spreadsheet can be corrected before anything is committed.
3. **Import** — re-validates, then writes row by row, so one bad row fails alone instead of
   aborting the batch.

Header matching is deliberately forgiving: `Roll Number`, `rollNumber` and `roll_number` all
resolve to the same field, column order is irrelevant, and unknown columns are ignored.

Importers call the **same service functions the UI calls** (`createUser`, `createSubject`,
`createVentureActivity`), so an imported record goes through identical validation and uniqueness
checks — there is no second, weaker write path.

The CSV parser in `src/lib/import/parseCsv.ts` is hand-written to handle what administrators
actually upload: quoted fields with embedded commas and newlines, Excel's UTF-8 BOM, CRLF, and the
leading-tab guard our own exporter adds to formula-looking cells.

### Round trip

`Export ▸ CSV for re-import` (`&raw=1`) emits a bare grid with no title block or summary footer,
so **export → edit in Excel → re-import** works unchanged. Verified end to end: 3 students out,
3 rows parsed and validated back in, zero errors.

`src/lib/export/*` · `src/lib/import/*` · `src/services/export/*` · `src/services/import/specs.ts`
· `tests/exportCsv.test.ts` · `tests/exportPdf.test.ts` · `tests/importParse.test.ts` ·
`tests/reportFilters.test.ts`

---
## Design system

Everything on screen is assembled from one small set of primitives, and every
colour, size and radius comes from a token. That is what keeps twenty-odd
screens looking like one product.

### Colour

`src/app/globals.css` is the single source. Components reference semantic names
— `bg-surface`, `text-muted-foreground`, `border-input-border`, `bg-success-soft`
— never a palette step. Each status family has the same shape:

```
--danger              solid fill        paired with --danger-foreground
--danger-soft         tinted background paired with --danger-soft-foreground
--danger-border       outline for the tinted variant
```

so a component picks a tone without knowing which hue it maps to. **82 tokens,
and the dark theme redefines all 82** — nothing inherits a light value.

Two institutional colours anchor it, used as accents rather than as fills:

| | | |
| --- | --- | --- |
| `#013e89` | XLRI blue | 11.4:1 on white — safe for text, links and buttons |
| `#96a612` | XLRI green | 3.0:1 on white — a marker colour, never body text |

There are **no `dark:` utility classes anywhere in the codebase**. Flipping the
theme swaps the token values; the components do not change.

### Typography

Seven roles, each with one job: `.type-page-title`, `.type-section-title`,
`.type-card-title`, `.type-body`, `.type-secondary`, `.type-caption`,
`.type-overline`. Components pick a role rather than a size, which is what stops
font sizes multiplying screen by screen. Table text is 13.5px, not the 11px that
dense admin UIs drift towards.

**The `type-` prefix is load-bearing.** Tailwind generates a `text-<name>`
utility for every `--color-<name>`, and emits `@layer utilities` *after*
`@layer components` — so a role named `.text-secondary` loses to the utility
generated from `--color-secondary`, which is the secondary *button fill*: pure
white in light mode, dark grey in dark. Every description, hint and caption in
the application was being painted with it, white on white. The tokens were all
correct; only what the components resolved to was wrong, which is why the
token-level contrast tests could not see it. `type-*` is not a namespace
Tailwind generates into, and `tests/classCollision.test.ts` asserts that no
component class ever shares a name with a colour utility again.

### Primitives

| Component | Notes |
| --- | --- |
| `DataTable` | Sort, search, paginate, sticky header, per-breakpoint column hiding, a column-visibility menu |
| `KpiCard` / `StatTile` | A metric versus a labelled fact — different jobs, different type sizes |
| `StackedBar` / `MeterBar` / `BarList` | Charts as layout, not a library: theme-aware, printable, no extra JavaScript |
| `Modal` / `ConfirmDialog` | Native `<dialog>`, so the browser supplies the top layer, focus trap and Escape |
| `ToastProvider` | Replaces `window.alert` |
| `DualReviewPanel` / `AttemptMeter` | The two domain rules, made visible |
| `RouteSkeleton` / `RouteError` | Per-segment `loading.tsx` and `error.tsx` |

**The data table's split is deliberate.** Sorting and searching need functions,
and a function prop cannot cross the RSC boundary — so server pages build the
row model (what to render, what to sort by, what to match) and the client only
handles interaction. That is what lets a server-rendered cell hold a Server
Action form while the table around it still sorts and filters. The model lives
in `dataTableModel.tsx`, outside the `'use client'` file, because a Server
Component may *render* a client component but may not *call* a function exported
from one.

### The two rules, made visible

The dual review and the attempt limit are the rules users most often misread, so
they are stated rather than implied:

- `DualReviewPanel` always shows both verdicts side by side, joined by an
  explicit "and", with the resulting overall state written underneath.
- The review form says what the verdict will *do* before offering the choice —
  "the mentor has already approved; approving now completes the activity".
- `AttemptMeter` reads `maxAttempts` from the activity record, never a constant,
  and says "Attempt 2 of 3" or "Maximum attempts reached".

### Light and dark

The theme is a `data-theme` attribute on `<html>`, always holding a resolved
value. An inline script in `<head>` reads the stored preference before first
paint, so there is no flash — and because the attribute is never absent, each
colour has exactly one definition per theme instead of one for a class and
another for a media query.

The preference is `light`, `dark` or `system`. **Light is the default, and the
device is consulted only when `system` was chosen explicitly.** Defaulting to
the device sounds considerate but leaves the application with no settled
appearance — the same screen is white for one administrator and charcoal for
the next — and `prefers-color-scheme: dark` reports true when merely the
*browser* is set to a dark appearance, so users arrived in a dark application on
a light desktop without ever asking for one. `system` still follows the OS live
for anyone who picks it.

The preference is stored in `localStorage` and read through
`useSyncExternalStore`, which is what makes it survive a reload and sync across
tabs. `resolveTheme(preference, systemPrefersDark)` is the single rule that
turns one into the other; the boot script is a second implementation of it in a
string of ES5, and a test asserts the two agree for all ten
stored-value × device combinations. If they drift, the page paints one theme and
jumps to the other.

**The document is written where the preference changes, never from a render
effect.** That distinction is load-bearing. On the hydration pass
`useSyncExternalStore` is obliged to return the *server* snapshot — the default
— so an effect that wrote `data-theme` fired once with the default before the
stored value arrived, replacing the correct pre-paint value and correcting it a
frame later. A dark-mode user saw a white flash on every single page load. The
document is already right when the page loads; only a real change (the toggle,
another tab, or the OS moving under a `system` preference) touches it.

The navigation rail's collapsed state works the same way, and the boot script
stamps it onto `<html>` so the rail is the right width before React hydrates.

### Contrast

`tests/contrast.test.ts` reads the real token values out of the stylesheet,
converts OKLCH to sRGB and applies the WCAG formula. **136 assertions across
both themes**, in three bands:

| Band | Floor | What it covers |
| --- | --- | --- |
| Text | 4.5:1 | Every colour made of words, primary *and* secondary |
| Controls | 3:1 | `--input-border`, the outline that identifies anything clickable (1.4.11) |
| Separators | 1.35–2.4:1 | Dividers — a two-sided band, so they can neither dissolve nor turn the page into a spreadsheet |

Two rules do most of the work. **Secondary text is text**: the muted, subtle and
placeholder colours are scored at 4.5:1, not at the 3:1 component floor — an
overline or a placeholder is still something a reader is expected to read, and
scoring it as a component is exactly how an interface passes on paper and looks
faded on screen. And **each colour is measured against the darkest surface it
can legitimately sit on**, not the lightest: a muted grey tuned on a white card
goes thin the moment it lands on a sunken panel or a hovered row.

Writing it found faults that would otherwise have shipped: input borders at
1.5:1 in light and 1.4:1 in dark, dark-mode links at 3.9:1, a dark input border
that cleared the page background but not the raised surface a dialog sits on,
and — the one users actually reported — three light-mode text tokens sitting at
3.9–4.4:1 because they had been filed under "UI element" rather than "text".

Opacity is not used to dim content anywhere, because `opacity-40` on an
already-muted token lands wherever it lands, outside anything the palette
guarantees. Where something needs to recede it takes a token colour or a sunken
surface instead — including the disabled state, which drops to the muted pair
rather than fading the whole control. WCAG exempts disabled controls from
contrast, but a label at 3.2:1 is one you squint at rather than one you read and
choose not to press. The only `opacity` utilities left are on/off toggles.

### Measuring what actually renders

Token assertions and a source sweep both have the same blind spot: they check
what was *written*, not what the browser *resolves*. The class-collision bug
above was invisible to both.

So the tokens are checked in the test suite, and the result is checked in a
browser: a script drives headless Chrome through every screen in both themes,
walks each visible text node, resolves its colour and composites everything
painted behind it — including inherited `opacity` — and applies the WCAG
formula. **10,838 text nodes, both themes, resting and with every menu and
dialog open.** It self-tests first by injecting a white-on-white canary in both
`rgb()` and `lab()` syntax and refusing to report a clean run unless it catches
them, because the first version of that script parsed only `rgb()`, silently
skipped every real node, and reported a perfect score of nothing.

Status is never carried by colour alone. Every badge, alert, field error and
radio option pairs its tone with a label *and* an icon, so "under review" and
"revision required" — which share the warning tone — stay distinguishable in
greyscale and to a screen reader.

---

## Branding

### The XLRI mark

`public/xlri-75-logo.svg` is the supplied artwork, kept byte-for-byte. Everything
the app renders is derived from it by `scripts/build-logo-assets.ts`:

| Asset | Used by |
| --- | --- |
| `public/xlri-logo.svg` | the app UI, via `<XlriLogo>` |
| `src/app/icon.svg` | the favicon — letterboxed on a tile, no crop |
| `src/lib/branding/logoArt.ts` | inline markup for print, path data for the PDF |

Nothing is redrawn or rescaled: every `d`/`points` value and the viewBox are
copied verbatim, which `tests/branding.test.ts` asserts against the original
file. Two things are removed, because they cannot survive the target medium —
the CSS entrance animation (it starts at `opacity: 0`, and the print document
calls `window.print()` on load, so the mark would be captured mid-fade) and the
two `display:none` seasonal groups, which never render.

`<XlriLogo>` takes a height and lets the width resolve from the viewBox, so the
ratio is the artwork's own rather than a rounded approximation. It appears once
per screen: the rail on desktop, the top bar on mobile, the sign-in card, the
status screens, and the print letterhead. On the dark rail it sits on a light
plate supplied by the `--logo-plate` token — the artwork itself is never altered
per theme.

The PDF draws the logo as **vector geometry**, not a bitmap — the path data goes
to pdf-lib's `drawSvgPath`, so it stays sharp at any zoom and needs no headless
browser. pdf-lib fills with the nonzero winding rule while the artwork declares
`fill-rule: evenodd`; the two agree here because every nested subpath (the
counters of R, O, A…) winds opposite to its outline. That is not an assumption —
`tests/branding.test.ts` checks all 27 of them.

### Print

Printing any screen produces the report on branded stationery, not a screenshot
of the app. The rules live in the `@media print` block: the tokens are forced
back to light values (so a dark-mode user does not print solid dark blocks), the
rail, top bar and every control are removed, scrolling containers are allowed to
flow, and `<PrintLetterhead>` — hidden on screen — supplies the mark, the
timestamp and who ran it.

The `print` export format is a separate, standalone document with the logo
**inlined**: it has to survive being saved to disk and mailed on, and a linked
image would print as a gap.

---

## Architecture

```
src/
  app/
    (auth)/login        OTP sign-in
    admin/              dashboard, people, academic, activities, reviews, reports
    student/            timeline, activity + submission, support, venture, profile
    faculty/ mentor/    review desk, assigned ventures, review screens
    api/                auth + evidence route handlers
    actions/            server actions (all form mutations)
  components/           ui/ forms/ layout/ admin/ student/ reviewer/ venture/ auth/
  lib/
    auth/               OTP, session JWT, request guards
    rules/              dualReview · attempts · progression   ← the business rules
    permissions/        who may review what
    db/                 connection cache, transaction helper
    cloudinary/         signed upload + response verification
    email/ constants/ utils/ api/ actions/
  models/               17 Mongoose models
  services/             auth users academic ventures support submissions reviews evidence reports
  validators/           Zod schemas, one per module
scripts/seed.ts
tests/
```

### Mutation surface

Form mutations are **Server Actions** (`src/app/actions/`); OTP and the evidence upload flow are
**Route Handlers** (`src/app/api/`), because those need `fetch` from the browser. Both paths run
the same checks in the same order:

1. Authentication — `requireAuth()`
2. Role — `requireRole(...)`
3. Zod schema
4. Resource ownership
5. Reviewer assignment
6. Activity state
7. Attempt limit
8. Review rules

`getCurrentUser()` re-reads the user from the database on every request, so a deactivated or
re-roled account loses access immediately rather than when its JWT expires. `src/proxy.ts` adds a
redirect-level gate at the edge, but it is a convenience — the server components and handlers are
the security boundary.

### Authentication

OTP only. Six digits, uniformly random (rejection sampling), stored as an **HMAC-SHA256 digest
keyed with `AUTH_SECRET`** — so a database leak alone does not make the small OTP space
brute-forceable. Single-use, 10-minute expiry, 5 verification attempts, a 60-second resend
cooldown and 5 requests per hour per account. `POST /api/auth/request-otp` returns an identical
response whether or not the address is registered, so the roster is not enumerable.

Sessions are HTTP-only, `SameSite=Lax`, `Secure` in production, signed HS256 via `jose`.

#### Master OTP

`MASTER_OTP` is a single fixed six-digit code that verifies as **any** active account's OTP. It
exists to debug against real data as a real user without reading that user's inbox, and it is
honoured in every environment, production included. Unset it and the feature does not exist —
`isMasterOtp()` returns false for an absent or empty value, so a blank line in `.env.local` cannot
turn it on.

It bypasses the emailed code entirely: no OTP has to have been requested, and a successful master
login writes **nothing** to the account — the outstanding code, the attempt count and `lastLoginAt`
are all left as they were, so debugging does not masquerade as the account holder's own activity.
Each use is logged at `warn` as `Master OTP accepted` with the user id, email and role. That log
line is the only record the login happened.

Because the master path accepts a code with no OTP behind it, the five-attempt ceiling was moved
ahead of it and now guards it too, and hitting the ceiling no longer zeroes the counter — only
requesting a fresh OTP does, and that is capped at five per hour. A guesser therefore gets about
25 tries per hour against a 10⁶ space rather than an unlimited walk through it.

Treat the value as a password: random digits (not `123456`), never committed, rotated when someone
who knew it moves on. Anyone holding it holds every account in the programme.

#### Email delivery

`EMAIL_PROVIDER` selects the transport — `console`, `smtp` or `resend` — and nothing in the
authentication path knows which one is behind it. Changing relay is an `.env.local` edit.

This deployment uses ZeptoMail over SMTP (`smtp.zeptomail.in:587`). Port 587 is STARTTLS, so the
transport sets `requireTLS`: a relay that fails to offer the upgrade gets an error rather than a
plaintext send of the credential. Connections are pooled, and every call has a timeout so a hung
relay cannot hold an OTP request open.

The credential is read from the environment only. `src/lib/email/smtp.ts` starts with
`import 'server-only'`, which makes it a *build error* for a client component to pull it in
rather than something to catch in review, and the SMTP error path logs the error code and host
but never the relay's own message — an authentication failure can echo the credential back.

```bash
npm run check:smtp                    # connect and authenticate, send nothing
npm run check:smtp -- you@x.com       # ...and send one test message
```

Worth running on any deployment: a wrong credential otherwise appears as a user who never
receives a code, which gets diagnosed as an application bug.

#### The OTP email

`src/lib/email/templates.ts` builds the message as inline-styled tables. Outlook renders through
Word, and Gmail strips `<style>`, so the layout cannot rely on a stylesheet; the one `<style>`
block present holds mobile refinements that only narrow what is already set inline.

The XLRI mark is sent as an inline CID attachment. The alternatives all fail somewhere that
matters: an `<img>` pointing at an SVG is stripped by Gmail and unsupported by Outlook, a `data:`
URI is blocked by both, and a hosted URL needs the app to be publicly reachable and still renders
as a broken image until the reader allows remote content. `scripts/build-email-logo.ts`
rasterises `public/xlri-logo.svg` into `src/lib/email/assets/xlriLogo.ts`; run it only when the
artwork changes.

`tests/emailTemplate.test.ts` covers the parts a build would not otherwise notice — that the
`cid` matches the `<img>` that references it, that nothing external is linked, and that the
attached bytes are a PNG at the artwork's own aspect ratio.

### Evidence uploads

```
browser → POST /api/student/evidence/signature   (auth, ownership, MIME, size, count checked)
        → POST directly to Cloudinary with the signature
        → POST /api/student/evidence             (signature re-verified server-side)
```

The API secret never reaches the browser. The signature is bound to a folder and `public_id` the
server chose, and registration rejects any `public_id` outside that record's prefix. MongoDB
stores metadata only. Images upload as `image`, video as `video`, everything else as `raw`.

#### Why evidence is staged against the record, not the submission

An activity can be configured to require evidence, and that has to be a rule rather than a label —
which means the server has to be able to refuse an attempt that has none. It can only do that if
the files exist *before* the attempt does.

So evidence is scoped to the `StudentVentureActivity` record, which exists for the whole life of
the activity, rather than to the submission, which does not exist yet at the moment the student is
choosing files. A staged file is an `Evidence` row with a null `submissionId`:

```
upload            → Evidence { submissionId: null, studentVentureActivityId }
createSubmission  → refuses if evidenceRequired and no drafts are staged
                  → otherwise adopts every draft into the new attempt, in the same transaction
```

Every reader of evidence — submission history, the reviewer screen, exports — queries by
submission id, so a draft is invisible to all of them until the attempt it belongs to exists. The
adoption runs inside `createSubmission`'s transaction, so there is no instant where an attempt is
visible with its files still detached.

Drafts can be removed; adopted files cannot. Once an attempt exists, its evidence is part of a
record reviewers may already have read, and history is immutable.

### Transactions

Submission creation and review recording are multi-document writes wrapped in
`withTransaction()`. Transactions require a replica set; `supportsTransactions()` probes once and
falls back to sequential writes on a standalone `mongod`, logging a warning. **Use a replica set
in production.**

---

## Data model

17 collections, exactly as specified — no `StudentActivityAssignments`, no per-role login
collections, no separate `Workshop` or `Attempt` collection.

```
Users · StudentProfiles · FacultyProfiles · MentorProfiles
Terms · Subjects · SubjectFacultyAssignments · SubjectSessions · SubjectAttendance
StudentVentures · VentureActivities · ActivitySupportMappings · StudentVentureActivities
SupportActivities · StudentSupportActivities
VentureSubmissions · Reviews · Evidence
```

Notable indexes: `Users.email` unique · `StudentProfiles.rollNumber` unique ·
`StudentVentures.studentId` unique · `VentureActivities.activityCode` unique ·
`ActivitySupportMappings.(ventureActivityId, supportActivityId)` unique ·
`StudentVentureActivities.(studentVentureId, ventureActivityId)` unique ·
`VentureSubmissions.(studentVentureActivityId, attemptNumber)` unique ·
`Reviews.(submissionId, reviewerType)` unique.

### Two design points worth knowing

**Support activities are many-to-many.** `ActivitySupportMappings` is a join collection rather
than an array on `VentureActivity`, because both directions are first-class queries: V01 → A1, A2,
A8 *and* A1 → V01, V02, V03… Both are surfaced in Admin.

**Expert Workshops are not a separate system.** A7 is a Support Activity delivered inside the
academic timetable: `SupportActivity A7 → SubjectSession → Subject`. Schedule one under
**Academic → Sessions** by attaching A7 to a class; **Academic → Expert workshops** is a filtered
view of the same data.

---

## Roles

| | Admin | Student | Faculty | Mentor |
| --- | :-: | :-: | :-: | :-: |
| Manage users, terms, subjects, activities | ✓ | | | |
| Assign faculty/mentor to a venture | ✓ | | | |
| Submit work and upload evidence | | ✓ | | |
| File a faculty review | | | ✓ (if assigned) | |
| File a mentor review | | | | ✓ (if assigned) |
| View reports | ✓ | own only | assigned only | assigned only |

---

## Known limitations

- **Attendance is recorded but not required.** No rule anywhere depends on it, because the
  mandatory-attendance policy was not finalised.
- **A student stuck at `MAX_ATTEMPTS_REACHED` blocks their own progression** until an admin raises
  `maxAttempts` on that activity. `maxAttempts` is a property of the activity, so raising it
  applies programme-wide — there is no per-student override.
- **Support activity records carry no attempt limit or dual review**, since several of the eight
  are participation records rather than graded submissions.
- **Activity date windows are advisory.** A submission outside the window is accepted and the
  window state is surfaced in the UI; nothing blocks on it.
- **Imports are not transactional across rows.** Each row commits independently, so a partially
  successful import leaves the successful rows in place. This is deliberate — the alternative
  discards good rows because of one bad one — but it means a failed import needs the report read,
  not just a retry.
- **Import accepts CSV only.** An .xlsx upload must be saved as CSV first; the template download
  and the round-trip export both produce CSV.
- **Exports are generated synchronously** and capped at 5,000 rows for the attempt and review-log
  reports. A cohort large enough to exceed that needs a background job and a download link.
- **Rate limiting is per-account**, stored on the user document. It does not limit an attacker
  spraying many different addresses from one IP; put a WAF or edge rate limit in front in
  production.
- **The theme preference is per-browser, not per-account.** It lives in `localStorage`, so a user
  who signs in on a second machine starts from their system setting again. Storing it on the user
  document would fix that at the cost of a write on every toggle.
- **The navigation rail is deep XLRI navy in both themes** rather than inverting with the rest of
  the UI. That is a deliberate institutional choice — it anchors the brand and keeps the mark on a
  constant backdrop — but it does mean the rail is not "light" in light mode.
- **The PDF logo depends on the artwork's winding directions.** A future revision of the mark whose
  letter counters wind the same way as their outlines would fill solid, because pdf-lib offers no
  even-odd fill. `tests/branding.test.ts` fails loudly if that ever changes.
- **The colour-contrast tests measure tokens, not rendered pixels.** They cannot see a component
  that puts `text-muted-foreground` on an unexpected background, or text over an image.

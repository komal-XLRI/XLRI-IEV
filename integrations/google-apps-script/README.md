# Mentor feedback: Google Forms → IEV portal

Each stage (venture activity) has its own Google Form. Mentors reach it by
scanning a presentation's QR, which opens the portal at
`/feedback/<token>`. The portal checks the presentation is received and sends
the mentor to the stage's form with the presentation already identified. When
the mentor submits, `iev-mentor-feedback.gs` forwards the response to the
portal, which stores it against that exact presentation.

```
QR → /feedback/<token> → (checks) → stage's Google Form
   → onFormSubmit (Apps Script) → POST /api/integrations/google-forms/feedback
   → MongoDB → admin & student pages
```

## One-time: the portal

1. Generate a secret:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
2. In the portal's environment (`.env.local` / hosting settings) set:
   - `FEEDBACK_WEBHOOK_SECRET` — the value above
   - `APP_URL` — the public address, e.g. `https://iev.xlri.ac.in` (must open on
     a phone; a `localhost` QR will not work)
3. Restart the portal.

## Per stage: the Google Form

Do this for each stage's form. Nothing in the portal's code changes per stage.

1. **Add the ID question.** Add a *Short answer* question titled exactly
   **`IEV Presentation ID (do not edit)`**. Make it required. You can put it
   last and add the description "Filled in automatically — please leave as is".
2. *(Optional)* Add short-answer questions for Student/Team, Venture and
   Stage so the mentor sees who they are reviewing.
3. **Collect emails.** Settings → Responses → *Collect email addresses* →
   **Verified** (mentors sign in with Google) or **Responder input**. This is
   how a second submission from the same mentor replaces their first instead
   of counting twice. Without it, every response counts separately.
4. **Allow mentors to respond.** Settings → Responses → if the form is
   restricted to XLRI users, mentors outside the domain cannot open it.
5. *(Optional)* Settings → Responses → *Allow response editing*. Edits are
   re-sent and update the stored feedback in place.
6. *(Optional, for your records)* Responses → *Link to Sheets*. The portal does
   not need the sheet; it is only Google's own copy.
7. **Get the pre-filled link.** Form editor → ⋮ → *Get pre-filled link*.
   Answer:
   - `IEV Presentation ID (do not edit)` → `{{IEV_TOKEN}}`
   - Student/Team → `{{IEV_STUDENT}}` *(optional)*
   - Venture → `{{IEV_VENTURE}}` *(optional)*
   - Stage → `{{IEV_STAGE}}` *(optional)*
   - Presentation date → `{{IEV_DATE}}` *(optional)*

   Click *Get link* → *Copy link*. It must be the long
   `https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry…` link, not a
   `forms.gle` short link.
8. **Configure the stage in the portal.** Admin → Venture activities → open the
   stage → *Mentor feedback form*: paste the link, set *Feedback responses
   required*, tick *Accept feedback for this stage*, save.

## Per stage: the Apps Script

1. In the **Form** editor (not the Sheet): ⋮ → *Script editor* (or
   Extensions → Apps Script).
2. Replace `Code.gs` with the contents of `iev-mentor-feedback.gs`. Save.
3. ⚙ Project Settings → *Script properties* → add:
   - `IEV_FEEDBACK_URL` = `https://<portal>/api/integrations/google-forms/feedback`
   - `IEV_FEEDBACK_SECRET` = the same value as `FEEDBACK_WEBHOOK_SECRET`
   - `IEV_MENTOR_NAME_QUESTION` *(optional)* = exact title of your "mentor name"
     question, if it is not something like "Your name" / "Mentor name"
4. Select the `setup` function → *Run* → accept the permissions (form access,
   external requests, triggers). This installs:
   - an **On form submit** trigger → `handleFormSubmit`
   - a **time-driven** trigger every 15 min → `retryQueued`
5. Select `testConnection` → *Run*. The execution log should say
   `Connection and signature OK.` (HTTP 404/422). HTTP 401 means the secret
   does not match; any other error usually means the URL is wrong.

The script never needs a web-app deployment: it only *calls* the portal.

## What the portal does with a response

| Situation | HTTP | Stored? |
|---|---|---|
| Valid, presentation received, form matches the stage | 200 | Yes |
| Same Google response id again (retry or edit) | 200 | Updated in place |
| Same mentor email, same presentation, new response | 200 | Yes; the earlier one is marked *superseded* and stops counting |
| Presentation not received (pending) | 409 | No |
| Form is not the one configured for that stage / stage form paused | 409 | No |
| Unknown or malformed presentation ID | 404 / 422 | No |
| Bad or missing signature, stale timestamp | 401 | No |
| Portal error | 5xx | No — the script queues it and retries every 15 min |

Every accepted or refused response (after the signature check) is written to
the `feedbacksynclogs` collection with a reason code, kept for 180 days. After
fixing a problem, run `resyncAll` in the script to re-send every response; it is
safe to repeat.

## Limits worth knowing

- Google Forms cannot lock a prefilled answer. A mentor *could* edit the
  presentation ID; the portal only accepts IDs it issued, for a received
  presentation, on that stage's own form.
- The ID question must keep a title starting with `IEV Presentation ID`.
- Changing which form a stage uses does not require reprinting QRs — the QR
  points at the portal, which looks the form up at scan time. Responses from
  the *old* form are refused once the stage points at the new one.

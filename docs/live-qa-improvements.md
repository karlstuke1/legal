# Live QA Improvement Notes

Date: 2026-05-28
Environment: https://legal-gamma-three.vercel.app

## Confirmed Working

- Production app loads and renders the landing page after the initial client spinner.
- Login with a confirmed Supabase test user works.
- First-run onboarding progresses into `/app/chat`.
- Supabase Edge Function CORS allows the Vercel production origin.
- Deep links now load through Vercel after adding the SPA rewrite. Direct navigation to `/app/chat` no longer returns `404 NOT_FOUND`.
- Direct production chat replay for `Was ist Mord nach § 75 StGB? Bitte mit Quellen.` returns HTTP 200 and streams successfully from OpenRouter `openai/gpt-5.5-20260423`.
- The chat stream emits a `source_map` before answer text. For the murder query it included verified RIS `NormDokument.wxe` entries for `§ 75 StGB` and `§ 5 StGB`.
- Live UI chat submission works end to end: thinking animation appears, quota decrements, answer renders, console has no app errors, and inline statute links point to exact RIS `NormDokument.wxe` URLs.
- The source sidebar no longer floods with repeated `Agent-Recherche 1` rows. Tool results are deduped and regrouped under the real provider (`RIS`).

## Fixed During This QA Pass

- Fixed OpenRouter/OpenAI 400s from replayed native tool call transcript IDs by flattening tool results into ordinary system context before the final GPT-5.5 call.
- Fixed internal Edge Function calls from `chat` to `retrieval`/`semantic-search` by forwarding the user's auth header plus anon key instead of using the service key.
- Normalized common Austrian criminal-law model wording (`öStGB`, `oeStGB`) to `StGB` for retrieval/tool calls.
- Added a fast exact RIS norm path for `exactNormOnly` retrieval requests. It still verifies the RIS `NormDokument.wxe` page, but avoids slow decomposition/reranking/enrichment for precise norm lookups.
- Added Vercel SPA fallback rewrites in `vercel.json`.
- Normalized/deduped `SourcesPanel` input so duplicated tool wrapper groups do not create repeated source rows.

## Improvement Candidates

- Initial page load briefly shows a nearly blank screen with only a spinner. This is functional, but a branded loading state would feel more polished.
- Landing page hero/product-preview text appears visually soft/low-contrast in the in-app browser screenshot, especially the grey headline line and preview card. Recheck contrast and blur/filter choices on production.
- After onboarding, two blocking overlays appear at the same time: the product tour modal and the confidentiality notice. This makes the first authenticated screen feel crowded and visually confusing. Prefer showing the confidentiality notice first, then starting the tour after it is acknowledged.
- Some onboarding button interactions were flaky through semantic browser automation even though the UI state was correct. This may be an automation/runtime quirk, but it is worth checking focus, disabled-state timing, and accessible names for repeated buttons like `Weiter`.
- Chat latency is still high for legal research with GPT-5.5 high reasoning. The successful live UI run took roughly 80-100 seconds from submit to final answer.
- Citation presentation is not purely `[Quelle N]` in the rendered UI. The final answer is post-processed into superscript-style footnotes (`¹`, `²`) and inline statute links. The links are correct, but this should be aligned with the canonical numbered-source architecture if `[Quelle N]` is still the desired visible format.
- The final answer can include legal context that is not directly represented as a source card, though the latest run handled unsupported verjährung cautiously by citing the retrieved `§ 57 StGB` source. Keep testing this with harder fabricated-citation cases.
- The source sidebar starts collapsed; users must expand `RIS` to see source titles such as `§ 75 Strafgesetzbuch`, `§ 5 Strafgesetzbuch`, and `§ 57 Strafgesetzbuch`. Consider auto-expanding when there are only a few verified sources.
- Browser viewport override did not take effect in this session: after setting `390x844` and reloading, `window.innerWidth` stayed `1440`. Mobile layout remains unverified from the in-app browser pass.
- The Browser automation environment could not type the `§` character directly because virtual clipboard support was unavailable. The UI was tested with `Paragraf 75 StGB`; the backend itself was separately tested with the exact `§ 75 StGB` query.

## Verification Run

- `deno check supabase/functions/retrieval/index.ts supabase/functions/chat/index.ts`
- `npx tsc --noEmit`
- `npm run build`
- `npm test`
- Live direct retrieval: `§ 75 StGB Mord` with `exactNormOnly: true` returned verified `§ 75 Strafgesetzbuch` in about 2 seconds.
- Live direct chat replay: HTTP 200, `source_map` emitted, no `KI-Fehler`.
- Live UI chat: submitted `Was ist Mord nach Paragraf 75 StGB? Bitte mit Quellen.`, answer rendered with exact RIS norm links and no console errors.

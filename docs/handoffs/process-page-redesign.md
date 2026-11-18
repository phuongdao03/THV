# Quy trình đề cử: handoff

- Route: `/process`. The page now uses an editorial introduction, a vertical
  five-stage timeline with native `<details>`, outcome branches, a compact FAQ
  and a final submission CTA. Native disclosure keeps keyboard behavior without
  client-side state or animation.
- Styling stays page-scoped in `frontend/src/app/globals.css` and inherits the
  existing `--theme-*` tokens. The preview release gate and existing routes
  remain intact.
- Per the latest request, public copy omits submission-fee, payment, voucher and
  waiver guidance. Keep that boundary unless the user asks to restore it.
- No API, authentication, dossier, payment, review, certificate or publication
  workflow changed.
- Verification: 26 focused frontend tests; root Prettier check; frontend lint
  and typecheck; production build. Browser checks at 320, 375, 390, 768, 1024
  and 1440 px found no horizontal overflow; light/dark themes, disclosures,
  anchor/back navigation, one H1/main landmark and console were checked.
- No real dossier or transaction was created. Browser checks used the local
  production build only.

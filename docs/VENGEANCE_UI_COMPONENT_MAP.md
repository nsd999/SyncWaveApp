# SyncWave Vengeance UI component selection

Design constraint: retain the existing BSNL SAHAJ/SKYC-inspired service-portal information architecture. Vengeance UI is an interaction layer, not a wholesale visual replacement. Prefer reduced motion, keyboard access, large touch targets, and stable media playback over decorative effects.

## Selected by surface

| Surface | Component pattern | Implementation status and rationale |
|---|---|---|
| Home Create/Join actions | Animated Button | **Implemented** in `components/ui/animated-button.tsx`, adapted to the existing `motion/react` dependency, reduced-motion preferences, native button semantics, and portal colors. Used for both primary homepage actions. |
| Landing-page help | FAQ Accordion | **Implemented** in `components/ui/faq-accordion.tsx` and mounted in the homepage. Includes keyboard-operable disclosure buttons, linked panel IDs, and practical answers about accounts, room codes, media support, and connection failures. |
| Main navigation | Spotlight Navbar or Mega Menu Navbar | Not added: the current portal has a small number of destinations; a spotlight/mega-menu would add complexity without helping users find the main Create/Join actions. |
| Room participant presence | Stacked Logos / Masked Avatars | Candidate only. Use real participant identities; avoid movement on every presence tick and do not invent avatars/counts. |
| Shared media player | Music Player | Not substituted. The existing room route owns playback behavior, and a separate `VideoPlayer` component contains placeholder handlers. Replacing the working route with a visual component risks breaking synchronization. |
| Media queue | Expandable Bento Grid / Highlight Grid | Candidate for later polish. Preserve queue order, current item, add/remove, and host-only actions; avoid card effects that obscure controls. |
| Live chat | Message/thread layout and accessible tooltip | Candidate for later polish. Composer, send failures, and moderation must remain connected to real handlers and keyboard/touch accessible. |
| Room status and errors | Kinetic Text Loader / Animated Tooltip sparingly | Use only with bounded timeouts, readable error recovery, and reduced-motion fallback. The health-aware status message remains the source of truth. |
| Feature overview | Glow Border Card / Expandable Bento Grid | Not applied to utility cards: persistent glow effects add visual noise to the SAHAJ/SKYC-inspired portal design. |
| Room invite and share | Share Sheet | Candidate only after the current copy/share actions are audited; preserve invite URL and explicit user permissions. |
| Authentication | Standard accessible form controls | Kept conventional. Login/signup errors and disabled states should not be hidden behind novelty motion. |
| Admin and diagnostics | Standard tables, filters, status indicators | Prefer clear data density and reliable operation over animated cards. |

## Implementation notes

- The Vengeance UI catalogue provides copy/paste or registry-installed source components; it is not a universal runtime library.
- The selected components are adapted to the app's existing stack instead of importing a second animation package.
- The service-portal palette and existing business logic are preserved. Decorative 3D carousels, cursor trails, shader backgrounds, and particle effects were intentionally excluded for mobile performance, accessibility, and clarity.
- Do not treat the UI work as end-to-end playback validation. The known Supabase health endpoint previously returned `SUPABASE_CONNECTION_FAILED`; real host/guest listening and watching still require a reachable database and a two-participant test.
- Verify the new Vercel build before treating these latest component changes as live.

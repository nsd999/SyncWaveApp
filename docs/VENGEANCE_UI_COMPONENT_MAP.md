# SyncWave Vengeance UI component selection

Design constraint: retain the existing BSNL SAHAJ/SKYC-inspired service-portal information architecture. Vengeance UI is an interaction layer, not a wholesale visual replacement. Prefer reduced motion, keyboard access, large touch targets, and stable media playback over decorative effects.

## Selected by surface

| Surface | Component pattern | Implementation guidance |
|---|---|---|
| Home Create/Join actions | Animated Button / Radial Glow Button | Keep both actions equally discoverable; current implementation uses a restrained CSS shine rather than a WebGL effect. |
| Main navigation | Spotlight Navbar or Mega Menu Navbar | Desktop only if it improves navigation; mobile keeps a compact header and clear primary actions. |
| Room participant presence | Stacked Logos / Masked Avatars | Use real participant identities only; avoid movement on every presence tick. |
| Shared media player | Music Player | Reuse synchronized player and controls; do not replace the playback engine. |
| Media queue | Expandable Bento Grid / Highlight Grid | Keep queue order, current item, add/remove, and host-only actions explicit. |
| Live chat | Search Modal / Animated Tooltip where appropriate | Never make controls hover-only; composer and message actions remain keyboard and touch accessible. |
| Room status and errors | Animated Tooltip / Kinetic Text Loader sparingly | Loading must have timeout/error recovery and a reduced-motion fallback. |
| Feature overview | Glow Border Card / Expandable Bento Grid | Keep content legible and avoid large motion on mobile. |
| Room invite and share | Share Sheet | Preserve invite URL and copy/share behavior; no new permissions without user action. |
| Authentication | Standard accessible form controls | Avoid novelty motion for login/signup, errors, and password controls. |
| Admin and diagnostics | Standard tables, filters, status badges | Prioritize data density and reliable operation over animated cards. |

## Implemented in this pass

- Added a lightweight Vengeance-inspired interaction layer (`sw-motion-cta`, `sw-motion-card`) using CSS only.
- Applied the CTA treatment to homepage Create Room and Join Room.
- Preserved focus-visible styling and disabled transition effects for reduced-motion users.
- Kept existing media/player behavior and portal palette intact.

## Integration note

The catalogue components are copy/paste or registry-installed source components, not a universal runtime library. Before adopting the animated player, spotlight navigation, 3D carousel, shader backgrounds, or interactive particles, verify source, dependency footprint, keyboard support, mobile behavior, and reduced-motion support. Do not install a component into production solely by name. Keep room state, realtime sync, and Supabase access logic outside presentational components.
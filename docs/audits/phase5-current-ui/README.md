# Phase 5 current UI audit — 2026-07-11

## Scope

Mobile viewport `390 × 844`, covering persona selection → room creation → agent calling → generation → completed turn.

## Flow evidence

1. **Persona selection — usable, overloaded.** `01-home.png` shows all 16 personas at once. Identity hooks are useful, but the primary decision is buried in a long two-column catalogue; selection count and the three-agent limit are not explained near the action.
2. **Selection state — functional, weak confirmation.** `02-selection.png` changes card tint and the bottom CTA. The selected roster is not summarized as a coherent room, and the sticky action appears only after a long scroll.
3. **Empty room — functional, low discoverability.** `03-empty-room.png` has a clear composer, but calling and pausing are hidden behind single/double-click instructions. Invite and remove are absent.
4. **Called agent — understandable after discovery.** `04-called-room.png` adds a call chip and composer copy, but the header chip does too many jobs and has no explicit menu or status affordance.
5. **Generation — recoverable but visually ambiguous.** `05-generating.png` exposes Stop, yet there is no step/status language for Director selection versus Persona response, and the stream has no stable skeleton or reserved layout.
6. **Completed turn — readable, no learning loop.** `06-completed-turn.png` distinguishes speakers and speech type, but individual utterances lack feedback, retry, or alternate-agent actions; long messages dominate the viewport.

## Highest-impact Phase 5 changes

- Replace hidden header gestures with an explicit room-member control surface for call, pause/resume, invite, and remove.
- Make each Persona utterance an actionable object with restrained feedback and a compact overflow menu.
- Give generation and failure states one stable status row with Stop/Retry/Refresh actions.
- Keep the existing warm neutral palette and restrained green accent, while improving hierarchy rather than adding decorative surfaces.
- Add visible focus styles, 44px touch targets, explicit button labels, `aria-live` status, and non-color-only selected/paused states.

## Evidence limits

- Screenshot inspection cannot establish keyboard order, screen-reader announcements, contrast ratios, or reduced-motion behavior; these require browser and automated checks during implementation.
- The browser capture showed transient black compositing in the transparent message region while streaming. Computed page backgrounds remained the expected warm neutral, so implementation QA must verify this again after the layout receives an explicit room surface background.

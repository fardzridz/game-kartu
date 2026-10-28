---
name: REBAS
description: Responsive multiplayer card game interface combining dark slate table aesthetics, squircle character pods, tactile physical playing cards, and glassmorphic HUD bars.
colors:
  primary: "#2ECC71"
  secondary: "#F5A623"
  tertiary: "#3B426B"
  background: "#252A4A"
  surface: "rgba(59, 66, 107, 0.65)"
  card-surface: "#FFFFFF"
  text-primary: "#FFFFFF"
  text-secondary: "#8E96C7"
  border: "rgba(255, 255, 255, 0.12)"
  success: "#2ECC71"
  warning: "#F5A623"
  error: "#E53935"
typography:
  h1:
    fontFamily: "'Rubik', 'Plus Jakarta Sans', sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.5rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "'Rubik', 'Plus Jakarta Sans', sans-serif"
    fontSize: "clamp(0.85rem, 1.2vw, 1rem)"
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: "'Rubik', 'Plus Jakarta Sans', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  label-sm:
    fontFamily: "'Rubik', 'Plus Jakarta Sans', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 22px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  avatar-pod:
    size: "clamp(54px, 5.5vw, 68px)"
    rounded: "{rounded.xl}"
    activeRing: "3.5px solid #2ECC71"
    waitingRing: "3.5px solid #E53935"
  playing-card:
    backgroundColor: "{colors.card-surface}"
    rounded: "10px"
    shadow: "0 8px 20px rgba(0, 0, 0, 0.45)"
    aspectRatio: "5 / 7"
  bottom-dock:
    backgroundColor: "rgba(45, 52, 88, 0.72)"
    backdropFilter: "blur(16px)"
    borderTop: "1px solid rgba(255, 255, 255, 0.12)"
---

## Rules to Never Break
1. **Zero Emoji & Zero External Icon Font Policy:** Never render Unicode emojis or icon fonts. Every suit, court card illustration, and HUD icon must be an inline `<svg>`; player avatars are the pixel-art portraits in `/public/avatars`.
2. **Proportional Card Anatomy:** Never place a single giant oversized suit symbol in the middle of number cards (2–10) or court cards (J, Q, K). Number cards must use accurate multi-pip grids; J/Q/K must use custom vector character illustrations; only Aces (`A`) feature a signature center emblem.
3. **Fanned Hand Arc:** Player hand cards (`6♠`, `Q♦`, `Q♥`) must always fan out in an organic radial arc (`rotate(-8deg)` to `rotate(8deg)`) with overlap, rising `18px` when clicked/selected.
4. **No Avatar-Panel Collisions:** Opponent avatar pods (`Bot 2`, `Bot 3`) must sit in dedicated grid tracks with a minimum `16px` clearance from the center discard zone and meld zone.
5. **Exclusive Avatars:** Each avatar portrait (`/avatars/*.png`) belongs to exactly one seat. Taken avatars stay visible but locked (grayscale + lock icon); the engine rejects a `sit` intent that would duplicate an avatar.

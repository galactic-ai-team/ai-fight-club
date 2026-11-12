# Art & Asset Manifest (`docs/ART.md`)

All character sprites, pixel portraits, stage backgrounds, and HUD/leaderboard stylesheets in `ai-fight-club` are **100% original works** authored specifically for this repository.

* **Independence & Non-Affiliation:** This project is an independent AI-vs-AI spectator arena and is **not** affiliated with, endorsed by, or derived from Capcom or *Street Fighter*. No lookalike sprites, proprietary move names (no Hadoken), paid asset packs, or secret tokens are included.

## Asset & License Table

| File / Asset | Description | Author | License |
| :--- | :--- | :--- | :--- |
| `src/spectator/pixelArt.ts` (`ion`) | Original 16x18 procedural pixel-art sprite matrices & 12x12 portrait for **Ion** (Plasma Coil Strider) | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/pixelArt.ts` (`quark`) | Original 16x18 procedural pixel-art sprite matrices & 12x12 portrait for **Quark** (Quantum Collider Construct) | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/pixelArt.ts` (`vexel`) | Original 16x18 procedural pixel-art sprite matrices & 12x12 portrait for **Vexel** (Polyhedral Tensor Weaver) | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/pixelArt.ts` (`cadence9`) | Original 16x18 procedural pixel-art sprite matrices & 12x12 portrait for **Cadence-9** (Acoustic Percussion Mech) | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/pixelArt.ts` (`drawArenaBackdrop`) | Original cyber-grid arena stage renderer with engine-tick parallax towers | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/leaderboardUi.ts` | Live Elo standings panel & `/leaderboard` view with FLIP rank animations, `+/-` Elo delta pills, W-L bars, and streak badges | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
| `src/spectator/spectator.css` | Dark arcade HUD, stage viewport, and 375px-verified responsive layout | Gemini (`galactic-ai-team`) | `CC0-1.0` / `MIT` |
## Integration notes (Lumi)

Wired into the M0 spectator shell (`index.html`, `src/main.ts`, `src/render/canvas.ts`) without replacing those entry points:

- Fighters are drawn in engine stage space (960×540, feet on `GROUND_Y`) so a device-pixel-ratio canvas transform stays aligned.
- `#leaderboard-root` hosts the Elo standings panel. The adapter in `leaderboardUi.ts` accepts draft PR #1's `{ version, entries }` model (rating, W-L-D, streak, lastDelta) and sorts rating desc, id asc. When PR #1's `bootLeaderboard()` is present, `mountSpectatorArtBoard({ getTable })` paints these visuals into `.afc-lb-table` and should be refreshed after `recordMatch`.

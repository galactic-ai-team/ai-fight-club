# Engine frame data (M1, 60 ticks/second)

All values below are in fixed 60 Hz ticks, integer pixels, and health points. No move damage or timings are changed by this hardening pass.

| Move | Startup | Active | Recovery | Damage | Block chip | Hitstun | Blockstun | Range (px) | Meter cost | Knockback (px/tick) | Launch vy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Light | 4 | 3 | 8 | 40 | 8 | 10 | 6 | 36 | 0 | 3 | 0 |
| Heavy | 10 | 4 | 16 | 80 | 16 | 16 | 10 | 50 | 0 | 6 | 0 |
| Special (melee burst) | 12 | 6 | 20 | 120 | 24 | 20 | 12 | 78 | 50 | 10 | -8 |

- Starting an attack places it at `attackT = 0` (first startup tick). On following ticks the counter increases; an attack becomes active when `attackT >= startup`, recovery starts when `attackT >= startup + active`, and it finishes at `startup + active + recovery`. An active hitbox can connect **once** per attack; it cannot hit repeatedly each active frame.
- Both attack connections are detected before either fighter takes damage. If both hitboxes overlap on the same tick, both hits resolve as a trade, even if the first hit puts the other fighter in hitstun or causes a double KO.
- Grounded guard only blocks strikes from the front. A blocked hit inflicts chip damage and blockstun, **not hitstun**. Specials fail when meter is under 50.
- Walking speed is 4 px/tick, initial jump velocity -16 px/tick, gravity +1 px/tick², fall capped at +18. Stage width is 960 px; fighters are 48×96 px standing or 48×60 crouched.
- Round time: 3,600 ticks (60 s); round-end linger: 120 ticks; first to two wins, with at most five rounds. Equal-health timeout is a draw with no round win. Meter carries across rounds.
- `serializeMatchState`/`restoreMatchState` are versioned **snapshots**, independent of replay version 1 and bot protocol `afc-obs-v0`. They include complete event history and can resume at the next tick. `canonicalState` includes all engine state fields using stable key ordering; `stateHash` is its compact FNV-1a checksum, not a security hash.

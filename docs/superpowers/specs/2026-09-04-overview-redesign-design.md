# Overview redesign

2026-09-04

Bottleneck answers one question: what is closest to its limit, and what is
doing it. Today's panel answers the first half with a ranked list of
percentages and hides the second half behind Full details. This redesign puts
the answer in a sentence, encodes proximity where it can be read at a glance,
and lets the panel say less when there is less to say.

## Scope

In scope: the bar cell, and the compact overview inside the dropdown panel.

Out of scope: the Full details section (spikes, top processes, CPU cores,
memory, storage). It keeps its current markup and behaviour and will be planned
separately. Sampling, ranking, and anomaly detection are unchanged — this is a
presentation change over data `Service.qml` already produces.

## The one rule

`calmThreshold` (default 40) governs both colour and inclusion. Anything worth
colouring is worth listing; anything below it is neither. There is no second
threshold to configure or explain.

| Band | Pressure | Colour | In summary |
|---|---|---|---|
| calm | under `calmThreshold` | neutral (`muted`) | no |
| loaded | `calmThreshold`–79 | theme `yellow` | yes |
| strained | 80+ | theme `orange` | yes |
| alarm | anomalous | theme `red` | yes |

A machine with nothing under pressure renders with no colour at all, so a
single coloured bar is unmissable. Colour marks deviation, not category.

### Conditions are exempt

Resources with `ranks: false` (CPU temp, GPU temp, disk space) are not measured
against `calmThreshold` — a 45 °C CPU is 0.45 pressure and entirely
unremarkable. Conditions enter the overview only when `detectAnomalies` flags
them, at which point they render in the alarm band. Non-anomalous conditions
stay in Full details.

## Colour source

The shell's `Color` singleton exposes five tokens (`foreground`, `background`,
`accent`, `urgent`, `muted`) — not enough for a four-step ramp, and on the
stock theme `accent` and `foreground` are the same value.

`lib/Theme.js` parses the active theme's `colors.toml` for named hues. The file
is flat `key = "#rrggbb"` pairs, most of them carrying a trailing `# comment` —
shipped themes annotate nearly every colour, so a parser that anchors the value
to end-of-line finds almost nothing. Anything whose value is not a plain hex
string is skipped rather than guessed at, which keeps `mode = "dark"` and the
`rgba(...) ... 45deg` border gradients out of the palette.

```
~/.local/state/omarchy/current/theme/colors.toml
```

| Band | Read from `colors.toml` | Fallback |
|---|---|---|
| calm | — | `Color.muted` |
| loaded | `yellow` | `Color.accent` |
| strained | `orange` | `Color.accent` |
| alarm | — | `Color.urgent` |

Only two keys are parsed. `Color.loadColors` already assigns the theme's `red`
to `Color.urgent`, so the alarm band takes it from the singleton rather than
re-reading it — which also guarantees an alarm here is the same red the rest of
the shell uses. `yellow` and `orange` are the only hues the singleton drops.

Fallback is per key, not all-or-nothing: a theme defining `yellow` but not
`orange` keeps its own yellow and falls back only for strained. With no
readable file the ramp degrades to a three-step `muted` / `accent` / `urgent`,
legible on every theme including the stock one.

`Service.qml` reads the file through its own `FileView` with `watchChanges`.
The shell's own `colorsFile` sets `watchChanges: false` and depends on a theme
switch pushing the payload over shell IPC, which plugins do not receive — so
watching the file directly is what makes a theme switch recolour both surfaces
without restarting the shell.

## Panel layout

Two densities of one overview. Full details remains a separate tier below both.

### Summary (default)

```
Chrome is pinning your P-cores
about 90% of the CPU in use, climbing for 16s          50%

  ╭──────────────────────────────────────────╮
  │   constraint history, ~2 min             │
  ╰──────────────────────────────────────────╯
──────────────────────────────────────────────────────────
Everything else has room.
RAM is next at 31%.                     Show all seven ⌄
──────────────────────────────────────────────────────────
                    Full details ⌄
```

The summary lists the constraint plus every other contended resource at or
above `calmThreshold`, plus any anomalous condition. Everything below the
threshold collapses into two sentences: a statement, and the next-highest
resource named with its value.

This makes the density adaptive by construction. When one resource is busy and
nothing competes, the summary is the constraint alone. When four resources heat
up, four rows appear on their own. No separate auto-expand trigger and no state
machine — the inclusion rule already does that work.

### All

Every contended resource as a row, ordered by pressure, calm ones included and
rendered neutral. Non-anomalous conditions stay out of both densities — they
are health checks, not things competing to be the constraint, and they remain
in Full details.

The inline control reads `Show all <n> ⌄`, where `n` is the number of contended
resources in the ranking, so the label states what it will do rather than how
many rows are hidden. Returning is `⌃ Show less`.

```
Chrome is pinning your P-cores
about 90% of the CPU in use, climbing for 16s          50%

  ╭──────────────────────────────────────────╮
  │   constraint history, ~2 min             │
  ╰──────────────────────────────────────────╯
──────────────────────────────────────────────────────────
  P-cores   ████████░░░░░░░░   50%
  RAM       █████░░░░░░░░░░░   31%
  VRAM      ███░░░░░░░░░░░░░   22%
  GPU       █░░░░░░░░░░░░░░░    6%
  E-cores   ░░░░░░░░░░░░░░░░    2%
  Swap      ░░░░░░░░░░░░░░░░    1%
  Disk I/O  ░░░░░░░░░░░░░░░░    0%
                                          ⌃ Show less
──────────────────────────────────────────────────────────
                    Full details ⌄
```

### Density state

The mode is held on `Service.qml`, which is `keepLoaded`, so it survives the
panel closing and reopening for the life of the shell. It is not written to
disk. A new `overviewDensity` setting (`"summary"` | `"all"`, default
`"summary"`) supplies the starting value.

The mode changes only on click. Within summary, rows follow the data live, but
a row that has appeared stays until the panel closes — rows may be added while
open, never removed. That surfaces a new problem immediately without the list
flickering as a value oscillates across the threshold.

## Marks

Three graphic forms, each answering a different question.

| Mark | Where | Question it answers |
|---|---|---|
| sparkline | bar cell | is this moving? |
| sparkline | panel hero | how did we get here? |
| fill track | panel rows | how close to the limit? |

`components/Sparkline.qml` keeps its current fill-and-stroke rendering and gains
nothing but the band tint. Its faint baseline track is removed in the hero,
where the sparkline is large enough to read without one.

`components/PressureTrack.qml` is new: a rounded track with a proportional fill,
band-coloured, with the fill clamped to `[0, 1]`. At pressures under a few
percent the fill is drawn at zero width rather than a one-pixel sliver, so an
idle resource reads as empty rather than as a dot.

## The verdict

The hero is the only element at heading size and the only place the design
takes a risk. Everything around it stays plain so the sentence carries.

### Shape

```
<verdict>                                    <display>
<attribution clause>, <trend> for <duration>
```

This shape is the non-alarm form. `duration` is how long the *constraint* has
held its position — `svc.since`, already tracked — and it never appears on the
alarm row below: an alarm can start on a resource that has been sitting well
under the constraint for hours, and `since` measures the constraint's tenure,
not the alarm's, so borrowing it there would be a fabricated claim.

`trend` reads the constraint's last 30 history samples (about a minute at the
default interval) and compares the mean of the newer 15 against the mean of the
older 15. A difference inside ±3 percentage points is `steady`; above is
`climbing`, below is `easing`. The deadband matters: without it the word flips
on every sample and the sentence becomes noise. Fewer than 30 samples available
yields `steady`.

Shares in the attribution clause are rounded to the nearest 5% and always
prefixed `about`, because the underlying figure does not deserve more precision
than that.

### Attribution

A process is named only when one earns it. Confidence is the top aggregated
process name's share of the summed metric **within the same `ps` sample**:

```
share = topName.metric / Σ(metric across the sample)
```

The ratio stays inside one metric deliberately. `ps %cpu` is a lifetime average
scaled to a single core, so comparing it against system-wide busy percent would
mix two incompatible numbers — a process reported at "98%" may be holding one
core of sixteen. A share computed within the sample is sound regardless.

Naming requires `share >= 0.5`. Below that the sentence changes shape rather
than inventing a culprit.

| Constraint | Metric | Source |
|---|---|---|
| `pcore`, `ecore` | `cpuPct` | `ps` sorted by `pcpu` |
| `ram` | `memPct` | `ps` sorted by `pmem` |
| `gpu` | `smPct` | `nvidia-smi pmon` |
| `vram` | `memPct` | `nvidia-smi pmon` |
| `swap`, `diskio` | — | none available |

`ps` is sampled for the constraint's own dimension, independent of which tab
the Full details process list is showing. Swap and disk I/O have no per-process
attribution available from these sources, so they are descriptive by
construction rather than by fallback.

### Copy

| Case | Verdict | Attribution clause |
|---|---|---|
| named, CPU | `Chrome is pinning your P-cores` | `about 90% of the CPU in use` |
| named, memory | `Chrome is holding your RAM` | `about 60% of what's in use` |
| named, GPU | `blender is driving your GPU` | `about 80% of GPU time` |
| diffuse | `P-cores are busy across 20 processes` | `no single cause` |
| not attributable | `Disk I/O is your tightest resource` | `steady for 2m10s` |
| alarm | `Your CPU is running hot` | `at 91°C` |
| idle | `Nothing is holding you back` | `P-cores are closest, at 12%` |

The two collapsed sentences beneath the rule:

| Case | Sentence | Second line |
|---|---|---|
| some resources listed above | `Everything else has room.` | `<next> is next at <n>%.` |
| nothing above the threshold | `All <n> resources have room.` | — |
| only one resource left below | `<name> is the only other one, at <n>%.` | — |

Sentence case, active voice, no middle-dot meta strings, no trailing arrows.
The verb varies by resource (`pinning`, `holding`, `driving`, `saturating`) and
lives in a table in `lib/Verdict.js`, not scattered through QML.

## Bar cell

Structure is unchanged: sparkline, glyph, percentage, laid out by the existing
`Grid` that flips for vertical bars. The glyph stays the constraint's own icon,
so the cell names the resource without spending pixels on a label.

What changes is `tone`: currently a three-way branch on `widgetState` with an
opacity reduction for calm. It becomes the band colour. The tooltip keeps its
current content.

Calm is the one place the two surfaces deliberately differ. In the panel it is
`Color.muted`, which sits on the panel's own background. In the bar it stays
the current dimmed foreground (`barForeground` at 0.55 alpha), because the bar
is drawn over the user's wallpaper and `muted` is not reliably legible there.
Both read as "quiet"; only the mechanism differs.

## Files

**New**

- `lib/Theme.js` — parse `colors.toml`, map band to hue, per-key fallback
- `lib/Verdict.js` — trend, attribution confidence, sentence assembly
- `components/PressureTrack.qml` — proportional band-coloured fill track
- `components/Overview.qml` — hero, summary/all rows, inline control
- `test/theme.test.js`, `test/verdict.test.js`
- `test/fixtures/colors-full.toml`, `test/fixtures/colors-nohues.toml`

**Changed**

- `Service.qml` — watched `FileView` on `colors.toml`; `themePalette`;
  constraint-dimension `ps` sampling; `overviewDensity` state
- `Panel.qml` — compact section replaced by `Overview.qml`; Full details
  untouched
- `BarWidget.qml` — band tint
- `manifest.json` — `overviewDensity` setting and schema entry
- `README.md` — bar states table, settings table, a note on theme colours

Extracting `Overview.qml` keeps `Panel.qml` from growing past 800 lines while
its Full details half is still pending its own redesign.

## Degradation

| Condition | Behaviour |
|---|---|
| `colors.toml` missing or unreadable | three-step `muted` / `accent` / `urgent` ramp |
| theme defines some hues | per-key fallback, others still themed |
| `ps` returns nothing | descriptive verdict, no name |
| no GPU backend | GPU and VRAM absent from ranking, as today |
| constraint is swap or disk I/O | descriptive verdict by construction |
| no constraint at all | idle verdict, summary density |

Nothing in this design can fail into a blank panel or a fabricated claim.

## Testing

`lib/Theme.js` and `lib/Verdict.js` are pure JavaScript with no Qt types,
matching the existing `lib/` convention, and are covered by `node --test test/`
alongside the current nine suites.

- **Theme**: full palette, partial palette, absent file, malformed lines,
  non-hex values, band-to-hue mapping at each boundary
- **Verdict**: dominant process, diffuse load, empty process list,
  non-attributable constraint, each trend direction, boundary at `share = 0.5`,
  idle, anomaly

QML has no unit harness here; the panel and bar cell are verified by running
the shell against a live machine and by exercising the bands with adjusted
thresholds.

## What this is not

It is not a dashboard. `jharrison.sysmonitor` occupies that ground with a
1180×900 keyboard-driven window, and competing on density would mean losing on
the one axis Bottleneck is built to win: at idle, a dashboard shows forty
numbers that all say "fine", and this panel shows one sentence that says it
once.

# Full details redesign

2026-09-04

The overview redesign gave the panel a verdict: what is limiting the machine
and what is doing it. Full details did not change, so the panel now has two
halves speaking different languages — sentences and pressure tracks above, tabs
and grids and middle-dot meta strings below. Opening it feels like leaving the
plugin.

This redesign gives Full details one job it can state in a sentence: **where
you stand right now, who is using it, and whether this has happened before.**

## Scope

In scope: the Full details section of `Panel.qml`, and the small amount of new
sampling it needs.

Out of scope: the compact overview, the bar cell, ranking, anomaly detection,
and the pressure-band colour system. All of those shipped in the overview
redesign and are unchanged here.

## Three zones

Full details becomes three labelled zones beneath the unchanged verdict hero,
in the order a person actually asks the questions.

```
Chrome is pinning your P-cores
about 90% of the CPU in use, climbing for 16s          50%
──────────────────────────────────────────────────────────
Now
  CPU    Core i9-11900K                            46°C
         P-cores ████████░░░░  50%   E-cores ░░  2%
  GPU    RTX 4070 Ti                               42 W
         VRAM 1.1 of 16.0 GB                       50°C
  RAM    12.6 of 31.1 GB              swap 0 of 62.3 GB
  Disk   130 of 930 GB on /                    3 others

Using it now, by cpu
  chrome            38% cpu                       2.1 GB
  code              12% cpu                       1.4 GB

Recently
  4m ago   P-cores hit 84%
           chrome 210%, code 46%
  22m ago  Disk I/O hit 97%
           dockerd 88%
──────────────────────────────────────────────────────────
                    ⌃ Less
```

Section headings are sentence case, not the shell's `SectionHeader` rule-and-
label treatment — this panel already has enough horizontal lines.

### Now

One row group per resource, carrying identity and **real units**. A percentage
is a ratio; capacity decisions need the numerator. `RAM 31%` does not tell you
whether another VM fits, and `12.6 of 31.1 GB` does.

| Resource | Line 1 | Line 2 |
|---|---|---|
| CPU | model name, CPU temp right-aligned | P-core and E-core tracks with percentages |
| GPU | identity, power draw, right-aligned | VRAM used of total, GPU temp right-aligned |
| RAM | used of total | swap used of total, right-aligned |
| Disk | fullest filesystem, used of total, with its mount | count of remaining filesystems |

The GPU group is omitted entirely when `gpuBackend` is `"none"`, as today. The
E-core track is omitted on a non-hybrid chip, where `coreClasses.e` is empty.
The swap figure is omitted when `swapTotal` is zero. Power draw renders alone,
with no cap beside it: `power.limit` is nvidia-only, so a denominator would
appear for some cards and not others, and querying it would force a CSV field
reorder that breaks `parseNvidiaCsv`'s "name is the remainder" design.

Disk shows the **fullest** filesystem rather than every mount. Listing all of
them is the sub-resource inventory this redesign is removing; naming the one
closest to full is the same editorial judgement the overview's ranking makes.

### Using it now

Processes ranked by the metric that is currently constraining the machine,
consuming `Service.qml`'s existing `attributionList` and `attributionKey` —
the same data the verdict already uses. When the constraint has no per-process
source (swap, disk I/O), the zone falls back to CPU.

Rows show name, the leading metric, and the secondary metric right-aligned.
The leading metric is whichever the zone is sorted by, so the columns swap when
the sort does.

**The override.** The heading reads `Using it now, by cpu`, where `by cpu` is an
interactive token — accent-tinted, underlined on hover, with a pointing cursor —
not prose. Clicking it cycles the sort through `cpu → mem → gpu → cpu`, skipping
`gpu` when `gpuBackend` is `"none"`.

Discoverability is the known weakness of a heading-as-control, accepted
deliberately over a row of pills. Styling the token as interactive rather than
hiding it in the sentence is the mitigation: it must *look* clickable without
costing the chrome a pill row would.

The override lives in a new `procSortOverride` property on `Service.qml`, empty
by default. Empty means "follow the constraint". It resets to empty when the
panel closes, so following the constraint is the state you return to — the
override is for the investigation you are in the middle of, not a preference.

The existing `procSort` property and its `CPU`/`MEM`/`GPU` pill row are deleted.

### Recently

The spike log, promoted from the last thing on the page to a peer of the other
two zones. `Service.qml` already records what crossed `spikeThreshold`, when,
and which processes were responsible **at that instant**, running whether or not
the panel is open. It is the strongest evidence this plugin holds and it is
currently below the fold.

Each entry is two lines: age with what spiked and to what value, then the
captured culprits beneath. At most six entries render; the service keeps its
existing twelve, so scrolling back is a later concern rather than a lost one.

Empty state: `Nothing has crossed 70% yet`, using the configured threshold.

## What is deleted

| Removed | Why |
|---|---|
| The per-core grid (one row per physical core) | Sub-resource breakdown. On a 16-core machine it is sixteen near-identical bars answering "which core", a question almost nobody has. |
| The multi-sensor thermal list | Same. CPU and GPU temperature survive, on their own resource rows. |
| `CPU` / `MEM` / `GPU` pills | Replaced by the heading token. ALL-CAPS labels also violate the copy rules the overview established. |
| Middle-dot meta strings | `12.6 GB of 31.1 GB RAM   ·   0 B of 62.3 GB swap` is a data strip, not language. |
| The `Memory` and `Storage` headings | Both fold into the Now zone as rows. Five headings become three. |

### Deleting the grid orphans a whole sampling chain

The per-core grid is `coreStats`'s only consumer anywhere — `Panel.qml:263`,
and nothing else in the repo reads it. Removing the grid therefore strands the
entire chain that produces it, and that chain **spawns a subprocess on every
detail tick**. Leaving it would mean shipping a `Process` that runs while the
panel is open to fill a property nobody reads.

Remove, from `Service.qml`:

- `physicalCores`, `coreStats`, `coreTemps`, `coreTempMap`, `coreTempDir`
- the `coreTempCommand` string builder and `refreshCoreStats()`
- the `topoProc` and `coreTempProc` `Process` declarations
- the `refreshCoreStats` call inside `sample()`, and the `coreTempProc` trigger
  inside `detailTick`

**Keep** `coreClasses`. It looks like part of the same chain and is not:
`sample()` reads `coreClasses.p` and `coreClasses.e` to compute the P-core and
E-core percentages that the ranking — and therefore the whole plugin — depends
on. Deleting it breaks everything. `discoverProc`, which populates it, stays for
the same reason.

**Keep** `tempDetect` and `tempFile`, but drop their `coreTempDir` and
`coreTempMap` assignments. That process also resolves the coretemp package
sensor behind `cpuTempC`, which is the CPU temperature the Now zone displays.

Three `lib/Proc.js` helpers lose their only callers with the chain —
`parseCoreTopology` and `groupPhysicalCores` (`Service.qml:118-119`) and
`parseCoretempMap` (`Service.qml:155`). Delete them, and the four cases in
`test/proc-detail.test.js` that cover them. A tested function nothing can reach
is still dead code, and keeping it implies a consumer that does not exist.

That file's other three cases — `parsePsList`, `parsePmon`, `aggregateByName` —
are the process-attribution core that both the verdict and the Using-it-now zone
depend on. They stay.

## New sampling

This redesign adds exactly two facts.

**CPU model.** `lib/Hardware.js` parses the first `model name` line out of
`/proc/cpuinfo`. Read once at startup by a one-shot `Process`, alongside the
existing topology discovery — the model cannot change at runtime.

**GPU name, where it is free.** `nvidia-smi` already accepts `name` in the query
`Gpu.nvidiaQueryArgs` builds. Appending it **after** the existing fields leaves
indices 0–4 untouched, so `parseNvidiaCsv` keeps its numeric loop and reads
index 5 as a string only when present:

```
--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,name
```

AMD and Intel get no marketing name. Deriving one means parsing hwdata's
`pci.ids` by tab depth, against a file that may be absent — a parser, fixtures
and a new failure mode for a string. Those backends render as backend plus VRAM
size instead: `amdgpu, 16.0 GB`. That is honest about what is knowable, and the
percentages and units next to it are the same either way.

`Hardware.gpuIdentity(backend, sample)` composes this, so the choice lives in one
tested function rather than in a QML ternary.

## Files

**Create**

| File | Responsibility |
|---|---|
| `components/Details.qml` | The three zones, extracted whole from `Panel.qml` |
| `lib/Hardware.js` | Parse the CPU model; compose the GPU identity string |
| `test/hardware.test.js` | Coverage for both |
| `test/fixtures/cpuinfo.txt` | A real `/proc/cpuinfo` head, including the multi-core repetition |

**Modify**

| File | Change |
|---|---|
| `Service.qml` | `cpuModel` property and its one-shot `Process`; `procSortOverride`; delete `procSort` and the orphaned per-core chain |
| `lib/Proc.js` | Delete `parseCoreTopology`, `groupPhysicalCores`, `parseCoretempMap` |
| `test/proc-detail.test.js` | Drop the four cases covering the deleted helpers. The file's remaining three — `parsePsList`, `parsePmon`, `aggregateByName` — are the process-attribution core and stay. |
| `lib/Gpu.js` | `name` appended to the nvidia query; `parseNvidiaCsv` reads index 5 when present |
| `test/gpu.test.js`, `test/fixtures/nvidia-smi.csv` | Extend for the new field; existing assertions must not change |
| `Panel.qml` | Details block replaced by `Details {}` |
| `README.md` | The Full details description, and the removal of the process tabs |

Extracting `Details.qml` leaves `Panel.qml` a shell of roughly 120 lines hosting
two components and a toggle. `Overview.qml` already established the pattern; this
completes it, and neither half is then large enough to be hard to hold in mind.

## Degradation

| Condition | Behaviour |
|---|---|
| No `model name` in `/proc/cpuinfo` | CPU row shows its units with no name |
| `gpuBackend` is `"none"` | No GPU group, as today |
| AMD or Intel backend | Backend and VRAM size in place of a marketing name |
| Non-hybrid CPU | No E-core track |
| No swap configured | No swap figure |
| One filesystem | No "others" count |
| No spikes yet | `Nothing has crossed <threshold>% yet` |
| Constraint has no per-process source | Process zone falls back to CPU |

Nothing here can fail into an empty zone with no explanation.

## Testing

`lib/Hardware.js` is pure JavaScript with no Qt types, matching the `lib/`
convention, covered by `node --test test/`:

- **CPU model**: a real multi-core `/proc/cpuinfo` (first match wins, not the
  last), a file with no `model name` line, empty input, and a model string
  containing its own `:` separator
- **GPU identity**: nvidia with a name, nvidia without one, amd with VRAM, amd
  without, intel, and `"none"`

`lib/Gpu.js`'s extended parse gets cases for a line with the name and a line
without it, and every existing assertion must continue to pass unchanged.

QML is verified by the live check — the installed plugin is a symlink to this
repo, so a shell restart loads the working tree directly.

## What this is not

It is still not a dashboard. The zones answer three questions in the order a
person asks them; they are not an inventory of everything measurable. The
sub-resource detail that was removed — which core, which sensor, which mount —
is the part that made this section feel like a wall, and none of it comes back.

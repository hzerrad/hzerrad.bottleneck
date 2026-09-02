# Vitals

An Omarchy bar widget that shows which system resource is closest to its
limit.

It samples ten resources (P-cores, E-cores, GPU, VRAM, RAM, swap, disk I/O,
disk space, CPU temp, GPU temp) and ranks them by pressure: how close each one
is to its own limit. The highest-pressure resource is the constraint. A
resource that crosses a health threshold is an anomaly, shown urgent even when
something else is the constraint. Anything that cannot be measured is left out
of the ranking rather than reported as 0%.

## Bar states

| State | When |
|---|---|
| calm | constraint under `calmThreshold`, no anomalies; sparkline only |
| loaded | constraint at or above `calmThreshold`, under 80% |
| strained | constraint at or above 80% |
| anomaly | a resource crossed its alert threshold; urgent colour |

Left-click opens the detail panel. Right-click runs `detailCommand`.

## Settings

Set in `shell.json`, or with `omarchy bar set hzerrad.vitals <key> <value>`.

| Setting | Default | Meaning |
|---|---|---|
| `interval` | `2000` | Sampler tick rate, ms |
| `calmThreshold` | `40` | Pressure % below which the bar goes bare |
| `spikeThreshold` | `70` | Pressure % a resource must cross up through to log a spike |
| `alertTemp` | `88` | CPU temperature anomaly threshold, °C |
| `alertGpuTemp` | `83` | GPU temperature anomaly threshold, °C |
| `alertDisk` | `90` | Disk usage anomaly threshold, % |
| `alertVram` | `95` | VRAM usage anomaly threshold, % |
| `notifications` | `false` | Desktop notification on anomaly onset |
| `detailCommand` | `btop` | Command launched on right-click |

## GPU support

NVIDIA reads from one persistent `nvidia-smi --loop-ms` process; if it exits,
telemetry is dropped rather than left stale and restarted after 5s. AMD reads
amdgpu sysfs on each tick: `gpu_busy_percent`, `mem_info_vram_used/total`, and
hwmon temperature and power. Intel reads i915 clocks and derives utilisation
from `gt_act_freq_mhz / gt_max_freq_mhz`, which is a proxy rather than a
measurement; VRAM is absent unless the card exposes it. With no backend, GPU
and VRAM stay out of the ranking.

Per-process GPU attribution in the panel comes from `nvidia-smi pmon`, which
has no sysfs equivalent, so that column stays NVIDIA-only.

Only the NVIDIA path has run on real hardware. AMD and Intel are implemented
and unit-tested against captured sysfs output, but no one has yet run either on
an actual card. If you have one, what the panel shows is worth reporting.

P/E core classification uses `cpuinfo_max_freq`; on a non-hybrid chip every
core lands in one class.

## Install

```bash
omarchy plugin add https://github.com/hzerrad/hzerrad.vitals.git
omarchy plugin enable hzerrad.vitals --section right
```

## Removing

```bash
omarchy plugin remove hzerrad.vitals
```

That unregisters the widget and deletes the plugin directory. Widget settings
live under `bar` in `~/.config/omarchy/shell.json`; the plugin never writes
anywhere else and never edits configuration you did not change yourself.

## Requirements

Sampling reads `/proc` and `/sys` directly, so the core needs nothing
installed. The rest:

| Command | Used for | Needed |
|---|---|---|
| `sh`, `cat` | reading sysfs in a single spawn per tick | always |
| `df` | filesystem usage | always |
| `ps` | top processes and spike attribution | only while the panel is open |
| `nvidia-smi` | NVIDIA telemetry and per-process GPU | NVIDIA cards only |
| `btop` | default right-click target, changeable via `detailCommand` | optional |

All of these ship with Omarchy except `nvidia-smi`, which comes with the
NVIDIA driver. AMD and Intel are read from sysfs and need no tooling.

## Tests

```bash
node --test test/
```

## License

MIT. See [LICENSE](LICENSE).

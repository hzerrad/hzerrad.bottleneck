# Vitals

An Omarchy bar widget that shows the one resource currently limiting your
machine, rather than a wall of numbers.

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
| `alertTemp` | `88` | CPU temperature anomaly threshold, °C |
| `alertGpuTemp` | `83` | GPU temperature anomaly threshold, °C |
| `alertDisk` | `90` | Disk usage anomaly threshold, % |
| `alertVram` | `95` | VRAM usage anomaly threshold, % |
| `notifications` | `false` | Desktop notification on anomaly onset |
| `detailCommand` | `btop` | Command launched on right-click |

## GPU support

NVIDIA reads from one persistent `nvidia-smi --loop-ms` process; if it exits,
telemetry is dropped rather than left stale and restarted after 5s. AMD uses
`gpu_busy_percent`, Intel `gt_act_freq_mhz`. With no backend, GPU and VRAM are
absent from the ranking.

P/E core classification uses `cpuinfo_max_freq`; on a non-hybrid chip every
core lands in one class.

## Install

```bash
omarchy plugin add hzerrad.vitals ~/Projects/hzerrad.vitals
omarchy plugin enable hzerrad.vitals --section right
```

## Tests

```bash
node --test test/
```

import QtQuick
import Quickshell
import Quickshell.Io
import "lib/Proc.js" as Proc
import "lib/Gpu.js" as Gpu
import "lib/Pressure.js" as Pressure
import "lib/Theme.js" as Theme

// One sampler for the plugin. keepLoaded mounts it at shell startup and
// survives the widget being hidden, so history stays continuous.
Item {
  id: root

  property int interval: 2000
  property int calmThreshold: 40
  property var thresholds: ({ alertTemp: 88, alertGpuTemp: 83, alertDisk: 90, alertVram: 95 })

  property var resources: []
  property var constraint: null
  property var anomalies: []
  property string barStateName: "calm"   // NOT `state` — Item.state already exists
  property var history: ({})
  property double since: 0

  property var coreClasses: ({ p: [], e: [] })
  property var prevStat: null
  property var prevDisk: null
  property double prevDiskAt: 0
  property var swapHistory: []
  property int diskIoStreak: 0
  property string lastConstraintKey: ""
  property var gpuSample: null
  property string gpuBackend: "none"
  property bool notifications: false
  property var notifiedKeys: ({})
  property var themePalette: ({})
  readonly property string themePath:
    Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"

  readonly property int historyLen: 120

  // Detail state (expanded panel)
  property bool panelOpen: false          // panel sets this; gates costly work
  property string procSort: "cpu"         // cpu | mem | gpu
  // Held here rather than on the panel because the service is keepLoaded, so
  // the choice survives the panel closing and reopening. Never written to disk.
  property string overviewDensity: "summary"   // summary | all
  property var physicalCores: []          // [{coreId, kind, threads}]
  property var coreStats: []              // [{coreId, kind, busyPct, tempC}]
  property var coreTempMap: ({})          // coreId -> hwmon input filename
  property string coreTempDir: ""
  property var memInfo: ({})              // raw byte counts for absolute display
  property var procs: []                  // top processes by cpu/mem
  property var gpuProcs: []               // per-process GPU from nvidia-smi pmon

  // Spike log
  property int spikeThreshold: 70
  property var spikes: []                 // newest first
  property var prevPressures: ({})
  readonly property int spikeLogLen: 12
  property var pendingSpike: null

  FileView { id: statFile;  path: "/proc/stat" }
  FileView { id: memFile;   path: "/proc/meminfo" }
  FileView { id: diskFile;  path: "/proc/diskstats" }
  FileView { id: tempFile;  path: "" }

  // The shell's own Color.colorsFile sets watchChanges: false and depends on a
  // theme switch pushing its payload over shell IPC, which plugins never
  // receive. Watching the file is what makes a theme switch recolour us live.
  FileView {
    id: themeFile
    path: root.themePath
    watchChanges: true
    printErrors: false
    // text() is stale inside the change signal, so both paths route through
    // reload() -> onLoaded and always parse fresh content.
    onFileChanged: reload()
    onLoaded: root.themePalette = Theme.parsePalette(text())
    onLoadFailed: root.themePalette = ({})
  }

  Component.onCompleted: discoverTopology()

  // Core classes and sensor paths never change at runtime — discover once.
  function discoverTopology() {
    discoverProc.running = true
  }

  Process {
    id: discoverProc
    command: ["sh", "-c",
      "for c in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/cpuinfo_max_freq; do " +
      "n=${c#/sys/devices/system/cpu/cpu}; n=${n%%/*}; echo \"$n $(cat $c)\"; done"]
    stdout: StdioCollector {
      onStreamFinished: {
        var freqs = []
        var lines = text.trim().split("\n")
        for (var i = 0; i < lines.length; i++) {
          var f = lines[i].trim().split(/\s+/)
          if (f.length === 2) freqs.push({ cpu: parseInt(f[0], 10), khz: parseInt(f[1], 10) })
        }
        root.coreClasses = Proc.classifyCores(freqs)
        topoProc.running = true
        tick.start()
      }
    }
  }

  // A hyperthread pair shares one core and one sensor, so fold threads back.
  Process {
    id: topoProc
    command: ["sh", "-c",
      "for c in /sys/devices/system/cpu/cpu[0-9]*/topology/core_id; do " +
      "n=${c#/sys/devices/system/cpu/cpu}; n=${n%%/*}; echo \"$n $(cat $c)\"; done"]
    stdout: StdioCollector {
      onStreamFinished: {
        var topo = Proc.parseCoreTopology(text)
        root.physicalCores = Proc.groupPhysicalCores(topo, root.coreClasses)
      }
    }
  }

  Timer {
    id: tick
    interval: root.interval
    repeat: true
    onTriggered: root.sample()
  }

  // The coretemp hwmon node and its package input are fixed for the boot.
  // Runs once and points tempFile at the answer, or cpuTempC stays null.
  Process {
    id: tempDetect
    running: true
    command: ["sh", "-c",
      "for h in /sys/class/hwmon/hwmon*; do " +
      "[ \"$(cat $h/name 2>/dev/null)\" = coretemp ] || continue; " +
      "for l in $h/temp*_label; do b=${l##*/}; echo \"$h ${b%_label}_input $(cat $l)\"; done; " +
      "break; done"]
    stdout: StdioCollector {
      onStreamFinished: {
        var labels = []
        var dir = ""
        var lines = String(text).trim().split("\n")
        for (var i = 0; i < lines.length; i++) {
          var parts = lines[i].trim().split(" ")
          if (parts.length < 3) continue
          dir = parts[0]
          labels.push({ input: parts[1], label: parts.slice(2).join(" ") })
        }
        var pick = Proc.pickCoretempInput(labels)
        if (dir && pick) tempFile.path = dir + "/" + pick
        root.coreTempDir = dir
        root.coreTempMap = Proc.parseCoretempMap(labels)
      }
    }
  }

  // Disk free space changes slowly; polling it at the sample rate is waste.
  Timer {
    interval: 30000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: dfProc.running = true
  }

  property var filesystems: []
  Process {
    id: dfProc
    command: ["df", "-P", "-T"]
    stdout: StdioCollector { onStreamFinished: root.filesystems = Proc.parseDf(text) }
  }

  Process {
    id: gpuDetect
    running: true
    command: ["sh", "-c",
      "command -v nvidia-smi >/dev/null && echo nvidia && exit 0; " +
      "ls /sys/class/drm/card*/device/gpu_busy_percent >/dev/null 2>&1 && echo amd && exit 0; " +
      "ls /sys/class/drm/card*/gt_act_freq_mhz >/dev/null 2>&1 && echo intel && exit 0; " +
      "echo none"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.gpuBackend = text.trim()
        if (root.gpuBackend === "nvidia") nvidiaProc.running = true
      }
    }
  }

  // One long-lived process rather than a spawn per sample.
  Process {
    id: nvidiaProc
    command: ["nvidia-smi"].concat(Gpu.nvidiaQueryArgs(root.interval))
    stdout: SplitParser {
      onRead: function (line) {
        var g = Gpu.parseNvidiaCsv(line)
        if (g) root.gpuSample = g
      }
    }
    onExited: {
      // Never report stale telemetry — absent != zero.
      root.gpuSample = null
      gpuRestart.start()
    }
  }

  Timer {
    id: gpuRestart
    interval: 5000
    repeat: false
    onTriggered: if (root.gpuBackend === "nvidia") nvidiaProc.running = true
  }

  // amdgpu and i915 are sysfs reads, so they ride the main tick as one spawn
  // rather than a long-lived stream.
  Process {
    id: sysfsGpuProc
    command: ["sh", "-c", root.gpuBackend === "intel" ? Gpu.intelSampleCommand() : Gpu.amdSampleCommand()]
    stdout: StdioCollector {
      onStreamFinished: {
        var kv = Gpu.parseSysfsKv(text)
        root.gpuSample = root.gpuBackend === "intel" ? Gpu.intelSample(kv) : Gpu.amdSample(kv)
      }
    }
  }

  function isAnomalous(key) {
    for (var i = 0; i < anomalies.length; i++) if (anomalies[i].key === key) return true
    return false
  }

  // One rule, two jobs: the band decides both colour and summary inclusion.
  function bandOf(resource) {
    if (!resource) return "calm"
    return Theme.bandFor(resource.pressure * 100, calmThreshold,
                         isAnomalous(resource.key), resource.ranks)
  }

  // One notification per anomaly onset, not per sample. The key clears when
  // the anomaly ends so a genuine recurrence fires again.
  function notifyOnsets() {
    var seen = {}
    var i
    for (i = 0; i < anomalies.length; i++) {
      var a = anomalies[i]
      seen[a.key] = true
      if (notifications && !notifiedKeys[a.key]) {
        Quickshell.execDetached(["omarchy-notification-send", "Bottleneck",
          a.label + " " + a.display])
      }
    }
    notifiedKeys = seen
  }

  // Spike capture
  // A crossing arms a one-shot `ps` — that is when the culprit is still
  // running — and its result is attached to the event.
  function recordSpike(resource) {
    pendingSpike = {
      at: Date.now(),
      key: resource.key,
      label: resource.label,
      glyph: resource.glyph,
      display: resource.display,
      culprit: ""
    }
    spikeCulpritProc.running = true
  }

  function commitSpike(culprit) {
    if (!pendingSpike) return
    var e = pendingSpike
    e.culprit = culprit
    pendingSpike = null
    var next = [e].concat(spikes)
    if (next.length > spikeLogLen) next = next.slice(0, spikeLogLen)
    spikes = next
  }

  Process {
    id: spikeCulpritProc
    command: ["sh", "-c", "ps -eo pid,comm,pcpu,pmem --sort=-pcpu --no-headers | head -3"]
    stdout: StdioCollector {
      onStreamFinished: {
        var list = Proc.parsePsList(text)
        var parts = []
        for (var i = 0; i < list.length && i < 2; i++) {
          parts.push(list[i].name + " " + Math.round(list[i].cpuPct) + "%")
        }
        root.commitSpike(parts.join(", "))
      }
    }
  }

  // Detail sampling
  // Runs only while the panel is open; idle cost is zero.
  Timer {
    id: detailTick
    interval: 2000
    repeat: true
    running: root.panelOpen
    triggeredOnStart: true
    onTriggered: {
      procProc.running = true
      if (root.constraintMetric === "cpu" || root.constraintMetric === "mem")
        constraintProcProc.running = true
      if (root.coreTempDir !== "") coreTempProc.running = true
      if (root.gpuBackend === "nvidia") gpuProcProc.running = true
    }
  }

  Process {
    id: procProc
    command: ["sh", "-c",
      "ps -eo pid,comm,pcpu,pmem --sort=-" +
      (root.procSort === "mem" ? "pmem" : "pcpu") +
      " --no-headers | head -40"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.procs = Proc.aggregateByName(Proc.parsePsList(text),
          root.procSort === "mem" ? "memPct" : "cpuPct")
      }
    }
  }

  // The verdict needs the process list for the constraint's own dimension,
  // which is not necessarily the tab the Full details list is showing.
  readonly property string constraintMetric: {
    if (!constraint) return ""
    switch (constraint.key) {
      case "pcore": case "ecore": return "cpu"
      case "ram":                 return "mem"
      case "gpu":                 return "gpusm"
      case "vram":                return "gpumem"
      // Swap and disk I/O have no per-process source here.
      default:                    return ""
    }
  }

  property var constraintProcs: []

  Process {
    id: constraintProcProc
    command: ["sh", "-c",
      "ps -eo pid,comm,pcpu,pmem --sort=-" +
      (root.constraintMetric === "mem" ? "pmem" : "pcpu") +
      " --no-headers | head -40"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.constraintProcs = Proc.aggregateByName(Proc.parsePsList(text),
          root.constraintMetric === "mem" ? "memPct" : "cpuPct")
      }
    }
  }

  readonly property var attributionList:
    (constraintMetric === "gpusm" || constraintMetric === "gpumem")
      ? gpuProcs : constraintProcs

  readonly property string attributionKey: {
    switch (constraintMetric) {
      case "cpu":    return "cpuPct"
      case "mem":    return "memPct"
      case "gpusm":  return "smPct"
      case "gpumem": return "memPct"
      default:       return ""
    }
  }

  Process {
    id: gpuProcProc
    command: ["sh", "-c", "nvidia-smi pmon -c 1 2>/dev/null"]
    stdout: StdioCollector {
      onStreamFinished: {
        var list = Proc.parsePmon(text)
        list.sort(function (a, b) { return (b.smPct - a.smPct) || (b.memPct - a.memPct) })
        root.gpuProcs = list.slice(0, 8)
      }
    }
  }

  // One spawn reads every core sensor, rather than one FileView per core.
  Process {
    id: coreTempProc
    command: ["sh", "-c", root.coreTempCommand]
    stdout: StdioCollector {
      onStreamFinished: {
        var m = {}
        var lines = String(text).trim().split("\n")
        for (var i = 0; i < lines.length; i++) {
          var f = lines[i].trim().split(/\s+/)
          if (f.length !== 2) continue
          var c = parseInt(f[0], 10)
          var t = Proc.parseMilliC(f[1])
          if (!isNaN(c) && t !== null) m[c] = t
        }
        root.coreTemps = m
      }
    }
  }

  property var coreTemps: ({})
  readonly property string coreTempCommand: {
    if (coreTempDir === "") return "true"
    var parts = []
    for (var id in coreTempMap) parts.push("echo \"" + id + " $(cat " + coreTempDir + "/" + coreTempMap[id] + ")\"")
    return parts.length ? parts.join("; ") : "true"
  }

  function refreshCoreStats(prev, curr) {
    if (!physicalCores.length) return
    var out = []
    for (var i = 0; i < physicalCores.length; i++) {
      var c = physicalCores[i]
      out.push({
        coreId: c.coreId,
        name: c.name,
        threads: c.threads.length,
        kind: c.kind,
        busyPct: prev ? Proc.cpuBusyPct(prev, curr, c.threads) : 0,
        tempC: coreTemps[c.coreId] !== undefined ? coreTemps[c.coreId] : null
      })
    }
    coreStats = out
  }

  function pushHistory(key, value) {
    var h = root.history
    if (!h[key]) h[key] = []
    h[key].push(value)
    if (h[key].length > root.historyLen) h[key].shift()
    root.history = h
  }

  function sample() {
    statFile.reload(); memFile.reload(); diskFile.reload()
    if (tempFile.path !== "") tempFile.reload()
    if (gpuBackend === "amd" || gpuBackend === "intel") sysfsGpuProc.running = true

    var stat = Proc.parseStat(statFile.text())
    var mem = Proc.parseMeminfo(memFile.text())
    var disk = Proc.parseDiskstats(diskFile.text())
    var now = Date.now()

    var pPct = prevStat ? Proc.cpuBusyPct(prevStat, stat, coreClasses.p) : 0
    var ePct = prevStat ? Proc.cpuBusyPct(prevStat, stat, coreClasses.e) : 0

    var diskIo = []
    if (prevDisk) {
      var elapsed = now - prevDiskAt
      for (var name in disk) {
        if (!prevDisk[name]) continue
        diskIo.push({ name: name, utilPct: Proc.diskUtilPct(prevDisk[name].ioTicks, disk[name].ioTicks, elapsed) })
      }
    }

    var swapPct = Proc.swapUsedPct(mem)
    swapHistory.push(swapPct)
    if (swapHistory.length > 5) swapHistory.shift()

    var saturated = false
    for (var i = 0; i < diskIo.length; i++) if (diskIo[i].utilPct >= 95) saturated = true
    diskIoStreak = saturated ? diskIoStreak + 1 : 0

    var sampleObj = {
      pPct: pPct, ePct: ePct,
      memPct: Proc.memUsedPct(mem),
      swapPct: swapPct,
      gpu: gpuSample,
      diskIo: diskIo,
      filesystems: filesystems,
      cpuTempC: tempFile.path ? Proc.parseMilliC(tempFile.text()) : null,
      gpuTempC: gpuSample ? gpuSample.tempC : null
    }

    var flags = {
      swapGrowing: Proc.swapGrowing(swapHistory, 3),
      ramCritical: mem.memTotal > 0 && (mem.memAvailable / mem.memTotal) < 0.05,
      diskIoSaturated: Pressure.debounced(diskIoStreak, 3)
    }

    // Computed into locals first, then assigned anomalies-before-resources:
    // Overview.qml's onResourcesChanged handler reads anomalies via
    // isAnomalous(), so if resources changed first that handler would see
    // last sample's anomalies and an alarm would take an extra sample to
    // reach the summary.
    var nextResources = Pressure.buildResources(sampleObj)
    var nextAnomalies = Pressure.detectAnomalies(nextResources, thresholds, flags)
    var nextConstraint = Pressure.rankConstraint(nextResources)

    anomalies = nextAnomalies
    resources = nextResources
    constraint = nextConstraint
    barStateName = Pressure.barState(constraint, anomalies, calmThreshold)

    if (constraint && constraint.key !== lastConstraintKey) {
      lastConstraintKey = constraint.key
      since = now
    }

    notifyOnsets()

    // Detected every sample, open or not — the point is catching what you missed.
    if (!pendingSpike) {
      var onsets = Pressure.spikeOnsets(prevPressures, resources, spikeThreshold)
      if (onsets.length) recordSpike(onsets[0])
    }
    prevPressures = Pressure.pressureByKey(resources)

    memInfo = mem
    if (panelOpen) refreshCoreStats(prevStat, stat)

    for (var j = 0; j < resources.length; j++) pushHistory(resources[j].key, resources[j].pressure)

    prevStat = stat
    prevDisk = disk
    prevDiskAt = now
  }
}

"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("parseDiskstats keeps whole devices and drops partitions", () => {
  const d = Proc.parseDiskstats(fixture("diskstats.txt"))
  assert.ok(d.nvme0n1, "expected nvme0n1")
  assert.ok(d.nvme1n1, "expected nvme1n1")
  assert.equal(d.nvme0n1p1, undefined, "partitions must not be counted twice")
  assert.equal(typeof d.nvme1n1.ioTicks, "number")
})

// io_ticks is ms the queue was non-empty: saturation, not speed.
test("diskUtilPct converts io_ticks delta to percent busy", () => {
  assert.equal(Proc.diskUtilPct(1000, 2000, 2000), 50)
  assert.equal(Proc.diskUtilPct(1000, 3000, 2000), 100)
  assert.equal(Proc.diskUtilPct(1000, 9999, 2000), 100, "must clamp")
  assert.equal(Proc.diskUtilPct(1000, 1000, 2000), 0)
  assert.equal(Proc.diskUtilPct(1000, 2000, 0), 0, "no elapsed time, no reading")
})

test("parseDf keeps real filesystems and skips virtual ones", () => {
  const text = [
    "Filesystem     Type     1024-blocks      Used Available Capacity Mounted on",
    "/dev/nvme0n1p2 ext4       960380628 122334124 789293932      14% /",
    "/dev/nvme0n1p1 vfat         1046512    296288    750224      29% /boot",
    "tmpfs          tmpfs       16340186         0  16340186       0% /dev/shm"
  ].join("\n")
  const fsList = Proc.parseDf(text)
  assert.equal(fsList.length, 2)
  assert.equal(fsList[0].mount, "/")
  assert.equal(fsList[0].usedPct, 14)
  assert.equal(fsList[1].mount, "/boot")
})

// btrfs subvolumes share a device and report identical usage.
test("parseDf reports one row per device, shortest mount wins", () => {
  const text = [
    "Filesystem     Type  1024-blocks      Used Available Capacity Mounted on",
    "/dev/dm-0      btrfs   960380628 122334124 789293932      39% /var/cache/pacman/pkg",
    "/dev/dm-0      btrfs   960380628 122334124 789293932      39% /",
    "/dev/dm-0      btrfs   960380628 122334124 789293932      39% /home",
    "/dev/nvme0n1p1 vfat      1046512    296288    750224      28% /boot"
  ].join("\n")
  const fs = Proc.parseDf(text)
  assert.equal(fs.length, 2, "one row per device")
  assert.equal(fs[0].mount, "/")
  assert.equal(fs[1].mount, "/boot")
})

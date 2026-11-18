import { it, expect } from "vitest";
import {
  createSimulation,
  configureLapTimes,
  issuePitPenalty,
  togglePit,
  refuelCountdownPercent,
  tick,
  resetSimulation,
} from "../src/core/simulator";

it("draws unique millisecond times per driver, exhausts the pool before reuse and carries tick overshoot", () => {
  const s = createSimulation();
  expect(configureLapTimes(s, 1, 1.01)).toBe(false);
  expect(configureLapTimes(s, 2, 2.031)).toBe(true);
  s.running = true;
  tick(s, 12.5);
  const owners = new Map<number, number>();
  for (const d of s.drivers) {
    const times = d.history.map((r) => r.time);
    expect(times).toHaveLength(6);
    expect(new Set(times.slice(0, 4)).size).toBe(4);
    expect(times[3]).not.toBe(times[4]);
    expect(d.best).toBe(Math.min(...times));
    expect(d.history[d.bestLap - 1]?.time).toBe(d.best);
    expect(times.reduce((a, b) => a + b, d.lapElapsed)).toBeCloseTo(
      s.elapsed,
      8,
    );
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(2.031);
      expect(owners.get(t) ?? d.id).toBe(d.id);
      owners.set(t, d.id);
    }
    expect(d.history.map((row) => row.fuel)).toEqual([98, 96, 94, 92, 90, 88]);
  }
  configureLapTimes(s, 4, 5);
  const oldTime = s.drivers[0]!.lapTargetMs;
  tick(s, 6.9);
  expect(s.drivers[0]!.history[6]!.time).toBe(oldTime / 1000);
  expect(s.drivers[0]!.history[7]!.time).toBeGreaterThanOrEqual(4);
  resetSimulation(s);
  expect(s.lapMinMs).toBe(4000);
  expect(s.drivers[0]!.history).toEqual([]);
});
it("charges fuel at the line, serves stacked penalties only in the pit and counts real refuels once", () => {
  const s = createSimulation(),
    d = s.drivers[0]!;
  s.running = true;
  tick(s, 0.1);
  const target = d.lapTargetMs / 1000;
  tick(s, target - 0.2);
  expect(d.fuel).toBe(100);
  tick(s, 0.1);
  expect(d.fuel).toBe(98);
  const secondTarget = d.lapTargetMs / 1000;
  issuePitPenalty(s, d, 4);
  issuePitPenalty(s, d, 2);
  tick(s, 1);
  expect(d.penalty).toBe(6);
  togglePit(s, d);
  const progress = d.progress;
  tick(s, 2);
  expect(d.progress).toBe(progress);
  expect(d.penalty).toBe(4);
  expect(d.stops).toBe(0);
  togglePit(s, d);
  tick(s, 0.1);
  expect(d.penalty).toBe(6);
  togglePit(s, d);
  s.phase = "chaos";
  tick(s, 10);
  expect(d.penalty).toBe(6);
  s.phase = "race";
  tick(s, 5);
  expect(d.boxPenalties.map((p) => p.remaining)).toEqual([1]);
  togglePit(s, d);
  expect(d.boxPenalties.map((p) => p.remaining)).toEqual([2]);
  togglePit(s, d);
  tick(s, 2);
  expect(d.boxPenalty).toBeNull();
  expect(refuelCountdownPercent(d)).toBe(100);
  tick(s, 1.5);
  expect(refuelCountdownPercent(d)).toBe(50);
  expect(d.fuel).toBe(98);
  expect(d.stops).toBe(0);
  tick(s, 1.6);
  expect(refuelCountdownPercent(d)).toBeNull();
  expect(d.fuel).toBeCloseTo(98.8);
  expect(d.stops).toBe(1);
  tick(s, 1);
  expect(d.stops).toBe(1);
  expect(d.fuel).toBe(100);
  togglePit(s, d);
  tick(s, secondTarget - 1.1);
  expect(d.last).toBeCloseTo(secondTarget + 13.1, 3);
  expect(d.history[1]!.fuel).toBe(98);
  s.live = true;
  issuePitPenalty(s, d, 5);
  togglePit(s, d);
  expect(d.penalty).toBe(0);
  expect(d.pit).toBe(false);
});

it("finishes queued penalties and refuels in one tick, with an optional zero delay", () => {
  for (const delay of [0, 2]) {
    const s = createSimulation(),
      d = s.drivers[1]!;
    s.running = true;
    s.refuelDelay = delay;
    d.fuel = 10;
    togglePit(s, d);
    issuePitPenalty(s, d, 2);
    tick(s, 1);
    issuePitPenalty(s, d, 3);
    expect(d.boxPenalties.map((p) => p.remaining)).toEqual([1, 3]);
    tick(s, 5 + delay);
    expect(d.penalty).toBe(0);
    expect(refuelCountdownPercent(d)).toBeNull();
    expect(d.fuel).toBe(18);
    expect(d.stops).toBe(1);
  }
});
it("restarts an interrupted refuel wait and keeps other slots independent", () => {
  const s = createSimulation(),
    d = s.drivers[0]!,
    other = s.drivers[1]!;
  s.running = true;
  d.fuel = other.fuel = 50;
  issuePitPenalty(s, d, 1);
  togglePit(s, d);
  togglePit(s, other);
  tick(s, 2);
  expect(other.fuel).toBe(66);
  expect(d.fuel).toBe(50);
  togglePit(s, d);
  expect(refuelCountdownPercent(d)).toBeNull();
  togglePit(s, d);
  expect(refuelCountdownPercent(d)).toBe(100);
  s.running = false;
  tick(s, 3);
  expect(d.refuelWait).toBe(3);
  resetSimulation(s);
  expect(d.refuelWait).toBe(0);
  expect(d.boxPenalties).toHaveLength(0);
});

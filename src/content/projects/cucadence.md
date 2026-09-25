---
code: PRJ-09
title: cuCadence
summary: A header-only C++17/CUDA profiler that lives inside your binary and reports per-stage latency, tail spikes, and deadline misses in real-time GPU loops.
status: active
start: '2026-08'
related: [solopulse]
tags: [C++, CUDA, Performance, Developer tools, Nsight]
repo: https://github.com/donald-heddesheimer/cadence
featured: true
cover: /projects/cadence-report.svg
coverAlt: cuCadence report showing per-stage latency distributions, a deadline verdict, and the three slowest iterations broken down by stage
cardFit: contain
evidence:
  - { kind: trace, src: /projects/cadence-timeline.png, alt: 'One iteration on the Perfetto timeline: host launches return within 10 µs while the device lane shows the gap before the second kernel starts' }
stats:
  - { label: Cost per GPU scope, value: '3.4 μs' }
  - { label: Overhead vs. blocking timing, value: '−48%' }
  - { label: Throughput cost on llama.cpp, value: 'none measurable' }
  - { label: Reporting defects fixed, value: '3' }
---

## Objective

Nsight Systems is great for a one-off investigation, but it can't watch a loop that runs for a week. At Solopulse I spent a lot of time profiling a real-time GPU pipeline. I wanted the same visibility all the time, from inside the process: which stage got slow, how much it varies, and how often the loop misses its deadline.

## How it works

Wrap the stages you care about and run the application as usual. cuCadence prints latency distributions when the process exits.

```cpp
#include <cadence/cadence.h>

while (running) {
  CADENCE_ITERATION("iteration");
  { CADENCE_KERNEL("saxpy", stream); Saxpy<<<...>>>(...); }
  { CADENCE_KERNEL("scale", stream); Scale<<<...>>>(...); }
  cudaStreamSynchronize(stream);
}
CADENCE_REPORT();
```

Each label gets two rows. `device` is GPU time measured with CUDA events, and `host` is the CPU time spent issuing the work. When the two converge, the stage is launch-bound rather than compute-bound.

## Staying out of the way

- **Deferred event resolution.** Scopes record CUDA events without synchronizing. The events are resolved later, at a sync point the application already has, so no measurement triggers a blocking read.
- **Thread-local buffers and event pools** mean threads never contend.
- **Bounded memory.** Statistics fold in with Welford's method plus a sample reservoir, so a week-long run uses the same memory as a one-minute run.

The result is **3.4 μs per GPU scope**, about 48% less than a blocking CUDA-event implementation.

## Timelines

The slowest iterations keep their stage breakdowns and can be exported as Chrome Trace JSON for [Perfetto](https://ui.perfetto.dev). Every scope also emits an NVTX range, so the same instrumentation shows up in Nsight.

[![One iteration on the Perfetto timeline: host launches return within 10 µs while the device lane shows the gap before the second kernel starts](/projects/cadence-timeline.png)](/projects/cadence-timeline.png)

## Validation

I tested cuCadence on llama.cpp's CUDA backend. Instrumenting at the graph level had no measurable throughput cost. Instrumenting every graph node cost 20%. I then hardened the library with CUDA Graph capture safeguards, because an event recorded into a capturing stream gets baked into the graph, and I fixed three reporting defects.

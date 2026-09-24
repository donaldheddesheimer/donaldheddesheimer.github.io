---
code: PRJ-11
title: Traffic Operations Center
summary: A city can't A/B test an emergency. This one rehearses every response in simulation and commits only the safe one.
status: shipped
start: '2026-09'
org: steelhacks
context: SteelHacks 2026
tags: [Python, Simulation, LLMs, SUMO]
repo: https://github.com/donaldheddesheimer/traffic-sim
featured: true
cover: /projects/traffic-ops.jpg
coverAlt: Traffic Operations Center console tracking a collision and EMS response in Oakland, Pittsburgh
stats:
  - { label: Candidate plans, value: '8' }
  - { label: Parallel workers, value: '4' }
  - { label: Signal transitions audited, value: '2,778' }
  - { label: Unsafe changes, value: '0' }
---

<!-- TODO: add who you built this with and what you owned. -->

## Objective

When a collision blocks a lane, traffic operators have to act on incomplete information. Change the signals? Divert traffic? Clear a corridor for EMS? Every option has side effects, and the real city is the worst place to find them. Built at **SteelHacks 2026**, this project turns that decision into an experiment.

## How it works

The system keeps a live traffic twin running on [Eclipse SUMO](https://eclipse.dev/sumo/). The moment an incident arrives, it:

1. **Detects** the collision from a simulated smart-city feed.
2. **Captures** vehicles, signals, routes, and RNG state in a snapshot.
3. **Branches** a baseline and several response plans into fresh SUMO processes on four workers.
4. **Challenges** every plan: unsafe ones are rejected before they run, and signal transitions are checked again inside each branch.
5. **Compares** outcomes across delay, queue length, throughput, and EMS response time.
6. **Commits** the chosen plan only after revalidating it against the live twin.
7. **Learns** by watching what actually happened and storing a lesson for the next incident.

![Incident response workflow](/projects/traffic-ops-flow.svg)

## Safety is code, not a prompt

Model output enters the system as untrusted plan data. Deterministic rules enforce minimum greens, pedestrian timing, yellow and all-red clearance, cycle limits, and legal phase transitions. The demo deliberately proposes an unsafe `aggressive-flush` plan so the gate can prove itself on screen.

## Results

Across the documented run, **8 candidate plans** ran on **4 parallel workers** and **2,778 signal transitions** were audited with **zero unsafe changes**. A full mock analysis, including seven simulated branches, took about 26 seconds. It runs on two city models: a deterministic 3×3 grid and Pittsburgh's Oakland street network.

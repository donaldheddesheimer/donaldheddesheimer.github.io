---
code: PRJ-10
title: Fluxion
summary: A top-down simulation game in C++ for learning game loops, data-oriented design, and performance engineering.
status: active
start: '2026-09'
tags: [C++, Performance, Simulation, raylib, Game dev]
repo: https://github.com/donaldheddesheimer/fluxion
---

## Objective

Build a game engine loop from the ground up and use it to learn how to make simulations fast: cache-friendly data layouts, tight update loops, and eventually thousands of agents on screen at once.

## Approach

Fluxion is written in C++ on [raylib](https://github.com/raysan5/raylib), with a premake build that pulls raylib down automatically on the first build. It builds on Linux, macOS, and Windows, and generates `compile_commands.json` for clangd.

## Current milestone

A controllable player in a small arena. Next up: an entity layout built for data-oriented design, then scaling the agent count and profiling as it grows.

<!-- TODO: add a GIF of the current build here, e.g. ![Fluxion arena](/projects/fluxion.gif) -->

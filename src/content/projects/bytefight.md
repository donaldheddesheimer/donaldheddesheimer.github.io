---
code: PRJ-05
title: Bytefight
summary: A game-playing agent for Georgia Tech's CS 3600 tournament that hunts hidden trapdoors with Bayesian inference and plans with iterative-deepening alpha-beta search.
status: shipped
start: '2025-11'
org: gt
context: CS 3600 · Bytefight tournament
team: Team 49, two people
tags: [Python, Search, Bayesian inference, Game AI]
repoNote: Course repository is private
# TODO: add the final tournament placement, and the one-line rules of the game if you want them here.
---

## Objective

Bytefight is a two-player tournament game for **CS 3600 (Introduction to AI)**. Each team's agent moves a chicken around a board, trying to lay more eggs than the opponent. Hidden trapdoors are scattered around the board, and stepping on one is fatal. Each agent only gets noisy sensor readings about where they are, plus a fixed time budget for the whole match.

## Approach

- **Trapdoor belief tracking.** A Bayesian filter keeps a probability for every square. Each turn it updates on what the sensors hear and feel. A reading that can't be explained by an adjacent trapdoor gets zero likelihood.
- **Death detection on both sides.** When either chicken dies, the agent deduces where the trapdoor was and locks that belief in, so later noisy readings can't overrule it. A parity rule (one trapdoor on even squares, one on odd) removes false positives.
- **Search.** Iterative-deepening alpha-beta minimax simulates trapdoor deaths inside the search tree, so it avoids squares that are likely to be deadly.
- **Time management.** The agent spends heavily in the opening and midgame, where a deeper search pays off, then tapers off in the endgame and always keeps a safety buffer.

## What I owned

I wrote the Bayesian trapdoor inference and death-handling logic, refactored the minimax and move-selection loop, fixed state bugs in move application, and built a web-based match viewer for replaying games.

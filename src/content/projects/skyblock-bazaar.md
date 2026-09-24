---
code: PRJ-06
title: Skyblock Bazaar Model
summary: Forecasting whether in-game commodity prices will rise, fall, or hold over the next six hours, using millions of market snapshots plus event and election data.
status: shipped
start: '2026-01'
team: Team of two
tags: [Python, Machine learning, PyTorch, XGBoost, Time series]
repoNote: Repository is private
stats:
  - { label: Market snapshots, value: '3.57M' }
  - { label: Test rows, value: '~698K' }
  - { label: Tuned 3-class accuracy, value: '60.6%' }
  - { label: Event + perk flags, value: '53' }
---

<!-- TODO: confirm these numbers, and add what you owned vs. your teammate. -->

## Objective

Hypixel Skyblock has a player-driven commodity market, the Bazaar, where prices react to in-game events, mayor elections, and player counts. The question: given the market right now, will an item's price go **up, down, or stay flat** over the next six hours?

## Data

- Bazaar order-book snapshots for every item: buy and sell prices, volumes, and weekly moving totals. The combined dataset has **3.57 million rows**.
- **14 event flags** (Jacob's Contest, Dark Auction, Spooky Festival, and more) and **about 39 mayor perk flags**, merged onto each snapshot by timestamp.
- Player-count data, plus engineered features like bid-ask spread, volatility, and buy/sell ratios.

## Models

An **XGBoost** classifier with class weighting handles the heavy imbalance, since most six-hour windows are flat. Cross-validated hyperparameter tuning raised test accuracy from 55.5% to **60.6%** on about 698K held-out rows, and the biggest gains were on the minority up/down classes. A **PyTorch LSTM** over 24-hour windows, with a strictly temporal train/test split, tested whether sequence context adds signal beyond per-snapshot features.

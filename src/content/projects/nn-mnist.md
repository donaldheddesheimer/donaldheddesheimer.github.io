---
code: PRJ-07
title: 'nn: MNIST three ways'
summary: The same neural network in NumPy, a C++ CPU baseline, and CUDA, with a hand-tiled GEMM benchmarked against cuBLAS.
status: active
start: '2026-06'
tags: [CUDA, C++, Python, Machine learning, Performance]
repo: https://github.com/donaldheddesheimer/nn
stats:
  - { label: MNIST accuracy, value: '~97%' }
  - { label: Implementations, value: '3' }
---

## Objective

Understand what actually happens between `model.fit()` and the GPU by writing the same multilayer perceptron three times, each one closer to the hardware.

## Approach

1. **NumPy:** the reference implementation, to get the math right.
2. **C++ on the CPU:** a baseline with no framework, to see where the time goes.
3. **CUDA:** the forward and backward passes on the GPU, including a hand-optimized tiled GEMM kernel.

## Measuring it

The custom GEMM is benchmarked against cuBLAS with a roofline and latency table, backed by Nsight profiles, so every claim about speed has a trace behind it.

<!-- TODO: add your GEMM vs cuBLAS numbers and a roofline plot image. -->

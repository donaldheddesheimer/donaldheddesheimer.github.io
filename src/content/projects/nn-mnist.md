---
code: PRJ-07
title: 'nn: MNIST three ways'
summary: The same neural network in NumPy, a C++ CPU baseline, and CUDA, with a hand-tiled GEMM benchmarked against cuBLAS.
brief:
  does: 'One multilayer perceptron written three times: NumPy, C++ and CUDA.'
  hard: 'The CUDA passes, including a hand-tiled GEMM benchmarked against cuBLAS.'
  shown: 'About 97% accuracy on MNIST.'
# TODO: brief: add mine; shown could carry the GEMM vs cuBLAS result once measured.
line: 'One neural network, written three ways'
stack: 'NumPy / C++ / CUDA'
result: '~97% on MNIST'
status: active
start: '2026-06'
tags: [CUDA, C++, Python, Machine learning, Performance]
repo: https://github.com/donaldheddesheimer/nn
stats:
  - { label: MNIST accuracy, value: '~97%' }
  - { label: Implementations, value: '3' }
# TODO: add your GEMM vs cuBLAS numbers and a roofline plot image.
---

## Objective

Understand what actually happens between `model.fit()` and the GPU by writing the same multilayer perceptron three times, each one closer to the hardware.

## Approach

1. **NumPy:** the reference implementation, to get the math right.
2. **C++ on the CPU:** a baseline with no framework, to see where the time goes.
3. **CUDA:** the forward and backward passes on the GPU, including a hand-optimized tiled GEMM kernel.

## Measuring it

The custom GEMM is benchmarked against cuBLAS with a roofline and latency table, backed by Nsight profiles, so every claim about speed has a trace behind it.


---
code: PRJ-03
title: Smart Bin
summary: A deep learning classifier that sorts waste into six categories, trained on images from Western Reserve Academy.
status: shipped
start: '2023'
org: wra
context: Western Reserve Academy
tags: [Python, Machine learning, Computer vision, TensorFlow]
repo: https://github.com/donaldheddesheimer/Smart-Bin
cover: /projects/smart-bin.png
coverAlt: Smart Bin pipeline diagram from the project repository
stats:
  - { label: Validation accuracy, value: '94.8%' }
  - { label: Validation F1, value: '0.943' }
  - { label: Classes, value: '6' }
---

## Objective

Decide from a photo whether an item goes in the trash or the recycling, and raise recycling awareness around campus while doing it.

## Approach

The current model is **ResNet50** with ImageNet weights and a custom classification head (global average pooling, dropout, and a dense layer), trained with heavy augmentation, early stopping, and learning-rate reduction on plateau. It sorts items into cardboard, glass, metal, paper, plastic, and trash.

## Results

| Metric | Training | Validation |
| --- | --- | --- |
| Accuracy | 96.2% | 94.8% |
| F1 score | 0.958 | 0.943 |

Metal was the easiest class (F1 0.97) and general trash the hardest (F1 0.89), which makes sense: "trash" is everything that isn't something else.

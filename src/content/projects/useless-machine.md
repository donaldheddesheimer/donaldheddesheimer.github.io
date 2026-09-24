---
code: PRJ-01
title: Useless Machine
summary: A wooden box with a switch. Flip it, the lid opens, and a little arm flips it back. My first project ever.
status: shipped
start: '2023'
tags: [Hardware, Circuits, Woodworking]
repo: https://github.com/donaldheddesheimer/Useless-Machine
cover: /projects/useless-machine.jpg
coverAlt: The useless machine partly assembled, with the servo and switch mounted inside the box
evidence:
  - { kind: video, src: /projects/useless-machine.mp4, poster: /projects/useless-machine.jpg, alt: 'Video of the useless machine' }
  - { kind: photo, src: /projects/useless-machine-circuit.jpg, alt: 'The circuit' }
---

## Objective

Build a machine whose only job is to turn itself off.

<video src="/projects/useless-machine.mp4" controls muted playsinline preload="metadata"></video>

## How it works

A DPDT toggle switch sets the direction of a continuous-rotation servo. Flip the switch and the servo swings a wooden arm up out of the lid to flip it back. That reverses the motor, which then runs until the arm presses an SPDT lever switch and cuts the power.

![The circuit](/projects/useless-machine-circuit.jpg)

## Parts

A continuous-rotation servo, a DPDT toggle switch, an SPDT lever switch, a 3×AA battery holder, a small hinged wooden box, a wooden letter for the arm, and wood glue.

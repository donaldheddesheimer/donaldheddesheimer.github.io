---
code: PRJ-02
title: Swerve Drive
summary: FRC robot code that turns an Xbox controller into independent speed and angle commands for four swerve modules.
brief:
  does: 'FRC robot code that turns an Xbox controller into independent speed and angle commands for four swerve modules.'
  hard: 'Field-centric control from a Pigeon 2 IMU across MK3, MK4 and MK4i modules, with a held button for robot-centric.'
# TODO: brief: add what you owned in the rewrite (mine) and how it ran on the robot (shown).
line: 'Driver control for an FRC swerve robot'
stack: 'Java / WPILib'
status: archived
start: '2023'
org: wra
context: WRA Robotics
tags: [Java, Robotics, WPILib, Controls]
repo: https://github.com/donaldheddesheimer/Swerve-Drive-Robotics
---

## Objective

Rewrite our robotics team's swerve drive from scratch. It began as code for the Western Reserve Academy robotics team.

## Hardware

NEO motors on Swerve Drive Specialties MK4 modules, CTRE mag encoders, and a Pigeon 2 IMU. The code also targets MK3 and MK4i modules and adapts to other module styles.

## Controls

- **Left stick:** translation (forward, back, and sideways)
- **Right stick:** rotation
- **Y:** zero the gyro
- **Left bumper (hold):** switch from field-centric to robot-centric control

The drive logic was inspired by Team 364's BaseFalconSwerve.

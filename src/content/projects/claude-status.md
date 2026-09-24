---
code: PRJ-08
title: claude-status
summary: A floating macOS desktop pet that shows what Claude Code is doing, including sessions running on a remote host over SSH.
status: active
start: '2026-08'
tags: [Developer tools, LLMs, Swift, macOS]
repo: https://github.com/donald-heddesheimer/claude-status
cover: /projects/claude-status-pet.gif
coverAlt: The pet working, then blocked on a permission prompt, then idle again
poster: /projects/claude-status-states.png
evidence:
  - { kind: screenshot, src: /projects/claude-status-states.png, alt: 'The four states: nothing running, idle, working, and needs you' }
  - { kind: screenshot, src: /projects/claude-status-sessions.png, alt: 'Three sessions, each with its own bubble color, and the hover panel naming them' }
---

## Objective

When several Claude Code sessions run at once, some of them on a remote dev box, it's easy to miss the one waiting on you. claude-status puts a small critter on the desktop that always knows.

## What the pet tells you

![The four states: nothing running, idle, working, and needs you](/projects/claude-status-states.png)

| Claude is… | The pet |
| --- | --- |
| working | bobs and shuffles, with a thought bubble like `editing SessionStore.swift` |
| **blocked on you** | jitters inside a pulsing ring: `allow Bash?` |
| just finished | hops and throws a few sparks |
| idle / not running | breathes and blinks / eyes shut, dimmed |

Several sessions collapse into one mood, and **waiting outranks working**, because the session that needs you is the one worth surfacing. Each session gets its own bubble color, and hovering lists all of them.

![Three sessions, each with its own bubble color, and the hover panel naming them](/projects/claude-status-sessions.png)

## How it works

A Claude Code plugin posts hook events to a small HTTP listener in the macOS app. Remote sessions reach it through a single SSH `RemoteForward` tunnel. **Settings → Remote** writes that config for you: it backs up `~/.ssh/config`, tests the tunnel, and explains what came back.

On shared hosts the tunnel port belongs to whoever connected, so the app can filter by account. The docs are explicit that a self-reported username is a convenience filter, not a security boundary. For an actual boundary, there's a shared token.

The app is written in Swift, installs with one script and no dependencies, and speaks an agent-neutral protocol, so Codex or opencode sessions can share the same pet.

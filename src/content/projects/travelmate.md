---
code: PRJ-04
title: TravelMate
summary: A Django trip planner with live weather, generated packing lists, travel tips, and an AI travel assistant.
status: shipped
start: '2025-03'
tags: [Python, LLMs, Django, Web]
repo: https://github.com/donaldheddesheimer/TravelMate
demo: https://travelmate-jv1d.onrender.com/
cover: /projects/travelmate.jpg
coverAlt: TravelMate dashboard showing trips, weather, and the AI assistant
---

## Objective

Put everything you need for a trip in one place: the itinerary, the forecast, what to pack, and someone to ask.

## What it does

- **Trips:** create, edit, and organize itineraries with destinations and dates.
- **Weather:** live forecasts for each destination from the OpenWeatherMap API.
- **Packing lists:** generated from the destination, forecast, and trip length.
- **AI assistant:** a chat assistant for planning questions, using Gemini 2.5 Flash through OpenRouter.

## Stack

Django 4.2 with Django REST Framework, SQLite in development and PostgreSQL in production, and Crispy Forms on the front end. It's deployed on Render with Gunicorn and WhiteNoise.

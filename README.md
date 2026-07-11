Atmos Weather App

A clean, glass-morphism weather app that shows you the current conditions, hourly forecast, and the week ahead. The background theme changes based on the time of day, and there are some interactive particles that react to your mouse.

<a href="https://atmos-weather-app.onrender.com/" target="_blank">Check out the live site here</a>

What it does

- Current Weather. See the temperature, wind, humidity, air quality, and more.
- Forecasts. Scroll through the next 24 hours or check the 7-day outlook.
- Dynamic Themes. The colors shift automatically for Dawn, Day, Dusk, and Night.
- Responsive. Works great on mobile (portrait & landscape) and desktop.
- Location. It tries to find your location automatically, or you can just search for a city.

How it's built

- Ruby on Rails 7.1. Server-rendered app, no database, since everything is fetched live or cached in memory.
- Stimulus + importmap. Just enough Javascript for the interactive bits, no bundler/Node build step.
- Open-Meteo API. Where the weather data comes from (no API key needed!).
- BigDataCloud API. Used to figure out the city name from coordinates.
- Puma. The app server, deployed on Render via the included Dockerfile.

How to run it

1. Clone the repo.
2. Install the Ruby version in `.ruby-version` (currently 3.3.5).
3. Run `bundle install`.
4. Run `bin/rails server` and visit `http://localhost:3000`.

Alternatively, build and run it with Docker: `docker build -t atmos-weather . && docker run -p 3000:3000 atmos-weather`.

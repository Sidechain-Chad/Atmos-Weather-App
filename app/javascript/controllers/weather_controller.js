  import { Controller } from "@hotwired/stimulus"

  // Configuration constants
  const CONFIG = {
      particleCount: 120,
      baseSpeed: 0.8,
      interactionRadius: 150,
  };

  // Particle Class Definition
  class Mushi {
      constructor(canvasWidth, canvasHeight, theme, weatherType, x = null, y = null) {
          this.canvasWidth = canvasWidth;
          this.canvasHeight = canvasHeight;
          this.theme = theme;
          this.weatherType = weatherType;
          this.reset();
          if (x && y) {
              this.x = x;
              this.y = y;
          } else {
              this.y = Math.random() * this.canvasHeight;
          }
      }

      reset() {
          this.x = Math.random() * this.canvasWidth;
          this.y = this.weatherType === 'clear' ? this.canvasHeight + 10 : -10;
          this.size = Math.random() * 2 + 1;
          this.speedY = Math.random() * CONFIG.baseSpeed + 0.2;
          this.speedX = (Math.random() - 0.5) * 0.5;
          this.opacity = Math.random() * 0.5 + 0.2;
          this.growing = true;
      }

      update(mouseX, mouseY, weatherType, theme) {
          this.weatherType = weatherType;
          this.theme = theme;

          if (this.weatherType === 'clear') {
              this.y -= this.speedY * 0.5;
              if (this.y < -10) this.reset();
          } else {
              this.y += this.speedY;
              if (this.y > this.canvasHeight + 10) this.reset();
          }
          this.x += this.speedX;

          if (mouseX != null) {
              const dx = mouseX - this.x;
              const dy = mouseY - this.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < CONFIG.interactionRadius) {
                  const force = (CONFIG.interactionRadius - dist) / CONFIG.interactionRadius;
                  this.x -= (dx/dist) * force * 8;
                  this.y -= (dy/dist) * force * 8;
              }
          }

          if (this.growing) {
              this.opacity += 0.01;
              if (this.opacity >= 0.8) this.growing = false;
          } else {
              this.opacity -= 0.01;
              if (this.opacity <= 0.2) this.growing = true;
          }
      }

      draw(ctx) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

          if (this.theme === 'day') {
              ctx.fillStyle = `rgba(255, 230, 150, ${this.opacity})`;
              ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
          } else if (this.theme === 'morning') {
              ctx.fillStyle = `rgba(255, 200, 200, ${this.opacity})`;
              ctx.shadowColor = "rgba(255, 100, 100, 0.5)";
          } else {
              ctx.fillStyle = `rgba(200, 255, 255, ${this.opacity})`;
              ctx.shadowColor = "rgba(0, 255, 255, 0.8)";
          }

          ctx.shadowBlur = this.size * 2;
          ctx.fill();
          ctx.shadowBlur = 0;
      }
  }

  export default class extends Controller {
      static targets = [
          "canvas", "cityInput", "spinner", "result", "errorAlert", "errorMsg",
          "cityName", "countryCode", "timeBadge", "tempValue", "weatherDesc",
          "dateDisplay", "windSpeed", "humidity", "aqiSummary", "detailsWrapper",
          "caretIcon", "realFeel", "aqiValue", "uvIndex", "visibility",
          "windGusts", "windDir", "dewPoint", "cloudCover", "pressure",
          "dayHigh", "nightLow", "precipProb", "precipSum", "hourlyContainer"
      ]

      connect() {
          this.appState = {
              theme: 'night',
              weather: 'snow',
              particles: [],
              mouse: { x: null, y: null }
          };

          this.initCanvas();
          this.animate();
          this.initDragScroll();
          this.fetchWeather(this.cityInputTarget.value || 'Cape Town');
      }

      disconnect() {
          window.removeEventListener('resize', this.resizeCanvas.bind(this));
          cancelAnimationFrame(this.animationFrame);
      }

      search(event) {
          event.preventDefault();
          if (this.cityInputTarget.value) {
              this.fetchWeather(this.cityInputTarget.value);
          }
      }

      async fetchWeather(city) {
          this.showLoading(true);
          this.hideError();
          this.detailsWrapperTarget.classList.remove('open');
          this.caretIconTarget.classList.replace('ph-caret-up', 'ph-caret-down');

          try {
              const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
              const geoData = await geoRes.json();

              if (!geoData.results?.length) throw new Error("City not found. Please check spelling.");

              const { latitude, longitude, name, country } = geoData.results[0];

              const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m,uv_index&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=1`;
              const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`;

              const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);

              if (!weatherRes.ok) throw new Error("Weather service unavailable.");

              const weatherData = await weatherRes.json();
              const aqiData = await aqiRes.json();

              // CHANGE HERE: Passing weatherData.utc_offset_seconds
              this.processAllData(name, country, weatherData, aqiData, weatherData.utc_offset_seconds);

          } catch (error) {
              console.error(error);
              this.showError(error.message);
              this.cityInputTarget.classList.add('is-invalid');
          } finally {
              this.showLoading(false);
          }
      }

      processAllData(city, country, wData, aData, utcOffsetSeconds) {
          const current = wData.current;
          const daily = wData.daily;
          const hourly = wData.hourly;
          const aqi = aData.current ? aData.current.us_aqi : null;

          // 1. CALCULATE CITY TIME
          // Get current UTC time in ms -> Add city offset in ms
          const nowUTC = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
          const cityTime = new Date(nowUTC + (utcOffsetSeconds * 1000));
          const currentHour = cityTime.getHours();

          this.cityNameTarget.textContent = city;
          this.countryCodeTarget.textContent = country;

          // Pass the cityTime to the date updater
          this.updateDateDisplay(cityTime);

          this.tempValueTarget.textContent = Math.round(current.temperature_2m);
          const { desc, type } = this.getWeatherInfo(current.weather_code);
          this.weatherDescTarget.textContent = desc;
          this.appState.weather = type;

          this.windSpeedTarget.textContent = Math.round(current.wind_speed_10m);
          this.humidityTarget.textContent = current.relative_humidity_2m;
          this.renderAqiSummary(aqi);

          // Pass calculated currentHour to renderer
          this.renderHourly(hourly, currentHour);

          this.realFeelTarget.textContent = Math.round(current.apparent_temperature);
          this.aqiValueTarget.textContent = aqi !== null ? aqi : "--";
          this.uvIndexTarget.textContent = current.uv_index !== undefined ? current.uv_index : "Low";
          this.windGustsTarget.textContent = Math.round(current.wind_gusts_10m);
          this.windDirTarget.textContent = this.getCompassDirection(current.wind_direction_10m);
          this.dewPointTarget.textContent = Math.round(current.dew_point_2m);
          this.pressureTarget.textContent = Math.round(current.surface_pressure);
          if(this.hasCloudCoverTarget) this.cloudCoverTarget.textContent = current.cloud_cover;
          this.visibilityTarget.textContent = (current.visibility / 1000).toFixed(1);

          this.dayHighTarget.textContent = Math.round(daily.temperature_2m_max[0]);
          this.nightLowTarget.textContent = Math.round(daily.temperature_2m_min[0]);
          this.precipProbTarget.textContent = daily.precipitation_probability_max[0];
          this.precipSumTarget.textContent = daily.precipitation_sum[0];

          // We pass cityTime (the calculated Date object) instead of current
          this.handleTheme(cityTime, daily, current.weather_code);
          this.resultTarget.style.opacity = 1;
      }

      updateDateDisplay(dateObj) {
              // Use the dateObj passed in (which is the city's local time)
              this.dateDisplayTarget.textContent = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
          }

      renderHourly(hourly, currentHour) {
          this.hourlyContainerTarget.innerHTML = "";

          // Loop from the CITY'S current hour to 23 (End of today)
          for (let i = currentHour; i <= 23; i++) {
              if (i >= hourly.time.length) break;

              const code = hourly.weather_code[i];
              const temp = Math.round(hourly.temperature_2m[i]);
              const isDay = hourly.is_day[i];
              const iconClass = this.getIconClass(code, isDay === 1);

              let displayTime = `${i}:00`;
              if (i === currentHour) displayTime = "Now";

              const div = document.createElement('div');
              div.className = 'hour-item';
              if (i === currentHour) div.classList.add('now');

              div.innerHTML = `
                  <span class="hour-time">${displayTime}</span>
                  <i class="hour-icon ${iconClass}"></i>
                  <span class="hour-temp">${temp}°</span>
              `;
              this.hourlyContainerTarget.appendChild(div);
          }
      }

      initCanvas() {
          this.ctx = this.canvasTarget.getContext('2d');
          this.resizeCanvas();
          for (let i = 0; i < CONFIG.particleCount; i++) {
              this.appState.particles.push(new Mushi(this.canvasTarget.width, this.canvasTarget.height, this.appState.theme, this.appState.weather));
          }
          window.addEventListener('resize', this.resizeCanvas.bind(this));
          window.addEventListener('mousemove', e => { this.appState.mouse.x = e.x; this.appState.mouse.y = e.y; });
          window.addEventListener('touchmove', e => { if (e.touches[0]) { this.appState.mouse.x = e.touches[0].clientX; this.appState.mouse.y = e.touches[0].clientY; } });
          window.addEventListener('mouseout', () => { this.appState.mouse.x = null; this.appState.mouse.y = null; });
      }

      resizeCanvas() {
          this.canvasTarget.width = window.innerWidth;
          this.canvasTarget.height = window.innerHeight;
          this.appState.particles.forEach(p => { p.canvasWidth = window.innerWidth; p.canvasHeight = window.innerHeight; });
      }

      animate() {
          this.ctx.clearRect(0, 0, this.canvasTarget.width, this.canvasTarget.height);
          this.appState.particles.forEach(p => {
              p.update(this.appState.mouse.x, this.appState.mouse.y, this.appState.weather, this.appState.theme);
              p.draw(this.ctx);
          });
          this.animationFrame = requestAnimationFrame(this.animate.bind(this));
      }

      handleTheme(cityTime, daily, weatherCode) {
            // 1. Get Sunrise and Sunset times
            const sunriseTime = new Date(daily.sunrise[0]);
            const sunsetTime = new Date(daily.sunset[0]);

            // 2. Define a "Transition Window" (45 minutes)
            const transitionWindow = 45 * 60 * 1000;

            // 3. Calculate time differences
            const distToSunrise = cityTime - sunriseTime;
            const distToSunset = cityTime - sunsetTime;

            // Default vars
            let theme = 'night';
            let label = 'Night';

            // 4. Logic Tree
            if (Math.abs(distToSunrise) <= transitionWindow) {
                // DAWN: 45 mins around Sunrise
                theme = 'morning';
                label = 'Dawn';
            }
            else if (Math.abs(distToSunset) <= transitionWindow) {
                // DUSK: 45 mins around Sunset
                theme = 'dusk';
                label = 'Dusk';
            }
            else if (cityTime > sunriseTime && cityTime < sunsetTime) {
                // DAY: Fully after Sunrise, before Sunset
                theme = 'day';
                label = 'Day';
            }
            else {
                // It is dark (either before Dawn or after Dusk)
                // CHECK: Is it "Morning" (00:00 - Dawn) or "Night" (Dusk - 23:59)?

                // We get the hour of the cityTime (0-23)
                const currentHour = cityTime.getHours();

                // If it is past midnight (00:00) but before sunrise, call it Morning
                if (currentHour >= 0 && cityTime < sunriseTime) {
                    theme = 'morning';
                    label = 'Morning';
                } else {
                    // Otherwise it is pre-midnight darkness
                    theme = 'night';
                    label = 'Night';
                }
            }

            // 5. Apply Theme
            document.body.className = `theme-${theme}`;

            // Special case for Clear Day
            if (theme === 'day' && (weatherCode === 0 || weatherCode === 1)) {
                document.body.classList.add('weather-clear');
            }

            // 6. Update App State for Particles
            // (Dusk uses morning particles, everything else maps 1:1)
            this.appState.theme = theme === 'dusk' ? 'morning' : theme;
            this.timeBadgeTarget.textContent = label;
        }

      renderAqiSummary(aqi) {
          if (aqi !== null) {
              let aqiClass = 'aqi-good';
              let aqiText = 'Good';
              if (aqi > 50) { aqiClass = 'aqi-fair'; aqiText = 'Moderate'; }
              if (aqi > 100) { aqiClass = 'aqi-poor'; aqiText = 'Unhealthy'; }
              this.aqiSummaryTarget.innerHTML = `<span class="aqi-badge ${aqiClass}">${aqiText}</span>`;
          } else {
              this.aqiSummaryTarget.textContent = "N/A";
          }
      }

      getCompassDirection(degrees) {
          const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          const index = Math.round(degrees / 45) % 8;
          return directions[index];
      }

      getWeatherInfo(code) {
          if (code === 0) return { desc: "Clear Sky", type: 'clear' };
          if (code <= 3) return { desc: "Partly Cloudy", type: 'clear' };
          if (code <= 48) return { desc: "Fog", type: 'snow' };
          if (code <= 67) return { desc: "Rain", type: 'snow' };
          if (code <= 77) return { desc: "Snow", type: 'snow' };
          if (code <= 82) return { desc: "Heavy Rain", type: 'snow' };
          return { desc: "Thunderstorm", type: 'snow' };
      }

      getIconClass(code, isDay) {
          if (code === 0) return isDay ? 'ph ph-sun' : 'ph ph-moon';
          if (code <= 3) return isDay ? 'ph ph-cloud-sun' : 'ph ph-cloud-moon';
          if (code <= 48) return 'ph ph-cloud-fog';
          if (code <= 67) return 'ph ph-cloud-rain';
          if (code <= 77) return 'ph ph-snowflake';
          if (code > 90) return 'ph ph-cloud-lightning';
          return 'ph ph-cloud';
      }

      showLoading(isLoading) {
          this.spinnerTarget.style.display = isLoading ? 'inline-block' : 'none';
      }

      showError(msg) {
          this.errorMsgTarget.textContent = msg;
          this.errorAlertTarget.style.display = 'block';
          setTimeout(() => {
              this.errorAlertTarget.style.display = 'none';
              this.cityInputTarget.classList.remove('is-invalid');
          }, 4000);
      }

      hideError() {
          this.errorAlertTarget.style.display = 'none';
      }

      toggleDetails() {
        // 1. Toggle the CSS class to animate opening/closing
        this.detailsWrapperTarget.classList.toggle('open');
        const isOpen = this.detailsWrapperTarget.classList.contains('open');

        // 2. Switch the caret icon (Up/Down)
        this.caretIconTarget.classList.toggle('ph-caret-up', isOpen);
        this.caretIconTarget.classList.toggle('ph-caret-down', !isOpen);

        if (isOpen) {
          // SCROLL DOWN: Wait 100ms for the animation to start, then scroll to the details
          setTimeout(() => {
            this.detailsWrapperTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 500);
        } else {
          // SCROLL UP: Scroll back to center the main card
          this.resultTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      initDragScroll() {
      const slider = this.hourlyContainerTarget;
      let isDown = false;
      let startX;
      let scrollLeft;
      let velX = 0; // Velocity X
      let momentumID;

      slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        cancelAnimationFrame(momentumID); // Stop any current glide
      });

      slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.classList.remove('active');
      });

      slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.classList.remove('active');
        this.beginMomentum(slider, velX); // Start gliding on release
      });

      slider.addEventListener('mousemove', (e) => {
          if (!isDown) return;
          e.preventDefault();

          const x = e.pageX - slider.offsetLeft;
          // CHANGED: Reduced from 2 to 1.5 for a tighter, smoother feel
          const walk = (x - startX) * 1.5;

          const prevScrollLeft = slider.scrollLeft;
          slider.scrollLeft = scrollLeft - walk;

          velX = slider.scrollLeft - prevScrollLeft;
        });
    }

    // Update in beginMomentum
      beginMomentum(slider, velocity) {
        // CHANGED: Reduced from 0.95 to 0.92 for a "heavier" premium stop
        const decay = 0.92;

        const step = () => {
          if (Math.abs(velocity) < 0.5) return;

          velocity *= decay;
          slider.scrollLeft += velocity;

          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }
  }

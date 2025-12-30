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
    // Update reference to current state
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

    // Mouse Interaction
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

    // Twinkle effect
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
  // Define targets to access elements easily
  static targets = [
    "canvas", "cityInput", "spinner", "result", "errorAlert", "errorMsg",
    "cityName", "countryCode", "timeBadge", "tempValue", "weatherDesc",
    "windSpeed", "humidity", "aqiSummary", "detailsWrapper", "caretIcon",
    "realFeel", "aqiValue", "uvIndex", "visibility", "windGusts", "windDir",
    "dewPoint", "cloudCover", "pressure", "dayHigh", "nightLow",
    "precipProb", "precipSum"
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

    // Initial fetch
    this.fetchWeather(this.cityInputTarget.value || 'Cape Town');
  }

  disconnect() {
    // Cleanup to prevent memory leaks in Single Page App feel
    window.removeEventListener('resize', this.resizeCanvas.bind(this));
    cancelAnimationFrame(this.animationFrame);
  }

  // --- Actions ---

  search(event) {
    event.preventDefault();
    if (this.cityInputTarget.value) {
      this.fetchWeather(this.cityInputTarget.value);
    }
  }

  toggleDetails() {
    this.detailsWrapperTarget.classList.toggle('open');
    const isOpen = this.detailsWrapperTarget.classList.contains('open');

    if (isOpen) {
      this.caretIconTarget.classList.replace('ph-caret-down', 'ph-caret-up');
      setTimeout(() => {
        this.detailsWrapperTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else {
      this.caretIconTarget.classList.replace('ph-caret-up', 'ph-caret-down');
    }
  }

  // --- API Logic ---

  async fetchWeather(city) {
    this.showLoading(true);
    this.hideError();
    this.detailsWrapperTarget.classList.remove('open');
    this.caretIconTarget.classList.replace('ph-caret-up', 'ph-caret-down');

    try {
      // 1. Geocoding
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (!geoData.results?.length) throw new Error("City not found. Please check spelling.");
      const { latitude, longitude, name, country } = geoData.results[0];

      // 2. Weather & AQI
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto`;
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`;

      const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);

      if (!weatherRes.ok) throw new Error("Weather service unavailable.");

      const weatherData = await weatherRes.json();
      const aqiData = await aqiRes.json();

      this.processAllData(name, country, weatherData, aqiData);

    } catch (error) {
      console.error(error);
      this.showError(error.message);
      this.cityInputTarget.classList.add('is-invalid');
    } finally {
      this.showLoading(false);
    }
  }

  processAllData(city, country, wData, aData) {
    const current = wData.current;
    const daily = wData.daily;
    const aqi = aData.current ? aData.current.us_aqi : null;

    // Header
    this.cityNameTarget.textContent = city;
    this.countryCodeTarget.textContent = country;
    this.tempValueTarget.textContent = Math.round(current.temperature_2m);

    const { desc, type } = this.getWeatherInfo(current.weather_code);
    this.weatherDescTarget.textContent = desc;
    this.appState.weather = type;

    // Summary
    this.windSpeedTarget.textContent = Math.round(current.wind_speed_10m);
    this.humidityTarget.textContent = current.relative_humidity_2m;
    this.renderAqiSummary(aqi);

    // Details
    this.realFeelTarget.textContent = Math.round(current.apparent_temperature);
    this.aqiValueTarget.textContent = aqi !== null ? aqi : "--";
    this.uvIndexTarget.textContent = current.uv_index !== undefined ? current.uv_index : "Low";
    this.windGustsTarget.textContent = Math.round(current.wind_gusts_10m);
    this.windDirTarget.textContent = this.getCompassDirection(current.wind_direction_10m);
    this.dewPointTarget.textContent = Math.round(current.dew_point_2m);
    this.pressureTarget.textContent = Math.round(current.surface_pressure);
    if(this.hasCloudCoverTarget) this.cloudCoverTarget.textContent = current.cloud_cover;
    this.visibilityTarget.textContent = (current.visibility / 1000).toFixed(1);

    // Forecast
    this.dayHighTarget.textContent = Math.round(daily.temperature_2m_max[0]);
    this.nightLowTarget.textContent = Math.round(daily.temperature_2m_min[0]);
    this.precipProbTarget.textContent = daily.precipitation_probability_max[0];
    this.precipSumTarget.textContent = daily.precipitation_sum[0];

    this.handleTheme(current, daily);
    this.resultTarget.style.opacity = 1;
  }

  // --- Visuals & Canvas ---

  initCanvas() {
    this.ctx = this.canvasTarget.getContext('2d');
    this.resizeCanvas();

    for (let i = 0; i < CONFIG.particleCount; i++) {
      this.appState.particles.push(new Mushi(this.canvasTarget.width, this.canvasTarget.height, this.appState.theme, this.appState.weather));
    }

    window.addEventListener('resize', this.resizeCanvas.bind(this));

    // Mouse listeners attached to window for global tracking
    window.addEventListener('mousemove', e => { this.appState.mouse.x = e.x; this.appState.mouse.y = e.y; });
    window.addEventListener('touchmove', e => {
        if(e.touches[0]) { this.appState.mouse.x = e.touches[0].clientX; this.appState.mouse.y = e.touches[0].clientY; }
    });
    window.addEventListener('mouseout', () => { this.appState.mouse.x = null; this.appState.mouse.y = null; });
  }

  resizeCanvas() {
    this.canvasTarget.width = window.innerWidth;
    this.canvasTarget.height = window.innerHeight;
    this.appState.particles.forEach(p => {
        p.canvasWidth = window.innerWidth;
        p.canvasHeight = window.innerHeight;
    });
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvasTarget.width, this.canvasTarget.height);
    this.appState.particles.forEach(p => {
      p.update(this.appState.mouse.x, this.appState.mouse.y, this.appState.weather, this.appState.theme);
      p.draw(this.ctx);
    });
    this.animationFrame = requestAnimationFrame(this.animate.bind(this));
  }

  // --- Helpers ---

  handleTheme(current, daily) {
    const now = new Date(current.time);
    const sunrise = new Date(daily.sunrise[0]);
    const sunset = new Date(daily.sunset[0]);
    const oneHour = 60 * 60 * 1000;
    const isMorning = Math.abs(now - sunrise) < oneHour;

    let timeLabel = "";
    document.body.className = "";

    if (isMorning) {
      this.appState.theme = 'morning';
      document.body.classList.add('theme-morning');
      timeLabel = "Dawn";
    } else if (current.is_day === 1) {
      this.appState.theme = 'day';
      document.body.classList.add('theme-day');
      if(this.appState.weather === 'clear') document.body.classList.add('weather-clear');
      timeLabel = "Day";
    } else {
      this.appState.theme = 'night';
      document.body.classList.add('theme-night');
      timeLabel = "Night";
    }
    this.timeBadgeTarget.textContent = timeLabel;
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
}

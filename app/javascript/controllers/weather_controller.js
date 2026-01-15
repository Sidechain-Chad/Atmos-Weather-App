import { Controller } from "@hotwired/stimulus"

// Configuration constants
const CONFIG = {
    particleCount: 120,
    baseSpeed: 0.8,
    interactionRadius: 150,
};

// V2 PARTICLE CLASS: Supports Orbs and Rain
class Mushi {
    constructor(canvasWidth, canvasHeight, theme, weatherType) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.reset(theme, weatherType);
    }

    reset(theme, weatherType) {
        this.theme = theme;
        this.weatherType = weatherType;
        this.x = Math.random() * this.canvasWidth;

        // Context-aware spawning
        const isRain = ['rain', 'drizzle', 'thunderstorm'].some(t => this.weatherType.includes(t));

        if (isRain) {
            this.y = Math.random() * -100; // Start above screen
            this.speedY = Math.random() * 15 + 10; // Fast rain
            this.speedX = (Math.random() - 0.5) * 2; // Slight wind
            this.size = Math.random() * 20 + 10; // Length of rain drop
        } else {
            // Floating Orbs
            this.y = Math.random() * this.canvasHeight;
            this.speedY = Math.random() * 0.5 + 0.1;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 3 + 1; // Radius
        }

        this.opacity = 0;
        this.growing = true;
    }

    update(mouseX, mouseY, weatherType, theme) {
        const isRain = ['rain', 'drizzle', 'thunderstorm'].some(t => weatherType.includes(t));

        this.y += this.speedY;
        this.x += this.speedX;

        // Reset if off screen
        if (this.y > this.canvasHeight + 50) {
            this.reset(theme, weatherType);
        }

        // Mouse Interaction (Push) - Only for orbs
        if (mouseX != null && !isRain) {
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
                const force = (150 - dist) / 150;
                this.x -= (dx / dist) * force * 5;
                this.y -= (dy / dist) * force * 5;
            }
        }

        // Twinkle/Fade logic
        if (this.growing) {
            this.opacity += 0.02;
            if (this.opacity >= 0.6) this.growing = false;
        } else {
            this.opacity -= 0.01;
            if (this.opacity <= 0.1) this.growing = true;
        }
    }

    draw(ctx) {
        const isRain = ['rain', 'drizzle', 'thunderstorm'].some(t => this.weatherType.includes(t));

        ctx.beginPath();

        if (isRain) {
            // Draw Rain Line
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + this.speedX, this.y + this.size);
            ctx.strokeStyle = `rgba(200, 230, 255, ${this.opacity * 0.8})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else {
            // Draw Glowing Orb
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            let color = '255, 255, 255'; // Default white
            if (this.theme === 'day') color = '255, 220, 150'; // Gold
            if (this.theme === 'dusk') color = '255, 180, 180'; // Pinkish

            ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
            ctx.shadowColor = `rgba(${color}, 0.5)`;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0; // Reset
        }
    }
}

export default class extends Controller {
    static targets = [
        "canvas", "cityInput", "spinner", "result", "skeleton",
        "errorAlert", "errorMsg", "searchResults",
        "cityName", "countryCode", "timeBadge", "tempValue", "weatherDesc",
        "dateDisplay", "windSpeed", "humidity", "aqiSummary", "detailsWrapper",
        "caretIcon", "realFeel", "aqiValue", "uvIndex", "visibility",
        "windGusts", "windDir", "dewPoint", "cloudCover", "pressure",
        "dayHigh", "nightLow", "precipProb", "precipSum",
        "hourlyChart", "dailyContainer", // V3 Targets
        "favIcon", "favoritesList"       // V3 Targets
    ]

    connect() {
        this.appState = {
            theme: 'night',
            weather: 'snow',
            particles: [],
            mouse: { x: null, y: null },
            userLocation: null,
            lastFetchTime: 0,
            currentCity: null
        };

        this.selectedIndex = -1;
        this.chartInstance = null; // Store chart instance

        this.animate = this.animate.bind(this);
        this.abortController = new AbortController();
        this.initCanvas();
        this.animate();

        // --- INIT SCROLL PHYSICS (Daily Only now) ---
        this.initDailyScroll();

        // --- LOAD FAVORITES ---
        this.loadFavorites();

        this.getUserLocation();

        // --- HANDLERS ---
        this.clickOutsideHandler = (e) => {
            if (!this.element.contains(e.target)) {
                this.searchResultsTarget.classList.remove('active');
            }
        };

        this.resizeHandler = this.resizeCanvas.bind(this);

        this.mouseMoveHandler = (e) => {
            this.appState.mouse.x = e.x;
            this.appState.mouse.y = e.y;
        };
        this.touchMoveHandler = (e) => {
            if (e.touches[0]) {
                this.appState.mouse.x = e.touches[0].clientX;
                this.appState.mouse.y = e.touches[0].clientY;
            }
        };
        this.mouseOutHandler = () => {
            this.appState.mouse.x = null;
            this.appState.mouse.y = null;
        };

        this.visibilityHandler = () => {
            if (document.visibilityState === "visible") {
                if (!this.animationFrame) this.animate();
                this.checkAndRefreshData();
            } else {
                cancelAnimationFrame(this.animationFrame);
                this.animationFrame = null;
            }
        };

        // --- LISTENERS ---
        document.addEventListener('click', this.clickOutsideHandler);
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('mousemove', this.mouseMoveHandler);
        window.addEventListener('touchmove', this.touchMoveHandler);
        window.addEventListener('mouseout', this.mouseOutHandler);
        document.addEventListener("visibilitychange", this.visibilityHandler);

        // Auto Refresh (15 mins)
        this.refreshTimer = setInterval(() => {
            this.checkAndRefreshData();
        }, 900000);
    }

    disconnect() {
        document.removeEventListener('click', this.clickOutsideHandler);
        window.removeEventListener('resize', this.resizeHandler);
        window.removeEventListener('mousemove', this.mouseMoveHandler);
        window.removeEventListener('touchmove', this.touchMoveHandler);
        window.removeEventListener('mouseout', this.mouseOutHandler);
        document.removeEventListener("visibilitychange", this.visibilityHandler);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        cancelAnimationFrame(this.animationFrame);
        this.abortController.abort();

        // Destroy chart on disconnect
        if (this.chartInstance) this.chartInstance.destroy();
    }

    checkAndRefreshData() {
        const now = Date.now();
        if (this.appState.currentCity && (now - this.appState.lastFetchTime >= 900000)) {
            console.log("Auto-refreshing weather data...");
            const c = this.appState.currentCity;
            this.executeWeatherFetch(c.lat, c.lon, c.name, c.country);
        }
    }

    // --- FAVORITES LOGIC (V3) ---

    loadFavorites() {
        const favs = JSON.parse(localStorage.getItem('weather_favs')) || [];
        this.renderFavoritesList(favs);
    }

    toggleFavorite() {
        const city = this.cityNameTarget.textContent;
        const country = this.countryCodeTarget.textContent;
        if (city === "--") return;

        let favs = JSON.parse(localStorage.getItem('weather_favs')) || [];
        const existingIndex = favs.findIndex(f => f.name === city);

        if (existingIndex > -1) {
            // Remove
            favs.splice(existingIndex, 1);
            this.favIconTarget.classList.remove('ph-star-fill');
            this.favIconTarget.classList.add('ph-star');
            this.favIconTarget.parentElement.classList.remove('active');
        } else {
            // Add
            favs.push({ name: city, country: country });
            this.favIconTarget.classList.remove('ph-star');
            this.favIconTarget.classList.add('ph-star-fill');
            this.favIconTarget.parentElement.classList.add('active');
        }

        localStorage.setItem('weather_favs', JSON.stringify(favs));
        this.renderFavoritesList(favs);
    }

    checkIfFavorite(cityName) {
        const favs = JSON.parse(localStorage.getItem('weather_favs')) || [];
        const isFav = favs.some(f => f.name === cityName);

        if (isFav) {
            this.favIconTarget.classList.remove('ph-star');
            this.favIconTarget.classList.add('ph-star-fill');
            this.favIconTarget.parentElement.classList.add('active');
        } else {
            this.favIconTarget.classList.remove('ph-star-fill');
            this.favIconTarget.classList.add('ph-star');
            this.favIconTarget.parentElement.classList.remove('active');
        }
    }

    renderFavoritesList(favs) {
        this.favoritesListTarget.innerHTML = '';
        if (favs.length === 0) {
            this.favoritesListTarget.style.display = 'none';
            return;
        }

        this.favoritesListTarget.style.display = 'flex';

        favs.forEach(city => {
            const chip = document.createElement('div');
            chip.className = 'fav-chip';
            chip.innerHTML = `
                <span>${city.name}</span>
                <i class="ph ph-x fav-remove"></i>
            `;

            chip.addEventListener('click', (e) => {
                if (e.target.classList.contains('fav-remove')) {
                    e.stopPropagation();
                    this.removeFavorite(city.name);
                } else {
                    this.cityInputTarget.value = city.name;
                    this.fetchWeather(city.name);
                }
            });

            this.favoritesListTarget.appendChild(chip);
        });
    }

    removeFavorite(name) {
        let favs = JSON.parse(localStorage.getItem('weather_favs')) || [];
        favs = favs.filter(f => f.name !== name);
        localStorage.setItem('weather_favs', JSON.stringify(favs));
        this.renderFavoritesList(favs);

        if (this.cityNameTarget.textContent === name) {
            this.checkIfFavorite(name);
        }
    }

    // --- Geolocation & Search ---

    getUserLocation() {
        if (navigator.geolocation) {
            this.showLoading(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    this.appState.userLocation = { lat, lon };
                    this.fetchWeatherByCoords(lat, lon);
                },
                (error) => {
                    console.log("Geolocation denied, defaulting to Cape Town");
                    this.fetchWeather('Cape Town');
                }
            );
        } else {
            this.fetchWeather('Cape Town');
        }
    }

    async handleInput() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            const query = this.cityInputTarget.value;
            if (query.length < 3) {
                this.searchResultsTarget.classList.remove('active');
                return;
            }
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
                const data = await res.json();
                if (data.results) {
                    let sortedResults = data.results;
                    if (this.appState.userLocation) {
                        sortedResults = data.results.sort((a, b) => {
                            const distA = this.calculateDistance(this.appState.userLocation.lat, this.appState.userLocation.lon, a.latitude, a.longitude);
                            const distB = this.calculateDistance(this.appState.userLocation.lat, this.appState.userLocation.lon, b.latitude, b.longitude);
                            return distA - distB;
                        });
                    }
                    this.renderSearchResults(sortedResults);
                } else {
                    this.searchResultsTarget.classList.remove('active');
                }
            } catch (error) {
                console.error(error);
            }
        }, 300);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    renderSearchResults(results) {
        this.selectedIndex = -1;
        this.searchResultsTarget.innerHTML = '';
        results.forEach(city => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            const admin = city.admin1 || city.admin2 || '';
            const country = city.country || '';
            const locationStr = [admin, country].filter(Boolean).join(', ');
            div.innerHTML = `<strong>${city.name}</strong><small>${locationStr}</small>`;
            div.onclick = () => {
                this.cityInputTarget.value = city.name;
                this.searchResultsTarget.classList.remove('active');
                this.executeWeatherFetch(city.latitude, city.longitude, city.name, city.country);
            };
            this.searchResultsTarget.appendChild(div);
        });
        this.searchResultsTarget.classList.add('active');
    }

    async fetchWeatherByCoords(lat, lon) {
        try {
            const revRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const revData = await revRes.json();
            const city = revData.city || revData.locality || "My Location";
            const country = revData.countryName || revData.countryCode || "";
            this.executeWeatherFetch(lat, lon, city, country);
        } catch (e) {
            console.error("Reverse geocoding failed", e);
            this.executeWeatherFetch(lat, lon, "My Location", "");
        }
    }

    search(event) {
        event.preventDefault();
        if (this.cityInputTarget.value) {
            this.fetchWeather(this.cityInputTarget.value);
            this.searchResultsTarget.classList.remove('active');
        }
    }

    async fetchWeather(city) {
        this.showLoading(true);
        this.hideError();
        // this.detailsWrapperTarget.classList.remove('open'); // Removed in V2 layout

        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`);
            const geoData = await geoRes.json();
            if (!geoData.results?.length) throw new Error("City not found.");

            let bestMatch = geoData.results[0];
            if (this.appState.userLocation) {
                geoData.results.sort((a, b) => {
                    const distA = this.calculateDistance(this.appState.userLocation.lat, this.appState.userLocation.lon, a.latitude, a.longitude);
                    const distB = this.calculateDistance(this.appState.userLocation.lat, this.appState.userLocation.lon, b.latitude, b.longitude);
                    return distA - distB;
                });
                bestMatch = geoData.results[0];
            }
            const { latitude, longitude, name, country } = bestMatch;
            this.executeWeatherFetch(latitude, longitude, name, country);
        } catch (error) {
            this.showError(error.message);
            this.showLoading(false);
        }
    }

    async executeWeatherFetch(latitude, longitude, name, country) {
        this.appState.lastFetchTime = Date.now();
        this.appState.currentCity = { lat: latitude, lon: longitude, name: name, country: country };
        this.showLoading(true);
        this.hideError();

        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m,uv_index&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=8`;
            const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`;

            const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);
            if (!weatherRes.ok) throw new Error("Weather service unavailable.");

            const weatherData = await weatherRes.json();
            const aqiData = await aqiRes.json();

            this.processAllData(name, country, weatherData, aqiData, weatherData.utc_offset_seconds, latitude, longitude);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    handleKeydown(event) {
        const items = this.searchResultsTarget.querySelectorAll('.search-result-item');
        if (!items.length) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.selectedIndex++;
            if (this.selectedIndex >= items.length) this.selectedIndex = 0;
            this.updateSelection(items);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.selectedIndex--;
            if (this.selectedIndex < 0) this.selectedIndex = items.length - 1;
            this.updateSelection(items);
        } else if (event.key === 'Enter') {
            if (this.selectedIndex > -1) {
                event.preventDefault();
                items[this.selectedIndex].click();
            }
        } else if (event.key === 'Escape') {
            this.searchResultsTarget.classList.remove('active');
            this.cityInputTarget.blur();
        }
    }

    updateSelection(items) {
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    // --- DATA PROCESSING & UI ---

    processAllData(city, country, wData, aData, utcOffsetSeconds, targetLat, targetLon) {
        const current = wData.current;
        const daily = wData.daily;
        const hourly = wData.hourly;
        const aqi = aData.current ? aData.current.us_aqi : null;

        const nowUTC = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
        const cityTime = new Date(nowUTC + (utcOffsetSeconds * 1000));
        const currentHour = cityTime.getHours();

        this.cityNameTarget.textContent = city;
        this.countryCodeTarget.textContent = country;
        this.updateDateDisplay(cityTime);

        // V3: Check Favorite Status
        this.checkIfFavorite(city);

        this.tempValueTarget.textContent = Math.round(current.temperature_2m);
        const { desc, type } = this.getWeatherInfo(current.weather_code);
        this.weatherDescTarget.textContent = desc;
        this.appState.weather = type;

        this.windSpeedTarget.textContent = Math.round(current.wind_speed_10m);
        this.humidityTarget.textContent = current.relative_humidity_2m;
        this.renderAqiSummary(aqi);

        // V3: Render CHART instead of list
        this.renderHourlyChart(hourly, currentHour);

        this.render7DayForecast(daily);

        this.realFeelTarget.textContent = Math.round(current.apparent_temperature);
        this.aqiValueTarget.textContent = aqi !== null ? aqi : "--";
        this.uvIndexTarget.textContent = current.uv_index !== undefined ? current.uv_index : "Low";
        this.windGustsTarget.textContent = Math.round(current.wind_gusts_10m);
        this.windDirTarget.textContent = this.getCompassDirection(current.wind_direction_10m);
        this.dewPointTarget.textContent = Math.round(current.dew_point_2m);
        this.pressureTarget.textContent = Math.round(current.surface_pressure);
        if (this.hasCloudCoverTarget) this.cloudCoverTarget.textContent = current.cloud_cover;
        this.visibilityTarget.textContent = (current.visibility / 1000).toFixed(1);

        this.dayHighTarget.textContent = Math.round(daily.temperature_2m_max[0]);
        this.nightLowTarget.textContent = Math.round(daily.temperature_2m_min[0]);
        this.precipProbTarget.textContent = daily.precipitation_probability_max[0];
        this.precipSumTarget.textContent = daily.precipitation_sum[0];

        this.handleTheme(cityTime, daily, current.weather_code);

        const glassPanel = this.element.querySelector('.glass-panel');
        if (glassPanel) glassPanel.scrollTop = 0;

        this.resultTarget.style.display = 'flex';
        this.resultTarget.style.flexDirection = 'column';
    }

    updateDateDisplay(dateObj) {
        this.dateDisplayTarget.textContent = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    }

    // --- V3 CHART RENDERING ---
    renderHourlyChart(hourly, currentHour) {
        // Destroy previous to prevent leaks
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = this.hourlyChartTarget.getContext('2d');

        const labels = [];
        const dataPoints = [];

        for (let i = 0; i < 24; i++) {
            const index = currentHour + i;
            if (index >= hourly.time.length) break;
            const time = new Date(hourly.time[index]).getHours() + ":00";
            labels.push(i === 0 ? "Now" : time);
            dataPoints.push(Math.round(hourly.temperature_2m[index]));
        }

        // V3 Gradient Look
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature',
                    data: dataPoints,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#ffffff',
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleFont: { family: 'Inter' },
                        bodyFont: { family: 'Space Grotesk', size: 14 }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 },
                        border: { display: false }
                    },
                    y: {
                        display: false,
                        grid: { display: false }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    render7DayForecast(daily) {
        this.dailyContainerTarget.scrollTop = 0;
        this.dailyContainerTarget.innerHTML = '';

        for (let i = 1; i < daily.time.length; i++) {
            const dateStr = daily.time[i];
            const max = Math.round(daily.temperature_2m_max[i]);
            const min = Math.round(daily.temperature_2m_min[i]);
            const code = daily.weather_code[i];
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateNum = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const iconClass = this.getIconClass(code, true);

            const div = document.createElement('div');
            div.className = 'daily-row';
            div.innerHTML = `
                <div class="daily-date">
                    <span class="day-name">${dayName}</span>
                    <span class="day-num">${dateNum}</span>
                </div>
                <div class="daily-icon"><i class="${iconClass}"></i></div>
                <div class="daily-temps">
                    <span class="temp-low">${min}°</span>
                    <span class="temp-high">${max}°</span>
                </div>
            `;
            this.dailyContainerTarget.appendChild(div);
        }
    }

    // --- CANVAS & PARTICLES ---
    initCanvas() {
        this.ctx = this.canvasTarget.getContext('2d');
        this.resizeCanvas();
        for (let i = 0; i < CONFIG.particleCount; i++) {
            this.appState.particles.push(new Mushi(this.canvasTarget.width, this.canvasTarget.height, this.appState.theme, this.appState.weather));
        }
    }

    resizeCanvas() {
        const width = window.innerWidth || document.documentElement.clientWidth;
        const height = window.innerHeight || document.documentElement.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.canvasTarget.width = width * dpr;
        this.canvasTarget.height = height * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvasTarget.style.width = width + 'px';
        this.canvasTarget.style.height = height + 'px';
        this.appState.particles.forEach(p => {
            p.canvasWidth = width;
            p.canvasHeight = height;
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvasTarget.width, this.canvasTarget.height);
        this.appState.particles.forEach(p => {
            p.update(this.appState.mouse.x, this.appState.mouse.y, this.appState.weather, this.appState.theme);
            p.draw(this.ctx);
        });
        if (document.visibilityState === "visible") {
            this.animationFrame = requestAnimationFrame(this.animate);
        }
    }

    // --- HELPERS ---
    handleTheme(cityTime, daily, weatherCode) {
        const sunriseTime = new Date(daily.sunrise[0]);
        const sunsetTime = new Date(daily.sunset[0]);
        const transitionWindow = 45 * 60 * 1000;
        const distToSunrise = cityTime - sunriseTime;
        const distToSunset = cityTime - sunsetTime;

        let theme = 'night';
        let label = 'Night';

        if (Math.abs(distToSunrise) <= transitionWindow) {
            theme = 'morning'; label = 'Dawn';
        } else if (Math.abs(distToSunset) <= transitionWindow) {
            theme = 'dusk'; label = 'Dusk';
        } else if (cityTime > sunriseTime && cityTime < sunsetTime) {
            theme = 'day'; label = 'Day';
        } else {
            const currentHour = cityTime.getHours();
            if (currentHour >= 0 && cityTime < sunriseTime) {
                theme = 'morning'; label = 'Morning';
            } else {
                theme = 'night'; label = 'Night';
            }
        }

        document.body.className = `theme-${theme}`;
        if (theme === 'day' && (weatherCode === 0 || weatherCode === 1)) {
            document.body.classList.add('weather-clear');
        }
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
        if (code <= 67) return { desc: "Rain", type: 'rain' };
        if (code <= 77) return { desc: "Snow", type: 'snow' };
        if (code <= 82) return { desc: "Heavy Rain", type: 'rain' };
        return { desc: "Thunderstorm", type: 'rain' };
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
        if (isLoading) {
            this.resultTarget.classList.remove('grand-entrance');
            this.resultTarget.style.transition = 'opacity 0.3s ease';
            this.resultTarget.style.opacity = '0';
            setTimeout(() => {
                this.resultTarget.style.display = 'none';
                this.skeletonTarget.style.display = 'flex';
                void this.skeletonTarget.offsetWidth;
                requestAnimationFrame(() => {
                    this.skeletonTarget.style.transition = 'opacity 0.3s ease';
                    this.skeletonTarget.style.opacity = '0.7';
                });
            }, 300);
        } else {
            this.skeletonTarget.style.transition = 'opacity 0.3s ease';
            this.skeletonTarget.style.opacity = '0';
            setTimeout(() => {
                this.skeletonTarget.style.display = 'none';
                this.resultTarget.style.display = 'flex';
                this.resultTarget.style.flexDirection = 'column';
                this.dailyContainerTarget.scrollTop = 0;
                this.resultTarget.style.opacity = '0';
                requestAnimationFrame(() => {
                    this.resultTarget.classList.add('grand-entrance');
                });
            }, 300);
        }
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

    // --- UI HELPERS ---
    toggleSearch(e) {
        if(e) e.preventDefault();
        const wrapper = this.element.querySelector('.search-wrapper');
        const input = this.cityInputTarget;
        wrapper.classList.toggle('active');
        if (wrapper.classList.contains('active')) input.focus();
    }

    collapseSearch() {
        setTimeout(() => {
            const wrapper = this.element.querySelector('.search-wrapper');
            if (this.cityInputTarget.value === '') wrapper.classList.remove('active');
        }, 200);
    }

    // --- PHYSICS: DAILY (Vertical Y-Axis) ---
    initDailyScroll() {
        const opts = { signal: this.abortController.signal };
        const slider = this.dailyContainerTarget;
        let isDown = false;
        let startY, scrollTop, velY = 0, momentumID;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startY = e.pageY - slider.offsetTop;
            scrollTop = slider.scrollTop;
            cancelAnimationFrame(momentumID);
        }, opts);

        slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('active'); }, opts);
        slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('active'); this.beginMomentumY(slider, velY); }, opts);
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const y = e.pageY - slider.offsetTop;
            const walk = (y - startY) * 1.5;
            const prevScrollTop = slider.scrollTop;
            slider.scrollTop = scrollTop - walk;
            velY = slider.scrollTop - prevScrollTop;
        }, opts);
    }

    beginMomentumY(slider, velocity) {
        const decay = 0.92;
        const step = () => {
            if (Math.abs(velocity) < 0.5) return;
            velocity *= decay;
            slider.scrollTop += velocity;
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}

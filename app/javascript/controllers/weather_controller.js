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
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONFIG.interactionRadius) {
                const force = (CONFIG.interactionRadius - dist) / CONFIG.interactionRadius;
                this.x -= (dx / dist) * force * 8;
                this.y -= (dy / dist) * force * 8;
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
        "canvas", "cityInput", "spinner", "result", "skeleton",
        "errorAlert", "errorMsg", "searchResults",
        "cityName", "countryCode", "timeBadge", "tempValue", "weatherDesc",
        "dateDisplay", "windSpeed", "humidity", "aqiSummary", "detailsWrapper",
        "caretIcon", "realFeel", "aqiValue", "uvIndex", "visibility",
        "windGusts", "windDir", "dewPoint", "cloudCover", "pressure",
        "dayHigh", "nightLow", "precipProb", "precipSum", "hourlyContainer", "dailyContainer"
    ]

    connect() {
        this.appState = {
            theme: 'night',
            weather: 'snow',
            particles: [],
            mouse: { x: null, y: null },
            userLocation: null
        };

        this.initCanvas();
        this.animate();

        // --- INIT SCROLL PHYSICS ---
        this.initHourlyScroll(); // Horizontal (X-Axis)
        this.initDailyScroll();  // Vertical (Y-Axis)

        this.getUserLocation();

        // --- DEFINE HANDLERS (Stored so we can remove them) ---

        // Click Outside
        this.clickOutsideHandler = (e) => {
            if (!this.element.contains(e.target)) {
                this.searchResultsTarget.classList.remove('active');
            }
        };

        // Resize (High Performance)
        this.resizeHandler = this.resizeCanvas.bind(this);

        // Mouse/Touch Interaction
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

        // --- ADD LISTENERS ---
        document.addEventListener('click', this.clickOutsideHandler);
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('mousemove', this.mouseMoveHandler);
        window.addEventListener('touchmove', this.touchMoveHandler);
        window.addEventListener('mouseout', this.mouseOutHandler);
    }

    disconnect() {
        // Remove UI Listeners
        document.removeEventListener('click', this.clickOutsideHandler);
        window.removeEventListener('resize', this.resizeHandler);

        // Remove Mouse/Touch Listeners
        window.removeEventListener('mousemove', this.mouseMoveHandler);
        window.removeEventListener('touchmove', this.touchMoveHandler);
        window.removeEventListener('mouseout', this.mouseOutHandler);

        // Stop Animation Loop
        cancelAnimationFrame(this.animationFrame);
    }

    // --- Geolocation & Smart Search Logic ---

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
                            const distA = this.calculateDistance(
                                this.appState.userLocation.lat,
                                this.appState.userLocation.lon,
                                a.latitude,
                                a.longitude
                            );
                            const distB = this.calculateDistance(
                                this.appState.userLocation.lat,
                                this.appState.userLocation.lon,
                                b.latitude,
                                b.longitude
                            );
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
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    renderSearchResults(results) {
        this.searchResultsTarget.innerHTML = '';
        results.forEach(city => {
            const div = document.createElement('div');
            div.className = 'search-result-item';

            const admin = city.admin1 || city.admin2 || '';
            const country = city.country || '';
            const locationStr = [admin, country].filter(Boolean).join(', ');

            div.innerHTML = `
                <strong>${city.name}</strong>
                <small>${locationStr}</small>
            `;

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
        this.detailsWrapperTarget.classList.remove('open');
        this.caretIconTarget.classList.replace('ph-caret-up', 'ph-caret-down');

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
        this.showLoading(true);
        this.hideError();

        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m,uv_index&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=8`;
            const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`;

            const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);

            if (!weatherRes.ok) throw new Error("Weather service unavailable.");

            const weatherData = await weatherRes.json();
            const aqiData = await aqiRes.json();

            // Pass Lat/Lon for distance calculation
            this.processAllData(name, country, weatherData, aqiData, weatherData.utc_offset_seconds, latitude, longitude);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // --- UI & Rendering Logic ---

    processAllData(city, country, wData, aData, utcOffsetSeconds, targetLat, targetLon) {
        const current = wData.current;
        const daily = wData.daily;
        const hourly = wData.hourly;
        const aqi = aData.current ? aData.current.us_aqi : null;

        const nowUTC = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
        const cityTime = new Date(nowUTC + (utcOffsetSeconds * 1000));
        const currentHour = cityTime.getHours();

        // Check if this is "My Location" (within 20km)
        let isMyLocation = false;
        if (this.appState.userLocation) {
            const dist = this.calculateDistance(
                this.appState.userLocation.lat,
                this.appState.userLocation.lon,
                targetLat,
                targetLon
            );
            if (dist < 20) isMyLocation = true;
        }

        this.cityNameTarget.textContent = city;
        this.countryCodeTarget.textContent = country;

        this.updateDateDisplay(cityTime);

        this.tempValueTarget.textContent = Math.round(current.temperature_2m);
        const { desc, type } = this.getWeatherInfo(current.weather_code);
        this.weatherDescTarget.textContent = desc;
        this.appState.weather = type;

        this.windSpeedTarget.textContent = Math.round(current.wind_speed_10m);
        this.humidityTarget.textContent = current.relative_humidity_2m;
        this.renderAqiSummary(aqi);

        // Render Hourly with Location Flag
        this.renderHourly(hourly, currentHour, isMyLocation);

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
        this.resultTarget.style.display = 'block'; // Ensure correct vertical stacking
        this.resultTarget.style.opacity = 1;
    }

    updateDateDisplay(dateObj) {
        this.dateDisplayTarget.textContent = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    }

    renderHourly(hourly, currentHour, isMyLocation) {
        this.hourlyContainerTarget.innerHTML = "";

        // Loop 24 times to show the next 24 hours continuously
        for (let i = 0; i < 24; i++) {
            const dataIndex = currentHour + i;
            if (dataIndex >= hourly.time.length) break;

            const code = hourly.weather_code[dataIndex];
            const temp = Math.round(hourly.temperature_2m[dataIndex]);
            const isDay = hourly.is_day[dataIndex];

            // Handle Midnight Rollover (0-23)
            const displayHourNum = (currentHour + i) % 24;
            const iconClass = this.getIconClass(code, isDay === 1);

            // Logic: Only show "Now" if it is YOUR location
            let displayTime = `${displayHourNum}:00`;
            if (i === 0 && isMyLocation) {
                displayTime = "Now";
            }

            const div = document.createElement('div');
            div.className = 'hour-item';

            // Highlight current hour visually
            if (i === 0) div.classList.add('now');

            div.innerHTML = `
                <span class="hour-time">${displayTime}</span>
                <i class="hour-icon ${iconClass}"></i>
                <span class="hour-temp">${temp}°</span>
            `;
            this.hourlyContainerTarget.appendChild(div);
        }
    }

    render7DayForecast(daily) {
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
                <div class="daily-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="daily-temps">
                    <span class="temp-low">${min}°</span>
                    <span class="temp-high">${max}°</span>
                </div>
            `;
            this.dailyContainerTarget.appendChild(div);
        }
    }

    // CLEANED: Removed event listeners (they are handled in connect/disconnect)
    initCanvas() {
        this.ctx = this.canvasTarget.getContext('2d');
        this.resizeCanvas();
        for (let i = 0; i < CONFIG.particleCount; i++) {
            this.appState.particles.push(new Mushi(this.canvasTarget.width, this.canvasTarget.height, this.appState.theme, this.appState.weather));
        }
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvasTarget.width = window.innerWidth * dpr;
        this.canvasTarget.height = window.innerHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvasTarget.style.width = window.innerWidth + 'px';
        this.canvasTarget.style.height = window.innerHeight + 'px';
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
        }
        else if (Math.abs(distToSunset) <= transitionWindow) {
            theme = 'dusk'; label = 'Dusk';
        }
        else if (cityTime > sunriseTime && cityTime < sunsetTime) {
            theme = 'day'; label = 'Day';
        }
        else {
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

        if (isLoading) {
            this.detailsWrapperTarget.classList.remove('open');
            this.caretIconTarget.classList.replace('ph-caret-up', 'ph-caret-down');
            this.resultTarget.style.transition = 'opacity 0.4s ease';
            this.resultTarget.style.opacity = '0';

            setTimeout(() => {
                this.resultTarget.style.display = 'none';
                this.skeletonTarget.style.display = 'flex';
                this.skeletonTarget.style.opacity = '0';
                requestAnimationFrame(() => {
                    this.skeletonTarget.style.transition = 'opacity 0.4s ease';
                    this.skeletonTarget.style.opacity = '0.7';
                });
            }, 400);

        } else {
            this.skeletonTarget.style.transition = 'opacity 0.4s ease';
            this.skeletonTarget.style.opacity = '0';

            setTimeout(() => {
                this.skeletonTarget.style.display = 'none';
                this.resultTarget.style.display = 'block'; // FIXED: block prevents flex squash
                this.resultTarget.style.opacity = '0';
                requestAnimationFrame(() => {
                    this.resultTarget.style.transition = 'opacity 0.8s ease';
                    this.resultTarget.style.opacity = '1';
                });
            }, 400);
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

    toggleDetails() {
        this.detailsWrapperTarget.classList.toggle('open');
        const isOpen = this.detailsWrapperTarget.classList.contains('open');
        this.caretIconTarget.classList.toggle('ph-caret-up', isOpen);
        this.caretIconTarget.classList.toggle('ph-caret-down', !isOpen);

        if (isOpen) {
            setTimeout(() => {
                this.detailsWrapperTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500);
        } else {
            this.resultTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- PHYSICS: HOURLY (Horizontal X-Axis) ---
    initHourlyScroll() {
        const slider = this.hourlyContainerTarget;
        let isDown = false;
        let startX;
        let scrollLeft;
        let velX = 0;
        let momentumID;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            cancelAnimationFrame(momentumID);
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('active');
            this.beginMomentumX(slider, velX);
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 1.5;
            const prevScrollLeft = slider.scrollLeft;
            slider.scrollLeft = scrollLeft - walk;
            velX = slider.scrollLeft - prevScrollLeft;
        });
    }

    beginMomentumX(slider, velocity) {
        const decay = 0.92;
        const step = () => {
            if (Math.abs(velocity) < 0.5) return;
            velocity *= decay;
            slider.scrollLeft += velocity;
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // --- PHYSICS: DAILY (Vertical Y-Axis) ---
    initDailyScroll() {
        const slider = this.dailyContainerTarget;
        let isDown = false;
        let startY;
        let scrollTop;
        let velY = 0;
        let momentumID;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startY = e.pageY - slider.offsetTop;
            scrollTop = slider.scrollTop;
            cancelAnimationFrame(momentumID);
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('active');
            this.beginMomentumY(slider, velY);
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const y = e.pageY - slider.offsetTop;
            const walk = (y - startY) * 1.5; // Drag Multiplier
            const prevScrollTop = slider.scrollTop;
            slider.scrollTop = scrollTop - walk;
            velY = slider.scrollTop - prevScrollTop;
        });
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

import { Controller } from "@hotwired/stimulus"

// ATMOS — apple layout, ported to Stimulus.
// Live data from Open-Meteo. Renders the hero, hourly, 7-day and detail cards,
// and drives the animated sky background + weather FX overlays.

// ---------- WMO weather_code -> condition label + icon kind ----------
const WMO = {
  0:["Clear","clear"], 1:["Mainly Clear","clear"], 2:["Partly Cloudy","partly"], 3:["Overcast","cloud"],
  45:["Fog","fog"], 48:["Rime Fog","fog"],
  51:["Light Drizzle","drizzle"], 53:["Drizzle","drizzle"], 55:["Heavy Drizzle","drizzle"],
  56:["Freezing Drizzle","sleet"], 57:["Freezing Drizzle","sleet"],
  61:["Light Rain","rain"], 63:["Rain","rain"], 65:["Heavy Rain","rain"],
  66:["Freezing Rain","sleet"], 67:["Freezing Rain","sleet"],
  71:["Light Snow","snow"], 73:["Snow","snow"], 75:["Heavy Snow","snow"], 77:["Snow Grains","snow"],
  80:["Rain Showers","rain"], 81:["Rain Showers","rain"], 82:["Violent Showers","rain"],
  85:["Snow Showers","snow"], 86:["Snow Showers","snow"],
  95:["Thunderstorm","thunder"], 96:["Thunderstorm + Hail","hail"], 99:["Thunderstorm + Hail","hail"],
}
const decode = c => WMO[c] || ["—","cloud"]

// ---------- SVG weather glyphs ----------
function wxIcon(kind, size = 28) {
  const o = `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"`
  switch (kind) {
    case "clear": return `<svg ${o}>
      <defs><radialGradient id="sg${size}"><stop offset="0%" stop-color="#ffe8a8"/><stop offset="100%" stop-color="#f5a635"/></radialGradient></defs>
      <circle cx="16" cy="16" r="6" fill="url(#sg${size})"/>
      <g stroke="#ffd78a" stroke-width="2" stroke-linecap="round">
        <line x1="16" y1="3" x2="16" y2="6"/><line x1="16" y1="26" x2="16" y2="29"/>
        <line x1="3" y1="16" x2="6" y2="16"/><line x1="26" y1="16" x2="29" y2="16"/>
        <line x1="6" y1="6" x2="8" y2="8"/><line x1="24" y1="24" x2="26" y2="26"/>
        <line x1="6" y1="26" x2="8" y2="24"/><line x1="24" y1="8" x2="26" y2="6"/></g></svg>`
    case "partly": return `<svg ${o}>
      <circle cx="11" cy="11" r="4.5" fill="#ffd78a"/>
      <path d="M9 24h13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 9 24z" fill="#f0f4fa" stroke="#c8d5e6" stroke-width="0.8"/></svg>`
    case "rain": case "drizzle": return `<svg ${o}>
      <path d="M9 20h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 20z" fill="#c8d5e6"/>
      <g stroke="#5aa0e0" stroke-width="2" stroke-linecap="round">
        <line x1="11" y1="23" x2="10" y2="27"/><line x1="16" y1="23" x2="15" y2="28"/><line x1="21" y1="23" x2="20" y2="27"/></g></svg>`
    case "snow": case "sleet": return `<svg ${o}>
      <path d="M9 20h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 20z" fill="#e5ecf5"/>
      <g fill="#fff"><circle cx="11" cy="26" r="1.4"/><circle cx="16" cy="27" r="1.4"/><circle cx="21" cy="26" r="1.4"/></g></svg>`
    case "thunder": case "hail": return `<svg ${o}>
      <path d="M9 18h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 18z" fill="#aab6c8"/>
      <path d="M16 18l-4 7h3l-2 5 7-9h-4l3-3z" fill="#ffd24a"/></svg>`
    default: return `<svg ${o}>
      <path d="M9 24h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 24z" fill="#dee6f2" stroke="#b8c5d8" stroke-width="0.8"/></svg>`
  }
}

// ---------- sky palettes ----------
const PALETTES = {
  dawn:  { top:"#2c1c3a", mid:"#8a4a5a", low:"#e09566", hz:"#f2c07a", sun:"radial-gradient(circle, #ffd89a, #f29566 60%, transparent 75%)", stars:false, pos:{left:"15%",top:"65%"} },
  day:   { top:"#1a4e82", mid:"#3a7cb8", low:"#7fb5d8", hz:"#cfe3f0", sun:"radial-gradient(circle, #fff0b4, #f8c05a 50%, transparent 70%)", stars:false, pos:{left:"70%",top:"15%"} },
  dusk:  { top:"#1a1a3a", mid:"#6b3a6a", low:"#d66b4a", hz:"#f0955a", sun:"radial-gradient(circle, #ff9e6a, #e55a3a 60%, transparent 75%)", stars:false, pos:{left:"80%",top:"60%"} },
  night: { top:"#050812", mid:"#0d1530", low:"#1a2a50", hz:"#2a3a66", sun:"radial-gradient(circle, #e8ecff, rgba(200,210,255,0.4) 50%, transparent 70%)", stars:true, pos:{left:"72%",top:"20%"} },
}
const phaseFromHour = h => (h < 6 || h >= 20) ? "night" : h < 8 ? "dawn" : h < 18 ? "day" : "dusk"

// How much each condition greys/darkens the sky (0 = clear, 1 = fully overcast/stormy).
const OVERCAST = {
  clear: 0, partly: 0.18, cloud: 0.55, overcast: 0.7,
  fog: 0.75, haze: 0.4, drizzle: 0.6, rain: 0.72,
  sleet: 0.72, snow: 0.5, hail: 0.8, thunder: 0.88,
}

// Blend a hex color toward an overcast grey by amount t (0..1).
function overcastBlend(hex, t, greyHex = "#5a626e") {
  const h2r = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
  const [r1, g1, b1] = h2r(hex), [r2, g2, b2] = h2r(greyHex)
  const mix = (a, b) => Math.round(a + (b - a) * t)
  const c = [mix(r1, r2), mix(g1, g2), mix(b1, b2)]
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("")
}

export default class extends Controller {
  static targets = [
    "skyBg", "skySun", "skyStars", "cloudOverlay", "rainOverlay", "snowOverlay",
    "fogOverlay", "thunderOverlay", "hailOverlay",
    "cityInput", "spinner", "searchResults", "errorAlert", "errorMsg",
    "hero", "hourly", "daily", "cards", "unitMetric", "unitImperial"
  ]

  connect() {
    this.units = localStorage.getItem("atmos.units") || "metric"
    this.syncUnitButtons()
    this.selectedIndex = -1
    this.initStars()

    // Always load something immediately so the page is never blank,
    // then upgrade to the user's real location if geolocation is granted.
    const lastCity = localStorage.getItem("atmos.lastCity") || "Cape Town"
    this.fetchWeather(lastCity)

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => this.fetchByCoords(p.coords.latitude, p.coords.longitude),
        () => { /* keep the city already loaded */ },
        { timeout: 8000, maximumAge: 600000 }
      )
    }
  }

  disconnect() {
    if (this._thunderInterval) clearInterval(this._thunderInterval)
  }

  // ============ units ============
  setUnits(e) {
    this.units = e.currentTarget.dataset.units
    localStorage.setItem("atmos.units", this.units)
    this.syncUnitButtons()
    if (this.weatherData) this.render(this.weatherData)
  }
  syncUnitButtons() {
    this.unitMetricTarget.classList.toggle("active", this.units === "metric")
    this.unitImperialTarget.classList.toggle("active", this.units === "imperial")
  }
  t(c)    { return this.units === "metric" ? Math.round(c) : Math.round(c * 9 / 5 + 32) }
  wind(k) { return this.units === "metric" ? Math.round(k) : Math.round(k * 0.621371) }
  get windUnit() { return this.units === "metric" ? "km/h" : "mph" }

  // ============ search ============
  async handleInput() {
    const q = this.cityInputTarget.value.trim()
    clearTimeout(this.searchTimeout)
    if (q.length < 2) { this.searchResultsTarget.innerHTML = ""; return }
    this.searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`)
        const json = await res.json()
        this.renderSearch(json.results || [])
      } catch { /* ignore */ }
    }, 250)
  }
  renderSearch(results) {
    this.selectedIndex = -1
    if (!results.length) { this.searchResultsTarget.innerHTML = ""; return }
    this.searchResultsTarget.innerHTML = results.map((r, i) => `
      <div class="search-result" data-idx="${i}"
           data-lat="${r.latitude}" data-lon="${r.longitude}"
           data-name="${r.name}" data-country="${r.country_code || ""}">
        <div><div>${r.name}</div><div class="region">${[r.admin1, r.country].filter(Boolean).join(", ")}</div></div>
      </div>`).join("")
    this.searchResultsTarget.querySelectorAll(".search-result").forEach(el => {
      el.addEventListener("mousedown", () => {
        const d = el.dataset
        this.cityInputTarget.value = d.name
        this.searchResultsTarget.innerHTML = ""
        this.executeFetch(+d.lat, +d.lon, d.name, d.country)
      })
    })
  }
  handleKeydown(e) {
    const items = this.searchResultsTarget.querySelectorAll(".search-result")
    if (!items.length) return
    if (e.key === "ArrowDown") { this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1); e.preventDefault() }
    else if (e.key === "ArrowUp") { this.selectedIndex = Math.max(this.selectedIndex - 1, 0); e.preventDefault() }
    else if (e.key === "Enter") { e.preventDefault(); if (items[this.selectedIndex]) items[this.selectedIndex].dispatchEvent(new Event("mousedown")); return }
    items.forEach((el, i) => el.classList.toggle("active", i === this.selectedIndex))
  }

  // ============ fetch ============
  async fetchByCoords(lat, lon) {
    let name = "Current Location", country = ""
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
      const j = await r.json(); name = j.city || j.locality || name; country = j.countryCode || ""
    } catch { /* ignore */ }
    this.executeFetch(lat, lon, name, country)
  }
  async fetchWeather(city) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`)
      const j = await r.json()
      if (!j.results || !j.results.length) return this.showError(`Couldn't find "${city}"`)
      const g = j.results[0]
      this.executeFetch(g.latitude, g.longitude, g.name, g.country_code || "")
    } catch { this.showError("Network error") }
  }
  async executeFetch(lat, lon, name, country) {
    this.spinnerTarget.style.display = "block"
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,` +
        `cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m,uv_index` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,` +
        `precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`
      const [wRes, aRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)])
      const w = await wRes.json()
      const a = await aRes.json().catch(() => ({}))
      this.weatherData = { w, aqi: a?.current?.us_aqi ?? null, name, country }
      localStorage.setItem("atmos.lastCity", name)
      this.render(this.weatherData)
    } catch (e) {
      console.error("ATMOS fetch/render error:", e)
      this.showError("Couldn't load weather")
    } finally {
      this.spinnerTarget.style.display = "none"
    }
  }

  // ============ render ============
  render({ w, aqi, name, country }) {
    const cur = w.current, day = w.daily
    const [label, kind] = decode(cur.weather_code)
    const localHour = new Date(cur.time).getHours()
    const phase = phaseFromHour(localHour)

    console.log("ATMOS render: start", { kind, phase, localHour })

    try { this.applyPalette(phase, kind); console.log("ATMOS render: applyPalette OK") }
    catch(e) { console.error("ATMOS render: applyPalette THREW", e); throw e }

    try { this.setWeatherFx(kind); console.log("ATMOS render: setWeatherFx OK") }
    catch(e) { console.error("ATMOS render: setWeatherFx THREW", e); throw e }

    const sunrise = (day.sunrise[0] || "").slice(11, 16)
    const sunset  = (day.sunset[0]  || "").slice(11, 16)

    try {
      this.heroTarget.innerHTML = `
        <div class="hero-loc">${name}${country ? `, ${country}` : ""}</div>
        <div class="hero-region">${label}</div>
        <div class="hero-temp">${this.t(cur.temperature_2m)}<span class="deg">°</span></div>
        <div class="hero-cond">${label}</div>
        <div class="hero-hilo">H:${this.t(day.temperature_2m_max[0])}°&nbsp;&nbsp;L:${this.t(day.temperature_2m_min[0])}°</div>
        ${["rain", "drizzle", "thunder"].includes(kind)
          ? `<div class="alert"><span class="dot"></span><span>Rain expected today</span><span class="arrow">›</span></div>` : ""}`
      console.log("ATMOS render: hero OK")
    } catch(e) { console.error("ATMOS render: hero THREW", e); throw e }

    try { this.renderHourly(w); console.log("ATMOS render: renderHourly OK") }
    catch(e) { console.error("ATMOS render: renderHourly THREW", e); throw e }

    try { this.renderDaily(w); console.log("ATMOS render: renderDaily OK") }
    catch(e) { console.error("ATMOS render: renderDaily THREW", e); throw e }

    try { this.renderCards({ cur, day, aqi, sunrise, sunset, localHour }); console.log("ATMOS render: renderCards OK") }
    catch(e) { console.error("ATMOS render: renderCards THREW", e); throw e }

    try {
      this.heroTarget.parentElement.querySelectorAll(".hero,.hourly,.daily,.cards")
        .forEach(el => el.style.opacity = 1)
      console.log("ATMOS render: opacity reveal OK")
    } catch(e) { console.error("ATMOS render: opacity reveal THREW", e); throw e }
  }

  renderHourly(w) {
    const h = w.hourly
    const startIdx = Math.max(0, h.time.findIndex(t => new Date(t) >= new Date(w.current.time)))
    let cols = ""
    for (let i = 0; i < 12; i++) {
      const idx = startIdx + i
      if (idx >= h.time.length) break
      const hr = new Date(h.time[idx]).getHours()
      const [, kind] = decode(h.weather_code[idx])
      const pop = h.precipitation_probability ? h.precipitation_probability[idx] : 0
      cols += `
        <div class="h-col ${i === 0 ? "now" : ""}">
          <div class="h-time">${i === 0 ? "Now" : String(hr).padStart(2, "0")}</div>
          <div class="h-icon">${wxIcon(kind, 26)}</div>
          <div class="h-temp">${this.t(h.temperature_2m[idx])}°</div>
          ${pop > 30 ? `<div class="h-precip">${pop}%</div>` : ""}
        </div>`
    }
    this.hourlyTarget.innerHTML = `
      <div class="hourly">
        <div class="hourly-hd">HOURLY FORECAST</div>
        <div class="hourly-scroll">${cols}</div>
      </div>`
  }

  renderDaily(w) {
    const d = w.daily
    const his = d.temperature_2m_max, los = d.temperature_2m_min
    const gMax = Math.max(...his) + 1, gMin = Math.min(...los) - 1, span = gMax - gMin || 1
    const rows = d.time.map((t, i) => {
      const [, kind] = decode(d.weather_code[i])
      const loPct = ((los[i] - gMin) / span) * 100
      const hiPct = ((his[i] - gMin) / span) * 100
      const dow = i === 0 ? "Today" : new Date(t).toLocaleDateString("en", { weekday: "short" })
      return `
        <div class="d-row ${i === 0 ? "today" : ""}">
          <div class="d-dow">${dow}</div>
          <div class="d-icon">${wxIcon(kind, 24)}</div>
          <div class="d-lo">${this.t(los[i])}°</div>
          <div class="d-range"><div class="d-range-fill" style="left:${loPct}%;width:${hiPct - loPct}%"></div></div>
          <div class="d-hi">${this.t(his[i])}°</div>
        </div>`
    }).join("")
    this.dailyTarget.innerHTML = `<div class="daily"><div class="daily-hd">7-DAY FORECAST</div>${rows}</div>`
  }

  cardHeader(icon, title) {
    return `<div class="card-hd">${icon}<span>${title}</span></div>`
  }

  renderCards({ cur, day, aqi, sunrise, sunset, localHour }) {
    const C = []

    // UV
    const uv = Math.round(day.uv_index_max[0] ?? cur.uv_index ?? 0)
    const uvLabel = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very High" : "Extreme"
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="3" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21" y2="12"/></g></svg>`, "UV Index")}
      <div class="card-val">${uv}<span class="unit">${uvLabel}</span></div>
      <div class="uv-bar"><div class="uv-thumb" style="left:${Math.min(uv / 11, 1) * 100}%"></div></div>
      <div class="card-sub">${uv < 3 ? "Low for the rest of the day." : "Use sun protection."}</div></div>`)

    // Sunset arc
    const toHr = s => { const [h, m] = s.split(":").map(Number); return h + m / 60 }
    const sr = toHr(sunrise || "06:00"), ss = toHr(sunset || "18:00")
    const sp = Math.max(0.001, ss - sr)
    const pct = Math.max(0, Math.min(1, (localHour - sr) / sp))
    const ang = Math.PI * (1 - pct), cx = 100, cy = 66, r = 66
    const sx = cx + r * Math.cos(ang), sy = cy - r * Math.sin(ang)
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 3v3M5 8l2 2M19 8l-2 2"/></svg>`, "Sunset")}
      <div class="card-val" style="font-size:26px">${sunset}</div>
      <svg class="sun-arc" viewBox="0 0 200 84">
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="2 3"/>
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${sx} ${sy}" fill="none" stroke="#ffd78a" stroke-width="2"/>
        <circle cx="${sx}" cy="${sy}" r="5" fill="#ffe8a8"/>
        <line x1="20" y1="${cy}" x2="180" y2="${cy}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/></svg>
      <div class="card-sub" style="margin-top:2px">Sunrise: ${sunrise}</div></div>`)

    // Wind compass
    const ws = this.wind(cur.wind_speed_10m), wd = cur.wind_direction_10m
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    const wcx = 45, wcy = 45, wr = 36, rad = (wd - 90) * Math.PI / 180
    const ax = wcx + (wr - 12) * Math.cos(rad), ay = wcy + (wr - 12) * Math.sin(rad)
    const ticks = dirs.map((dd, i) => {
      const aa = (i * 45 - 90) * Math.PI / 180
      const tx = wcx + (wr + 4) * Math.cos(aa), ty = wcy + (wr + 4) * Math.sin(aa) + 3
      return `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="7" fill="${dd === "N" ? "#fff" : "rgba(255,255,255,0.5)"}" font-weight="${dd === "N" ? 700 : 400}">${dd}</text>`
    }).join("")
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h14a2.5 2.5 0 1 0 0-5M3 12h18M3 16h10a2.5 2.5 0 1 1 0 5"/></svg>`, "Wind")}
      <div style="display:flex;align-items:center;gap:8px">
        <svg viewBox="0 0 90 90" style="width:80px;height:80px;flex:0 0 80px">
          <circle cx="${wcx}" cy="${wcy}" r="${wr}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
          <circle cx="${wcx}" cy="${wcy}" r="${wr - 8}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="2 3"/>
          ${ticks}
          <line x1="${wcx}" y1="${wcy}" x2="${ax}" y2="${ay}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          <circle cx="${wcx}" cy="${wcy}" r="2" fill="#fff"/></svg>
        <div>
          <div style="font-size:22px;font-weight:300">${ws}<span style="font-size:12px;opacity:.7;margin-left:3px">${this.windUnit}</span></div>
          <div style="font-size:11px;color:var(--fg-55);margin-top:10px">Gusts</div>
          <div style="font-size:13px">${this.wind(cur.wind_gusts_10m)}<span style="font-size:10px;opacity:.7;margin-left:2px">${this.windUnit}</span></div>
        </div></div></div>`)

    // Feels like
    const feels = this.t(cur.apparent_temperature), temp = this.t(cur.temperature_2m)
    const diff = feels - temp
    const fnote = diff === 0 ? "Similar to the actual temperature." : diff < 0 ? `Wind makes it feel ${Math.abs(diff)}° cooler.` : `Humidity makes it feel ${diff}° warmer.`
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3v11a3 3 0 1 0 4 0V3a2 2 0 0 0-4 0z"/><circle cx="12" cy="17" r="2" fill="currentColor"/></svg>`, "Feels Like")}
      <div class="mini-big">${feels}°</div><div class="card-sub">${fnote}</div></div>`)

    // Humidity
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z"/></svg>`, "Humidity")}
      <div class="mini-big">${cur.relative_humidity_2m}%</div>
      <div class="card-sub">The dew point is ${this.t(cur.dew_point_2m)}° right now.</div></div>`)

    // Visibility
    const vis = (cur.visibility / 1000).toFixed(1)
    const vnote = vis > 10 ? "Perfectly clear view." : vis > 5 ? "Slight haze in the distance." : "Reduced by fog or precipitation."
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`, "Visibility")}
      <div class="mini-big">${vis} <span style="font-size:18px;opacity:.7">km</span></div>
      <div class="card-sub">${vnote}</div></div>`)

    // Pressure gauge
    const pv = Math.round(cur.pressure_msl)
    const ppct = Math.max(0, Math.min(1, (pv - 980) / 60))
    const pang = -90 + ppct * 180
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`, "Pressure")}
      <div style="display:flex;align-items:center;gap:10px">
        <svg viewBox="0 0 100 60" style="width:90px">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linecap="round"/>
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${125.6 * ppct} 300"/>
          <g transform="translate(50 50) rotate(${pang})"><line x1="0" y1="0" x2="0" y2="-34" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>
          <circle cx="50" cy="50" r="2" fill="#fff"/></svg>
        <div><div style="font-size:22px;font-weight:300">${pv}<span style="font-size:12px;opacity:.7;margin-left:3px">hPa</span></div></div>
      </div></div>`)

    // AQI
    if (aqi != null) {
      const cat = aqi < 50 ? "Good" : aqi < 100 ? "Moderate" : aqi < 150 ? "Unhealthy (SG)" : aqi < 200 ? "Unhealthy" : "Hazardous"
      const anote = aqi < 50 ? "Air quality is ideal for outdoor activity." : aqi < 100 ? "Acceptable for most people." : "Sensitive groups should reduce exertion."
      C.push(`<div class="card">
        ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8c2-2 6-2 8 0s6 2 8 0M4 14c2-2 6-2 8 0s6 2 8 0"/></svg>`, "Air Quality")}
        <div class="card-val">${aqi} <span class="unit">${cat}</span></div>
        <div class="aqi-scale"><div class="aqi-thumb" style="left:${Math.min(aqi / 300, 1) * 100}%"></div></div>
        <div class="card-sub" style="margin-top:8px">${anote}</div></div>`)
    }

    // Precipitation today
    C.push(`<div class="card">
      ${this.cardHeader(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z"/></svg>`, "Precipitation")}
      <div class="card-val">${(day.precipitation_sum[0] ?? 0).toFixed(1)}<span class="unit">mm</span></div>
      <div class="card-sub" style="margin-top:4px">${day.precipitation_probability_max?.[0] ?? 0}% chance today</div></div>`)

    this.cardsTarget.innerHTML = C.join("")
  }

  // ============ sky + FX (ported from apple-app.jsx) ============
  applyPalette(phase, kind = "clear") {
    const p = PALETTES[phase] || PALETTES.day
    // Grey/darken the time-of-day palette according to how overcast the condition is.
    const t = OVERCAST[kind] ?? 0
    const grey = phase === "night" ? "#2a2f3a" : "#5a626e"
    const top = overcastBlend(p.top, t, grey)
    const mid = overcastBlend(p.mid, t, grey)
    const low = overcastBlend(p.low, t, grey)
    const hz  = overcastBlend(p.hz,  t, grey)
    this.skyBgTarget.style.background = `linear-gradient(180deg, ${top} 0%, ${mid} 35%, ${low} 70%, ${hz} 100%)`
    this.skySunTarget.style.background = p.sun
    this.skySunTarget.style.left = p.pos.left
    this.skySunTarget.style.top = p.pos.top
    this.skySunTarget.style.transform = "translate(-50%,-50%)"
    this.skyStarsTarget.classList.toggle("on", p.stars && t < 0.4)
  }

  initStars() {
    const el = this.skyStarsTarget
    if (el.children.length) return
    for (let i = 0; i < 80; i++) {
      const s = document.createElement("span")
      s.className = "star"
      s.style.left = Math.random() * 100 + "%"
      s.style.top = Math.random() * 70 + "%"
      const sz = Math.random() * 2 + 0.5
      s.style.width = sz + "px"; s.style.height = sz + "px"
      s.style.opacity = 0.4 + Math.random() * 0.6
      s.style.animation = `twinkle ${2 + Math.random() * 3}s ease-in-out ${Math.random() * 3}s infinite alternate`
      el.appendChild(s)
    }
  }

  setWeatherFx(kind) {
    const rain = this.rainOverlayTarget, snow = this.snowOverlayTarget, cloud = this.cloudOverlayTarget
    const fog = this.fogOverlayTarget, thunder = this.thunderOverlayTarget, hail = this.hailOverlayTarget
    ;[rain, snow, cloud, fog, hail].forEach(el => el.classList.remove("on", "overcast", "light"))
    thunder.classList.remove("on", "flash-bright", "flash-dim")
    if (this._thunderInterval) { clearInterval(this._thunderInterval); this._thunderInterval = null }

    // Hide the sun for overcast/precipitating skies, dim it for partly cloudy.
    if (this.hasSkySunTarget) {
      const sun = this.skySunTarget
      sun.classList.remove("dimmed", "hidden")
      if (["rain", "drizzle", "thunder", "sleet", "snow", "cloud", "overcast", "fog", "hail"].includes(kind)) {
        sun.classList.add("hidden")
      } else if (kind === "partly") {
        sun.classList.add("dimmed")
      }
    }

    const cloudy = ["cloud", "overcast", "partly", "rain", "drizzle", "thunder", "sleet", "snow", "fog", "hail"].includes(kind)
    if (cloudy) { cloud.classList.add("on"); if (["cloud", "overcast", "thunder", "fog", "hail"].includes(kind)) cloud.classList.add("overcast") }
    if (["rain", "drizzle", "thunder", "sleet"].includes(kind)) { rain.classList.add("on"); if (kind === "drizzle") rain.classList.add("light") }
    if (["snow", "sleet"].includes(kind)) snow.classList.add("on")
    if (kind === "fog") fog.classList.add("on")
    if (kind === "thunder" || kind === "hail") this.startThunder(thunder)
    if (kind === "hail") hail.classList.add("on")

    if (rain.classList.contains("on") && !rain.children.length) {
      const n = rain.classList.contains("light") ? 28 : 50
      for (let i = 0; i < n; i++) {
        const d = document.createElement("span"); d.className = "raindrop"
        d.style.left = Math.random() * 100 + "%"
        d.style.height = (12 + Math.random() * 12) + "px"
        d.style.animationDuration = (0.6 + Math.random() * 0.8) + "s"
        d.style.animationDelay = (Math.random() * 1.5) + "s"
        rain.appendChild(d)
      }
    }
    if (snow.classList.contains("on") && !snow.children.length) {
      for (let i = 0; i < 60; i++) {
        const f = document.createElement("span"); f.className = "snowflake"
        const sz = 2 + Math.random() * 4
        f.style.left = Math.random() * 100 + "%"
        f.style.width = sz + "px"; f.style.height = sz + "px"
        f.style.opacity = 0.55 + Math.random() * 0.45
        f.style.animationDuration = (6 + Math.random() * 8) + "s"
        f.style.animationDelay = "-" + (Math.random() * 10) + "s"
        snow.appendChild(f)
      }
    }
    if (cloudy && !cloud.querySelector(".cloud-blob")) {
      const blobs = [
        { w: 520, h: 160, top: "8%",  c: "rgba(220,225,235,0.55)", dur: 90 },
        { w: 420, h: 130, top: "22%", c: "rgba(200,210,225,0.45)", dur: 130, delay: -40 },
        { w: 620, h: 180, top: "40%", c: "rgba(190,200,215,0.4)",  dur: 160, delay: -90 },
        { w: 380, h: 110, top: "58%", c: "rgba(210,220,235,0.35)", dur: 110, delay: -20 },
        { w: 500, h: 150, top: "74%", c: "rgba(180,190,210,0.32)", dur: 200, delay: -130 },
      ]
      blobs.forEach(b => {
        const el = document.createElement("span"); el.className = "cloud-blob"
        el.style.width = b.w + "px"; el.style.height = b.h + "px"; el.style.top = b.top
        el.style.background = b.c; el.style.animationDuration = b.dur + "s"
        if (b.delay) el.style.animationDelay = b.delay + "s"
        cloud.appendChild(el)
      })
    }
    if (hail.classList.contains("on") && !hail.children.length) {
      for (let i = 0; i < 40; i++) {
        const s = document.createElement("span"); s.className = "hailstone"
        const sz = 3 + Math.random() * 5
        s.style.left = Math.random() * 100 + "%"
        s.style.width = sz + "px"; s.style.height = sz + "px"
        s.style.animationDuration = (0.3 + Math.random() * 0.3) + "s"
        s.style.animationDelay = (Math.random() * 1.5) + "s"
        hail.appendChild(s)
      }
    }
  }

  startThunder(el) {
    el.classList.add("on")
    const wrap = el.querySelector(".bolt-wrap")
    if (!wrap.children.length) {
      const bolt = document.createElement("div"); bolt.className = "bolt"
      bolt.innerHTML = `<svg viewBox="0 0 80 200" xmlns="http://www.w3.org/2000/svg"><path d="M44 0L12 88h28L24 200l52-112H52L72 0z"/></svg>`
      wrap.appendChild(bolt)
    }
    const flash = () => {
      const bolt = wrap.querySelector(".bolt")
      if (!bolt) return
      bolt.style.left = (15 + Math.random() * 70) + "%"
      el.classList.add("flash-bright"); bolt.classList.add("on")
      setTimeout(() => {
        el.classList.remove("flash-bright"); el.classList.add("flash-dim")
        bolt.classList.remove("on")
        setTimeout(() => el.classList.remove("flash-dim"), 200)
      }, 80)
    }
    flash()
    this._thunderInterval = setInterval(flash, 5000)
  }

  // ============ errors ============
  showError(msg) {
    this.errorMsgTarget.textContent = msg
    this.errorAlertTarget.style.display = "block"
    clearTimeout(this.errTimeout)
    this.errTimeout = setTimeout(() => { this.errorAlertTarget.style.display = "none" }, 4000)
  }
}

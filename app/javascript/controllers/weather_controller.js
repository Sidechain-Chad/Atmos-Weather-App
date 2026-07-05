import { Controller } from "@hotwired/stimulus"

// ATMOS — Stimulus now only does DOM manipulation and browser APIs (sky/FX
// animation, geolocation, search-as-you-type suggestions). Weather data is
// fetched and rendered server-side (WeatherController + WeatherService); the
// "weather_dashboard" turbo-frame is (re)loaded whenever the city, units, or
// geolocation changes.

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

// ---------- ambient sound ----------
const RAIN_KINDS = ["rain", "drizzle", "thunder", "sleet"]
const SNOW_KINDS = ["snow", "hail"]
const SOUND_FADE_MS = 2000
const MUTE_STORAGE_KEY = "atmos.muted"
const UNMUTED_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13" opacity="0.6"/></svg>`
const MUTED_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`

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
    "cityInput", "searchIcon", "spinner", "searchResults",
    "dashboard", "conditionData", "unitMetric", "unitImperial",
    "soundToggle", "ambientAudio", "weatherAudio"
  ]
  static values = { rootUrl: String }

  connect() {
    this.selectedIndex = -1
    this.initStars()
    this.initSound()
    this.dashboardLoaded()

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => this.navigate({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => { /* keep the city already loaded */ },
        { timeout: 8000, maximumAge: 600000 }
      )
    }
  }

  disconnect() {
    if (this._thunderInterval) clearInterval(this._thunderInterval)
    if (this.hasAmbientAudioTarget) clearInterval(this.ambientAudioTarget._fadeInterval)
    if (this.hasWeatherAudioTarget) clearInterval(this.weatherAudioTarget._fadeInterval)
  }

  // ============ navigation (reloads the weather_dashboard turbo-frame) ============
  navigate(params) {
    const url = new URL(this.rootUrlValue, window.location.origin)
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v) })
    this.dashboardTarget.src = url.pathname + url.search
  }

  navigateToLocation(e) {
    const d = e.currentTarget.dataset
    this.navigate({ lat: d.lat, lon: d.lon, name: d.name, country: d.country })
  }

  // Detail pages share this controller for sky/FX only and have no search bar,
  // so the spinner target won't exist there — guard instead of throwing.
  showSpinner() {
    if (!this.hasSpinnerTarget) return
    this.spinnerTarget.style.display = "block"
    if (this.hasSearchIconTarget) this.searchIconTarget.style.display = "none"
    if (this.hasCityInputTarget) {
      this._placeholder = this.cityInputTarget.placeholder
      this.cityInputTarget.placeholder = ""
    }
  }

  hideSpinner() {
    if (!this.hasSpinnerTarget) return
    this.spinnerTarget.style.display = "none"
    if (this.hasSearchIconTarget) this.searchIconTarget.style.display = ""
    if (this.hasCityInputTarget && this._placeholder !== undefined) this.cityInputTarget.placeholder = this._placeholder
  }

  // Runs after every dashboard load: initial page render AND every subsequent
  // turbo-frame navigation (unit toggle, city select, geolocation upgrade).
  dashboardLoaded() {
    this.hideSpinner()
    if (!this.hasConditionDataTarget) return

    const kind = this.conditionDataTarget.dataset.condition
    const localHour = parseInt(this.conditionDataTarget.dataset.localHour, 10)
    const windy = this.conditionDataTarget.dataset.windy === "true"
    const phase = phaseFromHour(localHour)
    this.applyPalette(phase, kind)
    this.setWeatherFx(kind)
    this.updateSound(phase, kind, windy)
    if (this.hasDashboardTarget) {
      this.dashboardTarget.querySelectorAll(".hero,.hourly,.daily,.cards,.my-locations").forEach(el => el.style.opacity = 1)
    }
  }

  // ============ units ============
  setUnits(e) {
    const units = e.currentTarget.dataset.units
    this.unitMetricTarget.classList.toggle("active", units === "metric")
    this.unitImperialTarget.classList.toggle("active", units === "imperial")
    this.navigate({ units })
  }

  // ============ ambient sound ============
  // Muted by default (no stored preference yet) — sound only ever starts as a
  // direct result of clicking the speaker icon, since that's a real user
  // gesture and needs no autoplay workaround. Audibility is controlled purely
  // via el.volume (faded by fadeAudio), not the `muted` media property, so
  // toggling gets the same 2s fade as everything else.
  initSound() {
    this.muted = localStorage.getItem(MUTE_STORAGE_KEY) !== "0"
    this.updateSoundToggleUI()
  }

  toggleSound() {
    this.muted = !this.muted
    localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? "1" : "0")
    this.updateSoundToggleUI()
    if (!this.hasAmbientAudioTarget) return

    if (this.muted) {
      [this.ambientAudioTarget, this.weatherAudioTarget].forEach(el => this.fadeAudio(el, 0, SOUND_FADE_MS, () => el.pause()))
      return
    }
    if (this.ambientAudioTarget.src) {
      this.ambientAudioTarget.play().catch(() => {})
      this.fadeAudio(this.ambientAudioTarget, this._ambientVolume ?? 0.5, SOUND_FADE_MS)
    }
    if (this.weatherAudioTarget.src && this._weatherVolume) {
      this.weatherAudioTarget.play().catch(() => {})
      this.fadeAudio(this.weatherAudioTarget, this._weatherVolume, SOUND_FADE_MS)
    }
  }

  updateSoundToggleUI() {
    if (!this.hasSoundToggleTarget) return
    this.soundToggleTarget.setAttribute("aria-label", this.muted ? "Unmute ambient sound" : "Mute ambient sound")
    this.soundToggleTarget.setAttribute("title", this.muted ? "Sound off" : "Sound on")
    this.soundToggleTarget.classList.toggle("muted", this.muted)
    this.soundToggleTarget.innerHTML = this.muted ? MUTED_ICON : UNMUTED_ICON
  }

  // Base ambient loop is day/night; a weather loop crossfades in on top when
  // conditions call for it, rather than replacing the ambience. Overcast skies
  // ("cloud" — WeatherCode labels WMO code 3 "Overcast" but its FX kind is
  // "cloud") get the wind loop too: a grey, fully-clouded sky reads as moodier
  // and breezier, not the same bright "day" ambience as clear/partly-cloudy.
  updateSound(phase, kind, windy) {
    if (!this.hasAmbientAudioTarget || !this.hasWeatherAudioTarget) return

    const ambient = phase === "night" ? "night" : "day"
    const weather = RAIN_KINDS.includes(kind) ? "rain" : SNOW_KINDS.includes(kind) ? "snow" : (windy || kind === "cloud") ? "wind" : null

    this._ambientVolume = 0.5
    this._weatherVolume = weather ? 0.55 : 0

    this.switchTrack(this.ambientAudioTarget, `/audio/${ambient}.mp3`, this._ambientVolume)
    if (weather) {
      this.switchTrack(this.weatherAudioTarget, `/audio/${weather}.mp3`, this._weatherVolume)
    } else if (this.weatherAudioTarget.dataset.src) {
      this.weatherAudioTarget.dataset.src = ""
      if (this.muted) this.weatherAudioTarget.pause()
      else this.fadeAudio(this.weatherAudioTarget, 0, SOUND_FADE_MS, () => this.weatherAudioTarget.pause())
    }
  }

  // Keeps el.src pointed at the right track always (even while muted, so
  // unmuting has something to play immediately) but only actually plays/fades
  // audibly when unmuted.
  switchTrack(el, src, targetVolume) {
    if (el.dataset.src === src) return
    el.dataset.src = src

    const start = () => {
      el.src = src
      el.currentTime = 0
      el.volume = 0
      if (this.muted) return
      el.play().catch(() => {})
      this.fadeAudio(el, targetVolume, SOUND_FADE_MS)
    }
    if (el.paused || this.muted) { start(); return }
    this.fadeAudio(el, 0, SOUND_FADE_MS / 2, start)
  }

  fadeAudio(el, target, ms, onDone) {
    clearInterval(el._fadeInterval)
    const steps = Math.max(1, Math.round(ms / 50))
    const start = el.volume, delta = target - start
    let i = 0
    el._fadeInterval = setInterval(() => {
      i++
      el.volume = Math.max(0, Math.min(1, start + delta * (i / steps)))
      if (i >= steps) {
        clearInterval(el._fadeInterval)
        if (onDone) onDone()
      }
    }, 50)
  }

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
        this.cityInputTarget.value = ""
        this.searchResultsTarget.innerHTML = ""
        this.navigate({ lat: d.lat, lon: d.lon, name: d.name, country: d.country })
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
}

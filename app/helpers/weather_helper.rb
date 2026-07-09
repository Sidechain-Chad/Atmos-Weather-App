module WeatherHelper
  # ---------- SVG weather glyphs (ported from the old client-side wxIcon()) ----------
  def wx_icon(kind, size = 28)
    o = %(xmlns="http://www.w3.org/2000/svg" width="#{size}" height="#{size}" viewBox="0 0 32 32")
    gid = "sg#{SecureRandom.hex(3)}"

    svg =
      case kind
      when "clear"
        %(<svg #{o}>
          <defs><radialGradient id="#{gid}"><stop offset="0%" stop-color="#ffe8a8"/><stop offset="100%" stop-color="#f5a635"/></radialGradient></defs>
          <circle cx="16" cy="16" r="6" fill="url(##{gid})"/>
          <g stroke="#ffd78a" stroke-width="2" stroke-linecap="round">
            <line x1="16" y1="3" x2="16" y2="6"/><line x1="16" y1="26" x2="16" y2="29"/>
            <line x1="3" y1="16" x2="6" y2="16"/><line x1="26" y1="16" x2="29" y2="16"/>
            <line x1="6" y1="6" x2="8" y2="8"/><line x1="24" y1="24" x2="26" y2="26"/>
            <line x1="6" y1="26" x2="8" y2="24"/><line x1="24" y1="8" x2="26" y2="6"/></g></svg>)
      when "partly"
        %(<svg #{o}>
          <circle cx="11" cy="11" r="4.5" fill="#ffd78a"/>
          <path d="M9 24h13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 9 24z" fill="#f0f4fa" stroke="#c8d5e6" stroke-width="0.8"/></svg>)
      when "rain", "drizzle"
        %(<svg #{o}>
          <path d="M9 20h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 20z" fill="#c8d5e6"/>
          <g stroke="#5aa0e0" stroke-width="2" stroke-linecap="round">
            <line x1="11" y1="23" x2="10" y2="27"/><line x1="16" y1="23" x2="15" y2="28"/><line x1="21" y1="23" x2="20" y2="27"/></g></svg>)
      when "snow", "sleet"
        %(<svg #{o}>
          <path d="M9 20h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 20z" fill="#e5ecf5"/>
          <g fill="#fff"><circle cx="11" cy="26" r="1.4"/><circle cx="16" cy="27" r="1.4"/><circle cx="21" cy="26" r="1.4"/></g></svg>)
      when "thunder", "hail"
        %(<svg #{o}>
          <path d="M9 18h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 18z" fill="#aab6c8"/>
          <path d="M16 18l-4 7h3l-2 5 7-9h-4l3-3z" fill="#ffd24a"/></svg>)
      else
        %(<svg #{o}>
          <path d="M9 24h14a5 5 0 0 0 0-10 6.5 6.5 0 0 0-12.5-1.5A4 4 0 0 0 9 24z" fill="#dee6f2" stroke="#b8c5d8" stroke-width="0.8"/></svg>)
      end

    svg.html_safe
  end

  # ---------- unit helpers (values already arrive pre-converted from Open-Meteo) ----------
  def wx_round(value)
    value.nil? ? "—" : value.round
  end

  def wind_unit(units)
    units == "imperial" ? "mph" : "km/h"
  end

  def visibility_unit(units)
    units == "imperial" ? "mi" : "km"
  end

  def visibility_value(meters, units)
    return "—" if meters.nil?

    km = meters / 1000.0
    units == "imperial" ? (km * 0.621371).round(1) : km.round(1)
  end

  def uv_label(uv)
    return "Low" if uv < 3
    return "Moderate" if uv < 6
    return "High" if uv < 8
    return "Very High" if uv < 11

    "Extreme"
  end

  def aqi_label(aqi)
    return "Good" if aqi < 50
    return "Moderate" if aqi < 100
    return "Unhealthy (SG)" if aqi < 150
    return "Unhealthy" if aqi < 200

    "Hazardous"
  end

  def wind_compass_label(deg)
    return "—" if deg.nil?

    %w[N NE E SE S SW W NW][(((deg % 360) + 22.5) / 45).to_i % 8]
  end

  BEAUFORT_SCALE = [
    [1, "0 Calm"],
    [6, "1 Light Air"],
    [12, "2 Light Breeze"],
    [20, "3 Gentle Breeze"],
    [29, "4 Moderate Breeze"],
    [39, "5 Fresh Breeze"],
    [50, "6 Strong Breeze"],
    [62, "7 Near Gale"],
    [75, "8 Gale"],
    [89, "9 Strong Gale"],
    [103, "10 Storm"],
    [118, "11 Violent Storm"]
  ].freeze

  def beaufort_label(speed, units)
    return "—" if speed.nil?

    kmh = units == "imperial" ? speed * 1.60934 : speed
    _, label = BEAUFORT_SCALE.find { |threshold, _| kmh < threshold }
    label || "12 Hurricane"
  end

  def pressure_trend_label(values)
    values = values.compact
    return "Steady" if values.size < 2

    diff = values.last - values.first
    return "Rising" if diff > 1
    return "Falling" if diff < -1

    "Steady"
  end

  def pollen_level(value)
    return "Low" if value.nil? || value < 20
    return "Moderate" if value < 50
    return "High" if value < 100

    "Very High"
  end

  METRIC_TITLES = {
    "uv" => "UV Index", "sunset" => "Sunset", "wind" => "Wind", "feels-like" => "Feels Like",
    "humidity" => "Humidity", "visibility" => "Visibility", "pressure" => "Pressure",
    "air-quality" => "Air Quality", "precipitation" => "Precipitation",
    "moon" => "Moon", "pollen" => "Pollen", "averages" => "Averages"
  }.freeze

  def metric_title(metric)
    METRIC_TITLES[metric] || metric.to_s.titleize
  end

  # ---------- card SVG widgets ----------
  def sunset_arc_svg(sunrise, sunset, local_hour)
    to_hr = ->(s) { h, m = s.split(":").map(&:to_i); h + m / 60.0 }
    sr = to_hr.call(sunrise.presence || "06:00")
    ss = to_hr.call(sunset.presence || "18:00")
    span = [0.001, ss - sr].max
    pct = [0, [1, (local_hour - sr) / span].min].max

    ang = Math::PI * (1 - pct)
    cx = 100
    cy = 66
    r = 66
    sx = cx + r * Math.cos(ang)
    sy = cy - r * Math.sin(ang)

    %(<svg class="sun-arc" viewBox="0 0 200 84">
      <path d="M #{cx - r} #{cy} A #{r} #{r} 0 0 1 #{cx + r} #{cy}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="2 3"/>
      <path d="M #{cx - r} #{cy} A #{r} #{r} 0 0 1 #{sx} #{sy}" fill="none" stroke="#ffd78a" stroke-width="2"/>
      <circle cx="#{sx}" cy="#{sy}" r="5" fill="#ffe8a8"/>
      <line x1="20" y1="#{cy}" x2="180" y2="#{cy}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/></svg>).html_safe
  end

  def wind_compass_svg(direction_deg)
    dirs = %w[N NE E SE S SW W NW]
    wcx = 45
    wcy = 45
    wr = 36
    rad = (direction_deg - 90) * Math::PI / 180
    ax = wcx + (wr - 12) * Math.cos(rad)
    ay = wcy + (wr - 12) * Math.sin(rad)

    ticks = dirs.each_with_index.map do |d, i|
      aa = (i * 45 - 90) * Math::PI / 180
      tx = wcx + (wr + 4) * Math.cos(aa)
      ty = wcy + (wr + 4) * Math.sin(aa) + 3
      color = d == "N" ? "#fff" : "rgba(255,255,255,0.5)"
      weight = d == "N" ? 700 : 400
      %(<text x="#{tx}" y="#{ty}" text-anchor="middle" font-size="7" fill="#{color}" font-weight="#{weight}">#{d}</text>)
    end.join

    %(<svg viewBox="0 0 90 90" style="width:80px;height:80px;flex:0 0 80px">
      <circle cx="#{wcx}" cy="#{wcy}" r="#{wr}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <circle cx="#{wcx}" cy="#{wcy}" r="#{wr - 8}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="2 3"/>
      #{ticks}
      <line x1="#{wcx}" y1="#{wcy}" x2="#{ax}" y2="#{ay}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="#{wcx}" cy="#{wcy}" r="2" fill="#fff"/></svg>).html_safe
  end

  # Large compass shown on the Wind detail page (distinct from the small
  # card-sized wind_compass_svg above).
  def wind_compass_detail_svg(direction_deg, speed_label, unit)
    direction_deg = direction_deg.to_f
    dirs = %w[N NE E SE S SW W NW]
    cx = 120
    cy = 120
    r = 100
    rad = (direction_deg - 90) * Math::PI / 180
    ax = cx + (r - 28) * Math.cos(rad)
    ay = cy + (r - 28) * Math.sin(rad)

    ticks = (0...24).map do |i|
      a = (i * 15 - 90) * Math::PI / 180
      inner = i.even? ? r - 8 : r - 4
      x1 = cx + inner * Math.cos(a)
      y1 = cy + inner * Math.sin(a)
      x2 = cx + r * Math.cos(a)
      y2 = cy + r * Math.sin(a)
      %(<line x1="#{x1}" y1="#{y1}" x2="#{x2}" y2="#{y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>)
    end.join

    labels = dirs.each_with_index.map do |d, i|
      a = (i * 45 - 90) * Math::PI / 180
      tx = cx + (r + 14) * Math.cos(a)
      ty = cy + (r + 14) * Math.sin(a) + 4
      color = d == "N" ? "#ffb467" : "rgba(255,255,255,0.6)"
      weight = d == "N" ? 700 : 500
      %(<text x="#{tx}" y="#{ty}" text-anchor="middle" font-size="13" fill="#{color}" font-weight="#{weight}">#{d}</text>)
    end.join

    %(<svg viewBox="0 0 240 240" width="240" height="240" style="max-width:100%">
      <circle cx="#{cx}" cy="#{cy}" r="#{r}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <circle cx="#{cx}" cy="#{cy}" r="#{r - 16}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 4"/>
      <circle cx="#{cx}" cy="#{cy}" r="#{r - 32}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      #{ticks}
      #{labels}
      <line x1="#{cx}" y1="#{cy}" x2="#{ax}" y2="#{ay}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <polygon points="#{ax - 6},#{ay + 6} #{ax},#{ay - 4} #{ax + 6},#{ay + 6}" transform="rotate(#{direction_deg + 180} #{ax} #{ay})" fill="#fff"/>
      <circle cx="#{cx}" cy="#{cy}" r="5" fill="#fff"/>
      <text x="#{cx}" y="#{cy + 48}" text-anchor="middle" font-size="28" font-weight="300" fill="#fff" letter-spacing="-0.02em">#{speed_label}</text>
      <text x="#{cx}" y="#{cy + 64}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.55)" letter-spacing="0.12em">#{unit.upcase}</text></svg>).html_safe
  end

  # Today's hourly series for `field`, starting at the current hour (same
  # floor-to-current-hour logic as the hourly forecast card).
  def hourly_window(weather, field, count: 24)
    times = weather.hourly["time"]
    floor_idx = times.rindex { |t| t <= weather.current["time"] } || 0
    Array(weather.hourly[field])[floor_idx, count] || []
  end

  HOURLY_ALERT_KIND_RANK = { "drizzle" => 0, "rain" => 1, "sleet" => 2, "snow" => 3, "hail" => 4, "thunder" => 5 }.freeze

  # Headline for the worst precipitation expected within the visible hourly
  # window (same 12-hour span shown in the hourly forecast card), e.g.
  # "Heavy rain expected around 15:00." Returns nil if nothing notable.
  def hourly_alert_text(weather, window: 12)
    times = weather.hourly["time"]
    codes = weather.hourly["weather_code"]
    pops = weather.hourly["precipitation_probability"]
    floor_idx = times.rindex { |t| t <= weather.current["time"] } || 0
    last_idx = [floor_idx + window, times.length].min - 1

    best = nil
    (floor_idx..last_idx).each do |idx|
      decoded = WeatherCode.decode(codes[idx])
      next unless HOURLY_ALERT_KIND_RANK.key?(decoded.kind)

      pop = pops&.[](idx)
      next if pop && pop < 40

      severity = decoded.label.start_with?("Heavy", "Violent") ? 2 : decoded.label.start_with?("Light") ? 0 : 1
      rank = [HOURLY_ALERT_KIND_RANK[decoded.kind], severity]
      next if best && (rank <=> best[:rank]) <= 0

      best = { idx: idx, label: decoded.label, rank: rank }
    end
    return nil unless best

    text = best[:label][0] + best[:label][1..].downcase
    return "#{text} right now." if best[:idx] == floor_idx

    "#{text} expected around #{format("%02d", times[best[:idx]][11, 2].to_i)}:00."
  end

  HERO_ALERT_KIND_NOUN = {
    "drizzle" => "Drizzle", "rain" => "Rain", "sleet" => "Sleet",
    "snow" => "Snow", "hail" => "Hail", "thunder" => "Thunderstorms"
  }.freeze

  # Short heads-up for the hero pill, e.g. "Rain expected for the next hour"
  # or "Snow expected around 17:00." Favors the soonest upcoming precipitation
  # (urgency) rather than the worst severity used by hourly_alert_text.
  def hero_alert_text(weather, window: 6)
    times = weather.hourly["time"]
    codes = weather.hourly["weather_code"]
    pops = weather.hourly["precipitation_probability"]
    floor_idx = times.rindex { |t| t <= weather.current["time"] } || 0
    last_idx = [floor_idx + window, times.length].min - 1

    idx = (floor_idx..last_idx).find do |i|
      decoded = WeatherCode.decode(codes[i])
      next false unless HOURLY_ALERT_KIND_RANK.key?(decoded.kind)

      pop = pops&.[](i)
      pop.nil? || pop >= 40
    end
    return nil unless idx

    noun = HERO_ALERT_KIND_NOUN.fetch(WeatherCode.decode(codes[idx]).kind, "Rain")
    return "#{noun} expected for the next hour" if idx <= floor_idx + 1

    "#{noun} expected around #{format("%02d", times[idx][11, 2].to_i)}:00"
  end

  def sparkline_svg(values, width: 280, height: 60, color: "#ffffff", fill: nil)
    values = values.compact
    return "".html_safe if values.size < 2

    min = values.min
    span = (values.max - min).nonzero? || 1
    step = width / (values.size - 1).to_f
    points = values.each_with_index.map { |v, i| [(i * step).round(1), (height - ((v - min) / span.to_f) * height).round(1)] }
    line = points.each_with_index.map { |(x, y), i| "#{i.zero? ? "M" : "L"}#{x} #{y}" }.join(" ")

    area = fill ? %(<path d="#{line} L#{points.last[0]} #{height} L0 #{height} Z" fill="#{fill}" stroke="none"/>) : ""

    %(<svg class="detail-chart" viewBox="0 0 #{width} #{height}" preserveAspectRatio="none">
      #{area}
      <path d="#{line}" fill="none" stroke="#{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>).html_safe
  end

  def bar_chart_svg(values, width: 280, height: 60, color: "#5aa0e0")
    values = values.map { |v| v || 0 }
    return "".html_safe if values.empty?

    max = [values.max, 0.1].max
    gap = 2
    bar_w = (width.to_f / values.size) - gap
    bars = values.each_with_index.map do |v, i|
      h = [(v / max.to_f) * height, 1].max
      x = (i * (bar_w + gap)).round(1)
      y = (height - h).round(1)
      %(<rect x="#{x}" y="#{y}" width="#{bar_w.round(1)}" height="#{h.round(1)}" rx="1.5" fill="#{color}"/>)
    end.join

    %(<svg class="detail-chart" viewBox="0 0 #{width} #{height}" preserveAspectRatio="none">#{bars}</svg>).html_safe
  end

  # Two overlaid series on a shared scale (e.g. apparent vs actual temperature).
  # `values_b` is drawn first/dashed so `values_a` renders on top.
  def dual_line_chart_svg(values_a, values_b, color_a: "#ffffff", color_b: "rgba(255,255,255,0.4)", width: 280, height: 60)
    a = values_a.compact
    b = values_b.compact
    return "".html_safe if a.size < 2 || b.size < 2

    all = a + b
    min = all.min
    span = (all.max - min).nonzero? || 1

    to_points = lambda do |values|
      step = width / (values.size - 1).to_f
      values.each_with_index.map { |v, i| [(i * step).round(1), (height - ((v - min) / span.to_f) * height).round(1)] }
    end
    path_of = ->(points) { points.each_with_index.map { |(x, y), i| "#{i.zero? ? "M" : "L"}#{x} #{y}" }.join(" ") }

    path_a = path_of.call(to_points.call(a))
    path_b = path_of.call(to_points.call(b))

    %(<svg class="detail-chart" viewBox="0 0 #{width} #{height}" preserveAspectRatio="none">
      <path d="#{path_b}" fill="none" stroke="#{color_b}" stroke-width="2" stroke-dasharray="4 4"/>
      <path d="#{path_a}" fill="none" stroke="#{color_a}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>).html_safe
  end

  # Waxing moons draw the sunlit side on the right (a simplification that
  # holds for northern-hemisphere observers; waning moons mirror it to the
  # left, since the real picture mirrors south of the equator, which this
  # doesn't attempt to correct for).
  def moon_icon_svg(illumination, waxing, size = 88)
    f = illumination.to_f.clamp(0, 100) / 100.0
    r = 30
    cx = cy = 40
    rx = (r * (1 - 2 * f).abs).round(2)
    lit = "#e8e3d1"
    dark = "#1a1f2e"

    body =
      if f < 0.5
        lit_x = waxing ? cx : cx - r
        %(<circle cx="#{cx}" cy="#{cy}" r="#{r}" fill="#{dark}"/>
          <rect x="#{lit_x}" y="#{cy - r}" width="#{r}" height="#{2 * r}" fill="#{lit}"/>
          <ellipse cx="#{cx}" cy="#{cy}" rx="#{rx}" ry="#{r}" fill="#{dark}"/>)
      else
        dark_x = waxing ? cx - r : cx
        %(<circle cx="#{cx}" cy="#{cy}" r="#{r}" fill="#{lit}"/>
          <rect x="#{dark_x}" y="#{cy - r}" width="#{r}" height="#{2 * r}" fill="#{dark}"/>
          <ellipse cx="#{cx}" cy="#{cy}" rx="#{rx}" ry="#{r}" fill="#{lit}"/>)
      end

    gid = "mc#{SecureRandom.hex(3)}"
    %(<svg viewBox="0 0 80 80" width="#{size}" height="#{size}">
      <defs><clipPath id="#{gid}"><circle cx="#{cx}" cy="#{cy}" r="#{r}"/></clipPath></defs>
      <g clip-path="url(##{gid})">#{body}</g>
      <circle cx="#{cx}" cy="#{cy}" r="#{r}" fill="none" stroke="rgba(255,255,255,0.15)"/>
    </svg>).html_safe
  end

  def pressure_gauge_svg(pressure_hpa)
    pct = [0, [1, (pressure_hpa - 980) / 60.0].min].max
    angle = -90 + pct * 180

    %(<svg viewBox="0 0 100 60" style="width:90px">
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linecap="round"/>
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="#{125.6 * pct} 300"/>
      <g transform="translate(50 50) rotate(#{angle})"><line x1="0" y1="0" x2="0" y2="-34" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>
      <circle cx="50" cy="50" r="2" fill="#fff"/></svg>).html_safe
  end

  # Large barometer dial shown on the Pressure detail page (distinct from the
  # small card-sized pressure_gauge_svg above).
  def pressure_gauge_detail_svg(pressure_hpa)
    pct = [0, [1, (pressure_hpa - 980) / 60.0].min].max
    angle = -90 + pct * 180
    dash = (314.2 * pct).round(1)

    %(<svg viewBox="0 0 240 140" width="240" height="140">
      <defs><linearGradient id="pressure-detail-g" x1="0" x2="1"><stop offset="0%" stop-color="#e06060"/><stop offset="50%" stop-color="#f2d84a"/><stop offset="100%" stop-color="#6ecf6c"/></linearGradient></defs>
      <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3" stroke-linecap="round"/>
      <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="url(#pressure-detail-g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="#{dash} 400"/>
      <g transform="translate(120 120) rotate(#{angle})"><line x1="0" y1="0" x2="0" y2="-90" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></g>
      <circle cx="120" cy="120" r="5" fill="#fff"/>
      <text x="20" y="135" font-size="11" fill="rgba(255,255,255,0.5)">980</text>
      <text x="220" y="135" font-size="11" fill="rgba(255,255,255,0.5)" text-anchor="end">1040</text>
      <text x="120" y="100" font-size="24" fill="#fff" text-anchor="middle" font-weight="300" letter-spacing="-0.02em">#{pressure_hpa.round}</text>
      <text x="120" y="115" font-size="9" fill="rgba(255,255,255,0.55)" text-anchor="middle" letter-spacing="0.12em">HPA</text></svg>).html_safe
  end

  # 12-month avg-high/avg-low area+line chart for the Averages detail page.
  # `monthly` is an array of {month:, avg_high:, avg_low:} (1-indexed month,
  # gaps allowed). `today_month`/`today_hi`/`today_lo` draw the marker line.
  def annual_temperature_chart_svg(monthly, today_month: nil, today_hi: nil, today_lo: nil)
    return "".html_safe if monthly.blank?

    month_labels = %w[J F M A M J J A S O N D]
    all_values = monthly.flat_map { |m| [m[:avg_high], m[:avg_low]] } + [today_hi, today_lo]
    all_values = all_values.compact
    min = all_values.min - 2
    max = all_values.max + 2
    span = (max - min).nonzero? || 1

    px = ->(month) { 20 + ((month - 1) / 11.0) * 560 }
    py = ->(v) { 20 + (1 - (v - min) / span.to_f) * 120 }

    hi_path = monthly.each_with_index.map { |m, i| "#{i.zero? ? "M" : "L"}#{px.call(m[:month])} #{py.call(m[:avg_high])}" }.join(" ")
    lo_path = monthly.each_with_index.map { |m, i| "#{i.zero? ? "M" : "L"}#{px.call(m[:month])} #{py.call(m[:avg_low])}" }.join(" ")
    area_path = "#{hi_path} #{monthly.reverse.map { |m| "L#{px.call(m[:month])} #{py.call(m[:avg_low])}" }.join(" ")} Z"

    marker =
      if today_month && today_hi && today_lo
        x = px.call(today_month)
        %(<line x1="#{x}" y1="20" x2="#{x}" y2="140" stroke="rgba(255,255,255,0.3)" stroke-dasharray="3 3"/>
          <circle cx="#{x}" cy="#{py.call(today_hi)}" r="5" fill="#fff"/>
          <circle cx="#{x}" cy="#{py.call(today_lo)}" r="5" fill="#fff"/>)
      else
        ""
      end

    labels = month_labels.each_with_index.map { |m, i| %(<text x="#{20 + (i / 11.0) * 560}" y="156" font-size="11" fill="rgba(255,255,255,0.5)" text-anchor="middle">#{m}</text>) }.join

    %(<svg class="detail-chart" viewBox="0 0 600 160" preserveAspectRatio="none" style="height:180px">
      <defs><linearGradient id="avg-hi-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff9966" stop-opacity="0.6"/><stop offset="100%" stop-color="#ff9966" stop-opacity="0.05"/></linearGradient></defs>
      <line x1="20" x2="580" y1="50" y2="50" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <line x1="20" x2="580" y1="80" y2="80" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <line x1="20" x2="580" y1="110" y2="110" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <path d="#{area_path}" fill="url(#avg-hi-g)"/>
      <path d="#{hi_path}" fill="none" stroke="#ff9966" stroke-width="2"/>
      <path d="#{lo_path}" fill="none" stroke="#74b9ff" stroke-width="2"/>
      #{marker}
      #{labels}</svg>).html_safe
  end
end

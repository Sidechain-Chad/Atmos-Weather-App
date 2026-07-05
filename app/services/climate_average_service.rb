# Compares today's forecast high/low against the historical average for this
# calendar day over the past 10 years, via Open-Meteo's archive API. Caches
# the result for a week since a 10-year normal barely moves day to day.
#
# Fetches run in small concurrent batches rather than all 10 at once: firing
# 10 simultaneous requests reliably trips Open-Meteo's "too many concurrent
# requests" 429 on this endpoint, silently losing years. A batched sequential
# pass, plus a single retry for anything that still failed, gets all 10
# without hammering the API.
module ClimateAverageService
  ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
  YEARS_BACK = 10
  BATCH_SIZE = 3
  # Annual chart uses whole-year archive pulls (one request covers all 12
  # months), so a handful of years is enough without the request count
  # ballooning the way a per-month/per-year matrix would.
  ANNUAL_YEARS_BACK = 3

  Result = Struct.new(:avg_high, :avg_low, :years, keyword_init: true)

  def self.fetch(lat, lon, date, units: "metric")
    cache_key = "climate_average/#{lat.round(2)}/#{lon.round(2)}/#{date.strftime('%m-%d')}/#{units}"
    Rails.cache.fetch(cache_key, expires_in: 7.days) { compute(lat, lon, date, units) }
  end

  def self.compute(lat, lon, date, units)
    dates = ((date.year - YEARS_BACK)...date.year).filter_map { |y| same_day_in(y, date) }
    results = fetch_in_batches(lat, lon, dates, units)

    dates.each_index.select { |i| results[i].nil? }.each do |i|
      results[i] = fetch_day(lat, lon, dates[i], units)
    end

    pairs = results.compact
    return nil if pairs.empty?

    highs, lows = pairs.map(&:first), pairs.map(&:last)
    Result.new(avg_high: average(highs), avg_low: average(lows), years: pairs.size)
  end

  def self.fetch_in_batches(lat, lon, dates, units)
    results = []
    dates.each_slice(BATCH_SIZE) do |batch|
      threads = batch.map { |d| Thread.new { fetch_day(lat, lon, d, units) } }
      results.concat(threads.map(&:value))
    end
    results
  end

  def self.fetch_day(lat, lon, date, units)
    json = HttpJson.get(ARCHIVE_URL,
      latitude: lat, longitude: lon, start_date: date.iso8601, end_date: date.iso8601,
      daily: "temperature_2m_max,temperature_2m_min", timezone: "auto",
      temperature_unit: units == "imperial" ? "fahrenheit" : "celsius")
    hi = json.dig("daily", "temperature_2m_max", 0)
    lo = json.dig("daily", "temperature_2m_min", 0)
    [hi, lo] if hi && lo
  rescue WeatherApiError
    nil
  end

  def self.same_day_in(year, date)
    Date.new(year, date.month, date.day)
  rescue ArgumentError
    nil # Feb 29 falling on a non-leap year
  end

  def self.average(values)
    (values.sum / values.size.to_f).round(1)
  end

  # Monthly normals for the "Annual Temperature" chart: one archive request
  # per year (each covering all 12 months) rather than fetching per-day
  # averages 12 times over, which would multiply the request count for no
  # real accuracy gain at this chart's scale.
  def self.fetch_annual(lat, lon, units: "metric")
    cache_key = "climate_average_annual/#{lat.round(2)}/#{lon.round(2)}/#{units}"
    Rails.cache.fetch(cache_key, expires_in: 7.days) { compute_annual(lat, lon, units) }
  end

  def self.compute_annual(lat, lon, units)
    years = ((Date.current.year - ANNUAL_YEARS_BACK)...Date.current.year).to_a
    by_year = years.filter_map { |y| fetch_year(lat, lon, y, units) }
    return nil if by_year.empty?

    monthly = (1..12).filter_map do |month|
      highs = by_year.flat_map { |data| data[month]&.map(&:first) || [] }
      lows  = by_year.flat_map { |data| data[month]&.map(&:last) || [] }
      next nil if highs.empty?

      { month: month, avg_high: average(highs), avg_low: average(lows) }
    end
    monthly.presence
  end

  def self.fetch_year(lat, lon, year, units)
    json = HttpJson.get(ARCHIVE_URL,
      latitude: lat, longitude: lon,
      start_date: Date.new(year, 1, 1).iso8601, end_date: Date.new(year, 12, 31).iso8601,
      daily: "temperature_2m_max,temperature_2m_min", timezone: "auto",
      temperature_unit: units == "imperial" ? "fahrenheit" : "celsius")
    times = json.dig("daily", "time") || []
    highs = json.dig("daily", "temperature_2m_max") || []
    lows = json.dig("daily", "temperature_2m_min") || []

    by_month = Hash.new { |h, k| h[k] = [] }
    times.each_with_index do |t, i|
      next unless highs[i] && lows[i]

      by_month[Date.parse(t).month] << [highs[i], lows[i]]
    end
    by_month
  rescue WeatherApiError
    nil
  end

  private_class_method :fetch_in_batches, :fetch_day, :same_day_in, :average, :compute_annual, :fetch_year
end

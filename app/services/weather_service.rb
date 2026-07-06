class WeatherService
  FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
  AQI_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

  CURRENT_FIELDS = %w[
    temperature_2m relative_humidity_2m apparent_temperature is_day precipitation weather_code
    cloud_cover pressure_msl wind_speed_10m wind_direction_10m wind_gusts_10m visibility dew_point_2m uv_index
  ].freeze
  # Mirrors CURRENT_FIELDS (minus is_day/cloud_cover) so every detail page can
  # chart today's hourly trend for its metric without a second API call.
  HOURLY_FIELDS = %w[
    temperature_2m weather_code precipitation_probability precipitation relative_humidity_2m
    apparent_temperature pressure_msl wind_speed_10m wind_gusts_10m wind_direction_10m visibility
    dew_point_2m uv_index
  ].freeze
  DAILY_FIELDS = %w[
    weather_code temperature_2m_max temperature_2m_min sunrise sunset
    uv_index_max precipitation_sum precipitation_probability_max
  ].freeze
  POLLEN_FIELDS = %w[alder_pollen birch_pollen grass_pollen mugwort_pollen olive_pollen ragweed_pollen].freeze
  POLLUTANT_FIELDS = %w[pm2_5 pm10 ozone nitrogen_dioxide sulphur_dioxide carbon_monoxide].freeze

  Result = Struct.new(
    :name, :country, :latitude, :longitude, :units,
    :condition, :current, :hourly, :daily, :aqi, :pollutants, :pollen, :moon,
    keyword_init: true
  )

  class << self
    def fetch_by_city(city, units: "metric")
      place = GeocodingService.search(city).first
      raise WeatherApiError, %(Couldn't find "#{city}") unless place

      fetch_by_coords(place.latitude, place.longitude, name: place.name, country: place.country_code, units: units)
    end

    def fetch_by_coords(lat, lon, name: nil, country: nil, units: "metric")
      name, country = GeocodingService.reverse(lat, lon) if name.blank?
      new(lat, lon, name, country, units).call
    end
  end

  def initialize(lat, lon, name, country, units)
    @lat = lat
    @lon = lon
    @name = name
    @country = country
    @units = units == "imperial" ? "imperial" : "metric"
  end

  def call
    weather = fetch_forecast
    air = fetch_air_quality
    current_time = weather.dig("current", "time")

    Result.new(
      name: @name, country: @country, latitude: @lat, longitude: @lon, units: @units,
      condition: WeatherCode.decode(weather.dig("current", "weather_code")),
      current: weather["current"], hourly: weather["hourly"], daily: weather["daily"],
      aqi: air&.dig("current", "us_aqi"),
      pollutants: extract_fields(air, POLLUTANT_FIELDS),
      pollen: extract_fields(air, POLLEN_FIELDS),
      moon: MoonService.calculate(current_time ? Date.parse(current_time) : Date.current)
    )
  end

  private

  # Cached briefly and keyed by rounded coords so repeat page loads and the
  # per-saved-location fetches on "/" don't re-hit Open-Meteo and trip its
  # rate limit (see ClimateAverageService for the same pattern). Also keeps a
  # longer-lived "stale" copy of the last successful response so that if
  # Open-Meteo rejects a live fetch (e.g. Render's shared outbound IP getting
  # rate-limited by traffic from other apps), the page still shows real,
  # if slightly old, weather instead of an error banner.
  def fetch_forecast
    cache_key = "weather_forecast/#{@lat.round(2)}/#{@lon.round(2)}/#{@units}"
    stale_key = "#{cache_key}/stale"
    data = Rails.cache.fetch(cache_key, expires_in: 10.minutes) { HttpJson.get(FORECAST_URL, forecast_params) }
    Rails.cache.write(stale_key, data, expires_in: 6.hours)
    data
  rescue WeatherApiError
    Rails.cache.read(stale_key) || raise
  end

  def fetch_air_quality
    fields = ["us_aqi"] + POLLEN_FIELDS + POLLUTANT_FIELDS
    cache_key = "air_quality/#{@lat.round(2)}/#{@lon.round(2)}"
    Rails.cache.fetch(cache_key, expires_in: 10.minutes) do
      HttpJson.get(AQI_URL, latitude: @lat, longitude: @lon, current: fields.join(","))
    end
  rescue WeatherApiError
    nil
  end

  def extract_fields(air, fields)
    return nil unless air

    fields.index_with { |field| air.dig("current", field) }
  end

  def forecast_params
    {
      latitude: @lat, longitude: @lon,
      current: CURRENT_FIELDS.join(","), hourly: HOURLY_FIELDS.join(","), daily: DAILY_FIELDS.join(","),
      timezone: "auto", forecast_days: 7,
      temperature_unit: @units == "imperial" ? "fahrenheit" : "celsius",
      wind_speed_unit: @units == "imperial" ? "mph" : "kmh",
      precipitation_unit: @units == "imperial" ? "inch" : "mm"
    }
  end
end

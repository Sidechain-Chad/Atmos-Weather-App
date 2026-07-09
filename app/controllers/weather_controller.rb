class WeatherController < ApplicationController
  DEFAULT_CITY = "Cape Town"
  MAX_SAVED_LOCATIONS = 8

  def index
    @units = resolve_units
    @weather = load_weather
    remember(@weather) if @weather
    @location_saved = location_saved?(@weather)
    @saved_locations = load_saved_locations
    @climate_average = load_climate_average if @weather
  rescue WeatherApiError => e
    @error = e.message
    @weather = fallback_weather
    @saved_locations = []
  end

  def show
    @metric = params[:metric]
    @units = resolve_units
    @weather = load_weather
    remember(@weather) if @weather
    if @metric == "averages" && @weather
      @climate_average = load_climate_average
      @annual_climate = load_annual_climate
    end
  rescue WeatherApiError => e
    @error = e.message
    @weather = fallback_weather
  end

  def save_location
    add_saved_location(name: params[:name], country: params[:country], lat: params[:lat], lon: params[:lon])
    redirect_to root_path
  end

  def remove_location
    remove_saved_location(name: params[:name], lat: params[:lat], lon: params[:lon])
    redirect_to root_path
  end

  private

  def resolve_units
    units = params[:units].presence || cookies[:atmos_units]
    %w[metric imperial].include?(units) ? units : "metric"
  end

  def load_weather
    if params[:lat].present? && params[:lon].present?
      WeatherService.fetch_by_coords(params[:lat].to_f, params[:lon].to_f,
        name: params[:name].presence, country: params[:country].presence, units: @units)
    elsif cookies[:atmos_lat].present? && cookies[:atmos_lon].present?
      WeatherService.fetch_by_coords(cookies[:atmos_lat].to_f, cookies[:atmos_lon].to_f,
        name: cookies[:atmos_name].presence, country: cookies[:atmos_country].presence, units: @units)
    else
      WeatherService.fetch_by_city(DEFAULT_CITY, units: @units)
    end
  end

  def load_climate_average
    date = Date.parse(@weather.current["time"])
    ClimateAverageService.fetch(@weather.latitude, @weather.longitude, date, units: @units)
  rescue ArgumentError, TypeError
    nil
  end

  def load_annual_climate
    ClimateAverageService.fetch_annual(@weather.latitude, @weather.longitude, units: @units)
  end

  def fallback_weather
    WeatherService.fetch_by_city(DEFAULT_CITY, units: @units)
  rescue WeatherApiError
    nil
  end

  def remember(weather)
    cookies.permanent[:atmos_units] = @units
    cookies.permanent[:atmos_lat] = weather.latitude.to_s
    cookies.permanent[:atmos_lon] = weather.longitude.to_s
    cookies.permanent[:atmos_name] = weather.name
    cookies.permanent[:atmos_country] = weather.country.to_s
  end

  # ---------- My Locations (cookie-backed, no DB/auth in this app) ----------
  # The cookie is client-controlled, so treat its contents as untrusted: drop
  # any non-Hash entries and cap the list length before it's ever used, not
  # just on write, so a hand-crafted cookie can't force load_saved_locations
  # to spawn unbounded threads/API calls or blow up on a non-hash entry.
  def saved_locations
    list = JSON.parse(cookies[:atmos_locations].presence || "[]")
    return [] unless list.is_a?(Array)

    list.select { |l| l.is_a?(Hash) }.first(MAX_SAVED_LOCATIONS)
  rescue JSON::ParserError
    []
  end

  def location_saved?(weather)
    return false unless weather

    saved_locations.any? { |l| l["name"] == weather.name && l["country"] == weather.country.to_s }
  end

  def add_saved_location(name:, country:, lat:, lon:)
    return if name.blank? || lat.blank? || lon.blank?

    list = saved_locations.reject { |l| l["name"] == name && l["country"] == country.to_s }
    list.unshift({ "name" => name, "country" => country.to_s, "lat" => lat.to_f, "lon" => lon.to_f })
    cookies.permanent[:atmos_locations] = list.first(MAX_SAVED_LOCATIONS).to_json
  end

  def remove_saved_location(name:, lat:, lon:)
    list = saved_locations.reject { |l| l["name"] == name && l["lat"].to_f == lat.to_f && l["lon"].to_f == lon.to_f }
    cookies.permanent[:atmos_locations] = list.to_json
  end

  # Fetches live weather for every explicitly-saved location in parallel
  # (network-bound, so threads are worth it even under the GVL). Reuses the
  # already-fetched @weather in place instead of re-fetching it, if the
  # current city happens to be one of the saved ones.
  def load_saved_locations
    return [] if saved_locations.empty?

    threads = saved_locations.map do |loc|
      if loc["name"] == @weather&.name && loc["country"] == @weather&.country.to_s
        Thread.new { @weather }
      else
        Thread.new do
          WeatherService.fetch_by_coords(loc["lat"], loc["lon"], name: loc["name"], country: loc["country"], units: @units)
        rescue WeatherApiError
          nil
        end
      end
    end
    threads.map(&:value).compact
  end
end

require "test_helper"
require "minitest/mock"

class WeatherServiceTest < ActiveSupport::TestCase
  test "successful fetch builds a Result" do
    HttpJson.stub :get, http_json_stub(forecast_json, air_json) do
      result = WeatherService.fetch_by_coords(1.0, 2.0, name: "Test City", country: "TC", units: "metric")

      assert_instance_of WeatherService::Result, result
      assert_equal "Test City", result.name
      assert_equal "TC", result.country
      assert_equal 18, result.current["temperature_2m"]
      assert_equal 30, result.aqi
    end
  end

  test "falls back to the stale cache copy when the forecast fetch raises" do
    with_memory_cache do
      lat, lon, units = 1.0, 2.0, "metric"
      cache_key = "weather_forecast/#{lat.round(2)}/#{lon.round(2)}/#{units}/stale"
      Rails.cache.write(cache_key, forecast_json, expires_in: 6.hours)

      HttpJson.stub :get, ->(*) { raise WeatherApiError, "rate limited" } do
        result = WeatherService.fetch_by_coords(lat, lon, name: "Test City", country: "TC", units: units)

        assert_equal forecast_json["current"]["temperature_2m"], result.current["temperature_2m"]
      end
    end
  end

  test "propagates the error when the forecast fetch fails with no stale copy" do
    with_memory_cache do
      HttpJson.stub :get, ->(*) { raise WeatherApiError, "rate limited" } do
        assert_raises(WeatherApiError) do
          WeatherService.fetch_by_coords(3.0, 4.0, name: "Nowhere", country: "NW", units: "metric")
        end
      end
    end
  end

  test "returns a nil aqi when the air-quality fetch fails" do
    HttpJson.stub :get, ->(url, params = {}) {
      url == WeatherService::FORECAST_URL ? forecast_json : raise(WeatherApiError, "aqi down")
    } do
      result = WeatherService.fetch_by_coords(1.0, 2.0, name: "Test City", country: "TC", units: "metric")

      assert_nil result.aqi
    end
  end

  private

  def with_memory_cache
    original = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = original
  end

  def http_json_stub(forecast, air)
    ->(url, params = {}) { url == WeatherService::FORECAST_URL ? forecast : air }
  end

  def forecast_json
    {
      "current" => { "time" => "2026-07-04T12:00", "weather_code" => 0, "temperature_2m" => 18 },
      "hourly" => { "time" => ["2026-07-04T12:00"], "temperature_2m" => [18] },
      "daily" => { "time" => ["2026-07-04"], "temperature_2m_max" => [20], "temperature_2m_min" => [10] }
    }
  end

  def air_json
    {
      "current" => {
        "us_aqi" => 30, "pm2_5" => 5, "pm10" => 10, "ozone" => 20,
        "nitrogen_dioxide" => 1, "sulphur_dioxide" => 1, "carbon_monoxide" => 100,
        "alder_pollen" => nil, "birch_pollen" => nil, "grass_pollen" => nil,
        "mugwort_pollen" => nil, "olive_pollen" => nil, "ragweed_pollen" => nil
      }
    }
  end
end

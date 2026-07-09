require "test_helper"
require "minitest/mock"

class WeatherControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    WeatherService.stub :fetch_by_city, fake_weather do
      ClimateAverageService.stub :fetch, fake_climate_average do
        get root_url
        assert_response :success
      end
    end
  end

  test "should get each metric detail page" do
    WeatherService.stub :fetch_by_city, fake_weather do
      ClimateAverageService.stub :fetch, fake_climate_average do
        get root_url # establishes the atmos_lat/lon cookies show relies on
      end
      %w[uv sunset wind feels-like humidity visibility pressure air-quality precipitation moon pollen averages].each do |metric|
        WeatherService.stub :fetch_by_coords, fake_weather do
          ClimateAverageService.stub :fetch, fake_climate_average do
            ClimateAverageService.stub :fetch_annual, fake_annual_climate do
              get weather_metric_url(metric)
              assert_response :success, "expected #{metric} to render"
            end
          end
        end
      end
    end
  end

  test "can save and remove a location" do
    WeatherService.stub :fetch_by_city, fake_weather do
      WeatherService.stub :fetch_by_coords, fake_weather do
        ClimateAverageService.stub :fetch, fake_climate_average do
          get root_url
          assert_no_match(/Saved/, @response.body)

          post weather_locations_url, params: { name: "Cape Town", country: "ZA", lat: -33.9, lon: 18.4 }
          assert_redirected_to root_url
          follow_redirect!
          assert_match(/Saved/, @response.body)
          assert_match(/MY LOCATIONS/, @response.body)

          delete "/weather/locations", params: { name: "Cape Town", lat: -33.9, lon: 18.4 }
          assert_redirected_to root_url
          follow_redirect!
          assert_no_match(/MY LOCATIONS/, @response.body)
        end
      end
    end
  end

  test "renders with a malformed/oversized saved-locations cookie" do
    valid_entries = (1..12).map { |i| { "name" => "City#{i}", "country" => "ZA", "lat" => i.to_f, "lon" => i.to_f } }
    oversized = [1, "not a hash", nil, true] + valid_entries
    fetched = []

    WeatherService.stub :fetch_by_city, fake_weather do
      WeatherService.stub :fetch_by_coords, ->(lat, lon, **) { fetched << [lat, lon]; fake_weather } do
        ClimateAverageService.stub :fetch, fake_climate_average do
          cookies[:atmos_locations] = oversized.to_json
          get root_url
          assert_response :success
        end
      end
    end

    assert_operator fetched.size, :<=, WeatherController::MAX_SAVED_LOCATIONS
  end

  private

  def fake_climate_average
    ClimateAverageService::Result.new(avg_high: 22.0, avg_low: 12.0, years: 10)
  end

  def fake_annual_climate
    (1..12).map { |m| { month: m, avg_high: 20.0 + m, avg_low: 10.0 + m } }
  end

  def fake_weather
    WeatherService::Result.new(
      name: "Cape Town", country: "ZA", latitude: -33.9, longitude: 18.4, units: "metric",
      condition: WeatherCode.decode(0),
      current: {
        "time" => "2026-07-04T12:00", "temperature_2m" => 18, "apparent_temperature" => 17,
        "relative_humidity_2m" => 60, "dew_point_2m" => 10, "wind_speed_10m" => 10,
        "wind_gusts_10m" => 15, "wind_direction_10m" => 180, "pressure_msl" => 1015,
        "visibility" => 20_000, "uv_index" => 4
      },
      hourly: {
        "time" => ["2026-07-04T12:00"], "weather_code" => [0],
        "temperature_2m" => [18], "precipitation_probability" => [0]
      },
      daily: {
        "time" => ["2026-07-04"], "weather_code" => [0],
        "temperature_2m_max" => [20], "temperature_2m_min" => [10],
        "sunrise" => ["2026-07-04T07:00"], "sunset" => ["2026-07-04T18:00"],
        "uv_index_max" => [5], "precipitation_sum" => [0], "precipitation_probability_max" => [0]
      },
      aqi: 30,
      pollen: { "alder_pollen" => nil, "birch_pollen" => nil, "grass_pollen" => nil,
                "mugwort_pollen" => nil, "olive_pollen" => nil, "ragweed_pollen" => nil },
      moon: MoonService.calculate(Date.new(2026, 7, 4))
    )
  end
end

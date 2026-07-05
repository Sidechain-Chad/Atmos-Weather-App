require "test_helper"
require "minitest/mock"

class WeatherControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    WeatherService.stub :fetch_by_city, fake_weather do
      get root_url
      assert_response :success
    end
  end

  test "should get each metric detail page" do
    WeatherService.stub :fetch_by_city, fake_weather do
      get root_url # establishes the atmos_lat/lon cookies show relies on
      %w[uv sunset wind feels-like humidity visibility pressure air-quality precipitation moon pollen].each do |metric|
        WeatherService.stub :fetch_by_coords, fake_weather do
          get weather_metric_url(metric)
          assert_response :success, "expected #{metric} to render"
        end
      end
    end
  end

  test "can save and remove a location" do
    WeatherService.stub :fetch_by_city, fake_weather do
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

  private

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

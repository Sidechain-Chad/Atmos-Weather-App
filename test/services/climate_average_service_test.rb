require "test_helper"
require "minitest/mock"

class ClimateAverageServiceTest < ActiveSupport::TestCase
  test "averages correctly over stubbed years" do
    date = Date.new(2020, 6, 15)
    years = ((date.year - ClimateAverageService::YEARS_BACK)...date.year).to_a

    HttpJson.stub :get, ->(url, params = {}) { archive_json_for(Date.parse(params[:start_date]).year) } do
      result = ClimateAverageService.fetch(1.0, 2.0, date, units: "metric")

      expected_high = years.map { |y| 20 + (y % 10) }.sum / years.size.to_f
      expected_low = years.map { |y| 10 + (y % 10) }.sum / years.size.to_f

      assert_equal years.size, result.years
      assert_in_delta expected_high.round(1), result.avg_high, 0.05
      assert_in_delta expected_low.round(1), result.avg_low, 0.05
    end
  end

  test "retries a failing year once and skips it if the retry also fails" do
    date = Date.new(2020, 6, 15)
    years = ((date.year - ClimateAverageService::YEARS_BACK)...date.year).to_a
    failing_year = years.first
    call_counts = Hash.new(0)

    HttpJson.stub :get, ->(url, params = {}) {
      year = Date.parse(params[:start_date]).year
      call_counts[year] += 1
      raise WeatherApiError, "down" if year == failing_year

      archive_json_for(year)
    } do
      result = ClimateAverageService.fetch(3.0, 4.0, date, units: "metric")

      assert_equal years.size - 1, result.years
      assert_equal 2, call_counts[failing_year]
    end
  end

  test "returns nil when every year fails" do
    HttpJson.stub :get, ->(*) { raise WeatherApiError, "down" } do
      result = ClimateAverageService.fetch(5.0, 6.0, Date.new(2020, 6, 15), units: "metric")

      assert_nil result
    end
  end

  private

  def archive_json_for(year)
    { "daily" => { "temperature_2m_max" => [20 + (year % 10)], "temperature_2m_min" => [10 + (year % 10)] } }
  end
end

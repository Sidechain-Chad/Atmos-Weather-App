require "test_helper"

class MoonServiceTest < ActiveSupport::TestCase
  test "a known new moon date maps to New Moon" do
    date = Date.new(2000, 1, 6)
    result = MoonService.calculate(date)

    assert_equal "New Moon", result.phase
    assert_operator result.next_full_moon, :>, date
    assert_operator result.next_new_moon, :>, date
  end

  test "a known full moon date maps to Full Moon" do
    date = Date.new(2000, 1, 21)
    result = MoonService.calculate(date)

    assert_equal "Full Moon", result.phase
    assert_operator result.next_full_moon, :>, date
    assert_operator result.next_new_moon, :>, date
  end

  test "illumination is always between 0 and 100" do
    [Date.new(2000, 1, 6), Date.new(2000, 1, 21), Date.new(2026, 7, 4)].each do |date|
      result = MoonService.calculate(date)

      assert_includes 0..100, result.illumination
    end
  end
end

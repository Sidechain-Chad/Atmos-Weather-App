# Pure-Ruby moon phase + illumination, no API call. Based on the days elapsed
# since a known new moon and the mean synodic month length — accurate to
# within roughly an hour, which is plenty for a phase name and illumination %.
#
# Deliberately does NOT compute moonrise/moonset: real rise/set times need the
# moon's topocentric position (right ascension/declination) for the observer's
# lat/lon, which this simple age-based model can't produce accurately. Rather
# than show plausible-looking but wrong times, that field is left nil.
module MoonService
  KNOWN_NEW_MOON = Time.utc(2000, 1, 6, 18, 14).freeze
  SYNODIC_MONTH = 29.530588853 # average days between new moons

  PHASE_NAMES = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
  ].freeze

  Result = Struct.new(:phase, :illumination, :age_days, :waxing, :next_full_moon, :next_new_moon, keyword_init: true)

  def self.calculate(date)
    days_since = (date.to_time.utc - KNOWN_NEW_MOON) / 86_400.0
    fraction = (days_since % SYNODIC_MONTH) / SYNODIC_MONTH
    age_days = fraction * SYNODIC_MONTH

    Result.new(
      phase: PHASE_NAMES[((fraction * 8) + 0.5).floor % 8],
      illumination: (((1 - Math.cos(2 * Math::PI * fraction)) / 2) * 100).round,
      age_days: age_days.round(1),
      waxing: fraction < 0.5,
      next_full_moon: (date + days_until(fraction, 0.5)).to_date,
      next_new_moon: (date + days_until(fraction, 1.0)).to_date
    )
  end

  def self.days_until(fraction, target_fraction)
    remaining = target_fraction - fraction
    remaining += 1 if remaining <= 0
    (remaining * SYNODIC_MONTH).round
  end
  private_class_method :days_until
end

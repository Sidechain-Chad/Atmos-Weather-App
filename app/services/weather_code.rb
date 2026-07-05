# Decodes Open-Meteo's WMO weather_code into a display label and an FX "kind"
# (the kind drives both the sky palette and the animated overlays in weather_controller.js).
module WeatherCode
  TABLE = {
    0 => ["Clear", "clear"], 1 => ["Mainly Clear", "clear"], 2 => ["Partly Cloudy", "partly"], 3 => ["Overcast", "cloud"],
    45 => ["Fog", "fog"], 48 => ["Rime Fog", "fog"],
    51 => ["Light Drizzle", "drizzle"], 53 => ["Drizzle", "drizzle"], 55 => ["Heavy Drizzle", "drizzle"],
    56 => ["Freezing Drizzle", "sleet"], 57 => ["Freezing Drizzle", "sleet"],
    61 => ["Light Rain", "rain"], 63 => ["Rain", "rain"], 65 => ["Heavy Rain", "rain"],
    66 => ["Freezing Rain", "sleet"], 67 => ["Freezing Rain", "sleet"],
    71 => ["Light Snow", "snow"], 73 => ["Snow", "snow"], 75 => ["Heavy Snow", "snow"], 77 => ["Snow Grains", "snow"],
    80 => ["Rain Showers", "rain"], 81 => ["Rain Showers", "rain"], 82 => ["Violent Showers", "rain"],
    85 => ["Snow Showers", "snow"], 86 => ["Snow Showers", "snow"],
    95 => ["Thunderstorm", "thunder"], 96 => ["Thunderstorm + Hail", "hail"], 99 => ["Thunderstorm + Hail", "hail"]
  }.freeze

  Decoded = Struct.new(:label, :kind, keyword_init: true)

  def self.decode(code)
    label, kind = TABLE[code] || ["—", "cloud"]
    Decoded.new(label: label, kind: kind)
  end
end

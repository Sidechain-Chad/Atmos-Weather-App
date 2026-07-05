class GeocodingService
  SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search"
  REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client"

  Place = Struct.new(:name, :country_code, :latitude, :longitude, keyword_init: true)

  class << self
    # Used to resolve the default/remembered city name into coordinates.
    def search(query, count: 1)
      return [] if query.blank?

      json = HttpJson.get(SEARCH_URL, name: query, count: count, language: "en", format: "json")
      (json["results"] || []).map do |r|
        Place.new(name: r["name"], country_code: r["country_code"], latitude: r["latitude"], longitude: r["longitude"])
      end
    end

    # Used to label a raw lat/lon pair (e.g. from browser geolocation) with a city name.
    def reverse(lat, lon)
      json = HttpJson.get(REVERSE_URL, latitude: lat, longitude: lon, localityLanguage: "en")
      name = json["city"].presence || json["locality"].presence || "Current Location"
      [name, json["countryCode"]]
    rescue WeatherApiError
      ["Current Location", nil]
    end
  end
end

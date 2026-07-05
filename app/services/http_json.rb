require "net/http"
require "json"

# Tiny shared GET-and-parse-JSON client for the Open-Meteo / BigDataCloud APIs.
module HttpJson
  module_function

  def get(url, params = {})
    uri = URI(url)
    uri.query = URI.encode_www_form(params)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                open_timeout: 5, read_timeout: 5) { |http| http.get(uri) }
    raise WeatherApiError, "#{uri.host} responded with #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue SocketError, Timeout::Error, JSON::ParserError => e
    raise WeatherApiError, e.message
  end
end

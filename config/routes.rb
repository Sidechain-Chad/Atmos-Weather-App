Rails.application.routes.draw do
  root "weather#index"

  get "weather/:metric", to: "weather#show", as: :weather_metric,
      constraints: { metric: /uv|sunset|wind|feels-like|humidity|visibility|pressure|air-quality|precipitation|moon|pollen|averages/ }

  post "weather/locations", to: "weather#save_location", as: :weather_locations
  delete "weather/locations", to: "weather#remove_location"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end

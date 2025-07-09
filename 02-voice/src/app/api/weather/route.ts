import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { location } = await req.json();
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  let lat, lon, city, country;

  if (/^\d{5,6}$/.test(location.trim())) {
    let pincode = location.trim();
    let countryCode = "IN";
    if (pincode.includes(",")) {
      [pincode, countryCode] = pincode.split(",").map((s: string) => s.trim());
    }
    if (countryCode === "IN" && pincode.length !== 6) {
      return NextResponse.json({ error: "Indian pincodes must be 6 digits." }, { status: 400 });
    }
    const geoUrl = `https://api.openweathermap.org/geo/1.0/zip?zip=${pincode},${countryCode}&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData.lat || !geoData.lon) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    lat = geoData.lat;
    lon = geoData.lon;
    city = geoData.name;
    country = geoData.country;
  } else {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData[0]) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    lat = geoData[0].lat;
    lon = geoData[0].lon;
    city = geoData[0].name;
    country = geoData[0].country;
  }

  // Use /weather endpoint for current weather
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return NextResponse.json({ error: "Weather fetch failed" }, { status: 500 });
  const data = await response.json();

  if (!data.weather || !data.main) return NextResponse.json({ error: "No weather data" }, { status: 404 });
  const time = new Date().toLocaleString();
  const temp = data.main.temp;
  const desc = data.weather[0].description;
  const humidity = data.main.humidity;
  const wind = data.wind.speed;

  return NextResponse.json({
    forecast: `Current weather for ${city}, ${country} at ${time}:
- ${desc}
- Temperature: ${temp}°C
- Humidity: ${humidity}%
- Wind speed: ${wind} m/s`
  });
}

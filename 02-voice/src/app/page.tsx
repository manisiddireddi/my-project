"use client";

import { useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
  tool,
} from "@openai/agents/realtime";
import { getSessionToken } from "./server/token";
import z from "zod";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { location } = await req.json();
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  let lat, lon, city, country;

  if (/^\d{5,6}$/.test(location.trim())) {
    // Pincode (India)
    const geoUrl = `https://api.openweathermap.org/geo/1.0/zip?zip=${location.trim()},IN&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData.lat || !geoData.lon) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    lat = geoData.lat;
    lon = geoData.lon;
    city = geoData.name;
    country = geoData.country;
  } else {
    // City name
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData[0]) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    lat = geoData[0].lat;
    lon = geoData[0].lon;
    city = geoData[0].name;
    country = geoData[0].country;
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return NextResponse.json({ error: "Weather fetch failed" }, { status: 500 });
  const data = await response.json();

  if (!data.list || data.list.length === 0) return NextResponse.json({ error: "No forecast data" }, { status: 404 });
  const next = data.list[0];
  const time = next.dt_txt;
  const temp = next.main.temp;
  const desc = next.weather[0].description;
  const humidity = next.main.humidity;
  const wind = next.wind.speed;

  return NextResponse.json({
    forecast: `Weather forecast for ${city}, ${country} at ${time}:
- ${desc}
- Temperature: ${temp}°C
- Humidity: ${humidity}%
- Wind speed: ${wind} m/s`
  });
}

const fetchWeather = async (location: string) => {
  const res = await fetch("/api/weather", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  });
  const data = await res.json();
  return data.forecast || data.error || "No response.";
};

const getWeather = tool({
  name: "getWeather",
  description: "Get the weather in a given location or pincode",
  parameters: z.object({
    location: z.string(),
  }),
  execute: async ({ location }) => {
    // Call your server API route
    return await fetchWeather(location);
  },
});

const weatherAgent = new RealtimeAgent({
  name: "Weather Agent",
  instructions: "Talk with a New York accent",
  handoffDescription: "This agent is an expert in weather",
  tools: [getWeather],
});

const agent = new RealtimeAgent({
  name: "Voice Agent",
  instructions:
    "You are a voice agent that can answer questions and help with tasks.",
  handoffs: [weatherAgent],
});

export default function Home() {
  const session = useRef<RealtimeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<RealtimeItem[]>([]);

  async function onConnect() {
    if (connected) {
      setConnected(false);
      await session.current?.close();
    } else {
      const token = await getSessionToken();
      session.current = new RealtimeSession(agent, {
        model: "gpt-4o-realtime-preview-2025-06-03",
      });
      session.current.on("transport_event", (event) => {
        console.log(event);
      });
      session.current.on("history_updated", (history) => {
        setHistory(history);
      });
      session.current.on(
        "tool_approval_requested",
        async (context, agent, approvalRequest) => {
          const response = prompt("Approve or deny the tool call?");
          session.current?.approve(approvalRequest.approvalItem);
        }
      );
      await session.current.connect({
        apiKey: token,
      });
      setConnected(true);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Voice Agent Demo</h1>
      <button
        onClick={onConnect}
        className="bg-black text-white p-2 rounded-md hover:bg-gray-800 cursor-pointer"
      >
        {connected ? "Disconnect" : "Connect"}
      </button>
      <ul>
        {history
          .filter((item) => item.type === "message")
          .map((item) => (
            <li key={item.itemId}>
              {item.role}: {JSON.stringify(item.content)}
            </li>
          ))}
      </ul>
    </div>
  );
}

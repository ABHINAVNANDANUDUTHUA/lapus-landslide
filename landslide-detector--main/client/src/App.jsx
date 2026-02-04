import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { apiConfig } from './config';
import apiClient from './apiClient';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

function MapClickHandler({ setMarker, predictRisk }) {
    useMapEvents({
        click(e) {
            setMarker(e.latlng);
            predictRisk(e.latlng);
        },
    });
    return null;
}

function App() {
    const [marker, setMarker] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [simMode, setSimMode] = useState(false);
    const [rainValue, setRainValue] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [depth, setDepth] = useState(2.5); // failure depth in meters
    const [cooldownRemaining, setCooldownRemaining] = useState(0); // 2-second cooldown timer

    const getFrictionDisplay = (res) => {
        if (!res || !res.prediction) return '—';
        // Prefer top-level friction_angle, fall back to details
        const val = res.prediction.friction_angle ?? res.prediction.details?.friction_angle ?? null;
        return val !== null && val !== undefined ? `${Number(val).toFixed(1)}°` : '—';
    };

    const getRainDisplay = (res) => {
        if (!res || !res.input) return '—';
        const d = res.input;
        const val = d.rain_current ?? null;
        return val !== null && val !== undefined ? `${parseFloat(val).toFixed(1)} mm` : '—';
    };

    // Cooldown timer effect - decrements every second
    useEffect(() => {
        if (cooldownRemaining > 0) {
            const timer = setInterval(() => {
                setCooldownRemaining(prev => prev - 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [cooldownRemaining]);

    // Re-run when rain slider moves in sim mode (only if cooldown is not active)
    useEffect(() => {
        if (marker && simMode && cooldownRemaining === 0) {
            const timer = setTimeout(() => {
                predictRisk(marker, rainValue);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [rainValue, simMode]);

    // Re-run when depth changes (if there's already a selected location and cooldown is not active)
    useEffect(() => {
        if (marker && cooldownRemaining === 0) {
            const timer = setTimeout(() => {
                predictRisk(marker);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [depth]);

    const predictRisk = async (latlng, manualRainOverride = null) => {
        // Check if cooldown is active
        if (cooldownRemaining > 0) {
            alert(`Please wait ${cooldownRemaining} seconds before making another request.`);
            return;
        }

        setLoading(true);
        try {
            const rainToSend = (simMode && manualRainOverride !== null) ? manualRainOverride : (simMode ? rainValue : null);

            const response = await apiClient.post('/predict', {
                lat: latlng.lat,
                lng: latlng.lng,
                manualRain: rainToSend,
                depth: Number(depth) || 2.5
            });
            setResult(response.data);
            // Start 2-second cooldown
            setCooldownRemaining(2);
        } catch (error) {
            console.error('Prediction error:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Server Error';
            alert(`Server Error: ${errorMsg}\n\nBackend: ${apiConfig.baseURL}`);
        } finally {
            setLoading(false);
        }
    };

    const handleLocationSearch = async () => {
        const q = searchQuery;
        if (!q.trim()) {
            alert("Please enter a location to search.");
            return;
        }
        if (cooldownRemaining > 0) {
            alert(`Please wait ${cooldownRemaining} seconds before making another request.`);
            return;
        }
        try {
            setLoading(true);
            const res = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q,
                    format: 'json',
                    limit: 1
                },
                headers: {
                    'Accept-Language': 'en'
                }
            });

            if (!res.data || res.data.length === 0) {
                alert("Location not found. Try a more specific name.");
                return;
            }

            const loc = res.data[0];
            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lon);

            const latlng = { lat, lng };
            setMarker(latlng);
            predictRisk(latlng);
        } catch (err) {
            console.error(err);
            alert("Location search failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported in this browser.");
            return;
        }
        if (cooldownRemaining > 0) {
            alert(`Please wait ${cooldownRemaining} seconds before making another request.`);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const latlng = { lat, lng };
                setMarker(latlng);
                predictRisk(latlng);
            },
            (err) => {
                console.error(err);
                alert("Failed to get location. Make sure location permission is allowed.");
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    };

    const getEnvironmentIcon = (env) => {
        const icons = {
            "Water Body": "🌊",
            "River/Stream": "🏞️",
            "Polar/Glacier": "❄️",
            "Snow-Covered": "⛷️",
            "Desert": "🏜️",
            "Rock Outcrop": "⛰️",
            "Land Surface": "🏔️"
        };
        return icons[env] || "📍";
    };

    const safetyNum = result?.prediction?.FoS ?? null;
    const safetyStr = safetyNum != null ? safetyNum.toFixed(2) : '—';
    const envLabel = result?.location_type === 'water' ? 'Water Body' : result?.location_type === 'ice' ? 'Ice/Glacier' : result?.climate?.zone;
    const envIcon = result?.location_type === 'water' ? '🌊' : result?.location_type === 'ice' ? '❄️' : getEnvironmentIcon(envLabel);
    const placeInfo = result?.location_info?.place || null;

    return (
        <div className="relative h-screen w-screen bg-slate-900 font-sans text-slate-800">
            
            <div className="absolute top-4 left-4 z-[1000] w-80 md:w-96 flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                
                <div className="bg-white/95 backdrop-blur-md p-5 rounded-2xl shadow-xl border-l-8 border-cyan-500">
                    <h1 className="text-2xl font-extrabold text-slate-800">LAP <span className="text-cyan-500">SUS</span></h1>
                    <p className="text-xs text-slate-500 mt-1">Real-time Landslide Analysis System</p>
                    {cooldownRemaining > 0 && (
                        <div className="mt-3 p-2 bg-yellow-100 border border-yellow-400 rounded-lg">
                            <p className="text-xs font-bold text-yellow-800">⏱️ Cooldown: {cooldownRemaining}s remaining</p>
                            <div className="w-full bg-yellow-200 rounded-full h-1.5 mt-1">
                                <div 
                                    className="bg-yellow-500 h-1.5 rounded-full transition-all duration-1000"
                                    style={{ width: `${(cooldownRemaining / 2) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Location and depth controls */}
                <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-lg space-y-3">
                    <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase text-slate-500">Location</p>

                        {/* Search bar */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search place (eg. Munnar, Kerala)"
                                className="flex-1 px-2 py-1.5 text-xs border rounded-lg border-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                                disabled={cooldownRemaining > 0}
                            />
                            <button
                                onClick={handleLocationSearch}
                                disabled={cooldownRemaining > 0}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Go
                            </button>
                        </div>

                        {/* Auto location button */}
                        <button
                            onClick={handleUseMyLocation}
                            disabled={cooldownRemaining > 0}
                            className="w-full mt-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500 text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>Use My Current Location</span>
                        </button>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold uppercase text-slate-500">Failure Depth</span>
                            <span className="text-[11px] text-slate-600">{depth} m</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="0.5"
                                max="15"
                                step="0.5"
                                value={depth}
                                onChange={(e) => setDepth(Number(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                                disabled={cooldownRemaining > 0}
                            />
                            <input
                                type="number"
                                min="0.5"
                                max="15"
                                step="0.5"
                                value={depth}
                                onChange={(e) => setDepth(Number(e.target.value) || 2.5)}
                                className="w-16 px-2 py-1 text-xs border rounded-lg border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                                disabled={cooldownRemaining > 0}
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Approximate depth of potential failure plane.</p>
                    </div>
                </div>

                <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold uppercase text-slate-500">Simulation Mode</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={simMode} 
                                onChange={(e) => setSimMode(e.target.checked)}
                                disabled={cooldownRemaining > 0}
                                className="sr-only peer" 
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                    </div>

                    {simMode ? (
                        <div>
                            <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                <span>Rainfall Amount</span>
                                <span className="text-cyan-600">{rainValue} mm</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="200" 
                                step="5"
                                value={rainValue} 
                                onChange={(e) => setRainValue(Number(e.target.value))}
                                disabled={cooldownRemaining > 0}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                            />
                            <p className="text-[10px] text-slate-400 mt-1 text-center">Test extreme weather scenarios</p>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic">Using Live Weather Data</p>
                    )}
                </div>

                {loading && (
                    <div className="bg-cyan-600 text-white p-4 rounded-xl shadow-lg animate-pulse flex items-center gap-3">
                        <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span className="font-bold text-sm">Analyzing Terrain...</span>
                    </div>
                )}

                {result && (
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden transition-all duration-500">
                        
                        <div className={`p-5 text-white flex justify-between items-center ${
                            result.prediction.risk_level === 'High' ? 'bg-red-600' :
                            result.prediction.risk_level === 'Medium' ? 'bg-orange-500' : 'bg-green-600'
                        }`}>
                            <div>
                                <p className="text-xs uppercase font-bold opacity-80">Risk Level</p>
                                <h2 className="text-3xl font-bold">{result.prediction.risk_level}</h2>
                                <p className="text-xs opacity-90 mt-1">
                                    {envIcon} {envLabel} {placeInfo ? `• ${placeInfo}` : ''}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs opacity-80">Safety Factor</p>
                                <p className="text-2xl font-mono">{safetyStr}</p>
                                <p className="text-[10px] opacity-70 mt-1">
                                    {safetyNum == null ? 'N/A' : (safetyNum < 1 ? 'FAILURE' : safetyNum < 1.5 ? 'UNSTABLE' : 'STABLE')}
                                </p>
                            </div>
                        </div>

                        <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
                            
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-lg border-l-4 border-cyan-500">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                                    <span>🧠</span> Analysis Summary
                                </p>
                                <p className="text-sm font-medium text-slate-700 leading-relaxed">
                                    FoS: {result.prediction.FoS.toFixed(2)} | 
                                    Shear Strength: {result.prediction.shear_strength} kPa | 
                                    Saturation: {result.prediction.saturation_percent}%
                                </p>
                            </div>

                            {result.prediction.saturation_percent !== undefined && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <p className="text-[10px] text-blue-600 uppercase font-bold mb-1">💧 Soil Saturation</p>
                                    <p className="text-xs text-blue-800">
                                        {result.prediction.saturation_percent}% saturated
                                    </p>
                                </div>
                            )}

                            {result.input.clay !== undefined && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                    <p className="text-[10px] text-amber-700 uppercase font-bold mb-2">🌍 Soil Composition</p>
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-amber-700">Clay</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 bg-amber-200 rounded-full h-2">
                                                    <div 
                                                        className="bg-amber-700 h-2 rounded-full" 
                                                        style={{ width: `${result.input.clay}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-bold text-amber-900 w-8">{result.input.clay.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-amber-700">Sand</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 bg-yellow-200 rounded-full h-2">
                                                    <div 
                                                        className="bg-yellow-600 h-2 rounded-full" 
                                                        style={{ width: `${result.input.sand}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-bold text-yellow-900 w-8">{result.input.sand.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-amber-700">Silt</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 bg-orange-200 rounded-full h-2">
                                                    <div 
                                                        className="bg-orange-600 h-2 rounded-full" 
                                                        style={{ width: `${result.input.silt}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-bold text-orange-900 w-8">{result.input.silt.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                    {result.isSimulated ? "⚗️ Simulated Weather" : "🌤️ Live Weather"}
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <StatBox label="Temp" value={`${result.input.temperature}°C`} />
                                    <StatBox label="Humidity" value={`${result.input.humidity}%`} />
                                    <div className={`p-2 rounded border ${result.input.rain_current > 0 ? 'bg-cyan-50 border-cyan-300' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className={`text-[10px] uppercase tracking-wide font-bold ${result.input.rain_current > 0 ? 'text-cyan-600' : 'text-slate-400'}`}>Rainfall</p>
                                        <p className={`text-lg font-bold ${result.input.rain_current > 0 ? 'text-cyan-700' : 'text-slate-700'}`}>{getRainDisplay(result)}</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                    ⛰️ Terrain Analysis
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <StatBox 
                                        label="Slope Angle" 
                                        value={`${result.input.slope}°`} 
                                        warning={result.input.slope > 25}
                                    />
                                    <StatBox label="Elevation" value={`${Math.round(result.input.elevation)}m`} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                    🔬 Soil Physics
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <StatBox label="Cohesion (c)" value={`${(result.prediction.details?.cohesion ?? result.prediction.details?.cohesion ?? '—')} kPa`} />
                                    <StatBox label="Friction (φ)" value={getFrictionDisplay(result)} />
                                    <StatBox label="Shear Stress" value={`${result.prediction.shear_stress} kPa`} />
                                    <StatBox 
                                        label="Saturation" 
                                        value={`${result.prediction.saturation_percent}%`}
                                        warning={result.prediction.saturation_percent > 50}
                                    />
                                    <StatBox 
                                        label="Safety Factor" 
                                        value={`${safetyStr}`}
                                        highlight={safetyNum != null && safetyNum > 1.5}
                                        warning={safetyNum != null && safetyNum < 1}
                                    />
                                </div>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <p className="text-[10px] text-blue-600 uppercase font-bold mb-1">📍 Location</p>
                                <p className="text-xs text-blue-800 font-mono">
                                    {result.location.lat.toFixed(4)}°N, {result.location.lng.toFixed(4)}°E
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <MapContainer center={[10.8505, 76.2711]} zoom={8} scrollWheelZoom={true} className="h-full w-full z-0">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler setMarker={setMarker} predictRisk={predictRisk} />
                {marker && <Marker position={marker} />}
            </MapContainer>
        </div>
    );
}

function StatBox({ label, value, warning = false, highlight = false }) {
    return (
        <div className={`p-2 rounded border ${
            warning ? 'bg-red-50 border-red-300' : 
            highlight ? 'bg-green-50 border-green-300' :
            'bg-slate-50 border-slate-200'
        }`}>
            <p className={`text-[10px] uppercase tracking-wide font-bold ${
                warning ? 'text-red-600' : 
                highlight ? 'text-green-600' :
                'text-slate-400'
            }`}>{label}</p>
            <p className={`text-lg font-bold ${
                warning ? 'text-red-700' : 
                highlight ? 'text-green-700' :
                'text-slate-700'
            }`}>{value}</p>
        </div>
    );
}

export default App;

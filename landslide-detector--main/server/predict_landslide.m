function predict_landslide(jsonInput)
    % 1. Parse Data from Node.js
    try
        data = jsondecode(jsonInput);
    catch
        disp('{"error": "Invalid JSON input"}');
        return;
    end

    % 2. Extract Variables
    rain = data.rain;
    slope = data.slope; % in degrees
    clay = data.clay;
    sand = data.sand;
    bulk_density = data.bulk_density;

    % 3. Geotechnical Estimations (Based on Soil Type)
    c = 15;   % Default Cohesion (kPa)
    phi = 28; % Default Friction Angle (degrees)

    if clay > 40
        c = 25; phi = 20; % Clayey
    elseif sand > 60
        c = 5; phi = 32;  % Sandy
    end

    % 4. Physics Calculation (Mohr-Coulomb Failure Criterion)
    gamma = (bulk_density / 100) * 9.81; % Unit Weight (kN/m3)
    z = 2.0; % Depth of slip surface (m)
    beta = deg2rad(slope); % Slope angle in radians

    % Forces
    % Normal Stress (Holding soil down)
    sigma = gamma * z * (cos(beta)^2);
    
    % Driving Stress (Pulling soil down slope)
    tau_driving = gamma * z * sin(beta) * cos(beta);

    % Pore Water Pressure (Rain Effect)
    % If heavy rain, water reduces friction
    u = 0; 
    if rain > 50
        u = sigma * 0.4; % High saturation
    elseif rain > 20
        u = sigma * 0.2; % Moderate saturation
    end
    
    sigma_effective = sigma - u;

    % Resisting Strength
    tanPhi = tan(deg2rad(phi));
    tau_resisting = c + (sigma_effective * tanPhi);

    % Factor of Safety (FoS)
    FoS = tau_resisting / (tau_driving + 0.001);

    % 5. Determine Risk Level
    risk = "Low";
    reason = "Stable Slope";

    if slope < 5
        FoS = 10.0;
        risk = "Low";
        reason = "Flat Terrain (Safe)";
    elseif FoS < 1.0
        risk = "High";
        reason = "Slope Failure Imminent (FoS < 1.0)";
    elseif FoS < 1.2
        risk = "High";
        reason = "Critical Instability";
    elseif FoS < 1.5
        risk = "Medium";
        reason = "Moderate Risk (Check Rainfall)";
    end

    % 6. Output JSON
    output.level = risk;
    output.reason = reason;
    output.probability = min(1/FoS, 0.99);
    output.details.FoS = FoS;
    output.details.shear_strength = tau_resisting;
    output.details.shear_stress = tau_driving;

    disp(jsonencode(output));
end
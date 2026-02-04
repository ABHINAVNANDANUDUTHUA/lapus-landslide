// API Configuration
const API_URL = (import.meta.env.VITE_API_URL || 'https://lapus-landslide.vercel.app').replace(/\/$/, '');

export const apiConfig = {
    baseURL: API_URL,
    endpoints: {
        predict: `${API_URL}/predict`,
        health: `${API_URL}/health`,
        corsTest: `${API_URL}/cors-test`
    }
};

export default apiConfig;

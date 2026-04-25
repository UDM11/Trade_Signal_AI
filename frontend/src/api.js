import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export const api = {
    uploadCSV: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return axios.post(`${API_BASE}/upload-csv`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    predict: async (symbol, newsText = "") => {
        const formData = new FormData();
        formData.append('symbol', symbol);
        formData.append('news_text', newsText);
        return axios.post(`${API_BASE}/predict`, formData);
    },
    getHistory: async () => {
        return axios.get(`${API_BASE}/predictions`);
    },
    getPredictions: async () => {
        return axios.get(`${API_BASE}/predictions`);
    },
    runPredictions: async (symbols = null) => {
        return axios.post(`${API_BASE}/predictions/run`, symbols);
    },

    // ── NEPSE Live Market ───────────────────────────────────────────────────
    getNepseLive: async () => {
        return axios.get(`${API_BASE}/nepse/live`);
    },
    getNepseHistory: async () => {
        return axios.get(`${API_BASE}/nepse/history`);
    },
    getNepseChart: async (symbol) => {
        return axios.get(`${API_BASE}/nepse/chart/${encodeURIComponent(symbol)}`);
    },
    getNepseStatus: async () => {
        return axios.get(`${API_BASE}/nepse/status`);
    },
    getNepseQuote: async (symbol) => {
        return axios.get(`${API_BASE}/nepse/quote/${encodeURIComponent(symbol)}`);
    },
};

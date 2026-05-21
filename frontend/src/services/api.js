const API_BASE = 'http://localhost:8000/api';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const dashboardAPI = {
  getOverview: () => fetchJSON(`${API_BASE}/dashboard/overview`),
  getRiskDistribution: () => fetchJSON(`${API_BASE}/dashboard/risk-distribution`),
  getTrend: () => fetchJSON(`${API_BASE}/dashboard/trend`),
  getRiskByAgency: () => fetchJSON(`${API_BASE}/dashboard/risk-by-agency`),
};

export const sociosAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`${API_BASE}/socios?${query}`);
  },
  getById: (id) => fetchJSON(`${API_BASE}/socios/${id}`),
  getPayments: (id) => fetchJSON(`${API_BASE}/socios/${id}/payments`),
  getTransactions: (id) => fetchJSON(`${API_BASE}/socios/${id}/transactions`),
  getBalanceHistory: (id) => fetchJSON(`${API_BASE}/socios/${id}/balance-history`),
};

export const alertsAPI = {
  getAll: () => fetchJSON(`${API_BASE}/alerts`),
};

export const modelAPI = {
  getFeatureImportance: () => fetchJSON(`${API_BASE}/model/feature-importance`),
  getInfo: () => fetchJSON(`${API_BASE}/model/info`),
};

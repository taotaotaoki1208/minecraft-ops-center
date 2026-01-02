const axios = require("axios");

function pteroClient(token) {
  const baseURL = process.env.PTERO_URL;
  if (!baseURL) throw new Error("缺少 PTERO_URL");
  if (!token) throw new Error("缺少 Pterodactyl Client Key（此使用者尚未綁定）");

  return axios.create({
    baseURL: `${baseURL}/api/client`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function getServerResources(serverId, token) {
  const api = pteroClient(token);
  const res = await api.get(`/servers/${serverId}/resources`);
  return res.data;
}

async function sendCommand(serverId, command, token) {
  const api = pteroClient(token);
  const res = await api.post(`/servers/${serverId}/command`, { command });
  return res.data;
}

async function setPower(serverId, signal, token) {
  const api = pteroClient(token);
  const res = await api.post(`/servers/${serverId}/power`, { signal });
  return res.data;
}

// 用來測試 key 是否有效（call /account）
async function getAccount(token) {
  const api = pteroClient(token);
  const res = await api.get(`/account`);
  return res.data;
}

module.exports = { getServerResources, sendCommand, setPower, getAccount };

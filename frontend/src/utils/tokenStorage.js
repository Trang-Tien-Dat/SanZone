
export const TOKEN_KEY = "sanngay_token";
export const tokenStorage = window.sessionStorage;

export const getToken = () => tokenStorage.getItem(TOKEN_KEY);
export const setToken = (token) => tokenStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => tokenStorage.removeItem(TOKEN_KEY);
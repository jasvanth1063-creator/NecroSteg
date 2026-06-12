const SERVER_URL = 'https://necrosteg-server.onrender.com';

export async function getUser() {
  try {
    const res = await fetch(`${SERVER_URL}/auth/user`, {
      credentials: 'include',
      mode: 'cors'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function loginWithGoogle() {
  window.location.href = `${SERVER_URL}/auth/google`;
}

export function logoutUser() {
  window.location.href = `${SERVER_URL}/auth/logout`;
}

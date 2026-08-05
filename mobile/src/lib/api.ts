export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const isFormData = isFormDataBody(options.body);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const details = data?.details ? `\n${JSON.stringify(data.details)}` : '';
    throw new Error((data?.error || data?.message || `Request failed: ${response.status}`) + details);
  }

  return data as T;
}

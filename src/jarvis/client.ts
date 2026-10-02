import { getAuthToken } from "deepspace";
export async function authenticatedFetch(
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = await getAuthToken();
  return fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

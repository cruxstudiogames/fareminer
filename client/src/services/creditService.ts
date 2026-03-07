export async function getCredits(): Promise<number> {
  const response = await fetch('/api/credits/balance', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch credits');
  const data = (await response.json()) as { credits: number };
  return data.credits;
}

export async function purchaseCredits(): Promise<string> {
  const response = await fetch('/api/credits/purchase', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to create checkout session');
  const data = (await response.json()) as { url: string };
  return data.url;
}

export async function verifyPurchase(sessionId: string): Promise<number> {
  const response = await fetch('/api/credits/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw new Error('Failed to verify purchase');
  const data = (await response.json()) as { credits: number };
  return data.credits;
}

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

interface ProxyPayload {
  webhook_url: string;
  payload: Record<string, unknown>;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { webhook_url, payload } = (await req.json()) as ProxyPayload;

    if (!webhook_url || typeof webhook_url !== 'string') {
      return new Response(
        JSON.stringify({ status: 400, statusText: 'Bad Request', body: '', error: 'webhook_url es requerido' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const res = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text();

    return new Response(
      JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        body: bodyText,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ status: 0, statusText: 'Network Error', body: '', error: message }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

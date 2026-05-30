import type { N8nRefreshPayload } from '@/types/tfi.types';
import { supabase } from '@/lib/supabase';

const WEBHOOK_URL = import.meta.env.VITE_N8N_TFI_REFRESH_WEBHOOK_URL;

export class WebhookError extends Error {
  status?: number;
  responseBody?: string;

  constructor(message: string, status?: number, responseBody?: string) {
    super(message);
    this.name = 'WebhookError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export async function triggerTfiRefresh(payload: N8nRefreshPayload, webhookUrl?: string, expectedSyncRunId?: string): Promise<string> {
  const url = webhookUrl || WEBHOOK_URL;
  if (!url || url.trim() === '') {
    throw new WebhookError('URL del webhook no está configurada. Agregala en el archivo .env o pasala como parámetro.');
  }

  // Defensa crítica: validar que supabase está inicializado
  if (!supabase) {
    throw new WebhookError('Supabase client no está inicializado. Verificá la configuración de .env.');
  }
  if (!supabase.functions) {
    throw new WebhookError('Supabase functions no está disponible. Verificá la conexión a Supabase.');
  }
  if (typeof supabase.functions.invoke !== 'function') {
    throw new WebhookError('Supabase functions.invoke no está disponible. Verificá la conexión a Supabase.');
  }

  console.log('[N8N Webhook] URL:', url);
  console.log('[N8N Webhook] Payload:', JSON.stringify(payload, null, 2));
  if (expectedSyncRunId) {
    console.log('[N8N Webhook] Expected sync_run_id:', expectedSyncRunId);
  }

  try {
    // Llamar al webhook a través del proxy de Edge Function para evitar CORS
    const { data, error } = await supabase.functions.invoke('n8n-webhook-proxy', {
      body: { webhook_url: url, payload },
    });

    if (error) {
      throw new WebhookError(
        `Error en proxy: ${error.message}`,
        error.status,
        JSON.stringify(error)
      );
    }

    // Defensa: si data es undefined o null
    if (!data || typeof data !== 'object') {
      console.error('[N8N Webhook] Response data inválido:', data);
      throw new WebhookError(
        'Respuesta inválida del proxy de webhook: data es undefined o no es objeto',
        undefined,
        String(data)
      );
    }

    const proxyJson = data as {
      status: number;
      statusText: string;
      body: string;
      error?: string;
    };

    if (proxyJson.error) {
      throw new WebhookError(
        proxyJson.error,
        undefined,
        JSON.stringify(proxyJson)
      );
    }

    const { status, statusText, body: bodyText } = proxyJson;
    console.log('[N8N Webhook] HTTP Status:', status, statusText);

    let bodyJson: Record<string, unknown> | null = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      console.warn('[N8N Webhook] Response no es JSON válido:', bodyText);
    }

    if (status < 200 || status >= 300) {
      console.error('[N8N Webhook] Response body:', bodyText);
      throw new WebhookError(
        `Webhook respondió ${status}: ${statusText}`,
        status,
        bodyText
      );
    }

    console.log('[N8N Webhook] Éxito. Response body:', bodyText);

    // Extraer sync_run_id de la respuesta del webhook
    const rawSyncRunId = bodyJson?.sync_run_id;
    if (typeof rawSyncRunId === 'string' && rawSyncRunId.trim() !== '') {
      const syncRunId = rawSyncRunId.trim();

      // Validación defensiva: rechazar placeholders, mustache templates y formatos no UUID
      if (
        syncRunId.includes('{{') ||
        syncRunId.includes('}}') ||
        !isValidUUID(syncRunId)
      ) {
        console.error('[N8N Webhook] sync_run_id inválido recibido:', syncRunId);
        console.error('[N8N Webhook] Response completo:', bodyText);
        return '';
      }

      // CRITICAL: Sync run mismatch detection
      // If frontend sent an expected sync_run_id, N8N MUST return the same one
      if (expectedSyncRunId && syncRunId !== expectedSyncRunId) {
        console.error('[N8N Webhook] SYNC RUN MISMATCH!');
        console.error('[N8N Webhook] Expected:', expectedSyncRunId);
        console.error('[N8N Webhook] Received:', syncRunId);
        console.error('[N8N Webhook] Response completo:', bodyText);
        throw new WebhookError(
          'Sync run mismatch: N8N devolvió un sync_run_id diferente al enviado. El workflow no está usando el sync_run_id correcto.',
          status,
          bodyText
        );
      }

      console.log('[N8N Webhook] sync_run_id recibido:', syncRunId);
      return syncRunId;
    }

    // Si no viene sync_run_id, loguear advertencia pero no fallar
    console.warn('[N8N Webhook] No se recibió sync_run_id en la respuesta. Body:', bodyText);
    return '';
  } catch (err) {
    if (err instanceof WebhookError) {
      throw err;
    }

    // Defensa: si err no es un Error, convertirlo
    const fetchError = err instanceof Error ? err : new Error(String(err));
    console.error('[N8N Webhook] Error de red/CORS/fetch:', fetchError.message);
    console.error('[N8N Webhook] Error completo:', fetchError);

    // Diferenciar errores típicos de fetch
    if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
      throw new WebhookError(
        'No se pudo conectar con N8N. Revisá la red, CORS o si el servidor está caído.',
        undefined,
        fetchError.message
      );
    }

    throw new WebhookError(
      `Error inesperado al llamar al webhook: ${fetchError.message}`,
      undefined,
      fetchError.message
    );
  }
}
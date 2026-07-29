import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal HTTP contract exposed to FacilAbo API handlers by the Vercel Node
 * runtime. Keeping these structural types local avoids installing the complete
 * Vercel build toolchain solely for two erased TypeScript imports.
 */
export type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: any;
};

export type VercelResponse = ServerResponse & {
  send: (body: any) => VercelResponse;
  json: (jsonBody: any) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};

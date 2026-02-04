/**
 * API Configuration for Frontend
 * 
 * This module provides the correct API URL based on the execution context:
 * - Server-side (Next.js API routes in Docker): Uses INTERNAL_API_URL (gateway:8080)
 * - Client-side (Browser): Uses NEXT_PUBLIC_API_URL (localhost:8080)
 * - Local development: Falls back to localhost:8080
 */

/**
 * Get the API URL for server-side API calls (Next.js API routes)
 * This is used when the frontend container makes requests to the gateway
 */
export function getServerApiUrl(): string {
  // In Docker, use the internal service name
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }
  
  // Fallback for backwards compatibility
  if (process.env.NEXT_PUBLIC_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL;
  }
  
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Default for local development
  return 'http://localhost:8080';
}

/**
 * Get the WebSocket URL for client-side connections
 * This is used by the browser to connect to the gateway
 */
export function getClientWsUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('getClientWsUrl() can only be called on the client side');
  }
  
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
}

/**
 * Get the API URL for client-side HTTP requests
 * This is used by the browser to make HTTP requests to the gateway
 */
export function getClientApiUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('getClientApiUrl() can only be called on the client side');
  }
  
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
}

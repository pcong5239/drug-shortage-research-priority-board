import React, { useState, useEffect, useCallback, useRef } from 'react';
import { studionet } from '../services/chains';

export interface RpcHealthState {
  status: 'checking' | 'healthy' | 'degraded' | 'offline';
  latencyMs: number | null;
  error: string | null;
}

export const RpcLatencyMonitor: React.FC = () => {
  const [health, setHealth] = useState<RpcHealthState>({
    status: 'checking',
    latencyMs: null,
    error: null,
  });

  const isMountedRef = useRef(true);

  const checkRpcHealth = useCallback(async () => {
    if (!isMountedRef.current) return;
    setHealth((prev) => ({ ...prev, status: 'checking' }));

    const rpcUrl = studionet.rpcUrls.default.http[0];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const startTime = performance.now();

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'net_version',
          params: [],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const elapsedMs = Math.round(endTime - startTime);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'RPC responded with error');
      }

      if (isMountedRef.current) {
        setHealth({
          status: elapsedMs > 1000 ? 'degraded' : 'healthy',
          latencyMs: elapsedMs,
          error: null,
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (isMountedRef.current) {
        const errorMsg = err.name === 'AbortError' ? 'RPC Request Timed Out' : (err?.message || 'RPC Unreachable');
        setHealth({
          status: 'offline',
          latencyMs: null,
          error: errorMsg,
        });
      }
    }
  }, []);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const getStatusDotClass = () => {
    switch (health.status) {
      case 'healthy':
        return 'dot-healthy';
      case 'degraded':
        return 'dot-degraded';
      case 'offline':
        return 'dot-offline';
      case 'checking':
      default:
        return 'dot-checking';
    }
  };

  const getStatusLabel = () => {
    if (health.status === 'checking') return 'Check RPC';
    if (health.status === 'offline') return 'RPC Offline';
    if (health.latencyMs !== null) return `${health.latencyMs}ms`;
    return 'RPC Ready';
  };

  return (
    <div
      className="rpc-latency-monitor"
      data-testid="rpc-latency-monitor"
      role="status"
      aria-live="polite"
      title={
        health.error
          ? `Studionet RPC Error: ${health.error}`
          : `Studionet RPC Latency: ${health.latencyMs !== null ? `${health.latencyMs}ms` : 'Checking'}`
      }
    >
      <span
        className={`rpc-status-dot ${getStatusDotClass()}`}
        data-testid="rpc-status-indicator"
        aria-hidden="true"
      />
      <span className="rpc-latency-text" data-testid="rpc-latency-value">
        {getStatusLabel()}
      </span>
      <button
        type="button"
        className="btn-rpc-refresh"
        data-testid="rpc-refresh-btn"
        onClick={() => checkRpcHealth()}
        aria-label="Refresh RPC Latency"
        title="Check Studionet RPC Latency"
      >
        ↻
      </button>
    </div>
  );
};

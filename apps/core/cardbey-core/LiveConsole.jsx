import { useEffect, useState, useRef } from 'react';

/**
 * LiveConsole Component
 * 
 * Displays real-time console/log output from the backend via Server-Sent Events (SSE).
 * 
 * Uses EventSource (native SSE client) instead of XHR/fetch to properly handle
 * long-lived streaming connections without "connection interrupted" errors.
 * 
 * Features:
 * - Connects to /api/stream endpoint with API key authentication
 * - Automatically reconnects on connection loss
 * - Displays real-time log messages
 * - Cleans up connection on unmount
 * 
 * @param {Object} props
 * @param {string} [props.apiKey] - Optional API key override (defaults to localStorage.getItem("API_KEY"))
 * @param {string} [props.coreBaseUrl] - Optional core base URL (defaults to relative path /api)
 * @param {Function} [props.onMessage] - Optional callback for each message received
 * @param {Function} [props.onError] - Optional callback for connection errors
 */
export default function LiveConsole({ 
  apiKey: propApiKey,
  coreBaseUrl = '', // Use relative path by default
  onMessage,
  onError 
}) {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelayMs = 3000; // 3 seconds

  // Get API key from props or localStorage
  const getApiKey = () => {
    if (propApiKey) return propApiKey;
    try {
      return localStorage.getItem('API_KEY');
    } catch (err) {
      console.error('[LiveConsole] Failed to read API_KEY from localStorage:', err);
      return null;
    }
  };

  // Build SSE URL with API key
  const buildStreamUrl = () => {
    const apiKey = getApiKey() || 'supersecret123';
    
    // Use relative path if no baseUrl provided (recommended - works with any origin)
    if (!coreBaseUrl) {
      return `/api/stream?key=${encodeURIComponent(apiKey)}`;
    }
    
    // Use absolute URL if baseUrl is provided
    const baseUrl = coreBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/api/stream?key=${encodeURIComponent(apiKey)}`;
  };

  // Connect to SSE stream
  const connect = () => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
      } catch (err) {
        console.warn('[LiveConsole] Error closing existing connection:', err);
      }
      eventSourceRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      setConnectionStatus('error');
      setError('API_KEY not found in localStorage. Please log in first.');
      if (onError) {
        onError(new Error('API_KEY not found'));
      }
      return;
    }

    const url = buildStreamUrl();
    console.log('[LiveConsole] Connecting to SSE stream:', url);

    setConnectionStatus('connecting');
    setError(null);

    try {
      // Create EventSource connection
      // EventSource is the native browser API for Server-Sent Events
      // It handles reconnection automatically, but we'll manage it manually for better control
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Connection opened successfully
      eventSource.onopen = () => {
        console.log('[LiveConsole] SSE connection opened');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      };

      // Handle messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Add timestamp if not present
          const message = {
            ...data,
            timestamp: data.timestamp || Date.now(),
            id: data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          };

          setMessages((prev) => {
            // Keep last 1000 messages to prevent memory issues
            const newMessages = [...prev, message].slice(-1000);
            return newMessages;
          });

          // Call optional callback
          if (onMessage) {
            onMessage(message);
          }
        } catch (err) {
          console.error('[LiveConsole] Failed to parse message:', err, event.data);
          // Still add as raw message
          setMessages((prev) => {
            const message = {
              data: event.data,
              timestamp: Date.now(),
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              error: 'Failed to parse JSON',
            };
            return [...prev, message].slice(-1000);
          });
        }
      };

      // Handle custom events (e.g., 'screen.pair_session.created', 'screens_updated', etc.)
      // EventSource supports custom event types via the 'event:' field in SSE
      // We'll listen for common event types
      const eventTypes = [
        'screen.pair_session.created',
        'screens_updated',
        'screen_online',
        'screen_offline',
        'screen_deleted',
        'error',
        'ready',
      ];

      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (event) => {
          try {
            const data = JSON.parse(event.data);
            const message = {
              ...data,
              type: eventType,
              timestamp: data.timestamp || Date.now(),
              id: data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            };

            setMessages((prev) => [...prev, message].slice(-1000));

            if (onMessage) {
              onMessage(message);
            }
          } catch (err) {
            console.error(`[LiveConsole] Failed to parse ${eventType} event:`, err, event.data);
          }
        });
      });

      // Handle connection errors
      eventSource.onerror = (err) => {
        console.error('[LiveConsole] SSE connection error:', err);
        
        // Check if connection is closed
        if (eventSource.readyState === EventSource.CLOSED) {
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current += 1;
            const delay = reconnectDelayMs * reconnectAttemptsRef.current; // Exponential backoff
            console.log(`[LiveConsole] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
            
            setConnectionStatus('connecting');
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            setConnectionStatus('error');
            const errorMsg = `Failed to connect after ${maxReconnectAttempts} attempts. Please check your connection and API key.`;
            setError(errorMsg);
            if (onError) {
              onError(new Error(errorMsg));
            }
          }
        } else {
          // Connection is still open but there was an error
          setConnectionStatus('error');
          setError('Connection error occurred');
          if (onError) {
            onError(err);
          }
        }
      };
    } catch (err) {
      console.error('[LiveConsole] Failed to create EventSource:', err);
      setConnectionStatus('error');
      setError(`Failed to create connection: ${err.message}`);
      if (onError) {
        onError(err);
      }
    }
  };

  // Disconnect from SSE stream
  const disconnect = () => {
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
        console.log('[LiveConsole] SSE connection closed');
      } catch (err) {
        console.warn('[LiveConsole] Error closing connection:', err);
      }
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus('disconnected');
  };

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []); // Empty deps - only run on mount/unmount

  // Reconnect if API key changes (e.g., user logs in)
  useEffect(() => {
    const apiKey = getApiKey();
    if (apiKey && connectionStatus === 'disconnected') {
      connect();
    }
  }, [propApiKey]); // Reconnect if propApiKey changes

  // Clear messages function (optional utility)
  const clearMessages = () => {
    setMessages([]);
  };

  // Render status indicator
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return reconnectAttemptsRef.current > 0 
          ? `Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          : 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="live-console">
      {/* Status Bar */}
      <div className="flex items-center justify-between p-2 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {error && (
            <span className="text-xs text-red-600" title={error}>
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={disconnect}
            disabled={connectionStatus === 'disconnected'}
            className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            Disconnect
          </button>
          <button
            onClick={connect}
            disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            Connect
          </button>
          <button
            onClick={clearMessages}
            className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div className="messages-container h-96 overflow-y-auto bg-black text-green-400 font-mono text-xs p-4">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {connectionStatus === 'connected' 
              ? 'Waiting for messages...' 
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Not connected. Click Connect to start receiving messages.'}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="message mb-1 break-words"
              data-timestamp={new Date(msg.timestamp).toISOString()}
            >
              <span className="text-gray-500">
                [{new Date(msg.timestamp).toLocaleTimeString()}]
              </span>
              {msg.type && (
                <span className="text-blue-400 ml-2">[{msg.type}]</span>
              )}
              <span className="ml-2">
                {msg.data ? JSON.stringify(msg.data, null, 2) : JSON.stringify(msg, null, 2)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Message Count */}
      <div className="p-2 bg-gray-100 border-t text-xs text-gray-600">
        {messages.length} message{messages.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}


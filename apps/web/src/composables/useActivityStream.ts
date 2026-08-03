import { ref, onUnmounted } from 'vue';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  topic: string;
  payload: any;
}

export function useActivityStream() {
  const events = ref<ActivityEvent[]>([]);
  const isConnected = ref(false);
  const error = ref<string | null>(null);
  let eventSource: EventSource | null = null;
  const maxEvents = 500;

  function connect(workspaceId: string) {
    if (!workspaceId) return;
    disconnect();

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/events`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      isConnected.value = true;
      error.value = null;
    };

    eventSource.onerror = (err) => {
      isConnected.value = false;
      error.value = 'Connection lost. Reconnecting...';
      console.warn('SSE connection error:', err);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const activityEv: ActivityEvent = {
          id: data.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          timestamp: data.timestamp || new Date().toISOString(),
          topic: data.topic || data.type || 'system.event',
          payload: data.payload ?? data,
        };

        events.value = [activityEv, ...events.value].slice(0, maxEvents);
      } catch (e) {
        // Fallback for non-JSON text frames
        events.value = [
          {
            id: `evt_${Date.now()}`,
            timestamp: new Date().toISOString(),
            topic: 'raw.message',
            payload: { message: event.data },
          },
          ...events.value,
        ].slice(0, maxEvents);
      }
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isConnected.value = false;
  }

  function clear() {
    events.value = [];
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    events,
    isConnected,
    error,
    connect,
    disconnect,
    clear,
  };
}

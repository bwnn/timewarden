/**
 * Minimal type declarations for the WebExtension `browser` API.
 *
 * Firefox exposes `browser.*` globally in extension contexts.
 * This covers only the APIs TimeWarden uses — expand as needed.
 */

declare namespace browser {
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }

    function sendMessage(message: unknown): Promise<unknown>;

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
        ) => Promise<unknown> | undefined,
      ): void;
      removeListener(
        callback: (
          message: unknown,
          sender: MessageSender,
        ) => Promise<unknown> | undefined,
      ): void;
    };

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };

    const onStartup: {
      addListener(callback: () => void): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      audible?: boolean;
      windowId: number;
    }

    function query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
    function update(tabId: number, updateProperties: Record<string, unknown>): Promise<Tab>;
    function get(tabId: number): Promise<Tab>;

    const onActivated: {
      addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void;
    };

    const onUpdated: {
      addListener(
        callback: (
          tabId: number,
          changeInfo: Record<string, unknown>,
          tab: Tab,
        ) => void,
      ): void;
    };

    const onRemoved: {
      addListener(callback: (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void): void;
    };
  }

  namespace windows {
    const WINDOW_ID_NONE: number;

    interface Window {
      id?: number;
      focused: boolean;
      type?: string;
    }

    function getAll(getInfo?: Record<string, unknown>): Promise<Window[]>;

    const onFocusChanged: {
      addListener(callback: (windowId: number) => void): void;
    };
  }

  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }

    function create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number; when?: number }): void;
    function clear(name: string): Promise<boolean>;
    function clearAll(): Promise<boolean>;
    function get(name: string): Promise<Alarm | undefined>;
    function getAll(): Promise<Alarm[]>;

    const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
    };
  }

  namespace notifications {
    interface CreateOptions {
      type: 'basic';
      iconUrl: string;
      title: string;
      message: string;
    }

    function create(notificationId: string, options: CreateOptions): Promise<string>;
    function clear(notificationId: string): Promise<boolean>;

    const onClicked: {
      addListener(callback: (notificationId: string) => void): void;
    };
  }

  namespace idle {
    type IdleState = 'active' | 'idle' | 'locked';

    function queryState(detectionIntervalInSeconds: number): Promise<IdleState>;

    const onStateChanged: {
      addListener(callback: (newState: IdleState) => void): void;
    };
  }

  namespace scripting {
    interface ScriptInjection {
      target: { tabId: number };
      files?: string[];
      func?: () => void;
    }

    function executeScript(injection: ScriptInjection): Promise<unknown[]>;
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void>;
  }
}

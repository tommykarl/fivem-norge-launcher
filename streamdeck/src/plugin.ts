import streamDeck, { action, SingletonAction, type KeyDownEvent, type SendToPluginEvent, type WillAppearEvent, type WillDisappearEvent } from '@elgato/streamdeck';

const API = 'http://127.0.0.1:53135';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

type FavoriteSettings = { serverId?: string };

@action({ UUID: 'no.fivemnorge.launcher.favorite' })
class FavoriteAction extends SingletonAction<FavoriteSettings> {
  override async onSendToPlugin(ev: SendToPluginEvent<{ serverId?: string }, FavoriteSettings>) {
    if (typeof ev.payload.serverId === 'string') await ev.action.setSettings({ serverId: ev.payload.serverId.trim() });
  }

  override async onKeyDown(ev: KeyDownEvent<FavoriteSettings>) {
    const id = ev.payload.settings.serverId;
    if (!id) return ev.action.showAlert();
    try {
      await request('/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      await ev.action.showOk();
    } catch (error) {
      streamDeck.logger.error(`Kunne ikke koble til favoritten: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}

type StatusSettings = { };
@action({ UUID: 'no.fivemnorge.launcher.status' })
class StatusAction extends SingletonAction<StatusSettings> {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  override onWillAppear(ev: WillAppearEvent<StatusSettings>) {
    const previous = this.timers.get(ev.action.id);
    if (previous) clearInterval(previous);
    const update = async () => {
      try {
        const { level } = await request('/status');
        const labels: Record<string, string> = { ok: 'FiveM\nOK', maintenance: 'FiveM\nVedlikehold', degraded: 'FiveM\nProblemer', outage: 'FiveM\nNede' };
        ev.action.setTitle(labels[level] || 'FiveM\nUkjent');
      } catch {
        ev.action.setTitle('FiveM\nOffline');
      }
    };
    void update();
    this.timers.set(ev.action.id, setInterval(update, 30_000));
  }

  override onWillDisappear(ev: WillDisappearEvent<StatusSettings>) {
    const timer = this.timers.get(ev.action.id);
    if (timer) clearInterval(timer);
    this.timers.delete(ev.action.id);
  }
}

streamDeck.actions.registerAction(new FavoriteAction());
streamDeck.actions.registerAction(new StatusAction());
streamDeck.connect();

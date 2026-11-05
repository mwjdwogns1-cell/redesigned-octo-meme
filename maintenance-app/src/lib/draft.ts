/** 입력 중 임시저장(로컬). 새로고침·앱 전환·전파 끊김에도 입력이 남도록 한다. */
const PREFIX = 'maint-draft:';

export function saveDraft(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* 저장 공간 부족 등은 무시 */ }
}
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw).value as T) : null;
  } catch { return null; }
}
export function clearDraft(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

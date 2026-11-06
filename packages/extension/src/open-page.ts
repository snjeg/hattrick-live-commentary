export const PAGE_PATH = 'page.html';

/** The slice of the Chrome API used to open the page; injected so it can be tested. */
export interface TabsApi {
  runtime: { getURL(path: string): string };
  tabs: {
    create(properties: { url: string }): Promise<{ id?: number }>;
    query(info: { url?: string | string[] }): Promise<{ id?: number }[]>;
    update(tabId: number, properties: { active?: boolean }): Promise<unknown>;
  };
}

/** Focuses the commentary page if it is already open, otherwise opens it in a new tab. */
export async function openOrFocusPage(api: TabsApi): Promise<void> {
  const url = api.runtime.getURL(PAGE_PATH);
  const [existing] = await api.tabs.query({ url });
  if (existing?.id !== undefined) {
    await api.tabs.update(existing.id, { active: true });
    return;
  }
  await api.tabs.create({ url });
}

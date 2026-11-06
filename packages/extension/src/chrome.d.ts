// Minimal typings for the Chrome extension APIs this package uses (avoids a types dependency).
declare namespace chrome {
  namespace runtime {
    function getURL(path: string): string;
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function create(properties: { url: string }): Promise<Tab>;
    function query(info: { url?: string | string[] }): Promise<Tab[]>;
    function update(tabId: number, properties: { active?: boolean }): Promise<Tab>;
  }
  namespace action {
    const onClicked: { addListener(callback: (tab: tabs.Tab) => void): void };
  }
}

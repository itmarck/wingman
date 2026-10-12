import { Tabs, Tooltip } from 'radix-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { type Catalog, useData } from './api';
import { Flow } from './flow';
import { Collections, EntryForm, Preferences, Projects, Settings } from './resources';
import { Loading } from './ui';
import '@fontsource-variable/geist';
import './theme.css';
import './styles.css';

const tabs = ['Flow', 'Projects', 'Collections', 'Preferences', 'Settings'] as const;

/** The open tab lives in the `tab` query param, so a reload keeps it. */
function initialTab(): string {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tabs.find((name) => name.toLowerCase() === tab) ?? 'Flow';
}

function selectTab(tab: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab.toLowerCase());
  window.history.replaceState(null, '', url);
}

function Panel() {
  const { data: catalog, error } = useData<Catalog>('/admin/catalog');
  return (
    <div className="shell">
      {error && <p className="error">{error}</p>}
      {!catalog && !error && <Loading />}
      {catalog && (
        <Tabs.Root defaultValue={initialTab()} onValueChange={selectTab}>
          <div className="row spread toolbar">
            <Tabs.List className="tabs-list">
              {tabs.map((tab) => (
                <Tabs.Trigger key={tab} value={tab} className="tabs-trigger">
                  {tab}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <EntryForm />
          </div>
          <Tabs.Content value="Flow">
            <Flow />
          </Tabs.Content>
          <Tabs.Content value="Projects">
            <Projects catalog={catalog} />
          </Tabs.Content>
          <Tabs.Content value="Collections">
            <Collections catalog={catalog} />
          </Tabs.Content>
          <Tabs.Content value="Preferences">
            <Preferences catalog={catalog} />
          </Tabs.Content>
          <Tabs.Content value="Settings">
            <Settings catalog={catalog} />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <Tooltip.Provider delayDuration={300}>
        <Panel />
      </Tooltip.Provider>
    </StrictMode>,
  );

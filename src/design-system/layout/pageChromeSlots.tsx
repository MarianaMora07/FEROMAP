import {
  type JSX,
  type Accessor,
  createContext,
  createRenderEffect,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';

type HeaderChrome = {
  actions: Accessor<JSX.Element | null>;
  subheader: Accessor<JSX.Element | null>;
  setActions: (node: JSX.Element | null) => void;
  setSubheader: (node: JSX.Element | null) => void;
};

const HeaderChromeContext = createContext<HeaderChrome>();

export function HeaderChromeProvider(props: { children: JSX.Element }) {
  const [actions, setActions] = createSignal<JSX.Element | null>(null);
  const [subheader, setSubheader] = createSignal<JSX.Element | null>(null);

  return (
    <HeaderChromeContext.Provider
      value={{
        actions,
        subheader,
        setActions,
        setSubheader,
      }}
    >
      {props.children}
    </HeaderChromeContext.Provider>
  );
}

export function useHeaderChrome() {
  return useContext(HeaderChromeContext);
}

export function AppShellHeaderActions(props: { children: JSX.Element }) {
  const chrome = useHeaderChrome();
  createRenderEffect(() => {
    chrome?.setActions(() => props.children);
  });
  onCleanup(() => chrome?.setActions(null));
  return null;
}

export function AppShellSubheader(props: { children: JSX.Element }) {
  const chrome = useHeaderChrome();
  createRenderEffect(() => {
    chrome?.setSubheader(() => props.children);
  });
  onCleanup(() => chrome?.setSubheader(null));
  return null;
}

interface SidebarSectionLabelProps {
  children: string;
}

export function SidebarSectionLabel(props: SidebarSectionLabelProps) {
  return (
    <p class="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-nav-section first:mt-0">
      {props.children}
    </p>
  );
}

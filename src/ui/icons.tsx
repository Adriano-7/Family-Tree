// Small line drawings for the controls. They are decoration: the button carries the name.
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const HomeIcon = () => (
  <Icon>
    <path d="M3.5 9 10 3.5 16.5 9" />
    <path d="M5.5 8v8h9V8" />
  </Icon>
)

export const WholeTreeIcon = () => (
  <Icon>
    <path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13" />
  </Icon>
)

export const GenerationsIcon = () => (
  <Icon>
    <circle cx="10" cy="4.5" r="1.7" />
    <circle cx="5" cy="15.5" r="1.7" />
    <circle cx="15" cy="15.5" r="1.7" />
    <path d="M10 6.2V10M5 13.8V10h10v3.8" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M10 4v12M4 10h12" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="9" cy="9" r="5" />
    <path d="m13 13 3.5 3.5" />
  </Icon>
)

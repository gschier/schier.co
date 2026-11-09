// The editor's small line icons, drawn in the text's colour.

const PATHS = {
  back: 'M10 3.5 5.5 8l4.5 4.5',
  chevron: 'M6 3.5 10.5 8 6 12.5',
  check: 'M3 8.5 6.5 12 13 4.5',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M10 6.5a.5.5 0 1 0 0-.01',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  pencil: 'M10.5 2.5l3 3-8 8H2.5v-3zM9 4l3 3',
  expand: 'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9',
  shrink: 'M13.5 2.5 9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M3 9.5h3.5V13',
  alert: 'M8 1.5 15 14H1zM8 6v3.5M8 11.5v.5',
}

export type IconName = keyof typeof PATHS

export function Ico({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
